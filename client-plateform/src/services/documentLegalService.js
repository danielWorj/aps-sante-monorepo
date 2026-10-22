// src/services/documentLegalService.js
// Documents légaux publics (voir server/src/routes/documentLegal.routes.js).
import { apiFetch } from '../lib/apiClient';

/**
 * GET /documents-legaux/:type?version=N — version en vigueur (ou une
 * version archivée) et historique des versions publiées.
 * @param {'cgu'|'confidentialite'} type
 * @param {number} [version]
 */
export function obtenirDocumentLegal(type, version) {
  const qs = version ? `?version=${encodeURIComponent(version)}` : '';
  return apiFetch(`/documents-legaux/${type}${qs}`);
}
