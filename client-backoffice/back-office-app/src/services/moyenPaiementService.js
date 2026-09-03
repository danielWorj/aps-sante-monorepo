// src/services/moyenPaiementService.js
//
// Couche d'accès API pour le module transverse "Moyens de paiement du
// médecin" (Mobile Money & Compte Bancaire). Miroir front-end unique
// de moyenPaiement.controller.js / moyenPaiement.routes.js — calqué
// sur medecinService.js pour rester cohérent avec le reste du front.
//
// S'appuie entièrement sur `apiFetch` (src/lib/apiClient.js) : celui-ci
// ajoute déjà l'access token en mémoire (Authorization: Bearer …), gère
// le cookie httpOnly du refresh token et rejoue automatiquement la
// requête en cas de 401 expiré. On ne réimplémente rien de tout ça ici.
//
// Note : `API_BASE_URL` (dans apiClient.js) inclut déjà le préfixe
// "/api" — les chemins ci-dessous commencent donc directement par
// "/types-mobile-money…", "/mobile-moneys…", "/comptes-bancaires…",
// "/medecins/:medecin_id/…", pas par "/api/…".
//
// Ce module couvre trois entités distinctes du schema.prisma (voir
// moyenPaiement.controller.js pour le détail des champs) :
//   - TypeMobileMoney : référentiel des opérateurs Mobile Money par
//     pays { id, pays_id, libelle } — lecture publique, écriture
//     admin/superadmin, suppression superadmin.
//   - MobileMoney     : coordonnées Mobile Money d'un médecin
//     { id, type_mobile_money_id, medecin_id, numero, titulaire } —
//     accès restreint au médecin propriétaire ou admin/superadmin.
//   - CompteBancaire  : coordonnées bancaires d'un médecin
//     { id, medecin_id, nom_banque, titulaire, iban } — accès
//     restreint au médecin propriétaire ou admin/superadmin.
//
// Toutes les routes MobileMoney/CompteBancaire exigent d'être
// authentifié (le routeur ne fait qu'exiger `authentifier` ;
// l'autorisation fine propriétaire vs admin est vérifiée côté serveur
// dans chaque handler du contrôleur — rien à dupliquer ici).
//
// apiFetch lève une Error (avec `.status` et `.data`) si le backend
// répond en erreur — chaque fonction ci-dessous se contente de la
// laisser remonter telle quelle à l'appelant. À noter en particulier :
//   - creerMobileMoney / creerCompteBancaire : 400 si un champ
//     obligatoire manque, 404 si medecin_id ne correspond à aucun
//     médecin, 403 si l'appelant n'est ni le médecin concerné ni
//     admin/superadmin.
//   - supprimerTypeMobileMoney : 409 si des MobileMoney référencent
//     encore ce type (contrainte FK, voir P2003 dans le contrôleur).

import { apiFetch } from '../lib/apiClient';

function construireParametres(filtres = {}) {
  const params = new URLSearchParams();
  Object.entries(filtres).forEach(([cle, valeur]) => {
    if (valeur !== undefined && valeur !== null && valeur !== '') {
      params.append(cle, valeur);
    }
  });
  const chaine = params.toString();
  return chaine ? `?${chaine}` : '';
}

/* ===================================================================
 * TypeMobileMoney (Référentiel des opérateurs Mobile Money par pays)
 *
 * Lecture publique (aucun token requis) — écriture et modification
 * réservées à admin/superadmin, suppression réservée à superadmin
 * (409 si des MobileMoney référencent encore ce type).
 * =================================================================== */

/**
 * GET /api/types-mobile-money
 * PUBLIQUE.
 * @param {Object} filtres - { pays_id? } — seul filtre reconnu par le
 *   contrôleur.
 * @returns {Promise<Array>} liste des types de Mobile Money, chacun
 *   avec `pays` inclus (voir SELECTION_PAYS_PUBLIC côté serveur).
 */
