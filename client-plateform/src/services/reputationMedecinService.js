// src/services/reputationMedecinService.js
// Réputation du médecin : tableau de bord (audience, activité, notes),
// avis et notation (côté médecin, public et patient), engagements des
// visiteurs sur la fiche publique.
// Côté serveur : server/src/controllers/reputationMedecin.controller.js
// et avis.controller.js (dépôt / modération).

import { apiFetch } from '../lib/apiClient';

function query(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/* ---------------------------- Constantes partagées ---------------------------- */

export const CRITERES_AVIS = [
  { cle: 'ponctualite', champ: 'note_ponctualite', libelle: 'Ponctualité', icone: 'fa-clock' },
  { cle: 'ecoute', champ: 'note_ecoute', libelle: 'Écoute', icone: 'fa-ear-listen' },
  { cle: 'explications', champ: 'note_explications', libelle: 'Clarté des explications', icone: 'fa-comment-medical' },
];

export const LIBELLES_NOTE = { 1: 'Décevant', 2: 'Passable', 3: 'Bien', 4: 'Très bien', 5: 'Excellent' };

export const TYPES_ENGAGEMENT = {
  clic_rdv: { libelle: 'Clics « Prendre RDV »', icone: 'fa-calendar-plus' },
  clic_contact: { libelle: 'Contacts', icone: 'fa-phone' },
  clic_itineraire: { libelle: 'Itinéraires', icone: 'fa-route' },
  partage: { libelle: 'Partages', icone: 'fa-share-nodes' },
  lecture_avis: { libelle: 'Lectures des avis', icone: 'fa-star-half-stroke' },
};

export const COMMENTAIRE_AVIS_MAX = 2000;
export const REPONSE_AVIS_MAX = 1500;

/* --------------------------------- Médecin --------------------------------- */

/** GET /medecins/mon-espace/tableau-de-bord?du&au&granularite */
export function obtenirTableauDeBordMedecin({ du, au, granularite } = {}) {
  return apiFetch(`/medecins/mon-espace/tableau-de-bord${query({ du, au, granularite })}`);
}

/** GET /medecins/mon-espace/avis?note&reponse&commentaire&tri&page */
export function listerMesAvisMedecin(filtres = {}) {
  return apiFetch(`/medecins/mon-espace/avis${query(filtres)}`);
}

/** PUT /avis-medecin/:id/reponse */
export function repondreAvis(avisId, reponse) {
  return apiFetch(`/avis-medecin/${avisId}/reponse`, { method: 'PUT', body: { reponse } });
}

/** DELETE /avis-medecin/:id/reponse */
export function supprimerReponseAvis(avisId) {
  return apiFetch(`/avis-medecin/${avisId}/reponse`, { method: 'DELETE' });
}

/** POST /avis-medecin/:id/signaler */
export function signalerAvis(avisId, motif) {
  return apiFetch(`/avis-medecin/${avisId}/signaler`, { method: 'POST', body: { motif } });
}

/* --------------------------------- Public --------------------------------- */

/** GET /medecins/:id/avis — synthèse + avis publiés paginés. */
export function listerAvisPublics(medecinId, filtres = {}) {
  return apiFetch(`/medecins/${medecinId}/avis${query(filtres)}`);
}

// Un même type n'est envoyé qu'une fois par fiche et par onglet : le
// serveur dédoublonne déjà par visiteur et par jour, inutile de le solliciter.
const dejaSignales = new Set();

/**
 * POST /medecins/:id/engagements — « fire and forget » : une statistique ne
 * doit jamais gêner la navigation (aucune erreur remontée).
 */
export function signalerEngagement(medecinId, type) {
  const cle = `${medecinId}:${type}`;
  if (!medecinId || dejaSignales.has(cle)) return;
  dejaSignales.add(cle);
  apiFetch(`/medecins/${medecinId}/engagements`, { method: 'POST', body: { type } }).catch(() => {});
}

/* --------------------------------- Patient --------------------------------- */

/** GET /avis-medecin/a-donner — consultations terminées encore à noter. */
export function listerConsultationsANoter() {
  return apiFetch('/avis-medecin/a-donner');
}

/** GET /avis-medecin/mes-avis — avis donnés (tous statuts). */
export function listerMesAvisDonnes() {
  return apiFetch('/avis-medecin/mes-avis');
}

/** POST /avis-medecin */
export function deposerAvisMedecin(donnees) {
  return apiFetch('/avis-medecin', { method: 'POST', body: donnees });
}
