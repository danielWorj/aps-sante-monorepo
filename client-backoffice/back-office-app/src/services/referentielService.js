// src/services/referentielService.js
// Couche d'accès aux endpoints REST du composant "référentiels" exposés
// par le backend (voir src/routes/referentiels.routes.js côté API) :
//
//   GET/POST/PUT/DELETE /api/referentiels/langues
//   GET/POST/PUT/DELETE /api/referentiels/devises
//   GET/POST/PUT/DELETE /api/referentiels/pays
//   GET/POST/PUT/DELETE /api/referentiels/villes
//   GET/POST/PUT/DELETE /api/referentiels/roles
//
// S'appuie entièrement sur `apiFetch` (src/lib/apiClient.js) : celui-ci
// ajoute déjà l'access token en mémoire (Authorization: Bearer …), gère
// le cookie httpOnly du refresh token et rejoue automatiquement la
// requête en cas de 401 expiré. On ne réimplémente rien de tout ça ici.
//
// Note : `API_BASE_URL` (dans apiClient.js) inclut déjà le préfixe
// "/api" — les chemins ci-dessous commencent donc directement par
// "/referentiels/…", pas par "/api/referentiels/…".
//
// Lecture (GET) langues/devises/pays/villes : publique côté backend,
// mais apiFetch envoie quand même le token s'il existe (sans incidence).
// Lecture (GET) roles : nécessite d'être authentifié.
// Écriture (POST/PUT) : admin/superadmin. Suppression : superadmin.
// apiFetch lève une Error (avec `.status` et `.data`) si le backend
// répond en erreur — chaque fonction ci-dessous se contente de la
// laisser remonter telle quelle à l'appelant.

import { apiFetch } from '../lib/apiClient';

/* ============================================================= Langues */
export function listerLangues() {
  return apiFetch('/referentiels/langues').then((d) => d.langues);
}
export function obtenirLangue(langue_id) {
  return apiFetch(`/referentiels/langues/${langue_id}`).then((d) => d.langue);
}
export function creerLangue({ nom }) {
  return apiFetch('/referentiels/langues', { method: 'POST', body: { nom } }).then((d) => d.langue);
}
export function modifierLangue(langue_id, { nom }) {
  return apiFetch(`/referentiels/langues/${langue_id}`, { method: 'PUT', body: { nom } }).then(
    (d) => d.langue
  );
}
export function supprimerLangue(langue_id) {
  return apiFetch(`/referentiels/langues/${langue_id}`, { method: 'DELETE' });
}

/* ============================================================= Devises */
export function listerDevises() {
  return apiFetch('/referentiels/devises').then((d) => d.devises);
}
export function obtenirDevise(devise_id) {
  return apiFetch(`/referentiels/devises/${devise_id}`).then((d) => d.devise);
}
export function creerDevise({ libelle }) {
  return apiFetch('/referentiels/devises', { method: 'POST', body: { libelle } }).then((d) => d.devise);
}
export function modifierDevise(devise_id, { libelle }) {
  return apiFetch(`/referentiels/devises/${devise_id}`, { method: 'PUT', body: { libelle } }).then(
    (d) => d.devise
  );
}
export function supprimerDevise(devise_id) {
  return apiFetch(`/referentiels/devises/${devise_id}`, { method: 'DELETE' });
}

/* ================================================================ Pays */
export function listerPays(statut_activation) {
  const qs = statut_activation ? `?statut_activation=${encodeURIComponent(statut_activation)}` : '';
  return apiFetch(`/referentiels/pays${qs}`).then((d) => d.pays);
}
export function obtenirPays(pays_id) {
  return apiFetch(`/referentiels/pays/${pays_id}`).then((d) => d.pays);
}
export function creerPays({ code_iso2, nom, devise_id, langue_id, statut_activation }) {
  return apiFetch('/referentiels/pays', {
    method: 'POST',
    body: { code_iso2, nom, devise_id, langue_id, statut_activation },
  }).then((d) => d.pays);
}
export function modifierPays(pays_id, { code_iso2, nom, devise_id, langue_id, statut_activation }) {
  return apiFetch(`/referentiels/pays/${pays_id}`, {
    method: 'PUT',
    body: { code_iso2, nom, devise_id, langue_id, statut_activation },
  }).then((d) => d.pays);
}
export function supprimerPays(pays_id) {
  return apiFetch(`/referentiels/pays/${pays_id}`, { method: 'DELETE' });
}

/* =============================================================== Villes */
export function listerVilles(pays_id) {
  const qs = pays_id ? `?pays_id=${encodeURIComponent(pays_id)}` : '';
  return apiFetch(`/referentiels/villes${qs}`).then((d) => d.villes);
}
export function obtenirVille(ville_id) {
  return apiFetch(`/referentiels/villes/${ville_id}`).then((d) => d.ville);
}
export function creerVille({ pays_id, nom, code_postal }) {
  return apiFetch('/referentiels/villes', {
    method: 'POST',
    body: { pays_id, nom, code_postal },
  }).then((d) => d.ville);
}
export function modifierVille(ville_id, { pays_id, nom, code_postal }) {
  return apiFetch(`/referentiels/villes/${ville_id}`, {
    method: 'PUT',
    body: { pays_id, nom, code_postal },
  }).then((d) => d.ville);
}
export function supprimerVille(ville_id) {
  return apiFetch(`/referentiels/villes/${ville_id}`, { method: 'DELETE' });
}

/* ========================================================== Rôles (IAM) */
export function listerRoles() {
  return apiFetch('/referentiels/roles').then((d) => d.roles);
}
export function obtenirRole(role_id) {
  return apiFetch(`/referentiels/roles/${role_id}`).then((d) => d.role);
}
export function creerRole({ libelle }) {
  return apiFetch('/referentiels/roles', { method: 'POST', body: { libelle } }).then((d) => d.role);
}
export function modifierRole(role_id, { libelle }) {
  return apiFetch(`/referentiels/roles/${role_id}`, { method: 'PUT', body: { libelle } }).then(
    (d) => d.role
  );
}
export function supprimerRole(role_id) {
  return apiFetch(`/referentiels/roles/${role_id}`, { method: 'DELETE' });
}
/* ========================================================== Villes */
