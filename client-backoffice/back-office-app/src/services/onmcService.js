// src/services/onmcService.js
// Tableau de l'Ordre National des Médecins du Cameroun (ONMC) — voir
// server/src/routes/onmc.routes.js.
import { apiFetch } from '../lib/apiClient';

/** GET /onmc/etat → { synchronisation_en_cours, derniere_synchronisation_reussie, total_registre, medecins, historique } */
export function obtenirEtatOnmc() {
  return apiFetch('/onmc/etat');
}

/** POST /onmc/synchroniser → 202 (tâche de fond), 409 si déjà en cours. */
export function lancerSynchronisationOnmc() {
  return apiFetch('/onmc/synchroniser', { method: 'POST' });
}

/** GET /onmc/registre?recherche=&page= → { total, page, par_page, fiches } */
export function listerRegistreOnmc({ recherche = '', page = 1, parPage = 25 } = {}) {
  const params = new URLSearchParams();
  if (recherche.trim()) params.set('recherche', recherche.trim());
  if (page > 1) params.set('page', String(page));
  params.set('par_page', String(parPage));
  return apiFetch(`/onmc/registre?${params.toString()}`);
}

/**
 * GET /onmc/verifier?numero_ordre=&nom= → { appartient_ordre, nom_complet?,
 * numero_ordre_onmc?, nom_correspond?, correspondances, source, ... }.
 * 502 : site ONMC injoignable (ne signifie PAS « non inscrit »).
 */
export function verifierNumeroOrdre(numeroOrdre, nom = '') {
  const params = new URLSearchParams({ numero_ordre: numeroOrdre });
  if (nom.trim()) params.set('nom', nom.trim());
  return apiFetch(`/onmc/verifier?${params.toString()}`);
}

/**
 * POST /medecins/:id/verifier-ordre → { medecin: { statut_ordre, ordre_nom_onmc, ordre_verifie_le }, verification }
 * Vérifie la fiche en direct et enregistre son statut.
 */
export function verifierOrdreMedecin(medecinId) {
  return apiFetch(`/medecins/${medecinId}/verifier-ordre`, { method: 'POST' });
}
