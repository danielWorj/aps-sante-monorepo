// src/services/annonceService.js
//
// Couche d'accès API pour le module autonome "Annonces" (schema.prisma,
// modèle Annonce — sans relation vers un autre module métier, même
// esprit que MobileApk). Miroir front-end unique de
// annonce.controller.js / annonce.routes.js — un seul routeur back-end
// monté sous /api, donc un seul service ici aussi, calqué sur
// medecinService.js / moyenPaiementService.js pour rester cohérent avec
// le reste du front.
//
// S'appuie entièrement sur `apiFetch` (src/lib/apiClient.js) : celui-ci
// ajoute déjà l'access token en mémoire (Authorization: Bearer …), gère
// le cookie httpOnly du refresh token et rejoue automatiquement la
// requête en cas de 401 expiré. On ne réimplémente rien de tout ça ici.
//
// Note : `API_BASE_URL` (dans apiClient.js) inclut déjà le préfixe
// "/api" — les chemins ci-dessous commencent donc directement par
// "/annonces…", pas par "/api/annonces…".
//
// IMPORTANT — creerAnnonce ET modifierAnnonce envoient un `FormData`
// (multipart, à cause de gererTeleversementAnnonce qui traite le champ
// `fichier`, voir upload.middleware.js) et non un objet JSON. apiFetch
// détecte déjà les instances de FormData et laisse passer le corps tel
// quel, sans JSON.stringify ni Content-Type manuel — rien à faire ici
// de ce côté.
// ⚠️ La clé FormData attendue par multer est `fichier` (PAS `file_url`,
// qui est le nom de la colonne en base écrite par le contrôleur après
// upload — voir annonce.controller.js, req.files?.fichier?.[0]).
// `fichier` est OPTIONNEL, aussi bien à la création qu'en modification
// (schema.prisma, Annonce.file_url, nullable — une annonce peut être
// purement textuelle) : une annonce peut être un visuel (image) ou un
// flyer (PDF).
//
// Champs réels du modèle Annonce (voir annonce.controller.js) :
//   annonce { id, libelle (obligatoire), description (optionnel),
//     file_url (optionnel, jamais l'URL complète en base — voir
//     avecUrlFichier côté serveur), date_creation (auto), jour_validite
//     (obligatoire, Int, nombre de jours), statut (Boolean, défaut
//     true), expiree (calculé à la volée côté serveur, PAS stocké en
//     base — voir estAnnonceExpiree) }.
//
// statut n'est PAS accepté à la création (req.body côté contrôleur ne
// le lit pas) : toute nouvelle annonce démarre active (statut=true,
// valeur par défaut du schéma) — à désactiver ensuite via
// modifierAnnonce, activerAnnonce ou desactiverAnnonce.
//
// Rappel des règles d'accès côté serveur (confirmées par
// annonce.controller.js / annonce.routes.js — le serveur reste la
// seule source de vérité) :
//   - GET  /annonces, GET /annonces/:id            → PUBLIQUE, aucun
//     token requis.
//   - POST /annonces, PUT/PATCH/DELETE /annonces/*  → réservé à
//     admin/superadmin (double contrôle : autoriser() dans les routes
//     + estAdmin() revérifié dans chaque handler du contrôleur).
//   - DELETE : suppression physique — aucune table ne référence
//     Annonce (modèle autonome, sans relation), donc pas de risque de
//     contrainte P2003 contrairement à d'autres suppressions du
//     backend.
//
// apiFetch lève une Error (avec `.status` et `.data`) si le backend
// répond en erreur — chaque fonction ci-dessous se contente de la
// laisser remonter telle quelle à l'appelant.

import { apiFetch } from '../lib/apiClient';

// Champ fichier attendu par gererTeleversementAnnonce — nom de la clé
// multer (.fields([{ name: "fichier", maxCount: 1 }])), PAS le nom de
// la colonne en base (file_url) — voir upload.middleware.js.
const CHAMP_FICHIER_ANNONCE = 'fichier';

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
 * Construit le FormData envoyé à la création/modification d'une
 * annonce : les champs texte tels quels, et `fichier` uniquement s'il
 * contient un vrai `File`. En modification, cela permet un envoi
 * partiel : un fichier non re-sélectionné n'est pas renvoyé, donc pas
 * remplacé côté serveur (file_url reste inchangé) — même patron que
 * construireFormDataMedecin dans medecinService.js.
 */
function construireFormDataAnnonce(donnees = {}) {
  const formData = new FormData();
  Object.entries(donnees).forEach(([cle, valeur]) => {
    if (valeur === undefined || valeur === null || valeur === '') return;
    if (cle === CHAMP_FICHIER_ANNONCE) {
      if (valeur instanceof File) formData.append(cle, valeur);
      return;
    }
    // FormData ne transporte que des strings : un booléen JS (ex.
    // statut) est converti explicitement en "true"/"false" plutôt que
    // de laisser le navigateur le faire implicitement — plus lisible
    // et ça documente le contrat attendu côté backend, qui reconvertit
    // cette string en Boolean avant l'écriture Prisma
    // (req.body.statut === true || req.body.statut === "true").
    formData.append(cle, typeof valeur === 'boolean' ? String(valeur) : valeur);
  });
  return formData;
}

