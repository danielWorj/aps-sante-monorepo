// src/services/abonnementAssuranceService.js
//
// Abonnements des assurances (guide abonnements assurances v3, §2.2.5) :
// offres, brouillon, paiement (Stripe / Mobile Money / virement), statut,
// facture, et vue propriétaire de la fiche.
//
// Règle d'or : le montant n'est JAMAIS envoyé. Le client transmet
// niveau_id et duree_mois ; le serveur calcule et fige le prix.

import { apiFetch } from '../lib/apiClient';

/** GET /services-assurance/mon-service -> { service_assurance } (404 si le compte n'est agent d'aucune fiche). */
export function obtenirMonServiceAssurance() {
  return apiFetch('/services-assurance/mon-service');
}

/**
 * GET /services-assurance/:id/gestion — vue propriétaire (agent ou admin) :
 * { service_assurance, activites, agences, droits, abonnement, brouillon, historique, quotas }
 */
export function obtenirGestionServiceAssurance(id) {
  return apiFetch(`/services-assurance/${id}/gestion`);
}

/** GET /abonnements-assurance/offres?service_assurance_id= */
export function obtenirOffresAbonnement(serviceAssuranceId) {
  return apiFetch(`/abonnements-assurance/offres?service_assurance_id=${encodeURIComponent(serviceAssuranceId)}`);
}

/**
 * POST /abonnements-assurance -> { abonnement, active }
 * `active` : gratuité ou montant nul, l'abonnement est déjà actif (aucun paiement).
 */
export function creerBrouillonAbonnement({ service_assurance_id, niveau_id, duree_mois }) {
  return apiFetch('/abonnements-assurance', {
    method: 'POST',
    body: { service_assurance_id, niveau_id, duree_mois },
  });
}

/** Stripe Checkout -> url de redirection. */
export async function demanderPaiementAbonnement(abonnementId) {
  const data = await apiFetch(`/abonnements-assurance/${abonnementId}/paiement`, { method: 'POST' });
  return data.url;
}

/** Mobile Money -> { reference, ussd_code, operateur, incertain? } */
export function demanderPaiementCampayAbonnement(abonnementId, numero) {
  return apiFetch(`/abonnements-assurance/${abonnementId}/paiement-campay`, {
    method: 'POST',
    body: { numero },
  });
}

/** Statut (polling) -> { statut_abonnement, abonnement, paiement, tentative_campay } */
export function obtenirStatutPaiementAbonnement(abonnementId) {
  return apiFetch(`/abonnements-assurance/${abonnementId}/paiement`);
}

/** Devis (aucune écriture) -> { type: 'devis', lignes, total, devise, frais_operateur? } */
export function obtenirDevisAbonnement(abonnementId, agregateur) {
  return apiFetch(`/abonnements-assurance/${abonnementId}/devis?agregateur=${encodeURIComponent(agregateur)}`);
}

/** Facture archivée du paiement abouti -> { facture } */
export async function obtenirFactureAbonnement(abonnementId) {
  const data = await apiFetch(`/abonnements-assurance/${abonnementId}/facture`);
  return data.facture;
}

/** Annule le(s) paiement(s) en cours -> { annulees } */
export function annulerPaiementAbonnement(abonnementId) {
  return apiFetch(`/abonnements-assurance/${abonnementId}/paiement/annuler`, { method: 'POST' });
}

/** Choix du virement -> { reference, montant, devise, instructions } */
export function choisirVirementAbonnement(abonnementId) {
  return apiFetch(`/abonnements-assurance/${abonnementId}/virement`, { method: 'POST' });
}
