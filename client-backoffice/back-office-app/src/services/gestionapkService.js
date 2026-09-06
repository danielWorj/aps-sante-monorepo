// src/services/gestionapkService.js
//
// Couche d'accès API pour le module "Gestion des APKs" de l'application
// mobile (voir gestionapk.controller.js / gestionapk.routes.js côté
// serveur). Calqué sur medecinService.js / pharmacieService.js pour
// rester cohérent avec le reste du front.
//
// S'appuie entièrement sur `apiFetch` (src/lib/apiClient.js) : celui-ci
// ajoute déjà l'access token en mémoire (Authorization: Bearer …), gère
// le cookie httpOnly du refresh token et rejoue automatiquement la
// requête en cas de 401 expiré. On ne réimplémente rien de tout ça ici.
//
// Note : `API_BASE_URL` (dans apiClient.js) inclut déjà le préfixe
// "/api" — les chemins ci-dessous commencent donc directement par
// "/apks…", pas par "/api/apks…".
//
// ⚠️ Toutes les routes CRUD (POST/GET/PUT/DELETE /apks…) sont réservées
// au SUPERADMIN (voir gestionapk.routes.js, autoriser("superadmin")) —
// apiFetch doit donc être appelé avec un utilisateur superadmin connecté,
// sinon le serveur renverra 403. Seule la route de téléchargement
// (GET /apks/download/:id/:nomFichier) est publique dans l'implémentation
// actuelle du back-end.
//
// IMPORTANT — creerApk ET modifierApk envoient un `FormData` (multipart,
// à cause de gererTeleversementApk qui traite le champ fichier unique
// `file`) et non un objet JSON. apiFetch détecte déjà les instances de
// FormData et laisse passer le corps tel quel, sans JSON.stringify ni
// Content-Type manuel — rien à faire ici de ce côté.
// ⚠️ La clé FormData attendue par multer est `file` (PAS `file_url`, qui
// est le nom de la colonne en base écrite par le contrôleur après
// upload — voir gestionapk.controller.js, req.file).
//
// Contraintes serveur à respecter côté formulaire (voir
// gestionapk.controller.js) :
//   - file      : extension .apk obligatoire, MIME
//     application/vnd.android.package-archive ou application/octet-stream,
//     5 Mo… en fait 100 Mo max (TAILLE_MAX_APK) ;
//   - libelle   : obligatoire à la création, jamais vide en modification
//     si envoyé (le serveur rejette une chaîne vide avec 400) ;
//   - description : optionnelle, effacée si envoyée vide/null ;
//   - status    : optionnel, booléen, true par défaut à la création.
//
// apiFetch lève une Error (avec `.status` et `.data`) si le backend
// répond en erreur — chaque fonction ci-dessous se contente de la
// laisser remonter telle quelle à l'appelant.

import { apiFetch, API_BASE_URL } from '../lib/apiClient';

// Champ fichier attendu par gererTeleversementApk — nom de la clé
// multer (upload_apk.middleware.js, .single("file") ou équivalent),
// PAS le nom de la colonne en base (file_url) — voir
// gestionapk.controller.js (req.file).
const CHAMP_FICHIER_APK = 'file';

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

/**
 * Construit le FormData envoyé à la création/modification d'une APK :
 * les champs texte tels quels, et `file` uniquement s'il contient un
 * vrai `File`. En modification, cela permet un envoi partiel : un
 * fichier non re-sélectionné n'est pas renvoyé, donc l'ancien fichier
 * reste en place côté serveur (voir modifierApk, gestionapk.controller.js
 * : `file_url` n'est mis à jour que si `req.file` est présent).
 */
function construireFormDataApk(donnees = {}) {
  const formData = new FormData();
  Object.entries(donnees).forEach(([cle, valeur]) => {
    if (valeur === undefined || valeur === null) return;
    if (cle === CHAMP_FICHIER_APK) {
      if (valeur instanceof File) formData.append(cle, valeur);
      return;
    }
    // FormData ne transporte que des strings : un booléen JS (status)
    // est converti explicitement en "true"/"false" plutôt que de
    // laisser le navigateur le faire implicitement — plus lisible, et
    // ça documente le contrat attendu côté backend (Boolean(status)).
    formData.append(cle, typeof valeur === 'boolean' ? String(valeur) : valeur);
  });
  return formData;
}

/* ===================================================================
 * APKs — CRUD (réservé SUPERADMIN)
 * =================================================================== */

/**
 * POST /api/apks  (superadmin uniquement)
 * Crée une nouvelle APK avec upload du fichier .apk.
 * @param {Object} donnees - {
 *   libelle,             // requis, string, max 255 caractères
 *   description?,        // optionnel, string
 *   status?,              // optionnel, boolean, true par défaut côté serveur
 *   file,                 // requis, File (.apk, max 100 Mo)
 * }
 * @returns {Promise<Object>} l'APK créée : { id, libelle, description,
 *   file_url (URL de téléchargement prête à l'emploi, ex.
 *   "/api/apks/download/{id}/{nomFichier}"), status, date_upload }
 */
