// src/services/urgenceService.js
// Couche d'accès aux endpoints REST du module "Urgences" exposés par le
// backend (voir src/routes/urgences.routes.js et
// src/controllers/urgences.controller.js côté API) :
//
//   GET/POST/PUT/DELETE /api/types-urgence
//   GET/POST/PUT/DELETE /api/urgences
//
// S'appuie entièrement sur `apiFetch` (src/lib/apiClient.js) : celui-ci
// ajoute déjà l'access token en mémoire (Authorization: Bearer …), gère
// le cookie httpOnly du refresh token et rejoue automatiquement la
// requête en cas de 401 expiré. On ne réimplémente rien de tout ça ici.
//
// Note : `API_BASE_URL` (dans apiClient.js) inclut déjà le préfixe
// "/api" — les chemins ci-dessous commencent donc directement par
// "/types-urgence" et "/urgences", pas par "/api/types-urgence" ni
// "/api/urgences".
//
// Lecture (GET) types-urgence/urgences : publique côté backend, mais
// apiFetch envoie quand même le token s'il existe (sans incidence).
// Écriture (POST/PUT) : admin/superadmin. Suppression : superadmin.
// apiFetch lève une Error (avec `.status` et `.data`) si le backend
// répond en erreur — chaque fonction ci-dessous se contente de la
// laisser remonter telle quelle à l'appelant.

import { apiFetch } from '../lib/apiClient';

/* ======================================================= Types d'urgence */
export function listerTypesUrgence() {
  return apiFetch('/types-urgence').then((d) => d.types);
}

export function obtenirTypeUrgence(type_urgence_id) {
  return apiFetch(`/types-urgence/${type_urgence_id}`).then((d) => d.typeUrgence);
}

export function creerTypeUrgence({ libelle, description }) {
  return apiFetch('/types-urgence', {
    method: 'POST',
    body: { libelle, description },
  }).then((d) => d.typeUrgence);
}

export function modifierTypeUrgence(type_urgence_id, { libelle, description }) {
  return apiFetch(`/types-urgence/${type_urgence_id}`, {
    method: 'PUT',
    body: { libelle, description },
  }).then((d) => d.typeUrgence);
}

export function supprimerTypeUrgence(type_urgence_id) {
  return apiFetch(`/types-urgence/${type_urgence_id}`, { method: 'DELETE' });
}

/* ================================================================ Urgences */
// `filtres` optionnel : { pays_id, type_urgence_id }
export function listerUrgences(filtres = {}) {
  const params = new URLSearchParams();
  if (filtres.pays_id) params.set('pays_id', filtres.pays_id);
  if (filtres.type_urgence_id) params.set('type_urgence_id', filtres.type_urgence_id);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiFetch(`/urgences${qs}`).then((d) => d.urgences);
}

export function obtenirUrgence(urgence_id) {
  return apiFetch(`/urgences/${urgence_id}`).then((d) => d.urgence);
}

export function creerUrgence({ type_urgence_id, pays_id, libelle, description, telephone }) {
  return apiFetch('/urgences', {
    method: 'POST',
    body: { type_urgence_id, pays_id, libelle, description, telephone },
  }).then((d) => d.urgence);
}

export function modifierUrgence(urgence_id, { type_urgence_id, pays_id, libelle, description, telephone }) {
  return apiFetch(`/urgences/${urgence_id}`, {
    method: 'PUT',
    body: { type_urgence_id, pays_id, libelle, description, telephone },
  }).then((d) => d.urgence);
}

export function supprimerUrgence(urgence_id) {
  return apiFetch(`/urgences/${urgence_id}`, { method: 'DELETE' });
}