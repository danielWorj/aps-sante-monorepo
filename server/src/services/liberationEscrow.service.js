// src/services/liberationEscrow.service.js
// Politique de fonds v2 §1, §3, §5, §7 — Libération de l'escrow vers le
// médecin.
//
// Vocabulaire : H = honoraires ; CM = commission MÉDECIN ; CP = commission
// PATIENT.
//
// Crédit du médecin = H − CM − amendes imputées :
//   1. CM (ligne_commission FIGÉE sur la transaction à la capture) est
//      prélevée ICI, à la libération, et enregistrée comme fait de
//      versement à APS (CommissionApsVersee, origine « medecin ») ;
//   2. CP (ligne_commission_patient FIGÉE, payée par le patient EN SUS des
//      honoraires) est conservée par APS : elle n'entame jamais le crédit
//      du médecin, et est enregistrée (origine « patient ») ;
//   3. le net (H − CM) est crédité au portefeuille (`credit_honoraires`) ;
//   4. les amendes en attente du médecin sont ensuite imputées sur ce
//      crédit (`debit_amende`, reversé à APS), plafonnées au crédit.
// Les frais d'envoi de l'agrégateur restent à la charge du patient : ils
// n'entrent jamais dans ce calcul. Rien n'est stocké en dérivé : CM et CP
// se recalculent depuis montant_honoraires × taux de la ligne figée.
// Transaction antérieure à CP (ligne NULL) : CP = 0, aucune ligne « patient ».
//
// Appelée par :
//   - libererEscrow(rdv_id) : RDV honoré (scan QR, clôture visio,
//     forcer-liberation) — comportement historique conservé ;
//   - libererFonds(rdv_id, { statutRdv }, tx) : annulation patient < 24h
//     et patient absent (statut « annule » / « non_honore »), étape 5,
//     éventuellement dans la transaction de l'appelant.

import prisma from "../lib/prisma.js";
import { decimalesPourMontant } from "../utils/montants.js";
import { repartirLiberation } from "./politiqueFonds.service.js";
import { creerMouvement } from "./portefeuille.service.js";
import { appliquerAmendesEnAttente } from "./amende.service.js";
import { enregistrerCommissionsAps } from "./commissionAps.service.js";

const STATUTS_RDV_LIBERATION = ["honore", "annule", "non_honore"];

/**
 * Libère l'escrow d'un rendez-vous vers le médecin (voir en-tête).
 *
 * Idempotence : l'escrow est « réservé » par un UPDATE conditionnel
 * (`WHERE statut = 'sequestre'`). Un second appel (double clôture visio,
 * webhook rejoué, course scan QR / forcer-liberation) obtient count = 0
 * et sort sans rien écrire. Escrow absent, déjà libéré, remboursé ou
 * gelé par un litige -> `deja_traite: true`, jamais d'exception.
 *
 * @param {string} rdv_id
 * @param {{ statutRdv?: "honore"|"annule"|"non_honore" }} [options]
 * @param {object} [tx] transaction Prisma de l'appelant (sinon une est ouverte)
 * @returns {Promise<{ deja_traite: boolean, honoraires?: number,
 *   commission_medecin?: number,   // CM (origine « medecin »)
 *   commission_patient?: number,   // CP conservée par APS (origine « patient »)
 *   commission_aps?: number,       // ALIAS DÉPRÉCIÉ de commission_medecin
 *   net_medecin?: number, amendes_imputees?: number, credit_final?: number }>}
 */
export async function libererFonds(rdv_id, { statutRdv = "honore" } = {}, tx) {
  if (!STATUTS_RDV_LIBERATION.includes(statutRdv)) {
    throw new Error(`Statut de RDV invalide pour une libération : "${statutRdv}".`);
  }

  const executer = async (db) => {
    const escrow = await db.compteEscrow.findUnique({
      where: { rdv_id },
      include: { transaction: { include: { ligne_commission: true, ligne_commission_patient: true } } },
    });
    if (!escrow || escrow.statut !== "sequestre") return { deja_traite: true };

    const t = escrow.transaction;
    if (t.montant_honoraires == null || !t.ligne_commission) {
      throw new Error(
        `Transaction ${t.transaction_id} sans honoraires ou sans ligne de commission figée : libération impossible.`
      );
    }

    // Réservation atomique de l'escrow (voir « Idempotence »).
    const { count } = await db.compteEscrow.updateMany({
      where: { escrow_id: escrow.escrow_id, statut: "sequestre" },
      data: { statut: "libere" },
    });
    if (count !== 1) return { deja_traite: true };

    const rdv = await db.rendezVous.update({
      where: { rdv_id },
      data: { statut: statutRdv },
      select: { medecin_id: true },
    });

    const decimales = decimalesPourMontant({ fournisseur: t.fournisseur, devise: t.devise });
    const { honoraires, commissionMedecin, commissionPatient, netMedecin } = repartirLiberation({
      honoraires: t.montant_honoraires,
      commission: t.ligne_commission,
      commissionPatient: t.ligne_commission_patient,
      decimales,
    });

    // Faits de versement à APS : une ligne par (RDV, origine) — CM
    // « medecin », CP « patient » — écrites par upsert (idempotent).
    await enregistrerCommissionsAps(db, {
      rdv_id,
      transaction: t,
      commissionMedecin,
      commissionPatient,
    });

    await creerMouvement(
      {
        medecin_id: rdv.medecin_id,
        type: "credit_honoraires",
        montant: netMedecin,
        rdv_id,
        reference_idempotence: rdv_id,
      },
      db
    );

    const amendes = await appliquerAmendesEnAttente(
      { medecin_id: rdv.medecin_id, creditNet: netMedecin, decimales },
      db
    );

    return {
      deja_traite: false,
      honoraires,
      commission_medecin: commissionMedecin,
      commission_patient: commissionPatient,
      commission_aps: commissionMedecin, // alias déprécié de commission_medecin
      net_medecin: netMedecin,
      amendes_imputees: amendes.totalImpute,
      credit_final: amendes.creditApres,
    };
  };

  return tx ? executer(tx) : prisma.$transaction(executer);
}

/**
 * RDV honoré : libération standard (scan QR, clôture de téléconsultation,
 * forcer-liberation). Signature historique conservée pour les appelants.
 * @param {string} rdv_id
 */
export function libererEscrow(rdv_id) {
  return libererFonds(rdv_id, { statutRdv: "honore" });
}