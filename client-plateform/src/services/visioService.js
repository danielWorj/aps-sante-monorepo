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

/** GET /visio/appel-entrant — PATIENT : visio que son médecin vient de lancer.
 *  -> { appel: { rdv_id, lancee_le, date_creneau, medecin: { prenom, nom, photo_url, specialite } } | null } */
export const obtenirAppelEntrant = () => apiFetch('/visio/appel-entrant');

/** POST /visio/:id/refus — PATIENT : appel refusé (ou manqué), l'appel cesse de
 *  sonner sur tous ses appareils. -> { refuse: true } */
export const refuserAppelVisio = (rdvId) => apiFetch(`/visio/${rdvId}/refus`, { method: 'POST' });

/** POST /visio/:id/presence — l'utilisateur est entré dans la salle (doublon
 *  volontaire du webhook Prosody, qui peut manquer). -> { enregistree } */
export const signalerPresenceVisio = (rdvId) => apiFetch(`/visio/${rdvId}/presence`, { method: 'POST' });

/** GET /visio/:id/duree — durée maximale de l'appel (réglée par pays) :
 *  -> { duree: { duree_minutes, debut_le, fin_prevue_le, alerte_avant_fin_minutes, ecoulee, maintenant } }
 *  `fin_prevue_le` est null tant que les deux parties ne sont pas présentes. */
export const obtenirDureeVisio = (rdvId) => apiFetch(`/visio/${rdvId}/duree`);
