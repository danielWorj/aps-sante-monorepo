// src/services/pharmacieService.js
//
// Consomme les routes du module "annuaire — pharmacie"
// (src/routes/pharmacie.routes.js -> src/controllers/pharmacie.controller.js) :
//   - Pharmacies             : /pharmacies
//   - Plannings de garde     : /plannings-garde
//   - Gardes (pharmacie<->créneau) : /gardes-pharmacie
//
// Toutes les routes GET sont publiques. Les routes d'écriture exigent
// une session authentifiée : on suppose que `apiFetch` (voir
// ../lib/apiClient) attache déjà le header Authorization quand un
// utilisateur est connecté, comme dans le reste du front (voir
// geoService.js pour le même pattern d'utilisation).
//
// Les 3 fichiers de la création/modification d'une pharmacie
// (image_pharmacie, piece_identite, document_agrement) sont envoyés en
// multipart/form-data : on ne fixe donc jamais le header Content-Type
// nous-mêmes, on laisse le navigateur poser la boundary.

import { apiFetch } from "../lib/apiClient";

/* ===================================================================
 * Helpers
 * =================================================================== */

/** Construit une querystring à partir d'un objet de filtres, en
 * ignorant les valeurs vides / undefined / null. */
function versQueryString(filtres = {}) {
  const params = new URLSearchParams();
  Object.entries(filtres).forEach(([cle, valeur]) => {
    if (valeur !== undefined && valeur !== null && valeur !== "") {
      params.append(cle, valeur);
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Construit un FormData à partir d'un objet plat. Les clés dont la
 * valeur est un File/Blob sont ajoutées telles quelles ; les autres
 * valeurs sont converties en string. Les valeurs undefined/null sont
 * ignorées (le champ n'est alors simplement pas envoyé). */
function versFormData(champs = {}) {
  const formData = new FormData();
  Object.entries(champs).forEach(([cle, valeur]) => {
    if (valeur === undefined || valeur === null) return;
    formData.append(cle, valeur);
  });
  return formData;
}

/* ===================================================================
 * Pharmacies
 * =================================================================== */

/**
 * GET /pharmacies
 * @param {{pays_id?: string, ville_id?: string, statut_verification?: string, recherche?: string}} filtres
 * @returns {Promise<{ pharmacies: object[] }>}
 */
export function listerPharmacies(filtres = {}) {
  return apiFetch(`/pharmacies${versQueryString(filtres)}`);
}

/**
 * GET /pharmacies/:id
 * @returns {Promise<{ pharmacie: object }>}
 */
export function obtenirPharmacie(pharmacieId) {
  return apiFetch(`/pharmacies/${pharmacieId}`);
}

/**
 * POST /pharmacies — multipart/form-data.
 * Crée la pharmacie ET le compte agent qui en a la charge, dans la
 * même requête (voir pharmacie.controller.js).
 *
 * @param {object} champs
 * @param {string} champs.nom
 * @param {string} champs.pays_id
 * @param {string} champs.ville_id
 * @param {string} champs.telephone
 * @param {string} champs.numero_ordre_titulaire
 * @param {string} champs.fonction            - poste de l'agent dans la pharmacie
 * @param {string} champs.agent_nom
 * @param {string} champs.agent_prenom
 * @param {string} champs.agent_email
 * @param {string} [champs.agent_telephone]
 * @param {number} [champs.latitude]
 * @param {number} [champs.longitude]
 * @param {string} [champs.statut_verification] - ignoré côté serveur si non admin/superadmin
 * @param {File} champs.image_pharmacie        - obligatoire
 * @param {File} champs.piece_identite         - obligatoire
 * @param {File} champs.document_agrement      - obligatoire
 * @returns {Promise<{ message: string, pharmacie: object, agent: { agent_id: string, fonction: string, utilisateur: object, mot_de_passe_temporaire: string } }>}
 */
export function creerPharmacie(champs) {
  return apiFetch("/pharmacies", {
    method: "POST",
    body: versFormData(champs),
  });
}

/**
 * PUT /pharmacies/:id — multipart/form-data. Les 3 fichiers sont
 * optionnels ici : seuls ceux fournis sont remplacés.
 * @returns {Promise<{ message: string, pharmacie: object }>}
 */
export function modifierPharmacie(pharmacieId, champs) {
  return apiFetch(`/pharmacies/${pharmacieId}`, {
    method: "PUT",
    body: versFormData(champs),
  });
}

/**
 * DELETE /pharmacies/:id — superadmin uniquement côté back.
 * @returns {Promise<{ message: string }>}
 */
export function supprimerPharmacie(pharmacieId) {
  return apiFetch(`/pharmacies/${pharmacieId}`, { method: "DELETE" });
}

/* ===================================================================
 * Plannings de garde
 * =================================================================== */

/**
 * GET /plannings-garde
 * @param {{pays_id?: string, statut?: string}} filtres
 * @returns {Promise<{ plannings: object[] }>}
 */
export function listerPlanningsGarde(filtres = {}) {
  return apiFetch(`/plannings-garde${versQueryString(filtres)}`);
}

/** GET /plannings-garde/:id */
export function obtenirPlanningGarde(planningId) {
  return apiFetch(`/plannings-garde/${planningId}`);
}

/** POST /plannings-garde — admin/superadmin uniquement côté back. */
export function creerPlanningGarde(donnees) {
  return apiFetch("/plannings-garde", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(donnees),
  });
}

/** PUT /plannings-garde/:id — admin/superadmin uniquement côté back. */
export function modifierPlanningGarde(planningId, donnees) {
  return apiFetch(`/plannings-garde/${planningId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(donnees),
  });
}

/** DELETE /plannings-garde/:id — admin/superadmin uniquement côté back. */
export function supprimerPlanningGarde(planningId) {
  return apiFetch(`/plannings-garde/${planningId}`, { method: "DELETE" });
}

/* ===================================================================
 * Gardes (affectation pharmacie <-> créneau)
 * =================================================================== */

/**
 * GET /gardes-pharmacie
 * @param {{ville_id?: string, planning_garde_id?: string, pharmacie_id?: string, date?: string}} filtres
 *   `date` (ISO) retourne les gardes actives à cet instant — utile
 *   pour "quelle(s) pharmacie(s) sont de garde maintenant ?".
 * @returns {Promise<{ gardes: object[] }>}
 */
export function listerGardesPharmacie(filtres = {}) {
  return apiFetch(`/gardes-pharmacie${versQueryString(filtres)}`);
}

/** GET /gardes-pharmacie/:id */
export function obtenirGardePharmacie(gardeId) {
  return apiFetch(`/gardes-pharmacie/${gardeId}`);
}

/** POST /gardes-pharmacie — admin/superadmin uniquement côté back. */
export function creerGardePharmacie(donnees) {
  return apiFetch("/gardes-pharmacie", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(donnees),
  });
}

/** PUT /gardes-pharmacie/:id — admin/superadmin uniquement côté back. */
export function modifierGardePharmacie(gardeId, donnees) {
  return apiFetch(`/gardes-pharmacie/${gardeId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(donnees),
  });
}

/** DELETE /gardes-pharmacie/:id — admin/superadmin uniquement côté back. */
export function supprimerGardePharmacie(gardeId) {
  return apiFetch(`/gardes-pharmacie/${gardeId}`, { method: "DELETE" });
}