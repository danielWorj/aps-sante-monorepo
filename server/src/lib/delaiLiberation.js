// src/lib/delaiLiberation.js
// Libération différée des fonds — Phase 2 : calculs PURS autour du délai T.
//
// Module SANS dépendance (ni Prisma, ni Stripe) : testable sans base.
//
// Principe « aucune valeur dérivée stockée » : en base on ne garde que des
// FAITS — `rendez_vous.termine_le` (fin de consultation constatée) et
// `rendez_vous.delai_liberation_heures` (T figé à ce moment-là). La date de
// libération n'est JAMAIS stockée : elle se recalcule ici,
//   date_liberation = termine_le + delai_liberation_heures.

const MS_PAR_HEURE = 60 * 60 * 1000;

// Bornes de T : miroir de la contrainte CHECK
// parametre_delai_liberation_heures_check (0 <= heures <= 720) de la migration
// 20261007100000_liberation_differee_fonds.
export const HEURES_MIN = 0;
export const HEURES_MAX = 720;

/**
 * T est-il une valeur acceptable ? Entier, dans [HEURES_MIN, HEURES_MAX].
 * Pas de conversion implicite : "24" (chaîne) ou 12.5 sont refusés pour ne
 * jamais laisser Postgres (colonne INTEGER) trancher à notre place.
 * @param {unknown} heures
 * @returns {boolean}
 */
export function heuresDelaiValides(heures) {
  return Number.isInteger(heures) && heures >= HEURES_MIN && heures <= HEURES_MAX;
}

function enDate(valeur, nom) {
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${nom} invalide : « ${String(valeur)} ».`);
  }
  return d;
}

/**
 * Date à partir de laquelle les fonds peuvent être libérés.
 * @param {Date|string} termine_le
 * @param {number} delai_liberation_heures T figé sur le RDV
 * @returns {Date}
 */
export function calculerDateLiberation(termine_le, delai_liberation_heures) {
  if (!heuresDelaiValides(delai_liberation_heures)) {
    throw new Error(
      `Délai de libération invalide : « ${String(delai_liberation_heures)} » (entier de ${HEURES_MIN} à ${HEURES_MAX} heures attendu).`
    );
  }
  const debut = enDate(termine_le, "termine_le");
  return new Date(debut.getTime() + delai_liberation_heures * MS_PAR_HEURE);
}

/**
 * Le délai T est-il écoulé ? Borne INCLUSIVE : à l'instant exact
 * `termine_le + T`, les fonds sont libérables (T = 0 => libérables
 * immédiatement). Un RDV sans fin constatée (`termine_le` null) ou sans T
 * figé n'est jamais libérable : faux, sans exception.
 * @param {{ termine_le?: Date|string|null, delai_liberation_heures?: number|null }} rdv
 * @param {Date} [maintenant]
 * @returns {boolean}
 */
export function delaiLiberationEcoule(rdv, maintenant = new Date()) {
  if (!rdv?.termine_le || rdv.delai_liberation_heures == null) return false;
  return calculerDateLiberation(rdv.termine_le, rdv.delai_liberation_heures).getTime() <= maintenant.getTime();
}

/**
 * Photographie de l'état de libération d'un RDV, pour l'affichage (portefeuille,
 * détail du RDV) et pour les décisions des jobs. Tout se recalcule ici.
 *
 * `etat` :
 *   - "non_termine" : consultation pas encore constatée terminée ;
 *   - "en_attente"  : terminée, délai T en cours (`date_liberation` et
 *                     `temps_restant_ms` renseignés) ;
 *   - "echu"        : délai écoulé, libération possible.
 * « Libéré » (fonds effectivement versés) n'est PAS un état d'ici : c'est
 * le statut de l'escrow, source de vérité unique.
 *
 * @param {{ termine_le?: Date|string|null, delai_liberation_heures?: number|null }} rdv
 * @param {Date} [maintenant]
 * @returns {{ etat: "non_termine"|"en_attente"|"echu",
 *   termine_le: Date|null, delai_liberation_heures: number|null,
 *   date_liberation: Date|null, temps_restant_ms: number|null }}
 */
export function etatLiberation(rdv, maintenant = new Date()) {
  if (!rdv?.termine_le || rdv.delai_liberation_heures == null) {
    return {
      etat: "non_termine",
      termine_le: rdv?.termine_le ? enDate(rdv.termine_le, "termine_le") : null,
      delai_liberation_heures: rdv?.delai_liberation_heures ?? null,
      date_liberation: null,
      temps_restant_ms: null,
    };
  }

  const date_liberation = calculerDateLiberation(rdv.termine_le, rdv.delai_liberation_heures);
  const restant = date_liberation.getTime() - maintenant.getTime();
  return {
    etat: restant <= 0 ? "echu" : "en_attente",
    termine_le: enDate(rdv.termine_le, "termine_le"),
    delai_liberation_heures: rdv.delai_liberation_heures,
    date_liberation,
    temps_restant_ms: Math.max(0, restant),
  };
}