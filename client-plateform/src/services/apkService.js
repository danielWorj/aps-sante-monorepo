// src/services/apkService.js
//
// Service de consommation de l'API du module "Gestion des APKs" (voir
// server/src/routes/gestionapk.routes.js et
// server/src/controllers/gestionapk.controller.js) — mais UNIQUEMENT
// la route publique de lecture, pas le CRUD (réservé au superadmin,
// géré côté client-backoffice via gestionapkService.js).
//
// Bâti sur le même client centralisé src/lib/apiClient.js que
// annonceService.js / medecinService.js (apiFetch : erreurs déjà
// normalisées avec .message/.status, credentials inclus). Aucun token
// n'est nécessaire ici : GET /apks/active est une route publique
// (voir gestionapk.routes.js), apiFetch fonctionne donc identiquement
// avec ou sans utilisateur connecté.
//
// Usage prévu : bouton "Télécharger l'application" de la page
// d'accueil (src/pages/Home.jsx) — remplace l'ancienne constante
// statique APK_DOWNLOAD_URL ('/downloads/aps.apk'), qui ne pointait
// vers aucun fichier réellement servi.

import { apiFetch, API_BASE_URL } from '../lib/apiClient';

/**
 * GET /apks/active
 * Route PUBLIQUE. Renvoie la dernière APK active (status=true) créée
 * par le superadmin depuis le back-office.
 *
 * @returns {Promise<Object|null>} l'APK active, avec `file_url` déjà
 *   au format "/api/apks/download/{id}/{nomFichier}" (voir
 *   construireUrlTelechargement côté contrôleur) — ou `null` si
 *   aucune APK n'est active pour le moment (404 côté serveur, ce
 *   n'est pas une erreur à propager : le bouton peut alors se
 *   désactiver proprement plutôt que planter la page).
 */
export async function obtenirApkActive() {
  try {
    const data = await apiFetch('/apks/active');
    return data.apk;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/**
 * Construit l'URL absolue de téléchargement à partir de l'objet APK
 * renvoyé par obtenirApkActive() (même logique que
 * gestionapkService.js côté back-office, dupliquée ici pour ne pas
 * créer de dépendance entre les deux fronts).
 *
 * @param {Object} apk - objet APK (doit contenir `file_url`)
 * @returns {string} URL absolue utilisable directement dans un
 *   <a href download>
 */
export function obtenirUrlTelechargementApk(apk) {
  if (!apk?.file_url) return '';
  // API_BASE_URL inclut déjà le protocole + host (+ éventuellement
  // /api selon la config) ; file_url renvoyé par le serveur commence
  // lui par "/api/apks/download/...". On évite donc de dupliquer
  // "/api" si API_BASE_URL le contient déjà.
  const base = API_BASE_URL.replace(/\/api\/?$/, '');
  return `${base}${apk.file_url}`;
}

export default {
  obtenirApkActive,
  obtenirUrlTelechargementApk,
};