// src/services/contactService.js
// Page publique « Contactez-nous » (voir server/src/routes/contact.routes.js).
import { apiFetch } from '../lib/apiClient';

/**
 * POST /contact — publique (le compte connecté est rattaché s'il existe).
 * @param {{ nom, email?, telephone?, profil, sujet, message, site_web? }} donnees
 * @returns {Promise<{ message: string, reference?: string }>}
 */
export function envoyerMessageContact(donnees) {
  return apiFetch('/contact', { method: 'POST', body: donnees });
}

/**
 * GET /contact/coordonnees — canaux directs (WhatsApp actif, e-mail,
 * téléphone, adresse), chacun pouvant être null.
 */
export function obtenirCoordonneesContact() {
  return apiFetch('/contact/coordonnees');
}
