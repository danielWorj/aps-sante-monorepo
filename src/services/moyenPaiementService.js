// src/services/moyenPaiementService.js
// Service de consommation des APIs du module transverse "Moyens de
// paiement du médecin" (voir src/routes/moyenPaiement.routes.js et
// src/controllers/moyenPaiement.controller.js côté backend), bâti sur
// le client centralisé src/lib/apiClient.js (apiFetch : Authorization
// automatique depuis l'access token en mémoire, refresh silencieux sur
// 401, erreurs déjà normalisées avec .message/.status — donc pas de
// gestion d'erreur supplémentaire ici), même patron que
// medecinService.js et geoService.js.
//
// Ce module couvre trois entités distinctes du schema.prisma :
//   - TypeMobileMoney : référentiel des opérateurs Mobile Money par
//                       pays (lecture publique, écriture admin/superadmin).
//   - MobileMoney     : coordonnées Mobile Money d'un médecin (accès
//                       restreint au médecin propriétaire ou admin/superadmin).
//   - CompteBancaire  : coordonnées bancaires d'un médecin (mêmes
//                       règles d'accès que MobileMoney).
//
// Aucun upload de fichier ici (contrairement à medecinService.js) :
// tous les corps de requête sont des objets JSON classiques, apiFetch
// s'occupe de la sérialisation.

import { apiFetch } from '../lib/apiClient';

// Construit une query string à partir d'un objet, en ignorant les
// valeurs vides/undefined/null (même utilitaire que medecinService.js).
function construireQueryString(params = {}) {
  const entrees = Object.entries(params).filter(
    ([, valeur]) => valeur !== undefined && valeur !== null && valeur !== ''
  );
  if (entrees.length === 0) return '';
  const recherche = new URLSearchParams(entrees);
  return `?${recherche.toString()}`;
}

/* ===================================================================
 * TypeMobileMoney (référentiel des opérateurs Mobile Money par pays)
 *
 * Lecture publique (utilisable avant même la création d'un compte,
 * ex. pour peupler un formulaire de saisie de moyen de paiement).
 * Écriture réservée à admin/superadmin, suppression à superadmin (des
 * MobileMoney peuvent encore référencer ce type — le serveur renvoie
 * 409 dans ce cas, voir supprimerTypeMobileMoney).
 * =================================================================== */

/**
 * GET /types-mobile-money
 * Publique.
 * @param {Object} filtres - { pays_id? } — filtre optionnel sur le pays.
 * @returns {Promise<Array>} liste des types de Mobile Money
 */
export async function listerTypesMobileMoney(filtres = {}) {
  const data = await apiFetch(`/types-mobile-money${construireQueryString(filtres)}`);
  return data.typesMobileMoney;
}

/**
 * GET /types-mobile-money/:id
 * Publique.
 */
export async function obtenirTypeMobileMoney(id) {
  const data = await apiFetch(`/types-mobile-money/${id}`);
  return data.typeMobileMoney;
}

/**
 * POST /types-mobile-money
 * Réservé à admin/superadmin côté backend.
 * @param {Object} donnees - { pays_id, libelle } — tous deux requis.
 */
export async function creerTypeMobileMoney(donnees) {
  return apiFetch('/types-mobile-money', {
    method: 'POST',
    body: donnees,
  });
}

/**
 * PUT /types-mobile-money/:id
 * Réservé à admin/superadmin côté backend.
 * @param {Object} donnees - champs partiels parmi { pays_id, libelle }.
 */
export async function modifierTypeMobileMoney(id, donnees = {}) {
  return apiFetch(`/types-mobile-money/${id}`, {
    method: 'PUT',
    body: donnees,
  });
}

/**
 * DELETE /types-mobile-money/:id
 * Réservé à superadmin côté backend. Le serveur renvoie 409 si des
 * MobileMoney référencent encore ce type.
 */
