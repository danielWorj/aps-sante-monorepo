// src/services/offreRdvService.js
// RDV aléatoire (RDV sur offre) — voir server/src/routes/offreRdv.routes.js.
//   Patient : publie une demande (spécialité, ville, jour + heure, type,
//             motif), voit les médecins qui ont répondu, valide l'un d'eux
//             (le RDV est créé, il reste à le payer).
//   Médecin : voit les demandes de sa spécialité dans sa ville, répond avec
//             son profil (mot facultatif), peut retirer sa réponse.
// Erreurs : normalisées par apiFetch (.message, .status, .code éventuel).

import { apiFetch } from '../lib/apiClient';

export const STATUTS_OFFRE = {
  ouverte: { label: 'En attente de réponses', chip: 'chip-st-attente', icone: 'fa-bullhorn' },
  attribuee: { label: 'Médecin validé', chip: 'chip-st-confirme', icone: 'fa-user-check' },
  expiree: { label: 'Expirée', chip: 'chip-st-annule', icone: 'fa-hourglass-end' },
  annulee: { label: 'Annulée', chip: 'chip-st-annule', icone: 'fa-ban' },
};

/* ---------------------------- Patient ---------------------------- */

/** POST /offres-rdv — { specialite_id, ville_id, type_rdv, date_souhaitee (ISO), motif? } */
export function publierOffre(donnees) {
  return apiFetch('/offres-rdv', { method: 'POST', body: donnees });
}

/** GET /offres-rdv/mes-offres — offres du patient avec les médecins qui ont répondu. */
export async function listerMesOffres() {
  const data = await apiFetch('/offres-rdv/mes-offres');
  return data.offres || [];
}

/** POST /offres-rdv/:id/annuler — seulement tant qu'aucun médecin n'est validé. */
export function annulerOffre(offreId) {
  return apiFetch(`/offres-rdv/${offreId}/annuler`, { method: 'POST' });
}

/**
 * POST /offres-rdv/:id/reponses/:reponseId/valider — « Valider ce médecin ».
 * @returns {Promise<{ rendez_vous, delai_confirmation_heures, echeance_confirmation }>}
 */
export function validerMedecin(offreId, reponseId) {
  return apiFetch(`/offres-rdv/${offreId}/reponses/${reponseId}/valider`, { method: 'POST' });
}

/* ---------------------------- Médecin ---------------------------- */

/** GET /offres-rdv/medecin?vue=ouvertes|mes_reponses */
export async function listerOffresMedecin(vue = 'ouvertes') {
  const data = await apiFetch(`/offres-rdv/medecin?vue=${encodeURIComponent(vue)}`);
  return data.offres || [];
}

/** POST /offres-rdv/:id/reponse — { message? } */
export function repondreOffre(offreId, message) {
  return apiFetch(`/offres-rdv/${offreId}/reponse`, { method: 'POST', body: { message: message || null } });
}

/** DELETE /offres-rdv/:id/reponse */
export function retirerReponse(offreId) {
  return apiFetch(`/offres-rdv/${offreId}/reponse`, { method: 'DELETE' });
}
