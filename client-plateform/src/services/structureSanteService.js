// src/services/structureSanteService.js
// Service de consommation des APIs du module "annuaire — centre de
// santé" (table structure_sante : cliniques, hôpitaux, centres
// médicaux, dispensaires, laboratoires — voir
// src/routes/centreSante.routes.js et
// src/controllers/centreSante.controller.js côté backend), bâti sur
// le client centralisé src/lib/apiClient.js (apiFetch : Authorization
// automatique depuis l'access token en mémoire, refresh silencieux
// sur 401, erreurs déjà normalisées avec .message/.status — donc pas
// de gestion d'erreur supplémentaire ici).
//
// Lecture (GET) : PUBLIQUE, aucune authentification requise — utilisable
// avant inscription (ex : recherche d'un centre proche avant de créer
// un compte patient).
//
// Création (POST) : tout utilisateur authentifié, quel que soit son
// rôle. Le formulaire est UNIQUE côté front : créer un centre crée
// AUSSI, dans la même transaction côté serveur, le COMPTE de l'agent
// qui en aura la charge (agent_nom/agent_prenom/agent_email, PAS
// forcément la personne connectée qui soumet le formulaire) + la
// fiche agent_structure_sante qui le rattache. La réponse contient
// UNE SEULE FOIS le mot de passe temporaire de ce compte — à afficher
// immédiatement à l'appelant (jamais restocké, jamais redemandable).
// Exige 3 pièces justificatives obligatoires en multipart/form-data :
// image_structure, piece_identite, document_agrement.
//
// Modification (PUT) : ouverte à tout utilisateur authentifié — même
// logique que la création. Les 3 fichiers sont optionnels ici (seuls
// ceux effectivement envoyés sont remplacés). Ne touche jamais au
// compte agent. Seuls admin/superadmin peuvent choisir librement
// statut_verification ; pour tout autre profil, la fiche repasse
// systématiquement en "en_cours" (à re-vérifier), quelle que soit la
// valeur envoyée.
//
// Suppression (DELETE) : réservée à superadmin côté serveur. Le
// serveur renvoie 409 si des agents sont encore rattachés au centre.
//
// Référentiels Pays / Ville : NE sont PAS redéfinis ici — voir
// src/services/geoService.js (listerPays/listerVilles).

import { apiFetch } from '../lib/apiClient';

// Types de structure acceptés par le serveur (TYPES_STRUCTURE côté
// contrôleur) — valeur invalide -> 400.
export const TYPES_STRUCTURE = [
  { valeur: 'clinique', libelle: 'Clinique' },
  { valeur: 'hopital', libelle: 'Hôpital' },
  { valeur: 'centre_medical', libelle: 'Centre médical' },
  { valeur: 'dispensaire', libelle: 'Dispensaire' },
  { valeur: 'laboratoire', libelle: 'Laboratoire' },
];

// Statuts de vérification (STATUTS_VERIFICATION_STRUCTURE côté
// contrôleur). Uniquement pertinent pour un appelant admin/superadmin :
// pour tout autre profil, le serveur ignore la valeur envoyée et force
// "en_cours" (création) ou repasse la fiche en "en_cours" (modification).
export const STATUTS_VERIFICATION_STRUCTURE = [
  { valeur: 'non_publie', libelle: 'Non publié' },
  { valeur: 'en_cours', libelle: 'En cours de vérification' },
  { valeur: 'publie', libelle: 'Publié' },
];

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

// Construit un FormData à partir des champs texte/nombre/booléen et
// des fichiers. Les booléens sont convertis en chaîne ("true"/"false")
// car FormData ne transporte que des chaînes ou des Blob.
// ⚠️ Les valeurs undefined/null sont OMISES (pas envoyées) : ce
// helper ne permet donc pas d'envoyer explicitement `latitude: null` /
// `longitude: null` pour EFFACER une géolocalisation existante (le
// serveur le supporte via appliquerGeolocalisation, mais seulement en
// JSON — inatteignable ici puisque ces routes sont multipart). Pour ce
// cas précis, il faudra un appel dédié côté backend/serveur si le
// besoin se présente.
function construireFormData(donnees, fichiers) {
  const formData = new FormData();

  Object.entries(donnees).forEach(([cle, valeur]) => {
    if (valeur === undefined || valeur === null) return;
    formData.append(cle, typeof valeur === 'boolean' ? String(valeur) : valeur);
  });

  Object.entries(fichiers).forEach(([champ, fichier]) => {
    if (fichier) formData.append(champ, fichier);
  });

  return formData;
}

/* ===================================================================
 * Centres de santé (fiche Annuaire)
 * =================================================================== */

/**
 * GET /centres-sante
 * Route publique.
 * @param {Object} filtres - { pays_id?, ville_id?, type_structure?,
 *   statut_verification?, recherche? } — `recherche` filtre sur le nom
 *   (insensible à la casse), `type_structure` doit être une valeur de
 *   TYPES_STRUCTURE, `statut_verification` une valeur de
 *   STATUTS_VERIFICATION_STRUCTURE.
 * @returns {Promise<Array>} liste des centres de santé (chaque entrée
 *   inclut pays, ville, geolocalisation, image_url, piece_identite_url,
 *   document_agrement_url)
 */
