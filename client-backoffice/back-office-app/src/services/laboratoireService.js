// src/services/laboratoireService.js
//
// Couche d'accès API du module "laboratoires d'analyses" côté back-office.
// Miroir de server/src/routes/laboratoire.routes.js (même patron que
// pharmacieService.js : apiFetch gère le jeton, le refresh et les erreurs).
//
//   - GET  /admin/laboratoires               : tous statuts, pièces, agents
//   - PATCH /admin/laboratoires/:id/statut   : publication / retrait
//   - POST/PUT /laboratoires                 : multipart (3 fichiers)
//   - DELETE /laboratoires/:id               : superadmin
//   - examens / centres / médias             : contenus de la fiche
//   - /admin/avis-laboratoire                : modération des avis

import { apiFetch } from '../lib/apiClient';
import {
  listerPays as listerPaysReferentiel,
  listerVilles as listerVillesReferentiel,
} from './referentielService';

export const STATUTS_VERIFICATION_LABORATOIRE = [
  { valeur: 'non_publie', libelle: 'Non publié' },
  { valeur: 'en_cours', libelle: 'En cours de vérification' },
  { valeur: 'publie', libelle: 'Publié' },
];

export const STATUTS_MODERATION_AVIS = [
  { valeur: 'en_attente', libelle: 'En attente', badge: 'is-warning' },
  { valeur: 'publie', libelle: 'Publié', badge: 'is-success' },
  { valeur: 'rejete', libelle: 'Rejeté', badge: 'is-danger' },
];

const CHAMPS_FICHIERS = ['image_laboratoire', 'piece_identite', 'document_agrement'];

function construireParametres(filtres = {}) {
  const params = new URLSearchParams();
  Object.entries(filtres).forEach(([cle, valeur]) => {
    if (valeur !== undefined && valeur !== null && valeur !== '') params.append(cle, valeur);
  });
  const chaine = params.toString();
  return chaine ? `?${chaine}` : '';
}

/** FormData : champs texte + fichiers seulement s'ils sont de vrais `File`. */
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

/* ============================ Fiches ============================ */

/** GET /admin/laboratoires — { pays_id, ville_id, statut_verification, recherche } */
export function listerLaboratoiresAdmin(filtres = {}) {
  return apiFetch(`/admin/laboratoires${construireParametres(filtres)}`).then((d) => d.laboratoires ?? []);
}

/** POST /laboratoires — réponse brute { message, laboratoire, agent } (mot de passe temporaire affiché une fois). */
export function creerLaboratoire(donnees) {
  return apiFetch('/laboratoires', { method: 'POST', body: construireFormData(donnees) });
}

export function modifierLaboratoire(id, donnees) {
  return apiFetch(`/laboratoires/${id}`, { method: 'PUT', body: construireFormData(donnees) }).then((d) => d.laboratoire);
}

export function changerStatutLaboratoire(id, statut_verification) {
  return apiFetch(`/admin/laboratoires/${id}/statut`, { method: 'PATCH', body: { statut_verification } });
}

export function supprimerLaboratoire(id) {
  return apiFetch(`/laboratoires/${id}`, { method: 'DELETE' });
}

/** GET /laboratoires/:id/gestion — fiche complète + examens + centres. */
export function obtenirGestionLaboratoire(id) {
  return apiFetch(`/laboratoires/${id}/gestion`);
}

export function listerMediasLaboratoire(id) {
  return apiFetch(`/laboratoires/${id}/medias/gestion`);
}

export function supprimerMediaLaboratoire(mediaId) {
  return apiFetch(`/medias-laboratoire/${mediaId}`, { method: 'DELETE' });
}

export function supprimerExamenLaboratoire(examenId) {
  return apiFetch(`/examens-laboratoire/${examenId}`, { method: 'DELETE' });
}

export function supprimerCentreLaboratoire(centreId) {
  return apiFetch(`/centres-laboratoire/${centreId}`, { method: 'DELETE' });
}

/* ============================ Avis ============================ */

/** GET /admin/avis-laboratoire — { statut_moderation, laboratoire_id, page, limite } */
export function listerAvisLaboratoire(filtres = {}) {
  return apiFetch(`/admin/avis-laboratoire${construireParametres(filtres)}`);
}

export function modererAvisLaboratoire(avisId, statut_moderation) {
  return apiFetch(`/admin/avis-laboratoire/${avisId}`, { method: 'PATCH', body: { statut_moderation } });
}

export function supprimerAvisLaboratoire(avisId) {
  return apiFetch(`/avis-laboratoire/${avisId}`, { method: 'DELETE' });
}

/* ============================ Référentiels ============================ */

export function listerPays() {
  return listerPaysReferentiel().then((pays) => pays ?? []);
}

export function listerVilles(paysId) {
  return listerVillesReferentiel(paysId).then((villes) => villes ?? []);
}
