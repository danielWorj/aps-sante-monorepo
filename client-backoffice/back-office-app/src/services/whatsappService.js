// src/services/whatsappService.js
//
// Miroir front-end des routes d'administration WhatsApp (/whatsapp/*).
// Chemins relatifs : API_BASE_URL inclut déjà « /api ».
// Lecture, test, vérification, renvoi : admin + superadmin.
// Création / modification / activation / suppression d'un numéro : superadmin.

import { apiFetch } from '../lib/apiClient';

/** GET /whatsapp/configuration
 *  -> { configuration: { jeton_configure, version_api, numero_actif, relance_max_tentatives, relance_fenetre_heures } } */
export const obtenirConfigurationWhatsapp = () => apiFetch('/whatsapp/configuration');

/** GET /whatsapp/numeros -> { numeros_whatsapp: [{ numero_whatsapp_id, libelle, numero, phone_number_id,
 *  waba_id, actif, date_creation, nombre_messages }] } */
export const listerNumerosWhatsapp = () => apiFetch('/whatsapp/numeros');

/** POST /whatsapp/numeros { libelle, numero, phone_number_id, waba_id?, actif? } */
export const creerNumeroWhatsapp = (body) => apiFetch('/whatsapp/numeros', { method: 'POST', body });

/** PATCH /whatsapp/numeros/:id { libelle?, numero?, phone_number_id?, waba_id? } */
export const modifierNumeroWhatsapp = (id, body) =>
  apiFetch(`/whatsapp/numeros/${id}`, { method: 'PATCH', body });

export const activerNumeroWhatsapp = (id) => apiFetch(`/whatsapp/numeros/${id}/activer`, { method: 'POST' });
export const desactiverNumeroWhatsapp = (id) => apiFetch(`/whatsapp/numeros/${id}/desactiver`, { method: 'POST' });
export const supprimerNumeroWhatsapp = (id) => apiFetch(`/whatsapp/numeros/${id}`, { method: 'DELETE' });

/** POST /whatsapp/numeros/:id/verifier -> { verification: { correspond, meta: { display_phone_number, verified_name, quality_rating } } } */
export const verifierNumeroWhatsapp = (id) => apiFetch(`/whatsapp/numeros/${id}/verifier`, { method: 'POST' });

/** POST /whatsapp/test { destinataire, texte } | { destinataire, modele: { nom, langue, parametres } }
 *  Échec d'envoi = HTTP 502, le détail est dans err.data.resultat. */
export const envoyerMessageTestWhatsapp = (body) => apiFetch('/whatsapp/test', { method: 'POST', body });

/** GET /whatsapp/messages?statut=&origine=&recherche=&page=&taille= -> { total, page, taille, messages } */
export const listerMessagesWhatsapp = (filtres = {}) => {
  const params = new URLSearchParams(
    Object.entries(filtres).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  const qs = params.toString();
  return apiFetch(`/whatsapp/messages${qs ? `?${qs}` : ''}`);
};

/** POST /whatsapp/messages/:id/renvoyer (message en échec uniquement) */
export const renvoyerMessageWhatsapp = (id) => apiFetch(`/whatsapp/messages/${id}/renvoyer`, { method: 'POST' });

/** GET /whatsapp/modeles-messages -> { modeles: [{ code, libelle, texte, nom_modele_meta, langue, actif, variables }] } */
export const listerModelesMessagesWhatsapp = () => apiFetch('/whatsapp/modeles-messages');

/** PUT /whatsapp/modeles-messages/:code { libelle?, texte?, nom_modele_meta?, langue?, actif? } */
export const modifierModeleMessageWhatsapp = (code, body) =>
  apiFetch(`/whatsapp/modeles-messages/${code}`, { method: 'PUT', body });