export function listerTypesMobileMoney(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/types-mobile-money${suffixe}`).then((d) => d.typesMobileMoney ?? []);
}

/**
 * GET /api/types-mobile-money/:id
 * PUBLIQUE.
 * @returns {Promise<Object>} le type de Mobile Money (avec `pays` inclus)
 */
export function obtenirTypeMobileMoney(id) {
  return apiFetch(`/types-mobile-money/${id}`).then((d) => d.typeMobileMoney);
}

/**
 * POST /api/types-mobile-money  (admin/superadmin uniquement)
 * @param {Object} donnees - { pays_id, libelle } — les deux obligatoires
 *   (400 sinon), pays_id doit référencer un pays existant (400 sinon).
 * @returns {Promise<Object>} le type de Mobile Money créé
 */
export function creerTypeMobileMoney(donnees) {
  return apiFetch('/types-mobile-money', { method: 'POST', body: donnees }).then(
    (d) => d.typeMobileMoney
  );
}

/**
 * PUT /api/types-mobile-money/:id  (admin/superadmin uniquement)
 * @param {Object} donnees - champs partiels parmi { pays_id?, libelle? } ;
 *   pays_id, si fourni, doit référencer un pays existant (400 sinon).
 * @returns {Promise<Object>} le type de Mobile Money mis à jour
 */
export function modifierTypeMobileMoney(id, donnees) {
  return apiFetch(`/types-mobile-money/${id}`, { method: 'PUT', body: donnees }).then(
    (d) => d.typeMobileMoney
  );
}

/**
 * DELETE /api/types-mobile-money/:id  (superadmin uniquement)
 * ⚠️ Le contrôleur renvoie 409 si des MobileMoney référencent encore
 * ce type — l'appelant doit prévoir la gestion de ce cas (message
 * d'erreur adapté plutôt qu'un échec silencieux).
 */
export function supprimerTypeMobileMoney(id) {
  return apiFetch(`/types-mobile-money/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * MobileMoney (Coordonnées Mobile Money d'un médecin)
 *
 * Toutes les routes exigent d'être authentifié. Autorisation fine
 * (médecin propriétaire vs admin/superadmin) gérée côté serveur dans
 * chaque handler du contrôleur.
 * =================================================================== */

/**
 * GET /api/medecins/:medecin_id/mobile-moneys
 * Réservé au médecin propriétaire ou admin/superadmin (403 sinon,
 * 404 si medecin_id introuvable).
 * @param {string} medecinId
 * @returns {Promise<Array>} liste des MobileMoney du médecin, chacun
 *   avec `type_mobile_money` (et son `pays`) inclus.
 */
export function listerMobileMoneyMedecin(medecinId) {
  return apiFetch(`/medecins/${medecinId}/mobile-moneys`).then((d) => d.mobileMoneys ?? []);
}

/**
 * GET /api/mobile-moneys/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 * @returns {Promise<Object>} le MobileMoney, avec `type_mobile_money`
 *   (et son `pays`) ainsi que `medecin` (id + utilisateur_id) inclus.
 */
export function obtenirMobileMoney(id) {
  return apiFetch(`/mobile-moneys/${id}`).then((d) => d.mobileMoney);
}

/**
 * POST /api/mobile-moneys
 * Réservé au médecin propriétaire ou admin/superadmin.
 * @param {Object} donnees - { medecin_id, type_mobile_money_id, numero,
 *   titulaire } — tous obligatoires (400 sinon), medecin_id doit
 *   correspondre à un médecin existant (404 sinon), type_mobile_money_id
 *   à un opérateur existant (400 sinon).
 * @returns {Promise<Object>} le MobileMoney créé
 */
export function creerMobileMoney(donnees) {
  return apiFetch('/mobile-moneys', { method: 'POST', body: donnees }).then((d) => d.mobileMoney);
}

/**
 * PUT /api/mobile-moneys/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 * @param {Object} donnees - champs partiels parmi { numero?, titulaire?,
 *   type_mobile_money_id? } ; type_mobile_money_id, si fourni, doit
 *   référencer un opérateur existant (400 sinon).
 * @returns {Promise<Object>} le MobileMoney mis à jour
 */
export function modifierMobileMoney(id, donnees) {
  return apiFetch(`/mobile-moneys/${id}`, { method: 'PUT', body: donnees }).then(
    (d) => d.mobileMoney
  );
}

/**
 * DELETE /api/mobile-moneys/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export function supprimerMobileMoney(id) {
  return apiFetch(`/mobile-moneys/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * CompteBancaire (Coordonnées bancaires d'un médecin)
 *
 * Mêmes règles d'accès que MobileMoney : authentifier obligatoire,
 * autorisation fine (propriétaire ou admin/superadmin) gérée côté
 * serveur.
 * =================================================================== */

/**
 * GET /api/medecins/:medecin_id/comptes-bancaires
 * Réservé au médecin propriétaire ou admin/superadmin (403 sinon,
 * 404 si medecin_id introuvable).
 * @param {string} medecinId
 * @returns {Promise<Array>} liste des comptes bancaires du médecin
 */
export function listerComptesBancairesMedecin(medecinId) {
  return apiFetch(`/medecins/${medecinId}/comptes-bancaires`).then(
    (d) => d.comptesBancaires ?? []
  );
}

/**
 * GET /api/comptes-bancaires/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 * @returns {Promise<Object>} le compte bancaire, avec `medecin`
 *   (id + utilisateur_id) inclus.
 */
export function obtenirCompteBancaire(id) {
  return apiFetch(`/comptes-bancaires/${id}`).then((d) => d.compteBancaire);
}

/**
 * POST /api/comptes-bancaires
 * Réservé au médecin propriétaire ou admin/superadmin.
 * @param {Object} donnees - { medecin_id, nom_banque, titulaire, iban }
 *   — tous obligatoires (400 sinon), medecin_id doit correspondre à un
 *   médecin existant (404 sinon).
 * @returns {Promise<Object>} le compte bancaire créé
 */
export function creerCompteBancaire(donnees) {
  return apiFetch('/comptes-bancaires', { method: 'POST', body: donnees }).then(
    (d) => d.compteBancaire
  );
}

/**
 * PUT /api/comptes-bancaires/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 * @param {Object} donnees - champs partiels parmi { nom_banque?,
 *   titulaire?, iban? }.
 * @returns {Promise<Object>} le compte bancaire mis à jour
 */
export function modifierCompteBancaire(id, donnees) {
  return apiFetch(`/comptes-bancaires/${id}`, { method: 'PUT', body: donnees }).then(
    (d) => d.compteBancaire
  );
}

/**
 * DELETE /api/comptes-bancaires/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export function supprimerCompteBancaire(id) {
  return apiFetch(`/comptes-bancaires/${id}`, { method: 'DELETE' });
}

const MoyenPaiementService = {
  // TypeMobileMoney (référentiel)
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

export default MoyenPaiementService;