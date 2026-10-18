// src/services/expirationConfirmation.service.js
// Agenda — annulation AUTOMATIQUE des rendez-vous restés sans confirmation.
//
// Un RDV « cree » (demandé, pas encore confirmé = pas encore payé) réserve
// sa case d'agenda. À l'échéance
//   min(date_creation + H, date_creneau)   (lib/delaiConfirmation.js)
// où H est figé sur le RDV (rendez_vous.delai_confirmation_heures, lu dans
// parametre_delai_confirmation, 4 h par défaut), il est annulé (motif
// « delai_confirmation_expire ») et sa case redevient disponible.
//
// Jamais payé : aucun fonds à rembourser ni à libérer, aucune amende. Les
// paiements Stripe encore ouverts sont neutralisés ; un paiement qui
// aboutirait malgré tout ensuite est remboursé par finaliserPaiement
// (paiement tardif, comme après toute annulation).
//
// Paiement en cours : si une tentative de paiement `en_attente` RÉCENTE
// existe (fenêtre PAIEMENT_FENETRE_EN_ATTENTE_MIN, 30 min par défaut), on
// laisse au patient le temps de la terminer — sauf si l'heure du créneau
// est atteinte. Le passage suivant du cron réévalue.
//
// Concurrence : l'annulation est un UPDATE CONDITIONNEL (statut « cree ») :
// un paiement confirmé entre la lecture et l'écriture l'emporte, le RDV
// n'est pas touché.

import prisma from "../lib/prisma.js";
import { confirmationExpiree } from "../lib/delaiConfirmation.js";
import { fenetreEnAttenteMs } from "./antiDoublePaiement.service.js";
import { neutraliserPaiementsEnCours } from "./annulation.service.js";
import { libererCreneauxDuRdv, libererCreneauxOrphelins } from "./agendaCreneau.service.js";
import { resoudreDelaiConfirmationPays } from "./parametreDelaiConfirmation.service.js";
import { creerNotifications } from "./notification.service.js";
import { rouvrirOffreApresAnnulationRdv } from "./offreRdv.service.js";

export const MOTIF_EXPIRATION = "delai_confirmation_expire";
const COMMENTAIRE_EXPIRATION =
  "Annulation automatique : le rendez-vous n'a pas été confirmé (payé) dans le délai imparti.";

/**
 * Le patient est-il en train de payer ? (tentative `en_attente` récente)
 * @param {string} rdv_id
 * @param {Date} maintenant
 */
async function paiementRecentEnCours(rdv_id, maintenant) {
  const seuil = new Date(maintenant.getTime() - fenetreEnAttenteMs());
  const t = await prisma.transactionPaiement.findFirst({
    where: { rdv_id_cible: rdv_id, statut: "en_attente", date_creation: { gte: seuil } },
    select: { transaction_id: true },
  });
  return Boolean(t);
}

async function notifierPatient(rdv) {
  const destinataire = rdv.patient?.utilisateur_id;
  if (!destinataire) return;
  await creerNotifications([
    {
      utilisateur_id: destinataire,
      type: "rdv_confirmation_expiree",
      rdv_id: rdv.rdv_id,
      titre: "Demande de rendez-vous annulée",
      message:
        "Votre demande de rendez-vous n'a pas été confirmée par le paiement dans le délai imparti : " +
        "elle a été annulée et le créneau a été libéré. Vous pouvez réserver un nouveau créneau.",
      donnees: { date_creneau: rdv.date_creneau.toISOString() },
      cle: `rdv_confirmation_expiree:${rdv.rdv_id}:${destinataire}`,
    },
  ]);
}

/**
 * Annule un RDV « cree » dont l'échéance est atteinte. Sans effet s'il a
 * changé de statut entre-temps.
 * @returns {Promise<boolean>} vrai si le RDV a été annulé par cet appel
 */
async function expirerRdv(rdv, maintenant) {
  const annule = await prisma.$transaction(async (tx) => {
    const { count } = await tx.rendezVous.updateMany({
      where: { rdv_id: rdv.rdv_id, statut: "cree" },
      data: {
        statut: "annule",
        motif_annulation: MOTIF_EXPIRATION,
        commentaire_annulation: COMMENTAIRE_EXPIRATION,
        date_annulation: maintenant,
      },
    });
    if (count !== 1) return false;
    await libererCreneauxDuRdv(rdv.rdv_id, tx);
    return true;
  });
  if (!annule) return false;

  // Après la transaction : appels Stripe et notification, jamais bloquants.
  await neutraliserPaiementsEnCours(rdv.rdv_id);
  // RDV aléatoire : l'offre d'origine redevient « ouverte » (non bloquant).
  await rouvrirOffreApresAnnulationRdv(rdv.rdv_id, maintenant);
  try {
    await notifierPatient(rdv);
  } catch (err) {
    console.error(`[expiration-confirmation] Notification patient impossible (rdv ${rdv.rdv_id}) :`, err.message);
  }
  return true;
}

/**
 * Un passage : annule chaque RDV « cree » échu, puis libère les cases encore
 * tenues par des RDV annulés (filet de sécurité).
 * @param {{ maintenant?: Date }} [options]
 * @returns {Promise<{ candidats: number, annules: number, reportes: number, echecs: number, cases_liberees: number }>}
 */
export async function expirerRdvNonConfirmes({ maintenant = new Date() } = {}) {
  const enAttente = await prisma.rendezVous.findMany({
    where: { statut: "cree" },
    select: {
      rdv_id: true,
      date_creation: true,
      date_creneau: true,
      delai_confirmation_heures: true,
      medecin: { select: { pays_exercice_id: true } },
      patient: { select: { utilisateur_id: true } },
    },
  });

  // H par défaut (RDV antérieurs au module) : le délai actif du pays, mis en cache.
  const delaiParPays = new Map();
  async function delaiParDefaut(pays_id) {
    if (!delaiParPays.has(pays_id)) delaiParPays.set(pays_id, (await resoudreDelaiConfirmationPays(pays_id)).heures);
    return delaiParPays.get(pays_id);
  }

  const bilan = { candidats: 0, annules: 0, reportes: 0, echecs: 0, cases_liberees: 0 };
  for (const rdv of enAttente) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const defaut = rdv.delai_confirmation_heures == null ? await delaiParDefaut(rdv.medecin?.pays_exercice_id) : undefined;
      if (!confirmationExpiree(rdv, maintenant, defaut)) continue;
      bilan.candidats += 1;

      const creneauAtteint = new Date(rdv.date_creneau).getTime() <= maintenant.getTime();
      // eslint-disable-next-line no-await-in-loop
      if (!creneauAtteint && (await paiementRecentEnCours(rdv.rdv_id, maintenant))) {
        bilan.reportes += 1;
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      if (await expirerRdv(rdv, maintenant)) bilan.annules += 1;
    } catch (err) {
      bilan.echecs += 1;
      console.error(`[expiration-confirmation] Échec pour le rdv ${rdv.rdv_id} :`, err.message);
    }
  }

  try {
    bilan.cases_liberees = await libererCreneauxOrphelins();
  } catch (err) {
    console.error("[expiration-confirmation] Libération des cases orphelines impossible :", err.message);
  }

  if (bilan.annules || bilan.echecs || bilan.cases_liberees) {
    console.info(`[expiration-confirmation] ${JSON.stringify(bilan)}`);
  }
  return bilan;
}
