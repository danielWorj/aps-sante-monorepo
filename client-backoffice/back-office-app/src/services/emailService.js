// src/services/emailService.js
//
// Miroir front-end des routes d'administration e-mail (/email/*, SMTP / IMAP).
// Chemins relatifs : API_BASE_URL inclut déjà « /api ». Superadmin.

import { apiFetch } from '../lib/apiClient';

const requete = (chemin, filtres = {}) => {
  const params = new URLSearchParams(
    Object.entries(filtres).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  const qs = params.toString();
  return `${chemin}${qs ? `?${qs}` : ''}`;
};

/** GET /email/configuration
 *  -> { configuration: { smtp: { configure, serveur, authentification, expediteur, repondre_a },
 *       imap: { configure, serveur, compte, dossier }, relance_max_tentatives, relance_fenetre_heures } } */
export const obtenirConfigurationEmail = () => apiFetch('/email/configuration');

/** POST /email/verifier — connexion + authentification SMTP. */
export const verifierSmtp = () => apiFetch('/email/verifier', { method: 'POST' });

/** POST /email/test { destinataire, sujet?, texte } — échec d'envoi = HTTP 502. */
export const envoyerEmailTest = (body) => apiFetch('/email/test', { method: 'POST', body });

/** GET /email/messages?statut=&origine=&recherche=&page=&taille= -> { total, page, taille, messages } */
export const listerMessagesEmail = (filtres = {}) => apiFetch(requete('/email/messages', filtres));

/** POST /email/messages/:id/renvoyer (e-mail en échec) */
export const renvoyerMessageEmail = (id) => apiFetch(`/email/messages/${id}/renvoyer`, { method: 'POST' });

/** GET /email/recus?lu=&recherche=&page=&taille= -> { total, non_lus, page, taille, emails } */
export const listerEmailsRecus = (filtres = {}) => apiFetch(requete('/email/recus', filtres));

/** GET /email/recus/:id -> { email } (texte seul) */
export const obtenirEmailRecu = (id) => apiFetch(`/email/recus/${id}`);

/** PATCH /email/recus/:id { lu } */
export const marquerEmailRecu = (id, lu) => apiFetch(`/email/recus/${id}`, { method: 'PATCH', body: { lu } });

/** POST /email/recus/relever — relève immédiate de la boîte IMAP. */
export const releverEmailsRecus = () => apiFetch('/email/recus/relever', { method: 'POST' });
