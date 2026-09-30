// src/services/antiDoublePaiement.service.js
// Politique de fonds v2 §6 — Pas de double paiement.
//
// Avant TOUTE création de transaction de paiement, on vérifie qu'aucun
// paiement n'existe déjà pour un RDV du même patient, du même médecin
// et du même créneau (date_creneau) :
//   - un escrow (fonds séquestrés ou déjà libérés pour un RDV honoré) ;
//   - une transaction `reussie` ;
//   - une transaction `en_attente` RÉCENTE (fenêtre configurable) : un
//     paiement peut être en cours chez l'agrégateur.
// Sinon la création est refusée (409). Les RDV `annule` / `non_honore`
// sont exclus : leurs fonds sont soldés (remboursés ou versés), ils ne
// doivent pas empêcher de réserver puis payer à nouveau le même créneau.
//
// Seconde ligne de défense : l'index unique partiel
// rendez_vous_medecin_creneau_actif_key (deux RDV actifs sur le même
// créneau d'un médecin sont impossibles). Le filet de
// finalisationPaiement (« double_paiement ») reste le dernier recours
// mais ne doit plus être atteint en fonctionnement normal.
//
// Concurrence : deux requêtes simultanées passeraient toutes deux le
// contrôle (lecture puis écriture). La vérification et la création
// s'exécutent donc dans UNE transaction SQL qui prend un verrou
// consultatif (pg_advisory_xact_lock) propre au triplet
// patient/médecin/créneau : la seconde requête attend la première, puis
// voit sa transaction `en_attente` et est refusée.

export class PaiementDejaExistantError extends Error {
  constructor(message) {
    super(message);
    this.name = "PaiementDejaExistantError";
    this.status = 409;
  }
}

// RDV dont les fonds sont soldés : ils ne comptent pas comme paiement actif.
const STATUTS_RDV_SOLDES = ["annule", "non_honore"];

const FENETRE_PAR_DEFAUT_MIN = 30;

/**
 * Durée (ms) pendant laquelle une transaction `en_attente` est jugée
 * « récente », donc susceptible d'aboutir. Réglage TECHNIQUE (pas une
 * valeur métier) : PAIEMENT_FENETRE_EN_ATTENTE_MIN, 30 min par défaut.
 */
export function fenetreEnAttenteMs(env = process.env) {
  const minutes = Number(env.PAIEMENT_FENETRE_EN_ATTENTE_MIN ?? FENETRE_PAR_DEFAUT_MIN);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : FENETRE_PAR_DEFAUT_MIN) * 60 * 1000;
}

async function clientParDefaut() {
  return (await import("../lib/prisma.js")).default;
}

/**
 * Lève PaiementDejaExistantError (409) si un paiement existe déjà.
 * @param {{ rdv_id: string, patient_id: string, medecin_id: string, date_creneau: Date|string }} rdv
 * @param {object} [client] client Prisma ou tx
 * @param {Date} [maintenant]
 */
export async function verifierAucunPaiementExistant(rdv, client, maintenant = new Date()) {
  const db = client ?? (await clientParDefaut());

  const memeCreneau = await db.rendezVous.findMany({
    where: {
      patient_id: rdv.patient_id,
      medecin_id: rdv.medecin_id,
      date_creneau: rdv.date_creneau,
      statut: { notIn: STATUTS_RDV_SOLDES },
    },
    select: { rdv_id: true },
  });
  const ids = memeCreneau.map((r) => r.rdv_id);
  if (!ids.includes(rdv.rdv_id)) ids.push(rdv.rdv_id); // le RDV visé compte toujours

  const message =
    "Un paiement existe déjà pour ce rendez-vous (ou pour un rendez-vous identique : même médecin, même créneau).";

  if (await db.compteEscrow.findFirst({ where: { rdv_id: { in: ids } }, select: { escrow_id: true } })) {
    throw new PaiementDejaExistantError(message);
  }

  if (
    await db.transactionPaiement.findFirst({
      where: { rdv_id_cible: { in: ids }, statut: "reussie" },
      select: { transaction_id: true },
    })
  ) {
    throw new PaiementDejaExistantError(message);
  }

  const seuil = new Date(maintenant.getTime() - fenetreEnAttenteMs());
  if (
    await db.transactionPaiement.findFirst({
      where: { rdv_id_cible: { in: ids }, statut: "en_attente", date_creation: { gte: seuil } },
      select: { transaction_id: true },
    })
  ) {
    throw new PaiementDejaExistantError(
      "Un paiement est déjà en cours pour ce rendez-vous. Terminez-le, ou patientez quelques minutes avant de réessayer."
    );
  }
}

/**
 * Réouverture d'un Checkout web (le patient a fermé la page puis
 * réessaie) : s'il n'y a PAS eu de paiement, on invalide chaque session
 * Checkout encore ouverte de ce RDV (Stripe d'abord, puis base :
 * transaction `echouee`), ce qui libère la création d'un nouveau
 * Checkout sans risque de double paiement. Si une session s'avère
 * payée entre-temps, on refuse (409) : le webhook finalisera.
 * @param {{ rdv: object, client?: object, expirer: (sessionId:string)=>Promise<"expiree"|"payee"> }} p
 */
export async function invaliderCheckoutsOuverts({ rdv, client, expirer }) {
  const db = client ?? (await clientParDefaut());
  const ouvertes = await db.transactionPaiement.findMany({
    where: {
      rdv_id_cible: rdv.rdv_id,
      fournisseur: "stripe",
      statut: "en_attente",
      stripe_checkout_session_id: { not: null },
    },
  });
  for (const t of ouvertes) {
    const etat = await expirer(t.stripe_checkout_session_id);
    if (etat === "payee") {
      throw new PaiementDejaExistantError(
        "Un paiement vient d'aboutir pour ce rendez-vous : sa confirmation est en cours de traitement."
      );
    }
    await db.transactionPaiement.updateMany({
      where: { transaction_id: t.transaction_id, statut: "en_attente" },
      data: { statut: "echouee" },
    });
  }
}

/**
 * Crée la transaction `en_attente` d'un RDV APRÈS contrôle anti double
 * paiement, dans une seule transaction SQL verrouillée par créneau.
 * @param {{ rdv: object, donnees: object, client?: object }} p
 *   donnees : `data` de transactionPaiement.create (doit porter rdv_id_cible)
 */
export async function creerTransactionSansDoublon({ rdv, donnees, client }) {
  const db = client ?? (await clientParDefaut());
  const cle = `paiement:${rdv.patient_id}:${rdv.medecin_id}:${new Date(rdv.date_creneau).toISOString()}`;

  return db.$transaction(async (tx) => {
    // ::text — Prisma ne sait pas désérialiser le type `void` renvoyé par la fonction.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${cle}, 0))::text`;
    await verifierAucunPaiementExistant(rdv, tx);
    return tx.transactionPaiement.create({ data: donnees });
  });
}
