// src/services/contactService.js
// Boîte de réception du formulaire public « Contactez-nous »
// (voir server/src/routes/contact.routes.js) — admin / superadmin.
import { apiFetch } from '../lib/apiClient';

/** GET /admin/messages-contact → { messages, pagination, par_statut } */
export function listerMessagesContact({ statut = '', recherche = '', page = 1 } = {}) {
  const params = new URLSearchParams();
  if (statut) params.set('statut', statut);
  if (recherche.trim()) params.set('recherche', recherche.trim());
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return apiFetch(`/admin/messages-contact${qs ? `?${qs}` : ''}`);
}

/** PUT /admin/messages-contact/:id { statut?, note_interne? } */
export function modifierMessageContact(id, donnees) {
  return apiFetch(`/admin/messages-contact/${id}`, { method: 'PUT', body: donnees }).then((d) => d.messageContact);
}
