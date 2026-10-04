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

// Codes lisibles par le front (champ `code` de la réponse 409) :
//   PAIEMENT_EXISTANT       : paiement abouti / escrow : rien à annuler ;
//   PAIEMENT_EN_COURS       : tentative `en_attente` récente : le patient peut l'ANNULER
//                             (POST /paiement/rendez-vous/:id/paiement/annuler) puis repayer ;
//   PAIEMENT_NON_ANNULABLE  : tentative en cours qu'on ne peut pas annuler sans risque.
export const CODE_PAIEMENT_EXISTANT = "PAIEMENT_EXISTANT";
export const CODE_PAIEMENT_EN_COURS = "PAIEMENT_EN_COURS";
export const CODE_PAIEMENT_NON_ANNULABLE = "PAIEMENT_NON_ANNULABLE";

export class PaiementDejaExistantError extends Error {
  constructor(message, code = CODE_PAIEMENT_EXISTANT) {
    super(message);
    this.name = "PaiementDejaExistantError";
    this.status = 409;
    this.code = code;
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

/** RDV actifs du même patient / médecin / créneau (+ le RDV visé, qui compte toujours). */
async function idsRdvMemeCreneau(db, rdv) {
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
  if (!ids.includes(rdv.rdv_id)) ids.push(rdv.rdv_id);
  return ids;
}

/**
 * Lève PaiementDejaExistantError (409) si un paiement existe déjà.
 * @param {{ rdv_id: string, patient_id: string, medecin_id: string, date_creneau: Date|string }} rdv
 * @param {object} [client] client Prisma ou tx
 * @param {Date} [maintenant]
 */
export async function verifierAucunPaiementExistant(rdv, client, maintenant = new Date()) {
  const db = client ?? (await clientParDefaut());
  const ids = await idsRdvMemeCreneau(db, rdv);

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
      "Un paiement est déjà en cours pour ce rendez-vous. Terminez-le, ou patientez quelques minutes avant de réessayer.",
      CODE_PAIEMENT_EN_COURS
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
 * Annule TOUS les paiements `en_attente` d'un RDV (et des RDV identiques :
 * même patient / médecin / créneau) pour permettre au patient d'en lancer un
 * nouveau. Ne touche JAMAIS un paiement abouti : si, chez le fournisseur,
 * le paiement s'avère payé (ou en cours de capture), on refuse (409) et le
 * webhook / la vérification finalise.
 *
 * `fournisseurs` (injecté, comme `invaliderCheckoutsOuverts`) :
 *   stripe.expirerSession(sessionId)       -> "expiree" | "payee"
 *   stripe.annulerPaymentIntent(piId)      -> "annule"  | "paye"
 *   campay.verifier(transaction)           -> "SUCCESSFUL" | "FAILED" | "PENDING" | "MONTANT_INCOHERENT" …
 *     (re-interroge CamPay et finalise si payé : jamais d'annulation à l'aveugle)
 *
 * CamPay n'offre pas d'API d'annulation d'une collecte : si la demande est
 * encore PENDING, on clôt la transaction côté APS (`echouee`). Une validation
 * tardive sur le téléphone est rattrapée par le webhook (voir
 * verifierEtFinaliserTransactionCampay) : remboursement « double_paiement »
 * si le patient a entre-temps payé autrement.
 * Une collecte à issue incertaine (sans référence) n'est PAS annulable : on ne
 * peut pas savoir si le patient a été débité.
 * @returns {Promise<number>} nombre de transactions annulées
 */
export async function annulerPaiementsEnCours({ rdv, client, fournisseurs }) {
  const db = client ?? (await clientParDefaut());
  const ids = await idsRdvMemeCreneau(db, rdv);
  const enAttente = await db.transactionPaiement.findMany({
    where: { rdv_id_cible: { in: ids }, statut: "en_attente" },
    orderBy: { date_creation: "asc" },
  });

  const dejaAboutiErr = () =>
    new PaiementDejaExistantError(
      "Un paiement vient d'aboutir pour ce rendez-vous : sa confirmation est en cours de traitement."
    );

  let annulees = 0;
  for (const t of enAttente) {
    if (t.fournisseur === "campay") {
      if (!t.campay_reference) {
        throw new PaiementDejaExistantError(
          "Votre demande Mobile Money est en cours de vérification auprès de l'opérateur : elle ne peut pas être annulée pour le moment. Patientez quelques minutes.",
          CODE_PAIEMENT_NON_ANNULABLE
        );
      }
      const issue = await fournisseurs.campay.verifier(t);
      if (issue === "SUCCESSFUL") throw dejaAboutiErr();
      if (issue === "MONTANT_INCOHERENT") {
        throw new PaiementDejaExistantError(
          "Ce paiement nécessite une vérification manuelle : il ne peut pas être annulé. Contactez l'assistance.",
          CODE_PAIEMENT_NON_ANNULABLE
        );
      }
    } else {
      if (t.stripe_checkout_session_id) {
        if ((await fournisseurs.stripe.expirerSession(t.stripe_checkout_session_id)) === "payee") throw dejaAboutiErr();
      }
      if (t.stripe_payment_intent_id) {
        if ((await fournisseurs.stripe.annulerPaymentIntent(t.stripe_payment_intent_id)) === "paye") throw dejaAboutiErr();
      }
    }

    const { count } = await db.transactionPaiement.updateMany({
      where: { transaction_id: t.transaction_id, statut: "en_attente" },
      data: { statut: "echouee" },
    });
    annulees += count;
  }
  return annulees;
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