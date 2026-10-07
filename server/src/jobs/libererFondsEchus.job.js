// src/jobs/libererFondsEchus.job.js
// Libération différée des fonds — Phase 3 : déclencheur périodique.
//
// Un passage = libererFondsEchus() (liberationDifferee.service.js) : libère
// l'escrow de chaque RDV dont la fin de consultation a été constatée et dont
// le délai T figé est écoulé (termine_le + delai_liberation_heures <= maintenant).
//
// Ce fichier ne contient AUCUNE règle métier : il ajoute seulement
//   - un verrou en mémoire contre le chevauchement de deux passages dans CE
//     process (un passage long ne doit pas être doublé par le tick suivant) ;
//   - la garantie qu'un passage ne rejette jamais (le scheduler ne doit pas
//     planter sur une erreur inattendue, ex. base injoignable).
// Le chevauchement entre plusieurs instances du serveur reste sans danger :
// la libération est idempotente (verrou de ligne + UPDATE conditionnel
// sur l'escrow « sequestre » dans libererFonds).

import { libererFondsEchus } from "../services/liberationDifferee.service.js";

let passageEnCours = false;

/**
 * @param {{ maintenant?: Date, limite?: number }} [options]
 * @returns {Promise<{ candidats: number, liberes: number, ignores: number, echecs: number, saute?: true }>}
 */
export async function libererFondsEchusJob(options = {}) {
  if (passageEnCours) {
    console.warn("[liberation-differee] Passage précédent encore en cours : tick ignoré.");
    return { candidats: 0, liberes: 0, ignores: 0, echecs: 0, saute: true };
  }
  passageEnCours = true;
  try {
    return await libererFondsEchus(options);
  } finally {
    passageEnCours = false;
  }
}