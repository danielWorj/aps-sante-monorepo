// src/services/assuranceService.js
//
// Couche d'accès API pour le composant "annuaire — assurance"
// (table service_assurance + mise_en_relation, diagramme
// 08_annuaire_assurances). Miroir front-end de
// assurance.controller.js / assurance.routes.js. Calqué sur
// pharmacieService.js pour rester cohérent avec le reste du front.
//
// S'appuie entièrement sur `apiFetch` (src/lib/apiClient.js) : celui-ci
// ajoute déjà l'access token en mémoire (Authorization: Bearer …), gère
// le cookie httpOnly du refresh token et rejoue automatiquement la
// requête en cas de 401 expiré. On ne réimplémente rien de tout ça ici.
//
// Note : `API_BASE_URL` (dans apiClient.js) inclut déjà le préfixe
// "/api" — les chemins ci-dessous commencent donc directement par
// "/services-assurance…" / "/mises-en-relation-assurance…", pas par
// "/api/…".
//
// IMPORTANT — creerServiceAssurance / modifierServiceAssurance envoient
// un `FormData` (multipart, à cause du fichier image_assurance) et non
// un objet JSON. apiFetch (voir apiClient.js) détecte déjà les
// instances de FormData et laisse passer le corps tel quel, sans
// JSON.stringify ni Content-Type manuel — rien à faire ici de ce côté.
//
// Rappel des règles d'accès côté serveur (appliquées ici uniquement
// pour l'UX — le serveur reste la seule source de vérité) :
//   service_assurance
//     GET (liste, détail)      : public, aucun token requis
//     POST                     : tout utilisateur authentifié — crée
//       AUSSI, dans la même transaction, le compte de l'agent en
//       charge du service (voir creerServiceAssurance ci-dessous)
//     PUT                      : tout utilisateur authentifié
//       (statut_verification n'est honoré tel quel que pour
//       admin/superadmin ; pour les autres profils la fiche est/reste
//       "en_cours" après envoi). Ne touche jamais au compte agent.
//     DELETE                   : superadmin uniquement
//   mise_en_relation
//     GET (liste, scopée à un service_assurance_id) : agent du service
//       concerné ou admin/superadmin
//     POST                     : tout utilisateur authentifié,
//       n'importe quel rôle — utilisateur_id est déduit du compte
//       connecté, jamais envoyé par le client
//     DELETE                   : agent du service concerné ou
//       admin/superadmin
// apiFetch lève une Error (avec `.status` et `.data`) si le backend
// répond en erreur — chaque fonction ci-dessous se contente de la
// laisser remonter telle quelle à l'appelant.

import { apiFetch } from '../lib/apiClient';
import {
  listerPays as listerPaysReferentiel,
  listerVilles as listerVillesReferentiel,
} from './referentielService';

export const STATUTS_VERIFICATION_ASSURANCE = [
  { valeur: 'non_publie', libelle: 'Non publié' },
  { valeur: 'en_cours', libelle: 'En cours de vérification' },
  { valeur: 'publie', libelle: 'Publié' },
];

export const TYPES_ACTEUR_ASSURANCE = [
  { valeur: 'compagnie', libelle: 'Compagnie' },
  { valeur: 'courtier', libelle: 'Courtier' },
];

