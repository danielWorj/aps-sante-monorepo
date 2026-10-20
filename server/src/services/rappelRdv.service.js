// src/services/rappelRdv.service.js
// Rappels de rendez-vous (MÉDECIN et PATIENT) : 3 jours avant, 1 jour
// avant, 3 heures avant et à l'heure du rendez-vous. Notification in-app
// `rdv_rappel` — donc aussi poussée sur mobile (push.service.js) ; un appui
// ouvre la page des rendez-vous de l'espace concerné.
//
// Règles :
//   - seuls les RDV PAYÉS et non terminés sont rappelés (« confirme »,
//     « en_attente_presence », termine_le nul) : un RDV non payé n'existe
//     pas pour le médecin (D8) ;
//   - à chaque passage, on envoie au plus le palier le PLUS PROCHE déjà
//     atteint : un RDV pris la veille ne reçoit pas « dans 3 jours » ;
//   - un palier déjà dépassé à la création du RDV est sauté (pas de
//     « rappel » juste après la réservation), sauf « c'est l'heure » ;
//   - idempotent : la clé contient le palier ET la date du créneau (un RDV
//     reprogrammé reçoit de nouveaux rappels), `skipDuplicates` fait le reste.
//
// Les heures sont écrites dans le fuseau du pays d'exercice du médecin.

import prisma from "../lib/prisma.js";
import { fuseauOuDefaut } from "../lib/fuseauHoraire.js";
import { creerNotifications } from "./notification.service.js";

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

// Du plus proche au plus lointain : le premier palier atteint est retenu.
export const PALIERS_RAPPEL = Object.freeze([
  { palier: "h0", avant: MINUTE }, // « à l'heure » : jusqu'à 1 min avant le début
  { palier: "h3", avant: 3 * HEURE },
  { palier: "j1", avant: JOUR },
  { palier: "j3", avant: 3 * JOUR },
]);

// « C'est l'heure » reste envoyé jusqu'à 30 min après le début (cron arrêté, redémarrage…).
const RETARD_MAX_H0 = 30 * MINUTE;

export const STATUTS_RAPPEL = Object.freeze(["confirme", "en_attente_presence"]);

/**
 * Palier à envoyer pour ce RDV maintenant, ou null.
 * @param {{ date_creneau: Date, date_creation: Date }} rdv
 */
export function palierDu(rdv, maintenant = new Date()) {
  const reste = rdv.date_creneau.getTime() - maintenant.getTime();
  if (reste < -RETARD_MAX_H0) return null;
  const atteint = PALIERS_RAPPEL.find((p) => reste <= p.avant);
  if (!atteint) return null;
  if (atteint.palier !== "h0") {
    // Palier déjà dépassé quand le RDV a été pris : pas de rappel.
    const momentPalier = rdv.date_creneau.getTime() - atteint.avant;
    if (rdv.date_creation && rdv.date_creation.getTime() > momentPalier) return null;
  }
  return atteint.palier;
}

function formaterQuand(date, fuseau) {
  const jour = date.toLocaleDateString("fr-FR", { timeZone: fuseau, weekday: "long", day: "numeric", month: "long" });
  const heure = date.toLocaleTimeString("fr-FR", { timeZone: fuseau, hour: "2-digit", minute: "2-digit" });
  return { jour, heure };
}

const TITRES = {
  j3: "Rendez-vous dans 3 jours",
  j1: "Rendez-vous demain",
  h3: "Votre rendez-vous approche",
  h0: "C'est l'heure de votre rendez-vous",
};

/**
 * Textes d'un rappel pour un destinataire.
 * @param {"j3"|"j1"|"h3"|"h0"} palier
 * @param {"patient"|"medecin"} role
 */
export function texteRappel(palier, role, { typeRdv, interlocuteur, jour, heure, lieu }) {
  const video = typeRdv === "teleconsultation";
  const quoi = video ? "téléconsultation" : "consultation";
  const avec = role === "patient" ? `avec ${interlocuteur}` : `avec votre patient ${interlocuteur}`;

  let message;
  if (palier === "h0") {
    message = video
      ? `Votre ${quoi} ${avec} commence maintenant (${heure}). Ouvrez vos rendez-vous pour rejoindre la visio.`
      : `Votre ${quoi} ${avec} commence maintenant (${heure})${lieu ? ` — ${lieu}` : ""}.`;
  } else {
    const quand = palier === "h3" ? `aujourd'hui à ${heure}` : `${jour} à ${heure}`;
    message = `Votre ${quoi} ${avec} est prévue ${quand}${!video && lieu ? ` — ${lieu}` : ""}.`;
    if (video && palier === "h3") message += " Vérifiez votre connexion, votre caméra et votre micro.";
  }
  return { titre: TITRES[palier], message };
}

/**
 * Cron : envoie les rappels dus. Ne lève pas pour un RDV isolé.
 * @returns {Promise<{ rdv_rappeles: number, notifications: number }>}
 */
export async function envoyerRappelsRdv({ maintenant = new Date() } = {}) {
  const rdvs = await prisma.rendezVous.findMany({
    where: {
      statut: { in: [...STATUTS_RAPPEL] },
      termine_le: null,
      date_creneau: {
        gte: new Date(maintenant.getTime() - RETARD_MAX_H0),
        lte: new Date(maintenant.getTime() + PALIERS_RAPPEL.at(-1).avant),
      },
    },
    select: {
      rdv_id: true,
      type_rdv: true,
      date_creneau: true,
      date_creation: true,
      lieu_rdv: true,
      patient: { select: { utilisateur: { select: { utilisateur_id: true, prenom: true, nom: true } } } },
      medecin: {
        select: {
          utilisateur: { select: { utilisateur_id: true, prenom: true, nom: true } },
          pays_exercice: { select: { fuseau_horaire: true } },
        },
      },
    },
  });

  const bilan = { rdv_rappeles: 0, notifications: 0 };
  for (const rdv of rdvs) {
    const palier = palierDu(rdv, maintenant);
    if (!palier) continue;

    const fuseau = fuseauOuDefaut(rdv.medecin.pays_exercice?.fuseau_horaire);
    const { jour, heure } = formaterQuand(rdv.date_creneau, fuseau);
    const p = rdv.patient.utilisateur;
    const m = rdv.medecin.utilisateur;
    const commun = { typeRdv: rdv.type_rdv, jour, heure, lieu: rdv.lieu_rdv };
    const destinataires = [
      { role: "patient", utilisateur_id: p.utilisateur_id, interlocuteur: `Dr ${m.prenom} ${m.nom}`.trim() },
      { role: "medecin", utilisateur_id: m.utilisateur_id, interlocuteur: `${p.prenom} ${p.nom}`.trim() },
    ];
    const cycle = rdv.date_creneau.toISOString();

    try {
      // eslint-disable-next-line no-await-in-loop
      const { count } = await creerNotifications(
        destinataires.map((d) => ({
          utilisateur_id: d.utilisateur_id,
          type: "rdv_rappel",
          rdv_id: rdv.rdv_id,
          ...texteRappel(palier, d.role, { ...commun, interlocuteur: d.interlocuteur }),
          donnees: { palier, date_creneau: cycle, type_rdv: rdv.type_rdv, role: d.role },
          cle: `rdv_rappel:${rdv.rdv_id}:${palier}:${cycle}:${d.utilisateur_id}`,
        }))
      );
      if (count) {
        bilan.rdv_rappeles += 1;
        bilan.notifications += count;
      }
    } catch (err) {
      console.error(`[rappels-rdv] Rappel ${palier} impossible (rdv ${rdv.rdv_id}) :`, err.message);
    }
  }
  return bilan;
}
