// src/services/pharmacieService.js
//
// Couche d'accès API pour le composant "annuaire — pharmacie" (table
// pharmacie). Miroir front-end de pharmacie.controller.js /
// pharmacie.routes.js. Calqué sur StructureSanteService.js pour rester
// cohérent avec le reste du front.
//
// S'appuie entièrement sur `apiFetch` (src/lib/apiClient.js) : celui-ci
// ajoute déjà l'access token en mémoire (Authorization: Bearer …), gère
// le cookie httpOnly du refresh token et rejoue automatiquement la
// requête en cas de 401 expiré. On ne réimplémente rien de tout ça ici.
//
// Note : `API_BASE_URL` (dans apiClient.js) inclut déjà le préfixe
// "/api" — les chemins ci-dessous commencent donc directement par
// "/pharmacies…", pas par "/api/…".
//
// IMPORTANT — creerPharmacie / modifierPharmacie envoient un `FormData`
// (multipart, à cause des 3 fichiers requis) et non un objet JSON.
// apiFetch (voir apiClient.js) détecte déjà les instances de FormData et
// laisse passer le corps tel quel, sans JSON.stringify ni Content-Type
// manuel — rien à faire ici de ce côté.
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

export const STATUTS_VERIFICATION_PHARMACIE = [
  { valeur: 'non_publie', libelle: 'Non publié' },
  { valeur: 'en_cours', libelle: 'En cours de vérification' },
  { valeur: 'publie', libelle: 'Publié' },
];

// Champs fichier attendus par le backend (voir upload.middleware.js /
// pharmacie.controller.js : req.files.image_pharmacie / piece_identite /
// document_agrement).
const CHAMPS_FICHIERS = ['image_pharmacie', 'piece_identite', 'document_agrement'];

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
 * Pharmacies
 * =================================================================== */

/**
 * GET /api/pharmacies
 * @param {Object} filtres - { pays_id, ville_id, statut_verification, recherche }
 * @returns {Promise<Array>} liste des pharmacies
 */
export function listerPharmacies(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/pharmacies${suffixe}`).then((d) => d.pharmacies ?? []);
}

/**
 * GET /api/pharmacies/:id
 * @returns {Promise<Object>} la pharmacie
 */
export function obtenirPharmacie(id) {
  return apiFetch(`/pharmacies/${id}`).then((d) => d.pharmacie);
}

/**
 * POST /api/pharmacies  (tout utilisateur authentifié)
 * @param {Object} donnees - { nom, pays_id, ville_id, telephone, statut_verification,
 *   numero_ordre_titulaire, fonction, agent_nom, agent_prenom, agent_email,
 *   agent_telephone?, latitude?, longitude?, image_pharmacie (File),
 *   piece_identite (File), document_agrement (File) }
 *   Les 3 fichiers sont obligatoires à la création (vérifié aussi côté serveur).
 *   Le même formulaire crée EN MÊME TEMPS un nouveau compte utilisateur pour
 *   l'agent qui aura la charge de la pharmacie — PAS forcément la personne
 *   connectée qui soumet ce formulaire :
 *     - fonction        : intitulé du poste de l'agent au sein de la pharmacie
 *     - agent_nom, agent_prenom, agent_email : identité du titulaire du compte
 *     - agent_telephone : optionnel
 *   Un mot de passe temporaire est généré côté serveur et renvoyé UNE SEULE
 *   FOIS dans la réponse (`agent.mot_de_passe_temporaire`) — à communiquer à
 *   l'agent, qui devra le changer sous 24h à sa première connexion. 409 si
 *   l'email de l'agent est déjà utilisé par un compte existant.
 * @returns {Promise<Object>} la réponse brute du backend : { message, pharmacie, agent }
 */
export function creerPharmacie(donnees) {
  // Contrairement à obtenirPharmacie/modifierPharmacie, on garde ici la
  // réponse brute du backend (pas seulement `pharmacie`) : le champ
  // `agent.mot_de_passe_temporaire` doit être affiché à l'auteur de la
  // soumission juste après la création, car il n'est jamais revisible
  // ensuite (non stocké en clair côté serveur).
  return apiFetch('/pharmacies', { method: 'POST', body: construireFormData(donnees) });
}

/**
 * PUT /api/pharmacies/:id  (tout utilisateur authentifié)
 * @param {Object} donnees - champs partiels à mettre à jour ; les fichiers
 *   sont optionnels (n'envoyer que ceux à remplacer). Ne touche jamais au
 *   compte agent (déjà créé une fois pour toutes à la création).
 */
export function modifierPharmacie(id, donnees) {
  return apiFetch(`/pharmacies/${id}`, { method: 'PUT', body: construireFormData(donnees) }).then(
    (d) => d.pharmacie
  );
}

/**
 * DELETE /api/pharmacies/:id  (superadmin)
 * 409 si des agents sont encore rattachés à la pharmacie.
 */
export function supprimerPharmacie(id) {
  return apiFetch(`/pharmacies/${id}`, { method: 'DELETE' });
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

const PharmacieService = {
  STATUTS_VERIFICATION_PHARMACIE,
  listerPharmacies,
  obtenirPharmacie,
  creerPharmacie,
  modifierPharmacie,
  supprimerPharmacie,
  listerPays,
  listerVilles,
};

export default PharmacieService;