// src/services/commissionAps.service.js
// Politique de fonds v2 (D3) — Enregistrement des commissions APS
// effectivement CONSERVÉES par APS, dans CommissionApsVersee.
//
// Vocabulaire : CM = commission MÉDECIN (origine « medecin »), CP =
// commission PATIENT (origine « patient »). Une ligne par (RDV, origine) :
//   - CM : prélevée sur le médecin à la libération, ou conservée par APS
//          pour « deux absents sans reprogrammation » ;
//   - CP : conservée par APS dès qu'elle n'est pas rendue au patient —
//          à la libération, ET lors d'un remboursement partiel (annulation
//          patient > 24 h, paiement tardif, deux absents sans
//          reprogrammation). Aucune ligne « patient » quand CP est rendue
//          au patient (médecin fautif).
//
// Chaque ligne référence la ligne de taux FIGÉE sur la transaction
// (ligne_commission_id pour CM ; ligne_commission_patient_id pour CP, stockée
// dans la colonne `ligne_commission_id` de CommissionApsVersee) : le montant
// est un fait constaté, les taux ne sont jamais relus.
//
// Idempotence : upsert sur la clé unique (rdv_id, origine) ; un rejeu
// (webhook, cron, reprise après échec) ne crée jamais de doublon et ne
// réécrit jamais un fait déjà enregistré (`update: {}`).
//
// Module SANS import de Prisma : le client (ou la transaction) est fourni
// par l'appelant, ce qui garde la partie pure testable sans base.

export const ORIGINES_COMMISSION_APS = Object.freeze({
  MEDECIN: "medecin",
  PATIENT: "patient",
});

/**
 * Fonction PURE : lignes CommissionApsVersee à écrire pour un événement.
 * Un montant nul (ou négatif) ne produit aucune ligne.
 *
 * @param {object} p
 * @param {{ transaction_id: string, ligne_commission_id?: string|null,
 *           ligne_commission_patient_id?: string|null }} p.transaction
 * @param {number} [p.commissionMedecin=0]  CM conservée par APS
 * @param {number} [p.commissionPatient=0]  CP conservée par APS
 * @returns {Array<{ origine: string, ligne_commission_id: string, montant: number }>}
 */
export function preparerCommissionsAps({ transaction, commissionMedecin = 0, commissionPatient = 0 }) {
  const lignes = [];

  if (Number(commissionMedecin) > 0) {
    if (!transaction.ligne_commission_id) {
      throw new Error(
        `Transaction ${transaction.transaction_id} sans ligne de commission médecin figée : ` +
        "enregistrement de CM impossible."
      );
    }
    lignes.push({
      origine: ORIGINES_COMMISSION_APS.MEDECIN,
      ligne_commission_id: transaction.ligne_commission_id,
      montant: Number(commissionMedecin),
    });
  }

  if (Number(commissionPatient) > 0) {
    if (!transaction.ligne_commission_patient_id) {
      throw new Error(
        `Transaction ${transaction.transaction_id} sans ligne de commission patient figée : ` +
        "enregistrement de CP impossible."
      );
    }
    lignes.push({
      origine: ORIGINES_COMMISSION_APS.PATIENT,
      ligne_commission_id: transaction.ligne_commission_patient_id,
      montant: Number(commissionPatient),
    });
  }

  return lignes;
}

/**
 * Enregistre (idempotent) CM et/ou CP conservées par APS pour un RDV.
 *
 * @param {object} db  client Prisma ou transaction interactive (`tx`)
 * @param {object} p
 * @param {string} p.rdv_id
 * @param {object} p.transaction  ligne TransactionPaiement (scalaires suffisent)
 * @param {number} [p.commissionMedecin=0]
 * @param {number} [p.commissionPatient=0]
 * @returns {Promise<number>} nombre de lignes traitées (créées ou déjà présentes)
 */
export async function enregistrerCommissionsAps(db, { rdv_id, transaction, commissionMedecin = 0, commissionPatient = 0 }) {
  const lignes = preparerCommissionsAps({ transaction, commissionMedecin, commissionPatient });
  for (const l of lignes) {
    await db.commissionApsVersee.upsert({
      where: { rdv_id_origine: { rdv_id, origine: l.origine } },
      create: {
        rdv_id,
        transaction_id: transaction.transaction_id,
        origine: l.origine,
        ligne_commission_id: l.ligne_commission_id,
        montant: l.montant,
      },
      update: {},
    });
  }
  return lignes.length;
}
