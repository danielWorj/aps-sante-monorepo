// src/services/annonceService.js
// Service de consommation des APIs du module "Annonces" (voir
// src/routes/annonce.routes.js et src/controllers/annonce.controller.js
// côté backend), bâti sur le même client centralisé src/lib/apiClient.js
// que medecinService.js / authService.js (apiFetch : Authorization
// automatique depuis l'access token en mémoire, refresh silencieux sur
// 401, erreurs déjà normalisées avec .message/.status — donc pas de
// gestion d'erreur supplémentaire ici).
//
// Module autonome (schema.prisma, model Annonce) — aucune relation vers
// un autre module métier, même esprit que MobileApk : CRUD complet +
// gestion d'un fichier optionnel (image ou PDF) sur Cloudinary.
//
// ⚠️ file_url : le backend ne renvoie QUE l'URL déjà construite via
// construireUrl() (voir annonce.controller.js), jamais le public_id
// Cloudinary brut — rien à reconstruire ici côté front.
//
// ⚠️ expiree : calculé à la volée côté serveur (date_creation +
// jour_validite dépassée), exposé directement sur chaque annonce
// renvoyée — ne pas le recalculer côté front.
//
// Accès :
//   - listerAnnonces / obtenirAnnonce                → PUBLIQUE
//   - creerAnnonce / modifierAnnonce / activerAnnonce /
//     desactiverAnnonce / supprimerAnnonce           → admin/superadmin

import { apiFetch } from '../lib/apiClient';

// Construit une query string à partir d'un objet, en ignorant les
// valeurs vides/undefined/null (apiFetch ne gère pas les params lui-
// même, contrairement à un client axios).
function construireQueryString(params = {}) {
  const entrees = Object.entries(params).filter(
    ([, valeur]) => valeur !== undefined && valeur !== null && valeur !== ''
  );
  if (entrees.length === 0) return '';
  const recherche = new URLSearchParams(entrees);
  return `?${recherche.toString()}`;
}

// Construit un FormData à partir des champs texte/nombre et d'un
// fichier optionnel (`fichier` — image ou PDF, voir
// gererTeleversementAnnonce côté backend). Même règle que sur
// medecinService.js : les valeurs undefined/null sont omises pour ne
// pas écraser un champ non fourni en modification.
function construireFormData(donnees = {}, fichier = null) {
  const formData = new FormData();

  Object.entries(donnees).forEach(([cle, valeur]) => {
    if (valeur === undefined || valeur === null) return;
    formData.append(cle, typeof valeur === 'boolean' ? String(valeur) : valeur);
  });

  if (fichier) {
    formData.append('fichier', fichier);
  }

  return formData;
}

/* ===================================================================
 * Annonces
 * =================================================================== */

/**
 * GET /annonces
 * Route PUBLIQUE.
 * @param {Object} [filtres]
 * @param {boolean} [filtres.statut] - filtre exact sur le champ statut.
 * @param {string} [filtres.recherche] - recherche insensible à la casse
 *   sur libelle.
 * @param {boolean} [filtres.actives] - ne renvoie que les annonces ni
 *   désactivées ni expirées (pratique pour l'affichage public, sans
 *   dupliquer le calcul d'expiration côté front).
 * @returns {Promise<Array>} liste des annonces, triée de la plus
 *   récente à la plus ancienne, chaque annonce portant `expiree`
 *   (booléen calculé côté serveur).
 */
export async function listerAnnonces(filtres = {}) {
  const data = await apiFetch(`/annonces${construireQueryString(filtres)}`);
  return data.annonces;
}

/**
 * GET /annonces/:id
 * Route PUBLIQUE.
 */
export async function obtenirAnnonce(id) {
  const data = await apiFetch(`/annonces/${id}`);
  return data.annonce;
}

/**
 * POST /annonces
 * Réservé à admin/superadmin côté backend (voir annonce.routes.js).
 * Envoie un multipart/form-data car un fichier est possible même si
 * optionnel (une annonce peut être purement textuelle).
 *
 * @param {Object} donnees
 * @param {string} donnees.libelle - requis.
 * @param {string} [donnees.description] - optionnel.
 * @param {number} donnees.jour_validite - requis, entier > 0 (durée de
 *   validité en jours à partir de la création, pas une date de fin).
 * @param {File} [fichier] - visuel ou flyer PDF de l'annonce.
 * @returns {Promise<Object>} l'annonce créée (statut=true par défaut,
 *   non paramétrable à la création — désactiver ensuite via
 *   desactiverAnnonce si besoin).
 */
export async function creerAnnonce(donnees, fichier = null) {
  const data = await apiFetch('/annonces', {
    method: 'POST',
    body: construireFormData(donnees, fichier),
  });
  return data.annonce;
}

/**
 * PUT /annonces/:id
 * Réservé à admin/superadmin. Tous les champs sont optionnels et
 * partiels : { libelle?, description?, jour_validite?, statut? }.
 * `fichier` remplace file_url si fourni (l'ancien fichier Cloudinary
 * est nettoyé côté serveur après confirmation de la mise à jour) ;
 * omettre `fichier` conserve le fichier existant.
 *
 * @param {string} id
 * @param {Object} [donnees] - { libelle?, description?, jour_validite?, statut? }
 * @param {File} [fichier]
 * @returns {Promise<Object>} l'annonce mise à jour.
 */
export async function modifierAnnonce(id, donnees = {}, fichier = null) {
  const data = await apiFetch(`/annonces/${id}`, {
    method: 'PUT',
    body: construireFormData(donnees, fichier),
  });
  return data.annonce;
}

/**
 * PATCH /annonces/:id/activer
 * Réservé à admin/superadmin. Équivalent explicite à
 * modifierAnnonce(id, { statut: true }) — isolé en action dédiée,
 * même esprit que publierMedecin/reactiverMedecin.
 */
export async function activerAnnonce(id) {
  const data = await apiFetch(`/annonces/${id}/activer`, { method: 'PATCH' });
  return data.annonce;
}

/**
 * PATCH /annonces/:id/desactiver
 * Réservé à admin/superadmin. Équivalent explicite à
 * modifierAnnonce(id, { statut: false }).
 */
export async function desactiverAnnonce(id) {
  const data = await apiFetch(`/annonces/${id}/desactiver`, { method: 'PATCH' });
  return data.annonce;
}

/**
 * DELETE /annonces/:id
 * Réservé à admin/superadmin. Suppression PHYSIQUE — aucune table ne
 * référence Annonce (modèle autonome), donc pas de risque de
 * contrainte P2003 côté serveur ; le fichier Cloudinary associé, s'il
 * existe, est nettoyé après la suppression en base.
 */
export async function supprimerAnnonce(id) {
  return apiFetch(`/annonces/${id}`, { method: 'DELETE' });
}

export default {
  listerAnnonces,
  obtenirAnnonce,
  creerAnnonce,
  modifierAnnonce,
  activerAnnonce,
  desactiverAnnonce,
  supprimerAnnonce,
};