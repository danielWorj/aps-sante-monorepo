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

/**
 * Télécharge le fichier APK en mémoire (Blob) en suivant sa progression,
 * pour alimenter une barre de progression pilotée par React (voir
 * Home.jsx, bouton "Télécharger l'application").
 *
 * On n'utilise PAS un simple <a href download> ici : cela délègue tout
 * le téléchargement au navigateur, sans aucun moyen de connaître son
 * avancement. À la place, on récupère le corps de la réponse comme un
 * flux (ReadableStream via `fetch`) et on additionne les octets reçus
 * au fil de l'eau, en les comparant à Content-Length pour calculer un
 * pourcentage — puis on reconstruit un Blob une fois le flux terminé.
 *
 * (Contrairement à un UPLOAD, où suivre la progression impose XHR —
 * voir apiFetchUpload côté back-office — un TÉLÉCHARGEMENT peut suivre
 * sa progression directement avec `fetch`, car `response.body` expose
 * un ReadableStream standard.)
 *
 * @param {string} url - URL absolue de téléchargement (voir
 *   obtenirUrlTelechargementApk)
 * @param {(pourcentage: number) => void} [onProgress] - appelé avec un
 *   pourcentage entier (0-100) au fil de la réception. Si le serveur ne
 *   renvoie pas Content-Length (peu probable ici : telechargerApk,
 *   gestionapk.controller.js, ne le fixe pas explicitement mais Express
 *   le déduit automatiquement de la taille du fichier streamé), la
 *   progression n'est signalée qu'une fois à 100 % en fin de réception.
 * @returns {Promise<{ blob: Blob, nomFichier: string }>}
 */
export async function telechargerApkAvecProgression(url, onProgress) {
  const reponse = await fetch(url);
  if (!reponse.ok) {
    throw new Error(`Échec du téléchargement (HTTP ${reponse.status}).`);
  }

  // Nom de fichier proposé par le serveur (Content-Disposition, voir
  // construireUrlTelechargement / telechargerApk côté contrôleur), avec
  // un repli raisonnable si l'en-tête est absent ou non lisible.
  const entete = reponse.headers.get('Content-Disposition') || '';
  const correspondance = /filename="([^"]+)"/.exec(entete);
  const nomFichier = correspondance ? correspondance[1] : 'ApSa.apk';

  const tailleTotale = Number(reponse.headers.get('Content-Length')) || 0;
  const lecteur = reponse.body?.getReader?.();

  // Repli si le navigateur ne supporte pas les flux sur `fetch` (très
  // rare aujourd'hui) : pas de progression détaillée, juste 0 % -> 100 %.
  if (!lecteur) {
    const blob = await reponse.blob();
    onProgress?.(100);
    return { blob, nomFichier };
  }

  const morceaux = [];
  let recu = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await lecteur.read();
    if (done) break;
    morceaux.push(value);
    recu += value.length;
    if (tailleTotale > 0) {
      onProgress?.(Math.min(100, Math.round((recu / tailleTotale) * 100)));
    }
  }

  onProgress?.(100);
  return { blob: new Blob(morceaux), nomFichier };
}

/**
 * Déclenche l'enregistrement d'un Blob déjà téléchargé (voir
 * telechargerApkAvecProgression) via un lien caché, sans navigation de
 * page — même patron que gestionapkService.js côté back-office.
 * @param {Blob} blob
 * @param {string} nomFichier
 */
export function declencherSauvegardeBlob(blob, nomFichier) {
  const urlObjet = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = urlObjet;
  lien.download = nomFichier;
  lien.rel = 'noopener';
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  URL.revokeObjectURL(urlObjet);
}

export default {
  obtenirApkActive,
  obtenirUrlTelechargementApk,
  telechargerApkAvecProgression,
  declencherSauvegardeBlob,
};