export function creerApk(donnees) {
  return apiFetch('/apks', { method: 'POST', body: construireFormDataApk(donnees) }).then(
    (d) => d.apk
  );
}

/**
 * GET /api/apks  (superadmin uniquement)
 * Liste les APKs avec filtres et pagination.
 * @param {Object} filtres - {
 *   status?,   // true/false — filtre sur le statut actif/inactif
 *   search?,   // recherche textuelle (libelle, description)
 *   skip?,     // pagination, défaut 0
 *   take?,     // pagination, défaut 20, max 100 côté serveur
 * }
 * @returns {Promise<Object>} { total, skip, take, apks: Array }
 */
export function listerApks(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/apks${suffixe}`).then((d) => ({
    total: d.total ?? 0,
    skip: d.skip ?? 0,
    take: d.take ?? 20,
    apks: d.apks ?? [],
  }));
}

/**
 * GET /api/apks/:id  (superadmin uniquement)
 * @returns {Promise<Object>} l'APK demandée
 * @throws {Error} .status === 404 si l'APK n'existe pas
 */
export function obtenirApk(id) {
  return apiFetch(`/apks/${id}`).then((d) => d.apk);
}

/**
 * PUT /api/apks/:id  (superadmin uniquement)
 * Modifie les métadonnées d'une APK, et remplace optionnellement le
 * fichier .apk lui-même.
 * @param {Object} donnees - champs partiels parmi { libelle?, description?,
 *   status?, file? (File) } — au moins un champ doit être fourni, sinon
 *   le serveur renvoie 400 ("Aucun champ à modifier fourni").
 * @returns {Promise<Object>} l'APK mise à jour
 * @throws {Error} .status === 404 si l'APK n'existe pas
 */
export function modifierApk(id, donnees) {
  return apiFetch(`/apks/${id}`, {
    method: 'PUT',
    body: construireFormDataApk(donnees),
  }).then((d) => d.apk);
}

/**
 * DELETE /api/apks/:id  (superadmin uniquement)
 * Supprime l'APK en base ET son fichier associé sur le disque serveur.
 * @throws {Error} .status === 404 si l'APK n'existe pas
 */
export function supprimerApk(id) {
  return apiFetch(`/apks/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * Téléchargement
 *
 * GET /api/apks/download/:id/:nomFichier — PUBLIC dans l'implémentation
 * actuelle du back-end (aucun token requis, voir gestionapk.routes.js).
 * Ce n'est pas un appel JSON classique : c'est un flux binaire
 * (Content-Type application/vnd.android.package-archive) destiné à être
 * téléchargé directement par le navigateur, pas consommé via apiFetch.
 * =================================================================== */

/**
 * Construit l'URL absolue de téléchargement d'une APK à partir de
 * l'objet renvoyé par le serveur (apk.file_url contient déjà le chemin
 * relatif "/api/apks/download/{id}/{nomFichier}", voir
 * construireUrlTelechargement côté contrôleur).
 * @param {Object} apk - objet APK tel que renvoyé par l'API (doit
 *   contenir `file_url`)
 * @returns {string} URL absolue, utilisable directement dans un
 *   <a href> ou window.open
 */
export function obtenirUrlTelechargementApk(apk) {
  if (!apk?.file_url) return '';
  // API_BASE_URL inclut déjà le protocole + host (+ éventuellement /api
  // selon la config) ; file_url renvoyé par le serveur commence lui
  // par "/api/apks/download/...". On évite donc de dupliquer "/api" si
  // API_BASE_URL le contient déjà.
  const base = API_BASE_URL.replace(/\/api\/?$/, '');
  return `${base}${apk.file_url}`;
}

/**
 * Déclenche le téléchargement du fichier .apk dans le navigateur, sans
 * navigation complète de page (ouvre/actionne un lien caché).
 * Pratique pour un bouton "Télécharger" dans l'UI d'administration des
 * APKs, sans passer par apiFetch (réponse binaire, pas JSON).
 * @param {Object} apk - objet APK tel que renvoyé par l'API
 */
export function telechargerApk(apk) {
  const url = obtenirUrlTelechargementApk(apk);
  if (!url) return;
  const lien = document.createElement('a');
  lien.href = url;
  lien.rel = 'noopener';
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
}

const GestionApkService = {
  creerApk,
  listerApks,
  obtenirApk,
  modifierApk,
  supprimerApk,
  obtenirUrlTelechargementApk,
  telechargerApk,
};

export default GestionApkService;