export async function supprimerTypeMobileMoney(id) {
  return apiFetch(`/types-mobile-money/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * MobileMoney (coordonnées Mobile Money d'un médecin)
 *
 * Donnée privée : authentification requise partout. Autorisation fine
 * (médecin propriétaire vs admin/superadmin) gérée côté serveur dans
 * chaque handler — inutile de la dupliquer ici.
 * =================================================================== */

/**
 * GET /medecins/:medecin_id/mobile-moneys
 * Réservé au médecin propriétaire ou admin/superadmin.
 * @param {string} medecinId
 * @returns {Promise<Array>} liste des Mobile Money du médecin
 */
export async function listerMobileMoneyMedecin(medecinId) {
  const data = await apiFetch(`/medecins/${medecinId}/mobile-moneys`);
  return data.mobileMoneys;
}

/**
 * GET /mobile-moneys/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export async function obtenirMobileMoney(id) {
  const data = await apiFetch(`/mobile-moneys/${id}`);
  return data.mobileMoney;
}

/**
 * POST /mobile-moneys
 * Réservé au médecin propriétaire (medecin_id doit être le sien) ou
 * admin/superadmin.
 * @param {Object} donnees - { medecin_id, type_mobile_money_id, numero,
 *   titulaire } — tous requis.
 */
export async function creerMobileMoney(donnees) {
  const data = await apiFetch('/mobile-moneys', {
    method: 'POST',
    body: donnees,
  });
  return data.mobileMoney;
}

/**
 * PUT /mobile-moneys/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 * @param {Object} donnees - champs partiels parmi { numero, titulaire,
 *   type_mobile_money_id }.
 */
export async function modifierMobileMoney(id, donnees = {}) {
  const data = await apiFetch(`/mobile-moneys/${id}`, {
    method: 'PUT',
    body: donnees,
  });
  return data.mobileMoney;
}

/**
 * DELETE /mobile-moneys/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export async function supprimerMobileMoney(id) {
  return apiFetch(`/mobile-moneys/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * CompteBancaire (coordonnées bancaires d'un médecin)
 *
 * Mêmes règles d'accès que MobileMoney : authentification obligatoire,
 * autorisation fine (propriétaire ou admin/superadmin) gérée côté
 * serveur.
 * =================================================================== */

/**
 * GET /medecins/:medecin_id/comptes-bancaires
 * Réservé au médecin propriétaire ou admin/superadmin.
 * @param {string} medecinId
 * @returns {Promise<Array>} liste des comptes bancaires du médecin
 */
export async function listerComptesBancairesMedecin(medecinId) {
  const data = await apiFetch(`/medecins/${medecinId}/comptes-bancaires`);
  return data.comptesBancaires;
}

/**
 * GET /comptes-bancaires/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export async function obtenirCompteBancaire(id) {
  const data = await apiFetch(`/comptes-bancaires/${id}`);
  return data.compteBancaire;
}

/**
 * POST /comptes-bancaires
 * Réservé au médecin propriétaire (medecin_id doit être le sien) ou
 * admin/superadmin.
 * @param {Object} donnees - { medecin_id, nom_banque, titulaire, iban }
 *   — tous requis.
 */
export async function creerCompteBancaire(donnees) {
  const data = await apiFetch('/comptes-bancaires', {
    method: 'POST',
    body: donnees,
  });
  return data.compteBancaire;
}

/**
 * PUT /comptes-bancaires/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 * @param {Object} donnees - champs partiels parmi { nom_banque,
 *   titulaire, iban }.
 */
export async function modifierCompteBancaire(id, donnees = {}) {
  const data = await apiFetch(`/comptes-bancaires/${id}`, {
    method: 'PUT',
    body: donnees,
  });
  return data.compteBancaire;
}

/**
 * DELETE /comptes-bancaires/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export async function supprimerCompteBancaire(id) {
  return apiFetch(`/comptes-bancaires/${id}`, { method: 'DELETE' });
}

export default {
  // TypeMobileMoney
  listerTypesMobileMoney,
  obtenirTypeMobileMoney,
  creerTypeMobileMoney,
  modifierTypeMobileMoney,
  supprimerTypeMobileMoney,
  // MobileMoney
  listerMobileMoneyMedecin,
  obtenirMobileMoney,
  creerMobileMoney,
  modifierMobileMoney,
  supprimerMobileMoney,
  // CompteBancaire
  listerComptesBancairesMedecin,
  obtenirCompteBancaire,
  creerCompteBancaire,
  modifierCompteBancaire,
  supprimerCompteBancaire,
};