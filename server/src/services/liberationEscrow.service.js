// src/services/liberationEscrow.service.js
// Politique de fonds v2 §1, §3, §5, §7 — Libération de l'escrow vers le
// médecin.
//
// Crédit du médecin = honoraires − commission APS − amendes imputées :
//   1. la commission APS (ligne_commission FIGÉE sur la transaction à la
//      capture) est prélevée ICI, à la libération, et enregistrée comme
//      fait de versement à APS (CommissionApsVersee) ;
//   2. le net (honoraires − commission) est crédité au portefeuille
//      (`credit_honoraires`) ;
//   3. les amendes en attente du médecin sont ensuite imputées sur ce
//      crédit (`debit_amende`, reversé à APS), plafonnées au crédit.
// Les frais d'envoi de l'agrégateur restent à la charge du patient : ils
// n'entrent jamais dans ce calcul. Rien n'est stocké en dérivé : la
// commission se recalcule depuis montant_honoraires × ligne_commission.taux.
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
 * @returns {Promise<{ deja_traite: boolean, honoraires?: number, commission_aps?: number,
 *   net_medecin?: number, amendes_imputees?: number, credit_final?: number }>}
 */
export async function libererFonds(rdv_id, { statutRdv = "honore" } = {}, tx) {
  if (!STATUTS_RDV_LIBERATION.includes(statutRdv)) {
    throw new Error(`Statut de RDV invalide pour une libération : "${statutRdv}".`);
  }

  const executer = async (db) => {
    const escrow = await db.compteEscrow.findUnique({
      where: { rdv_id },
      include: { transaction: { include: { ligne_commission: true } } },
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
    const { honoraires, commissionAps, netMedecin } = repartirLiberation({
      honoraires: t.montant_honoraires,
      commission: t.ligne_commission,
      decimales,
    });

    // Fait de versement à APS (une seule ligne par RDV : rdv_id unique).
    if (commissionAps > 0) {
      await db.commissionApsVersee.create({
        data: {
          rdv_id,
          transaction_id: t.transaction_id,
          ligne_commission_id: t.ligne_commission.ligne_tarifaire_id,
          montant: commissionAps,
        },
      });
    }

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
      commission_aps: commissionAps,
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