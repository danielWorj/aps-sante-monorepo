// src/services/liberationDifferee.service.js
// Libération différée des fonds — Phase 2 : libération de l'escrow une fois
// le délai T écoulé après la fin de consultation constatée
// (finConsultation.service.js).
//
//   date de libération = termine_le + delai_liberation_heures   (recalculée,
//   jamais stockée — lib/delaiLiberation.js)
//
// Ce service ne fait QUE sélectionner les RDV échus et déléguer le
// mouvement d'argent à libererFonds (liberationEscrow.service.js), qui reste
// l'exécuteur unique : commissions, crédit du portefeuille, imputation des
// amendes, idempotence par l'escrow (UPDATE conditionnel sur « sequestre »).
// Le déclencheur périodique (job + scheduler) n'est pas ici.
//
// Garde-fous :
//   - seuls les RDV encore « confirme » / « en_attente_presence » sont
//     libérés : un RDV passé entre-temps en « conteste », « annule » ou
//     « non_honore » n'est JAMAIS libéré par ce chemin (le litige gèle les
//     fonds) ;
//   - chaque libération s'exécute dans UNE transaction qui verrouille la
//     ligne du RDV et revérifie statut + échéance, pour qu'une annulation
//     ou une contestation concurrente ne puisse pas s'intercaler ;
//   - chaque RDV est traité indépendamment : une erreur sur l'un (ex.
//     ligne de commission figée absente) n'interrompt pas les autres, et il
//     est retenté au passage suivant (il reste « sequestre »).

import prisma from "../lib/prisma.js";
import { delaiLiberationEcoule, etatLiberation } from "../lib/delaiLiberation.js";
import { libererFonds } from "./liberationEscrow.service.js";

// Mêmes statuts que la constatation de fin de consultation.
export const STATUTS_LIBERATION_DIFFEREE = Object.freeze(["confirme", "en_attente_presence"]);

// Plafond de libérations par passage : borne la durée d'un cycle de job ; le
// reliquat est repris au passage suivant (les plus anciens d'abord).
export const LIMITE_LIBERATIONS_PAR_PASSAGE = 100;

/**
 * RDV dont le délai T est écoulé et dont les fonds sont encore en séquestre,
 * du plus ancien au plus récent. La date d'échéance se recalcule en
 * JavaScript (lib/delaiLiberation.js) : une seule définition de l'échéance.
 * Le préfiltre SQL (`termine_le <= maintenant`) est nécessaire mais pas
 * suffisant ; il évite seulement de charger les RDV d'aujourd'hui.
 *
 * @param {{ maintenant?: Date, limite?: number }} [options]
 * @param {object} [client]
 * @returns {Promise<Array<{ rdv_id: string, termine_le: Date, delai_liberation_heures: number, date_liberation: Date }>>}
 */
export async function trouverRdvsALiberer(
  { maintenant = new Date(), limite = LIMITE_LIBERATIONS_PAR_PASSAGE } = {},
  client = prisma
) {
  const candidats = await client.rendezVous.findMany({
    where: {
      statut: { in: [...STATUTS_LIBERATION_DIFFEREE] },
      termine_le: { not: null, lte: maintenant },
      delai_liberation_heures: { not: null },
      compte_escrow: { is: { statut: "sequestre" } },
    },
    select: { rdv_id: true, termine_le: true, delai_liberation_heures: true },
    orderBy: [{ termine_le: "asc" }, { rdv_id: "asc" }],
  });

  return candidats
    .filter((rdv) => delaiLiberationEcoule(rdv, maintenant))
    .slice(0, limite)
    .map((rdv) => ({ ...rdv, date_liberation: etatLiberation(rdv, maintenant).date_liberation }));
}

/**
 * Libère les fonds d'UN rendez-vous si (et seulement si) son délai T est
 * écoulé. Sans effet, sans exception, dans tous les autres cas : renvoie
 * `libere: false` et la `raison`.
 *
 * @param {string} rdv_id
 * @param {{ maintenant?: Date }} [options]
 * @returns {Promise<
 *   { libere: true, honoraires: number, commission_medecin: number, commission_patient: number,
 *     net_medecin: number, amendes_imputees: number, credit_final: number }
 *   | { libere: false, raison: "rdv_introuvable"|"statut_non_eligible"|"consultation_non_terminee"|"delai_en_cours"|"deja_traite",
 *       date_liberation?: Date }>}
 */
export async function libererRdvEchu(rdv_id, { maintenant = new Date() } = {}) {
  return prisma.$transaction(async (tx) => {
    // Verrou de ligne : sérialise avec toute autre opération qui prend le
    // même verrou (constatation de fin, saisie du code).
    await tx.$queryRaw`SELECT rdv_id FROM rendez_vous WHERE rdv_id = ${rdv_id}::uuid FOR UPDATE`;

    const rdv = await tx.rendezVous.findUnique({
      where: { rdv_id },
      select: { rdv_id: true, statut: true, termine_le: true, delai_liberation_heures: true },
    });
    if (!rdv) return { libere: false, raison: "rdv_introuvable" };
    if (!STATUTS_LIBERATION_DIFFEREE.includes(rdv.statut)) return { libere: false, raison: "statut_non_eligible" };
    if (!rdv.termine_le || rdv.delai_liberation_heures == null) {
      return { libere: false, raison: "consultation_non_terminee" };
    }
    if (!delaiLiberationEcoule(rdv, maintenant)) {
      return { libere: false, raison: "delai_en_cours", date_liberation: etatLiberation(rdv, maintenant).date_liberation };
    }

    const resultat = await libererFonds(rdv_id, { statutRdv: "honore" }, tx);
    if (resultat.deja_traite) return { libere: false, raison: "deja_traite" };

    return {
      libere: true,
      honoraires: resultat.honoraires,
      commission_medecin: resultat.commission_medecin,
      commission_patient: resultat.commission_patient,
      net_medecin: resultat.net_medecin,
      amendes_imputees: resultat.amendes_imputees,
      credit_final: resultat.credit_final,
    };
  });
}

/**
 * Passage complet : libère tous les RDV échus (jusqu'à `limite`). Ne rejette
 * jamais pour une erreur propre à un RDV (journalisée, retentée au passage
 * suivant). Destinée au futur job planifié.
 *
 * @param {{ maintenant?: Date, limite?: number }} [options]
 * @returns {Promise<{ candidats: number, liberes: number, ignores: number, echecs: number }>}
 */
export async function libererFondsEchus({ maintenant = new Date(), limite = LIMITE_LIBERATIONS_PAR_PASSAGE } = {}) {
  const aLiberer = await trouverRdvsALiberer({ maintenant, limite });

  let liberes = 0;
  let ignores = 0;
  let echecs = 0;

  for (const { rdv_id } of aLiberer) {
    try {
      const resultat = await libererRdvEchu(rdv_id, { maintenant });
      if (resultat.libere) liberes += 1;
      else ignores += 1; // traité entre-temps (forcer-liberation, litige, annulation…)
    } catch (err) {
      echecs += 1;
      console.error(`[liberation-differee] Échec de la libération du rdv ${rdv_id} (retenté au prochain passage) :`, err);
    }
  }

  if (aLiberer.length > 0) {
    console.info(
      `[liberation-differee] ${liberes} libération(s), ${ignores} ignoré(s), ${echecs} échec(s), sur ${aLiberer.length} RDV échu(s).`
    );
  }
  return { candidats: aLiberer.length, liberes, ignores, echecs };
}