// Champ fichier attendu par le backend (voir upload.middleware.js /
// assurance.controller.js : req.files.image_assurance). Un seul
// fichier ici, contrairement à Pharmacie / Centre de santé (3
// pièces) — voir upload.middleware.js, gererTeleversementAssurance.
const CHAMPS_FICHIERS = ['image_assurance'];

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
 * texte tels quels, et le champ fichier uniquement s'il contient un
 * vrai `File` (permet un envoi partiel en modification : un fichier
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
 * Services d'assurance
 * =================================================================== */

/**
 * GET /api/services-assurance
 * @param {Object} filtres - { pays_id, ville_id, type_acteur, statut_verification, recherche }
 * @returns {Promise<Array>} liste des services d'assurance
 */
export function listerServicesAssurance(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/services-assurance${suffixe}`).then((d) => d.services_assurance ?? []);
}

/**
 * GET /api/services-assurance/:id
 * @returns {Promise<Object>} le service d'assurance
 */
export function obtenirServiceAssurance(id) {
  return apiFetch(`/services-assurance/${id}`).then((d) => d.service_assurance);
}

/**
 * POST /api/services-assurance  (tout utilisateur authentifié)
 * @param {Object} donnees - { nom, pays_id, ville_id, telephone, email, agrement,
 *   statut_verification, type_acteur ('compagnie' | 'courtier'), description?,
 *   latitude?, longitude?, image_assurance (File),
 *   fonction, agent_nom, agent_prenom, agent_email, agent_telephone? }
 *   Le fichier image_assurance est obligatoire à la création (vérifié aussi
 *   côté serveur). Le même formulaire crée EN MÊME TEMPS un nouveau compte
 *   utilisateur pour l'agent qui aura la charge du service — PAS forcément
 *   la personne connectée qui soumet ce formulaire :
 *     - fonction        : intitulé du poste de l'agent au sein du service
 *     - agent_nom, agent_prenom, agent_email : identité du titulaire du compte
 *     - agent_telephone : optionnel
 *   Un mot de passe temporaire est généré côté serveur et renvoyé UNE SEULE
 *   FOIS dans la réponse (`agent.mot_de_passe_temporaire`) — à communiquer à
 *   l'agent, qui devra le changer sous 24h à sa première connexion. 409 si
 *   l'email de l'agent est déjà utilisé par un compte existant.
 * @returns {Promise<Object>} la réponse brute du backend : { message, service_assurance, agent }
 */
export function creerServiceAssurance(donnees) {
  // Contrairement à obtenirServiceAssurance/modifierServiceAssurance, on
  // garde ici la réponse brute du backend (pas seulement
  // `service_assurance`) : le champ `agent.mot_de_passe_temporaire` doit
  // être affiché à l'auteur de la soumission juste après la création, car
  // il n'est jamais revisible ensuite (non stocké en clair côté serveur).
  return apiFetch('/services-assurance', { method: 'POST', body: construireFormData(donnees) });
}

/**
 * PUT /api/services-assurance/:id  (tout utilisateur authentifié)
 * @param {Object} donnees - champs partiels à mettre à jour ; image_assurance
 *   est optionnel (n'envoyer que s'il faut remplacer le fichier existant).
 *   Ne touche jamais au compte agent (déjà créé une fois pour toutes à la
 *   création du service).
 */
export function modifierServiceAssurance(id, donnees) {
  return apiFetch(`/services-assurance/${id}`, {
    method: 'PUT',
    body: construireFormData(donnees),
  }).then((d) => d.service_assurance);
}

/**
 * DELETE /api/services-assurance/:id  (superadmin)
 * 409 si des agents, mises en relation, activités ou agences sont encore
 * rattachés au service.
 */
export function supprimerServiceAssurance(id) {
  return apiFetch(`/services-assurance/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * Mises en relation
 *
 * Remplace l'ancien "contact_prospect_assurance" : n'importe quel
 * utilisateur authentifié peut solliciter un service d'assurance
 * (relation N-N utilisateur <-> assurance). Toujours scopée à un
 * service_assurance_id — pas de liste globale sans filtre côté serveur.
 * =================================================================== */

/**
 * GET /api/mises-en-relation-assurance?service_assurance_id=...
 * Réservé à l'agent du service concerné ou à admin/superadmin.
 * @param {string} serviceAssuranceId - requis
 * @returns {Promise<Array>} liste des mises en relation
 */
export function listerMisesEnRelationAssurance(serviceAssuranceId) {
  const suffixe = construireParametres({ service_assurance_id: serviceAssuranceId });
  return apiFetch(`/mises-en-relation-assurance${suffixe}`).then((d) => d.mises_en_relation ?? []);
}

/**
 * POST /api/mises-en-relation-assurance  (tout utilisateur authentifié)
 * @param {Object} donnees - { service_assurance_id, message }
 *   utilisateur_id n'est jamais envoyé : déduit du compte authentifié
 *   côté serveur.
 * @returns {Promise<Object>} la mise en relation créée
 */
export function creerMiseEnRelationAssurance({ service_assurance_id, message }) {
  return apiFetch('/mises-en-relation-assurance', {
    method: 'POST',
    body: { service_assurance_id, message },
  }).then((d) => d.mise_en_relation);
}

/**
 * DELETE /api/mises-en-relation-assurance/:id
 * Réservé à l'agent du service concerné ou à admin/superadmin.
 */
export function supprimerMiseEnRelationAssurance(id) {
  return apiFetch(`/mises-en-relation-assurance/${id}`, { method: 'DELETE' });
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

const AssuranceService = {
  STATUTS_VERIFICATION_ASSURANCE,
  TYPES_ACTEUR_ASSURANCE,
  listerServicesAssurance,
  obtenirServiceAssurance,
  creerServiceAssurance,
  modifierServiceAssurance,
  supprimerServiceAssurance,
  listerMisesEnRelationAssurance,
  creerMiseEnRelationAssurance,
  supprimerMiseEnRelationAssurance,
  listerPays,
  listerVilles,
};

export default AssuranceService;