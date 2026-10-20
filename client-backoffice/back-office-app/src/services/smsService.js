// src/services/smsService.js
//
// Miroir front-end des routes d'administration SMS (/sms/*, Twilio).
// Chemins relatifs : API_BASE_URL inclut déjà « /api ». Admin + superadmin.

import { apiFetch } from '../lib/apiClient';

/** GET /sms/configuration
 *  -> { configuration: { mode, pays_autorises, twilio: { compte_configure, expediteur, rappel_statut },
 *       relance_max_tentatives, relance_fenetre_heures } } */
export const obtenirConfigurationSms = () => apiFetch('/sms/configuration');

/** POST /sms/test { destinataire, texte } — échec d'envoi = HTTP 502, détail dans err.data.resultat. */
export const envoyerSmsTest = (body) => apiFetch('/sms/test', { method: 'POST', body });

/** GET /sms/messages?statut=&origine=&recherche=&page=&taille= -> { total, page, taille, messages } */
export const listerMessagesSms = (filtres = {}) => {
  const params = new URLSearchParams(
    Object.entries(filtres).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  const qs = params.toString();
  return apiFetch(`/sms/messages${qs ? `?${qs}` : ''}`);
};

/** POST /sms/messages/:id/renvoyer (SMS en échec, hors codes de vérification) */
export const renvoyerMessageSms = (id) => apiFetch(`/sms/messages/${id}/renvoyer`, { method: 'POST' });
