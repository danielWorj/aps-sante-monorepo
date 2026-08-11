// src/services/assuranceService.js
//
// Couche d'accès aux APIs du module "Annuaire assurances" (compagnies
// et courtiers d'assurance santé). Regroupe tous les appels décrits
// dans src/routes/assurance.routes.js : services d'assurance, agences,
// catalogue activité / option d'activité, et mises en relation.
//
// Toutes les fonctions passent par apiFetch() (src/lib/apiClient.js),
// qui gère déjà : en-tête Authorization Bearer, cookie refresh token,
// retry silencieux sur 401, et la levée d'une Error(.status, .data)
// sur réponse non-OK. Les appelants (composants) n'ont donc qu'à
// englober ces appels dans un try/catch.
//
// Endpoints en écriture (POST/PUT/DELETE) exigent un utilisateur
// authentifié — voir assurance.routes.js — apiFetch s'en charge via
// l'access token en mémoire (setAccessToken côté AuthContext).

import { apiFetch } from "../lib/apiClient";

/* ============================ Helpers ============================ */

function construireQuery(filtres = {}) {
  const params = new URLSearchParams();
  Object.entries(filtres).forEach(([cle, valeur]) => {
    if (valeur !== undefined && valeur !== null && valeur !== "") {
      params.set(cle, valeur);
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Construit le FormData multipart attendu par le backend pour
 * POST/PUT /services-assurance (voir upload.middleware.js). Les clés
 * `undefined`/`null`/chaîne vide sont omises pour ne pas écraser des
 * champs optionnels en modification.
 */
function construireFormData(donnees = {}) {
  const formData = new FormData();
  Object.entries(donnees).forEach(([cle, valeur]) => {
    if (valeur === undefined || valeur === null || valeur === "") return;
    formData.append(cle, valeur);
  });
  return formData;
}

/* ============================ Services d'assurance ============================ */

/**
 * GET /services-assurance — annuaire public.
 * @param {object} [filtres]
 * @param {string} [filtres.pays_id]
 * @param {string} [filtres.ville_id]
 * @param {"compagnie"|"courtier"} [filtres.type_acteur]
 * @param {"non_publie"|"en_cours"|"publie"} [filtres.statut_verification]
 * @param {string} [filtres.recherche] - recherche insensible à la casse sur le nom
 * @returns {Promise<{ services_assurance: object[] }>}
 */
export function listerServicesAssurance(filtres = {}) {
  return apiFetch(`/services-assurance${construireQuery(filtres)}`);
}

/** GET /services-assurance/:id */
export function obtenirServiceAssurance(id) {
  return apiFetch(`/services-assurance/${id}`);
}

/**
 * POST /services-assurance — crée la compagnie/le courtier ET le
 * compte de son agent responsable, en une seule transaction côté
 * serveur. `donnees.image_assurance` doit être un File (obligatoire).
 *
 * Champs fiche attendus : nom, pays_id, ville_id, telephone, email,
 * agrement, type_acteur ('compagnie'|'courtier'), statut_verification,
 * description (facultatif), latitude/longitude (facultatifs).
 * Champs agent attendus : fonction, agent_nom, agent_prenom,
 * agent_email, agent_telephone (facultatif).
 *
 * Réponse : { message, service_assurance, agent: { ..., mot_de_passe_temporaire } }
 * — le mot de passe temporaire de l'agent n'est renvoyé qu'une seule
 * fois, à cet instant : à afficher immédiatement à l'utilisateur.
 */
export function creerServiceAssurance(donnees) {
  return apiFetch("/services-assurance", {
    method: "POST",
    body: construireFormData(donnees),
  });
}

/** PUT /services-assurance/:id — image_assurance optionnelle ici. */
export function modifierServiceAssurance(id, donnees) {
  return apiFetch(`/services-assurance/${id}`, {
    method: "PUT",
    body: construireFormData(donnees),
  });
}

/** DELETE /services-assurance/:id — réservé superadmin. */
export function supprimerServiceAssurance(id) {
  return apiFetch(`/services-assurance/${id}`, { method: "DELETE" });
}

/* ============================ Activités (catalogue produits) ============================ */

/** GET /activites?service_assurance_id=... (public) */
export function listerActivites(serviceAssuranceId) {
  return apiFetch(`/activites${construireQuery({ service_assurance_id: serviceAssuranceId })}`);
}

/** GET /activites/:id (public) */
export function obtenirActivite(id) {
  return apiFetch(`/activites/${id}`);
}

/** POST /activites — réservé agent du service concerné / admin. */
export function creerActivite(donnees) {
  return apiFetch("/activites", { method: "POST", body: donnees });
}

/** PUT /activites/:id */
export function modifierActivite(id, donnees) {
  return apiFetch(`/activites/${id}`, { method: "PUT", body: donnees });
}

/** DELETE /activites/:id — bloqué si des options y sont rattachées. */
export function supprimerActivite(id) {
  return apiFetch(`/activites/${id}`, { method: "DELETE" });
}

/* ============================ Options d'activité ============================ */

/** GET /options-activite?activite_id=... — activite_id requis (public). */
export function listerOptionsActivite(activiteId) {
  return apiFetch(`/options-activite${construireQuery({ activite_id: activiteId })}`);
}

/** GET /options-activite/:id (public) */
export function obtenirOptionActivite(id) {
  return apiFetch(`/options-activite/${id}`);
}

/** POST /options-activite */
export function creerOptionActivite(donnees) {
  return apiFetch("/options-activite", { method: "POST", body: donnees });
}

/** PUT /options-activite/:id */
export function modifierOptionActivite(id, donnees) {
  return apiFetch(`/options-activite/${id}`, { method: "PUT", body: donnees });
}

/** DELETE /options-activite/:id */
export function supprimerOptionActivite(id) {
  return apiFetch(`/options-activite/${id}`, { method: "DELETE" });
}

/* ============================ Agences ============================ */

/** GET /agences?service_assurance_id=... (public) */
export function listerAgences(serviceAssuranceId) {
  return apiFetch(`/agences${construireQuery({ service_assurance_id: serviceAssuranceId })}`);
}

/** GET /agences/:id (public) */
export function obtenirAgence(id) {
  return apiFetch(`/agences/${id}`);
}

/**
 * POST /agences — réservé agent du service concerné / admin.
 * Champs requis : service_assurance_id, libelle, localisation, contact.
 * Facultatifs : latitude, longitude.
 */
export function creerAgence(donnees) {
  return apiFetch("/agences", { method: "POST", body: donnees });
}

/** PUT /agences/:id */
export function modifierAgence(id, donnees) {
  return apiFetch(`/agences/${id}`, { method: "PUT", body: donnees });
}

/** DELETE /agences/:id */
export function supprimerAgence(id) {
  return apiFetch(`/agences/${id}`, { method: "DELETE" });
}

/* ============================ Mises en relation ============================ */

/**
 * GET /mises-en-relation-assurance?service_assurance_id=...
 * Réservé à l'agent du service concerné / admin (donnée commerciale
 * privée, pas une fiche annuaire publique).
 */
export function listerMisesEnRelation(serviceAssuranceId) {
  return apiFetch(
    `/mises-en-relation-assurance${construireQuery({ service_assurance_id: serviceAssuranceId })}`
  );
}

/**
 * POST /mises-en-relation-assurance — ouvert à tout utilisateur
 * authentifié. utilisateur_id n'est jamais envoyé : déduit côté
 * serveur du compte connecté.
 * @param {{ service_assurance_id: string, message: string }} donnees
 */
export function creerMiseEnRelation(donnees) {
  return apiFetch("/mises-en-relation-assurance", { method: "POST", body: donnees });
}

/** DELETE /mises-en-relation-assurance/:id */
export function supprimerMiseEnRelation(id) {
  return apiFetch(`/mises-en-relation-assurance/${id}`, { method: "DELETE" });
}