/* ===================================================================
 * Annonces
 * =================================================================== */

/**
 * GET /api/annonces
 * PUBLIQUE, aucune authentification requise.
 * @param {Object} filtres - {
 *   statut?: boolean|string,   // filtre exact sur le champ statut
 *   recherche?: string,        // recherche insensible à la casse sur libelle
 *   actives?: 'true'|boolean,  // ne renvoie que les annonces ni
 *                               // désactivées ni expirées (calcul fait
 *                               // côté serveur, pas à refaire ici)
 * }
 * @returns {Promise<Array>} liste des annonces, triées de la plus
 *   récente à la plus ancienne, chacune avec `file_url` déjà résolue
 *   en URL complète (ou null) et `expiree` (booléen calculé côté
 *   serveur).
 */
export function listerAnnonces(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/annonces${suffixe}`).then((d) => d.annonces ?? []);
}

/**
 * GET /api/annonces/:id
 * PUBLIQUE.
 * @returns {Promise<Object>} l'annonce, avec `file_url` résolue et
 *   `expiree` calculée.
 */
export function obtenirAnnonce(id) {
  return apiFetch(`/annonces/${id}`).then((d) => d.annonce);
}

/**
 * POST /api/annonces  (réservé admin/superadmin)
 * @param {Object} donnees - {
 *   libelle,               // obligatoire
 *   jour_validite,          // obligatoire, entier > 0 (nombre de jours)
 *   description?,           // optionnel
 *   fichier? (File),        // optionnel — visuel (image) ou flyer (PDF)
 * }
 *   statut n'est pas accepté ici : toute nouvelle annonce démarre
 *   active (statut=true) — voir activerAnnonce/desactiverAnnonce.
 * @returns {Promise<Object>} l'annonce créée
 */
export function creerAnnonce(donnees) {
  return apiFetch('/annonces', {
    method: 'POST',
    body: construireFormDataAnnonce(donnees),
  }).then((d) => d.annonce);
}

/**
 * PUT /api/annonces/:id  (réservé admin/superadmin)
 * @param {Object} donnees - champs partiels parmi {
 *   libelle?,                // ne peut pas être vide si fourni
 *   description?,             // chaîne vide ou null efface la description
 *   jour_validite?,           // entier > 0 si fourni
 *   statut? (boolean),        // true|false — active/désactive l'annonce
 *   fichier? (File),          // remplace file_url ; l'ancien fichier
 *                               // Cloudinary est nettoyé côté serveur
 *                               // une fois la mise à jour confirmée
 * }
 * @returns {Promise<Object>} l'annonce mise à jour
 */
export function modifierAnnonce(id, donnees) {
  return apiFetch(`/annonces/${id}`, {
    method: 'PUT',
    body: construireFormDataAnnonce(donnees),
  }).then((d) => d.annonce);
}

/**
 * PATCH /api/annonces/:id/activer  (réservé admin/superadmin)
 * Action explicite équivalente à modifierAnnonce(id, { statut: true }),
 * isolée dans son propre endpoint côté serveur — même esprit que
 * publierMedecin/suspendreMedecin dans medecin.controller.js.
 * @returns {Promise<Object>} l'annonce activée
 */
export function activerAnnonce(id) {
  return apiFetch(`/annonces/${id}/activer`, { method: 'PATCH' }).then((d) => d.annonce);
}

/**
 * PATCH /api/annonces/:id/desactiver  (réservé admin/superadmin)
 * Action explicite équivalente à modifierAnnonce(id, { statut: false }).
 * @returns {Promise<Object>} l'annonce désactivée
 */
export function desactiverAnnonce(id) {
  return apiFetch(`/annonces/${id}/desactiver`, { method: 'PATCH' }).then((d) => d.annonce);
}

/**
 * DELETE /api/annonces/:id  (réservé admin/superadmin)
 * Suppression physique — aucune table ne référence Annonce (modèle
 * autonome, sans relation), donc pas de risque de contrainte P2003.
 * Le fichier Cloudinary associé, s'il existe, est nettoyé côté serveur
 * (best effort) après suppression en base.
 */
export function supprimerAnnonce(id) {
  return apiFetch(`/annonces/${id}`, { method: 'DELETE' });
}

const AnnonceService = {
  listerAnnonces,
  obtenirAnnonce,
  creerAnnonce,
  modifierAnnonce,
  activerAnnonce,
  desactiverAnnonce,
  supprimerAnnonce,
};

export default AnnonceService;