// src/services/laboratoireService.js
//
// Couche d'accès aux APIs du module « Laboratoires d'analyses » — miroir de
// server/src/routes/laboratoire.routes.js : annuaire public, fiche, examens,
// centres de prélèvement, avis, médiathèque, engagements et portail du
// gérant (tableau de bord, gestion). apiFetch gère le jeton, le refresh et
// lève une Error(.status, .data) sur réponse non-OK.

import { apiFetch } from '../lib/apiClient';

function construireQuery(filtres = {}) {
  const params = new URLSearchParams();
  Object.entries(filtres).forEach(([cle, valeur]) => {
    if (valeur !== undefined && valeur !== null && valeur !== '') params.set(cle, valeur);
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

const CHAMPS_FICHIERS = ['image_laboratoire', 'piece_identite', 'document_agrement'];

function construireFormData(donnees = {}) {
  const formData = new FormData();
  Object.entries(donnees).forEach(([cle, valeur]) => {
    if (valeur === undefined || valeur === null || valeur === '') return;
    if (CHAMPS_FICHIERS.includes(cle)) {
      if (valeur instanceof File) formData.append(cle, valeur);
      return;
    }
    formData.append(cle, valeur);
  });
  return formData;
}

/* ============================ Annuaire / fiche ============================ */

/** GET /laboratoires — { pays_id, ville_id, recherche, examen, lat, lng, rayon_km } */
export async function listerLaboratoires(filtres = {}) {
  const d = await apiFetch(`/laboratoires${construireQuery(filtres)}`);
  return d.laboratoires || [];
}

export async function obtenirLaboratoire(id) {
  const d = await apiFetch(`/laboratoires/${id}`);
  return d.laboratoire;
}

/** POST /laboratoires — réponse brute { message, laboratoire, agent }. */
export function creerLaboratoire(donnees) {
  return apiFetch('/laboratoires', { method: 'POST', body: construireFormData(donnees) });
}

export async function modifierLaboratoire(id, donnees) {
  const d = await apiFetch(`/laboratoires/${id}`, { method: 'PUT', body: construireFormData(donnees) });
  return d.laboratoire;
}

/* ============================ Examens ============================ */

/** -> { examens, categories } */
export function listerExamens(laboratoireId, filtres = {}) {
  return apiFetch(`/laboratoires/${laboratoireId}/examens${construireQuery(filtres)}`);
}

export function creerExamen(laboratoireId, donnees) {
  return apiFetch(`/laboratoires/${laboratoireId}/examens`, { method: 'POST', body: donnees });
}

export function modifierExamen(examenId, donnees) {
  return apiFetch(`/examens-laboratoire/${examenId}`, { method: 'PUT', body: donnees });
}

export function supprimerExamen(examenId) {
  return apiFetch(`/examens-laboratoire/${examenId}`, { method: 'DELETE' });
}

/* ============================ Centres ============================ */

export async function listerCentres(laboratoireId) {
  const d = await apiFetch(`/laboratoires/${laboratoireId}/centres`);
  return d.centres || [];
}

export function creerCentre(laboratoireId, donnees) {
  return apiFetch(`/laboratoires/${laboratoireId}/centres`, { method: 'POST', body: donnees });
}

export function modifierCentre(centreId, donnees) {
  return apiFetch(`/centres-laboratoire/${centreId}`, { method: 'PUT', body: donnees });
}

export function supprimerCentre(centreId) {
  return apiFetch(`/centres-laboratoire/${centreId}`, { method: 'DELETE' });
}

/* ============================ Avis ============================ */

/** -> { resume, avis, pagination, mon_avis } */
export function listerAvis(laboratoireId, { page = 1, limite = 5, tri, note } = {}) {
  return apiFetch(`/laboratoires/${laboratoireId}/avis${construireQuery({ page, limite, tri, note })}`);
}

export function deposerAvis(laboratoireId, { note, commentaire }) {
  return apiFetch(`/laboratoires/${laboratoireId}/avis`, { method: 'POST', body: { note, commentaire } });
}

export function supprimerAvis(avisId) {
  return apiFetch(`/avis-laboratoire/${avisId}`, { method: 'DELETE' });
}

/* ============================ Médiathèque ============================ */

export async function listerMediasPublics(laboratoireId) {
  const d = await apiFetch(`/laboratoires/${laboratoireId}/medias`);
  return d.medias || [];
}

/** -> { medias, quotas, fiche_publiee } */
export function listerMediasGestion(laboratoireId) {
  return apiFetch(`/laboratoires/${laboratoireId}/medias/gestion`);
}

export function ajouterMedia(laboratoireId, fichier, titre) {
  const fd = new FormData();
  fd.append('fichier', fichier);
  if (titre?.trim()) fd.append('titre', titre.trim());
  return apiFetch(`/laboratoires/${laboratoireId}/medias`, { method: 'POST', body: fd });
}

export function modifierMedia(mediaId, titre) {
  return apiFetch(`/medias-laboratoire/${mediaId}`, { method: 'PUT', body: { titre: titre ?? null } });
}

export function supprimerMedia(mediaId) {
  return apiFetch(`/medias-laboratoire/${mediaId}`, { method: 'DELETE' });
}

export function ordonnerMedias(laboratoireId, type, ids) {
  return apiFetch(`/laboratoires/${laboratoireId}/medias/ordre`, { method: 'PUT', body: { type, ids } });
}

/* ============================ Engagements ============================ */

/**
 * Signale un engagement sur la fiche publique (appel, e-mail, itinéraire,
 * partage, lecture des examens / des avis). Silencieux : une statistique ne
 * doit jamais gêner le visiteur.
 */
export function signalerEngagement(laboratoireId, type) {
  return apiFetch(`/laboratoires/${laboratoireId}/engagements`, { method: 'POST', body: { type } }).catch(() => {});
}

/* ============================ Portail du gérant ============================ */

/** GET /laboratoires/mon-laboratoire — 404 si le compte ne gère aucun laboratoire. */
export async function obtenirMonLaboratoire() {
  const d = await apiFetch('/laboratoires/mon-laboratoire');
  return d.laboratoire;
}

/** -> { laboratoire, examens, centres } */
export function obtenirGestionLaboratoire(laboratoireId) {
  return apiFetch(`/laboratoires/${laboratoireId}/gestion`);
}

export function obtenirTableauDeBord(laboratoireId, jours = 30) {
  return apiFetch(`/laboratoires/${laboratoireId}/tableau-de-bord?jours=${jours}`);
}

/** Prix indicatif lisible (« Sur demande » sans prix). */
export function formaterPrix(prix, devise) {
  if (prix === null || prix === undefined) return 'Sur demande';
  return `${Number(prix).toLocaleString('fr-FR')} ${devise ?? ''}`.trim();
}
