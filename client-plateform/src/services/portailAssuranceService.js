// src/services/portailAssuranceService.js
// Portail assurance (espace de l'agent d'une compagnie / d'un courtier) —
// voir server/src/routes/portailAssurance.routes.js. La fiche, les
// activités, les agences et l'abonnement passent par assuranceService.js
// et abonnementAssuranceService.js ; ce module ajoute le tableau de bord,
// la médiathèque et le suivi des demandes.
// Erreurs : normalisées par apiFetch (.message, .status, .data.code éventuel).

import { apiFetch } from '../lib/apiClient';

export const STATUTS_DEMANDE = {
  nouvelle: { label: 'Nouvelle', chip: 'chip-st-todo', icone: 'fa-envelope' },
  en_cours: { label: 'En cours', chip: 'chip-st-attente', icone: 'fa-spinner' },
  traitee: { label: 'Traitée', chip: 'chip-st-confirme', icone: 'fa-circle-check' },
  archivee: { label: 'Archivée', chip: 'chip-st-termine', icone: 'fa-box-archive' },
};

/** GET /services-assurance/:id/tableau-de-bord?jours= */
export function obtenirTableauDeBord(serviceId, jours = 30) {
  return apiFetch(`/services-assurance/${serviceId}/tableau-de-bord?jours=${jours}`);
}

/* ---------------------------- Médiathèque ---------------------------- */

/** GET /services-assurance/:id/medias/gestion -> { medias, quotas, droits, fiche_publiee } */
export function listerMediasGestion(serviceId) {
  return apiFetch(`/services-assurance/${serviceId}/medias/gestion`);
}

/** GET /services-assurance/:id/medias (public) -> médias visibles */
export async function listerMediasPublics(serviceId) {
  const data = await apiFetch(`/services-assurance/${serviceId}/medias`);
  return data.medias || [];
}

/** POST multipart : champ « fichier » (photo ou vidéo) + « titre » facultatif. */
export function ajouterMedia(serviceId, fichier, titre) {
  const fd = new FormData();
  fd.append('fichier', fichier);
  if (titre?.trim()) fd.append('titre', titre.trim());
  return apiFetch(`/services-assurance/${serviceId}/medias`, { method: 'POST', body: fd });
}

export function modifierMedia(mediaId, titre) {
  return apiFetch(`/medias-assurance/${mediaId}`, { method: 'PUT', body: { titre: titre ?? null } });
}

export function supprimerMedia(mediaId) {
  return apiFetch(`/medias-assurance/${mediaId}`, { method: 'DELETE' });
}

/** PUT ordre : `ids` = TOUS les médias du type, dans le nouvel ordre. */
export function ordonnerMedias(serviceId, type, ids) {
  return apiFetch(`/services-assurance/${serviceId}/medias/ordre`, { method: 'PUT', body: { type, ids } });
}

/* ---------------------------- Demandes ---------------------------- */

/**
 * GET /mises-en-relation-assurance?service_assurance_id=&statut=&recherche=&page=&limite=
 * -> { mises_en_relation, total, page, limite, compteurs }
 */
export function listerDemandes(serviceId, { statut, recherche, page = 1, limite = 20 } = {}) {
  const p = new URLSearchParams({ service_assurance_id: serviceId, page: String(page), limite: String(limite) });
  if (statut) p.set('statut', statut);
  if (recherche?.trim()) p.set('recherche', recherche.trim());
  return apiFetch(`/mises-en-relation-assurance?${p}`);
}

/** PATCH { statut?, note_interne? } -> { mise_en_relation } */
export function suivreDemande(demandeId, modifications) {
  return apiFetch(`/mises-en-relation-assurance/${demandeId}`, { method: 'PATCH', body: modifications });
}

export function supprimerDemande(demandeId) {
  return apiFetch(`/mises-en-relation-assurance/${demandeId}`, { method: 'DELETE' });
}
