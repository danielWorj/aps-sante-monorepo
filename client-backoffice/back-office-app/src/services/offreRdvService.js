// src/services/offreRdvService.js
//
// Miroir front-end des routes admin de server/src/routes/offreRdv.routes.js
// (RDV aléatoire / RDV sur offre : le patient publie une demande, les
// médecins de la spécialité et de la ville répondent, le patient valide l'un
// d'eux). Back-office : suivi et modération uniquement.

import { apiFetch } from '../lib/apiClient';

/**
 * GET /offres-rdv/admin -> { offres, total, page, limite, statistiques: { ouverte, attribuee, expiree, annulee } }
 * @param {{ statut?: string, pays_id?: string, page?: number, limite?: number }} filtres
 */
export function listerOffres(filtres = {}) {
  const params = new URLSearchParams(
    Object.entries(filtres).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  const q = params.toString();
  return apiFetch(`/offres-rdv/admin${q ? `?${q}` : ''}`);
}

/** POST /offres-rdv/:id/retirer — retire une demande encore ouverte (modération). */
export function retirerOffre(offreId) {
  return apiFetch(`/offres-rdv/${offreId}/retirer`, { method: 'POST' });
}
