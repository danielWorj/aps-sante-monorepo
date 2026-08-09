// src/services/StructureSanteService.js
//
// Couche d'accès API pour le composant "annuaire — centre de santé"
// (table structure_sante : cliniques, hôpitaux, centres médicaux,
// dispensaires, laboratoires). Miroir front-end de
// centreSante.controller.js / centreSante.routes.js.
//
// S'appuie entièrement sur `apiFetch` (src/lib/apiClient.js) : celui-ci
// ajoute déjà l'access token en mémoire (Authorization: Bearer …), gère
// le cookie httpOnly du refresh token et rejoue automatiquement la
// requête en cas de 401 expiré. On ne réimplémente rien de tout ça ici.
//
// Note : `API_BASE_URL` (dans apiClient.js) inclut déjà le préfixe
// "/api" — les chemins ci-dessous commencent donc directement par
// "/centres-sante…", pas par "/api/…".
//
// IMPORTANT — creerCentreSante / modifierCentreSante envoient désormais
// un `FormData` (multipart, à cause des 3 fichiers requis) et non plus
// un objet JSON. Si `apiFetch` sérialise systématiquement `body` en
// JSON et pose `Content-Type: application/json`, il doit être adapté
// pour laisser passer un FormData tel quel (ne pas JSON.stringify, ne
// pas fixer Content-Type — le navigateur doit poser lui-même le
// boundary multipart). Ce fichier ne peut pas faire cette vérification
// à votre place : apiClient.js n'était pas fourni ici.
//
// Rappel des règles d'accès côté serveur (appliquées ici uniquement
// pour l'UX — le serveur reste la seule source de vérité) :
//   - GET (liste, détail)      : public, aucun token requis
//   - POST / PUT               : tout utilisateur authentifié
//     (statut_verification n'est honoré tel quel que pour admin/superadmin ;
//     pour les autres profils la fiche est/reste "en_cours" après envoi)
//   - DELETE                   : superadmin uniquement
// apiFetch lève une Error (avec `.status` et `.data`) si le backend
// répond en erreur — chaque fonction ci-dessous se contente de la
// laisser remonter telle quelle à l'appelant.

import { apiFetch } from '../lib/apiClient';
import {
  listerPays as listerPaysReferentiel,
  listerVilles as listerVillesReferentiel,
} from './referentielService';

export const TYPES_STRUCTURE = [
  { valeur: 'clinique', libelle: 'Clinique' },
  { valeur: 'hopital', libelle: 'Hôpital' },
  { valeur: 'centre_medical', libelle: 'Centre médical' },
  { valeur: 'dispensaire', libelle: 'Dispensaire' },
  { valeur: 'laboratoire', libelle: 'Laboratoire' },
];

export const STATUTS_VERIFICATION = [
  { valeur: 'non_publie', libelle: 'Non publié' },
  { valeur: 'en_cours', libelle: 'En cours de vérification' },
  { valeur: 'publie', libelle: 'Publié' },
];

// Champs fichier attendus par le backend (voir upload.middleware.js).
const CHAMPS_FICHIERS = ['image_structure', 'piece_identite', 'document_agrement'];

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
 * Construit le FormData envoyé à la création/modification : les champs
 * texte tels quels, et les 3 champs fichier uniquement s'ils contiennent
 * un vrai `File` (permet un envoi partiel en modification : un fichier
 * non re-sélectionné n'est pas renvoyé, donc pas remplacé côté serveur).
 */
function construireFormData(donnees = {}) {
  const formData = new FormData();
  Object.entries(donnees).forEach(([cle, valeur]) => {
    if (valeur === undefined || valeur === null || valeur === '') return;
    if (CHAMPS_FICHIERS.includes(cle)) {
      if (valeur instanceof File) formData.append(cle, valeur);
      return;
    }
    formData.append(cle, valeur);
  });
  return formData;
}

/* ===================================================================
 * Centres de santé
 * =================================================================== */

/**
 * GET /api/centres-sante
 * @param {Object} filtres - { pays_id, ville_id, type_structure, statut_verification, recherche }
 * @returns {Promise<Array>} liste des centres de santé
 */
export function listerCentresSante(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/centres-sante${suffixe}`).then((d) => d.centresSante ?? []);
}

/**
 * GET /api/centres-sante/:id
 * @returns {Promise<Object>} le centre de santé
 */
export function obtenirCentreSante(id) {
  return apiFetch(`/centres-sante/${id}`).then((d) => d.centreSante);
}

/**
 * POST /api/centres-sante  (tout utilisateur authentifié)
 * @param {Object} donnees - { nom, pays_id, ville_id, telephone, statut_verification,
 *   type_structure, fonction, agent_nom, agent_prenom, agent_email, agent_telephone?,
 *   latitude?, longitude?, image_structure (File), piece_identite (File),
 *   document_agrement (File) }
 *   Les 3 fichiers sont obligatoires à la création (vérifié aussi côté serveur).
 *   Le même formulaire crée EN MÊME TEMPS un nouveau compte utilisateur pour
 *   l'agent qui aura la charge du centre — PAS forcément la personne connectée
 *   qui soumet ce formulaire :
 *     - fonction        : intitulé du poste de l'agent au sein du centre
 *     - agent_nom, agent_prenom, agent_email : identité du titulaire du compte
 *     - agent_telephone : optionnel
 *   Un mot de passe temporaire est généré côté serveur et renvoyé UNE SEULE
 *   FOIS dans la réponse (`agent.mot_de_passe_temporaire`) — à communiquer à
 *   l'agent, qui devra le changer sous 24h à sa première connexion. 409 si
 *   l'email est déjà utilisé par un compte existant.
 */
export function creerCentreSante(donnees) {
  // Contrairement aux autres fonctions de ce fichier, on garde ici la
  // réponse brute du backend (pas seulement `centreSante`) : le champ
  // `agent.mot_de_passe_temporaire` doit être affiché à l'auteur de la
  // soumission juste après la création, car il n'est jamais revisible
  // ensuite (non stocké en clair côté serveur).
  return apiFetch('/centres-sante', { method: 'POST', body: construireFormData(donnees) });
}

/**
 * PUT /api/centres-sante/:id  (tout utilisateur authentifié)
 * @param {Object} donnees - champs partiels à mettre à jour ; les fichiers
 *   sont optionnels (n'envoyer que ceux à remplacer).
 */
export function modifierCentreSante(id, donnees) {
  return apiFetch(`/centres-sante/${id}`, { method: 'PUT', body: construireFormData(donnees) }).then(
    (d) => d.centreSante
  );
}

/**
 * DELETE /api/centres-sante/:id  (superadmin)
 */
export function supprimerCentreSante(id) {
  return apiFetch(`/centres-sante/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * Référentiels géographiques (pour peupler le formulaire pays / ville)
 * Ré-exportés depuis referentielService.js plutôt que dupliqués ici,
 * pour éviter que les deux implémentations divergent avec le temps.
 * =================================================================== */

/**
 * GET /api/referentiels/pays
 */
export function listerPays() {
  return listerPaysReferentiel().then((pays) => pays ?? []);
}

/**
 * GET /api/referentiels/villes?pays_id=...
 * @param {string} [paysId] - filtre optionnel par pays
 */
export function listerVilles(paysId) {
  return listerVillesReferentiel(paysId).then((villes) => villes ?? []);
}

const StructureSanteService = {
  TYPES_STRUCTURE,
  STATUTS_VERIFICATION,
  listerCentresSante,
  obtenirCentreSante,
  creerCentreSante,
  modifierCentreSante,
  supprimerCentreSante,
  listerPays,
  listerVilles,
};

export default StructureSanteService;