export async function listerCentresSante(filtres = {}) {
  const data = await apiFetch(`/centres-sante${construireQueryString(filtres)}`);
  return data.centresSante;
}

/**
 * GET /centres-sante/:id
 * Route publique.
 */
export async function obtenirCentreSante(id) {
  const data = await apiFetch(`/centres-sante/${id}`);
  return data.centreSante;
}

/**
 * GET /centres-sante/:id/images
 * Route publique. Galerie de photos du centre (en plus de son
 * image_url principale).
 * @returns {Promise<{images: Array}>}
 */
export async function listerImagesCentre(id) {
  return apiFetch(`/centres-sante/${id}/images`);
}

/**
 * GET /centres-sante/:id/examens
 * Route publique. Liste des examens/actes réalisés dans ce centre.
 * @returns {Promise<{examens: Array}>}
 */
export async function listerExamensCentre(id) {
  return apiFetch(`/centres-sante/${id}/examens`);
}

/**
 * POST /centres-sante/:id/messages
 * Route publique — formulaire de contact de la fiche centre, utilisable
 * par un visiteur non connecté (pas de compte requis pour écrire à un
 * centre).
 * @param {Object} donnees - { email, message }
 * @returns {Promise<{message: string}>}
 */
export async function envoyerMessageCentre(id, donnees) {
  return apiFetch(`/centres-sante/${id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(donnees),
  });
}

/**
 * POST /centres-sante
 * Ouvert à tout utilisateur authentifié. Crée en une seule transaction
 * le centre de santé ET le compte de l'agent qui en aura la charge.
 * Envoie un multipart/form-data car les 3 pièces justificatives sont
 * obligatoires.
 *
 * @param {Object} donnees
 * @param {string} donnees.nom
 * @param {string} donnees.pays_id
 * @param {string} donnees.ville_id
 * @param {string} donnees.telephone
 * @param {string} donnees.statut_verification - pris en compte
 *   uniquement si l'appelant est admin/superadmin (sinon forcé à
 *   "en_cours" côté serveur) — voir STATUTS_VERIFICATION_STRUCTURE.
 * @param {string} donnees.type_structure - voir TYPES_STRUCTURE.
 * @param {number} [donnees.latitude] - optionnel, à fournir avec
 *   longitude.
 * @param {number} [donnees.longitude] - optionnel, à fournir avec
 *   latitude.
 * @param {string} donnees.fonction - intitulé du poste de l'agent au
 *   sein du centre (ex. "Gérant", "Directeur médical").
 * @param {string} donnees.agent_nom
 * @param {string} donnees.agent_prenom
 * @param {string} donnees.agent_email - doit être unique en base
 *   (409 sinon) ; le pays du compte agent est repris automatiquement
 *   de donnees.pays_id côté serveur.
 * @param {string} [donnees.agent_telephone]
 * @param {Object} fichiers - { image_structure: File, piece_identite: File,
 *   document_agrement: File } — les 3 sont obligatoires.
 * @returns {Promise<{message, centreSante, agent}>} agent contient
 *   agent.mot_de_passe_temporaire, renvoyé UNE SEULE FOIS par le
 *   backend — à afficher immédiatement à l'appelant pour transmission
 *   à l'agent, jamais restocké.
 */
export async function creerCentreSante(donnees, fichiers = {}) {
  return apiFetch('/centres-sante', {
    method: 'POST',
    body: construireFormData(donnees, fichiers),
  });
}

/**
 * PUT /centres-sante/:id
 * Ouvert à tout utilisateur authentifié. Ne touche jamais au compte
 * agent déjà créé. Les 3 fichiers sont optionnels (remplacement d'un
 * fichier existant uniquement). Pour un appelant non admin/superadmin,
 * statut_verification envoyé est ignoré : la fiche repasse en
 * "en_cours" quoi qu'il arrive.
 *
 * @param {Object} donnees - champs partiels parmi { nom, pays_id,
 *   ville_id, telephone, statut_verification, type_structure,
 *   latitude, longitude }
 * @param {Object} fichiers - { image_structure?, piece_identite?,
 *   document_agrement? } — File optionnels.
 * @returns {Promise<{message, centreSante}>}
 */
export async function modifierCentreSante(id, donnees = {}, fichiers = {}) {
  return apiFetch(`/centres-sante/${id}`, {
    method: 'PUT',
    body: construireFormData(donnees, fichiers),
  });
}

/**
 * DELETE /centres-sante/:id
 * Réservé à superadmin côté backend. Le serveur renvoie 409 si des
 * agents sont encore rattachés à ce centre.
 */
export async function supprimerCentreSante(id) {
  return apiFetch(`/centres-sante/${id}`, { method: 'DELETE' });
}

export default {
  TYPES_STRUCTURE,
  STATUTS_VERIFICATION_STRUCTURE,
  listerCentresSante,
  obtenirCentreSante,
  listerImagesCentre,
  listerExamensCentre,
  envoyerMessageCentre,
  creerCentreSante,
  modifierCentreSante,
  supprimerCentreSante,
};