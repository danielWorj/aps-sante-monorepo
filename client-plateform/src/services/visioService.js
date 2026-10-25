// src/services/visioService.js
// Téléconsultation : fin d'appel et bilan de clôture (voir
// server/src/controllers/visio.controller.js, cloturerVisio / obtenirBilanVisio).
import { apiFetch } from '../lib/apiClient';

/** POST /visio/:id/cloture — appelé quand l'appel se termine pour l'utilisateur.
 *  Médecin : clôt la consultation (fin constatée, paiement dans T heures).
 *  Patient : ne clôt rien, renvoie le bilan.
 *  -> { rdv_id, role, termine, raison_non_terminee, delai_liberation_heures, date_liberation,
 *       interlocuteur, medecin?, avis?: { possible, deja_depose }, contestation?: { possible } } */
export const cloturerVisio = (rdvId) => apiFetch(`/visio/${rdvId}/cloture`, { method: 'POST' });

/** GET /visio/:id/cloture — même bilan, sans effet (le patient attend la clôture du médecin). */
export const obtenirBilanVisio = (rdvId) => apiFetch(`/visio/${rdvId}/cloture`);

/** POST /visio/:id/presence — l'utilisateur est entré dans la salle (doublon
 *  volontaire du webhook Prosody, qui peut manquer). -> { enregistree } */
export const signalerPresenceVisio = (rdvId) => apiFetch(`/visio/${rdvId}/presence`, { method: 'POST' });
