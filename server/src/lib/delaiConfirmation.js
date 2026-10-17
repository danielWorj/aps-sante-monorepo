// src/lib/delaiConfirmation.js
// Agenda — calculs PURS autour du délai de confirmation H d'un rendez-vous.
//
// Module SANS dépendance : testable sans base.
//
// Un RDV « cree » (demandé mais pas encore confirmé, c.-à-d. pas encore payé)
// réserve son créneau : la case disparaît de la grille des autres patients.
// Cette réservation est provisoire : à l'échéance
//   échéance = min(date_creation + H, date_creneau)
// le RDV est annulé automatiquement et la case redevient disponible.
//
// Principe « aucune valeur dérivée stockée » (comme delaiLiberation.js) : en
// base on ne garde que les FAITS `rendez_vous.date_creation` et
// `rendez_vous.delai_confirmation_heures` (H figé à la création) ;
// l'échéance se recalcule ici.

const MS_PAR_HEURE = 60 * 60 * 1000;

// Bornes de H : miroir de la contrainte CHECK
// parametre_delai_confirmation_heures_check (1 <= heures <= 720) de la
// migration 20261017100100_agenda_reservation.
export const HEURES_MIN = 1;
export const HEURES_MAX = 720;

// Valeur appliquée quand aucun paramètre actif n'existe pour le pays.
export const DELAI_CONFIRMATION_PAR_DEFAUT_H = 4;

/**
 * H est-il une valeur acceptable ? Entier, dans [HEURES_MIN, HEURES_MAX].
 * Pas de conversion implicite ("4" ou 4.5 sont refusés).
 * @param {unknown} heures
 * @returns {boolean}
 */
export function heuresDelaiConfirmationValides(heures) {
  return Number.isInteger(heures) && heures >= HEURES_MIN && heures <= HEURES_MAX;
}

/**
 * Échéance de confirmation d'un RDV « cree ».
 * @param {{ date_creation: Date|string, date_creneau: Date|string, delai_confirmation_heures?: number|null }} rdv
 * @param {number} [delaiParDefaut] H à appliquer quand le RDV n'en porte pas
 *   (RDV antérieur au module) : le délai actif du pays, à défaut 4 h.
 * @returns {Date}
 */
export function echeanceConfirmation(rdv, delaiParDefaut = DELAI_CONFIRMATION_PAR_DEFAUT_H) {
  const heures = rdv.delai_confirmation_heures ?? delaiParDefaut;
  const creation = new Date(rdv.date_creation).getTime();
  const creneau = new Date(rdv.date_creneau).getTime();
  if (Number.isNaN(creation) || Number.isNaN(creneau)) {
    throw new Error(`RDV ${rdv.rdv_id ?? "?"} : date_creation ou date_creneau invalide.`);
  }
  return new Date(Math.min(creation + heures * MS_PAR_HEURE, creneau));
}

/**
 * L'échéance est-elle atteinte ? Borne INCLUSIVE.
 * @param {object} rdv voir echeanceConfirmation
 * @param {Date} [maintenant]
 * @param {number} [delaiParDefaut]
 * @returns {boolean}
 */
export function confirmationExpiree(rdv, maintenant = new Date(), delaiParDefaut = DELAI_CONFIRMATION_PAR_DEFAUT_H) {
  return echeanceConfirmation(rdv, delaiParDefaut).getTime() <= maintenant.getTime();
}
