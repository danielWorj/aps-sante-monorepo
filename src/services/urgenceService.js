// src/services/urgenceServices.js
//
// Service de consommation des APIs du module "urgences" côté backend.
//
// Routes backend utilisées (cf. urgences.routes.js / urgences.controller.js) :
//   - GET    /types-urgence
//   - GET    /types-urgence/:id
//   - POST   /types-urgence
//   - PUT    /types-urgence/:id
//   - DELETE /types-urgence/:id
//
//   - GET    /urgences
//   - GET    /urgences/:id
//   - POST   /urgences
//   - PUT    /urgences/:id
//   - DELETE /urgences/:id
//
// Le préfixe /api est déjà géré par apiClient.js.
// Ici on appelle donc directement :
//   - /types-urgence
//   - /urgences
//
// Règles d'accès côté backend :
//   - Lecture : publique
//   - Création / modification : admin ou superadmin
//   - Suppression : superadmin uniquement
//
// Comme dans les autres services, on laisse apiFetch :
//   - ajouter automatiquement l'access token en mémoire
//   - envoyer les cookies (refresh token httpOnly)
//   - tenter un refresh silencieux sur 401
//   - normaliser les erreurs avec .status et .data

import { apiFetch } from "../lib/apiClient";

/* ===================================================================
   Helpers internes
=================================================================== */

/**
 * Construit une query string propre à partir d'un objet de filtres.
 * Ignore les valeurs undefined, null ou chaîne vide.
 *
 * Exemple :
 *   construireQueryString({ pays_id: "1", type_urgence_id: "2" })
 *   => "?pays_id=1&type_urgence_id=2"
 */
