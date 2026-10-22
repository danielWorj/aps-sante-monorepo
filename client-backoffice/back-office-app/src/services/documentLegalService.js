// src/services/documentLegalService.js
// Documents légaux (CGU, politique de confidentialité) — superadmin.
// Voir server/src/routes/documentLegal.routes.js.
import { apiFetch } from '../lib/apiClient';

/** GET /admin/documents-legaux?type= → { type, libelle, versions } */
export function listerVersions(type) {
  return apiFetch(`/admin/documents-legaux?type=${encodeURIComponent(type)}`);
}

/** GET /admin/documents-legaux/versions/:id → version complète (avec contenu_html) */
export function obtenirVersion(id) {
  return apiFetch(`/admin/documents-legaux/versions/${id}`).then((d) => d.version);
}

/** POST /admin/documents-legaux { type } → nouveau brouillon */
export function creerBrouillon(type) {
  return apiFetch('/admin/documents-legaux', { method: 'POST', body: { type } }).then((d) => d.version);
}

/** PUT /admin/documents-legaux/versions/:id { titre?, contenu_html?, resume_modifications? } */
export function enregistrerBrouillon(id, donnees) {
  return apiFetch(`/admin/documents-legaux/versions/${id}`, { method: 'PUT', body: donnees }).then((d) => d.version);
}

/** POST /admin/documents-legaux/versions/:id/publier */
export function publierVersion(id) {
  return apiFetch(`/admin/documents-legaux/versions/${id}/publier`, { method: 'POST' });
}

/** DELETE /admin/documents-legaux/versions/:id (brouillon seulement) */
export function supprimerBrouillon(id) {
  return apiFetch(`/admin/documents-legaux/versions/${id}`, { method: 'DELETE' });
}

/** GET /admin/documents-legaux/versions/:id/acceptations → { acceptations, pagination } */
export function listerAcceptations(id, { recherche = '', page = 1 } = {}) {
  const params = new URLSearchParams();
  if (recherche.trim()) params.set('recherche', recherche.trim());
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return apiFetch(`/admin/documents-legaux/versions/${id}/acceptations${qs ? `?${qs}` : ''}`);
}