function construireQueryString(filtres = {}) {
  const params = new URLSearchParams();

  Object.entries(filtres).forEach(([cle, valeur]) => {
    if (valeur !== undefined && valeur !== null && valeur !== "") {
      params.append(cle, valeur);
    }
  });

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Vérifie qu'un identifiant est fourni.
 */
function exigerId(id, nomChamp = "id") {
  if (id === undefined || id === null || id === "") {
    throw new Error(`Identifiant manquant : ${nomChamp}.`);
  }
}

/**
 * Vérifie qu'une valeur texte obligatoire est fournie.
 */
function exigerTexte(valeur, nomChamp) {
  if (valeur === undefined || valeur === null || String(valeur).trim() === "") {
    throw new Error(`Champ requis manquant : ${nomChamp}.`);
  }
}

/* ===================================================================
   Types d'urgence
=================================================================== */

/**
 * GET /types-urgence
 *
 * Récupère la liste des types d'urgence.
 * Route publique côté backend.
 *
 * @returns {Promise<{ types: Array }>}
 */
export function listerTypesUrgence() {
  return apiFetch("/types-urgence");
}

/**
 * GET /types-urgence/:id
 *
 * Récupère un type d'urgence par son identifiant.
 * Route publique côté backend.
 *
 * @param {string|number} typeUrgenceId
 * @returns {Promise<{ typeUrgence: Object }>}
 */
export function obtenirTypeUrgence(typeUrgenceId) {
  exigerId(typeUrgenceId, "typeUrgenceId");

  return apiFetch(`/types-urgence/${encodeURIComponent(typeUrgenceId)}`);
}

/**
 * POST /types-urgence
 *
 * Crée un type d'urgence.
 * Réservé aux rôles admin / superadmin côté backend.
 *
 * @param {Object} donnees
 * @param {string} donnees.libelle - Obligatoire.
 * @param {string} [donnees.description] - Optionnel.
 * @returns {Promise<{ message: string, typeUrgence: Object }>}
 */
export function creerTypeUrgence(donnees) {
  const { libelle, description } = donnees || {};

  exigerTexte(libelle, "libelle");

  return apiFetch("/types-urgence", {
    method: "POST",
    body: {
      libelle: String(libelle).trim(),
      description:
        description === undefined || description === null
          ? undefined
          : String(description).trim(),
    },
  });
}

/**
 * PUT /types-urgence/:id
 *
 * Met à jour un type d'urgence.
 * Réservé aux rôles admin / superadmin côté backend.
 *
 * @param {string|number} typeUrgenceId
 * @param {Object} donnees
 * @param {string} [donnees.libelle]
 * @param {string|null} [donnees.description]
 * @returns {Promise<{ message: string, typeUrgence: Object }>}
 */
export function modifierTypeUrgence(typeUrgenceId, donnees = {}) {
  exigerId(typeUrgenceId, "typeUrgenceId");

  const body = {};

  if (donnees.libelle !== undefined) {
    exigerTexte(donnees.libelle, "libelle");
    body.libelle = String(donnees.libelle).trim();
  }

  if (donnees.description !== undefined) {
    body.description =
      donnees.description === null
        ? null
        : String(donnees.description ?? "").trim();
  }

  if (Object.keys(body).length === 0) {
    throw new Error("Aucune donnée à mettre à jour pour le type d'urgence.");
  }

  return apiFetch(`/types-urgence/${encodeURIComponent(typeUrgenceId)}`, {
    method: "PUT",
    body,
  });
}

/**
 * DELETE /types-urgence/:id
 *
 * Supprime un type d'urgence.
 * Réservé au superadmin côté backend.
 *
 * @param {string|number} typeUrgenceId
 * @returns {Promise<{ message: string }>}
 */
export function supprimerTypeUrgence(typeUrgenceId) {
  exigerId(typeUrgenceId, "typeUrgenceId");

  return apiFetch(`/types-urgence/${encodeURIComponent(typeUrgenceId)}`, {
    method: "DELETE",
  });
}

/* ===================================================================
   Urgences (numéros d'urgence)
=================================================================== */

/**
 * GET /urgences
 *
 * Récupère la liste des urgences.
 * Route publique côté backend.
 *
 * Filtres optionnels :
 *   - pays_id
 *   - type_urgence_id
 *
 * Exemple :
 *   listerUrgences({ pays_id: "1", type_urgence_id: "2" })
 *
 * @param {Object} [filtres]
 * @param {string|number} [filtres.pays_id]
 * @param {string|number} [filtres.type_urgence_id]
 * @returns {Promise<{ urgences: Array }>}
 */
export function listerUrgences(filtres = {}) {
  const qs = construireQueryString(filtres);

  return apiFetch(`/urgences${qs}`);
}

/**
 * GET /urgences/:id
 *
 * Récupère une urgence par son identifiant.
 * Route publique côté backend.
 *
 * @param {string|number} urgenceId
 * @returns {Promise<{ urgence: Object }>}
 */
export function obtenirUrgence(urgenceId) {
  exigerId(urgenceId, "urgenceId");

  return apiFetch(`/urgences/${encodeURIComponent(urgenceId)}`);
}

/**
 * POST /urgences
 *
 * Crée un numéro d'urgence.
 * Réservé aux rôles admin / superadmin côté backend.
 *
 * @param {Object} donnees
 * @param {string|number} donnees.type_urgence_id - Obligatoire.
 * @param {string|number} donnees.pays_id - Obligatoire.
 * @param {string} donnees.libelle - Obligatoire.
 * @param {string} donnees.telephone - Obligatoire.
 * @param {string} [donnees.description] - Optionnel.
 * @returns {Promise<{ message: string, urgence: Object }>}
 */
export function creerUrgence(donnees) {
  const {
    type_urgence_id,
    pays_id,
    libelle,
    telephone,
    description,
  } = donnees || {};

  exigerId(type_urgence_id, "type_urgence_id");
  exigerId(pays_id, "pays_id");
  exigerTexte(libelle, "libelle");
  exigerTexte(telephone, "telephone");

  return apiFetch("/urgences", {
    method: "POST",
    body: {
      type_urgence_id,
      pays_id,
      libelle: String(libelle).trim(),
      telephone: String(telephone).trim(),
      description:
        description === undefined || description === null
          ? undefined
          : String(description).trim(),
    },
  });
}

/**
 * PUT /urgences/:id
 *
 * Met à jour un numéro d'urgence.
 * Réservé aux rôles admin / superadmin côté backend.
 *
 * @param {string|number} urgenceId
 * @param {Object} donnees
 * @param {string|number} [donnees.type_urgence_id]
 * @param {string|number} [donnees.pays_id]
 * @param {string} [donnees.libelle]
 * @param {string|null} [donnees.description]
 * @param {string} [donnees.telephone]
 * @returns {Promise<{ message: string, urgence: Object }>}
 */
export function modifierUrgence(urgenceId, donnees = {}) {
  exigerId(urgenceId, "urgenceId");

  const body = {};

  if (donnees.type_urgence_id !== undefined) {
    exigerId(donnees.type_urgence_id, "type_urgence_id");
    body.type_urgence_id = donnees.type_urgence_id;
  }

  if (donnees.pays_id !== undefined) {
    exigerId(donnees.pays_id, "pays_id");
    body.pays_id = donnees.pays_id;
  }

  if (donnees.libelle !== undefined) {
    exigerTexte(donnees.libelle, "libelle");
    body.libelle = String(donnees.libelle).trim();
  }

  if (donnees.telephone !== undefined) {
    exigerTexte(donnees.telephone, "telephone");
    body.telephone = String(donnees.telephone).trim();
  }

  if (donnees.description !== undefined) {
    body.description =
      donnees.description === null
        ? null
        : String(donnees.description ?? "").trim();
  }

  if (Object.keys(body).length === 0) {
    throw new Error("Aucune donnée à mettre à jour pour l'urgence.");
  }

  return apiFetch(`/urgences/${encodeURIComponent(urgenceId)}`, {
    method: "PUT",
    body,
  });
}

/**
 * DELETE /urgences/:id
 *
 * Supprime un numéro d'urgence.
 * Réservé au superadmin côté backend.
 *
 * @param {string|number} urgenceId
 * @returns {Promise<{ message: string }>}
 */
export function supprimerUrgence(urgenceId) {
  exigerId(urgenceId, "urgenceId");

  return apiFetch(`/urgences/${encodeURIComponent(urgenceId)}`, {
    method: "DELETE",
  });
}

/* ===================================================================
   Export par défaut
=================================================================== */

export default {
  // Types d'urgence
  listerTypesUrgence,
  obtenirTypeUrgence,
  creerTypeUrgence,
  modifierTypeUrgence,
  supprimerTypeUrgence,

  // Urgences
  listerUrgences,
  obtenirUrgence,
  creerUrgence,
  modifierUrgence,
  supprimerUrgence,
};