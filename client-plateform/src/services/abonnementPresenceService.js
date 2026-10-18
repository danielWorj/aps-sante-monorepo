// src/services/abonnementPresenceService.js
//
// Abonnements de présence des pharmacies, centres de santé et médecins :
// fiche gérée, vue de gestion, offres, brouillon, paiement (Stripe / Mobile
// Money / virement), statut et facture. Même contrat que
// abonnementAssuranceService.js ; `type` vaut "pharmacie", "structure" ou
// "medecin".
//
// Règle d'or : le montant n'est JAMAIS envoyé. Le client transmet
// niveau_id et duree_mois ; le serveur calcule et fige le prix.

import { apiFetch } from '../lib/apiClient';

export const TYPES_PRESENCE = {
  pharmacie: {
    libelle: 'pharmacie',
    espace: '/mon-espace-pharmacie',
    gestion: (id) => `/pharmacie/${id}/gestion`,
    creation: '/pharmacie/creation',
  },
  structure: {
    libelle: 'centre de santé',
    espace: '/mon-espace-structure',
    gestion: (id) => `/structure-sante/${id}/gestion`,
    creation: '/structure-sante/creation',
  },
  medecin: {
    libelle: 'médecin',
    espace: '/portail/medecin-abonnement',
    gestion: () => '/portail/medecin-abonnement',
    creation: '/devenir-medecin',
  },
};

/** Avantages lisibles, par clé de droit (affichage des offres). */
export const LIBELLES_AVANTAGES = {
  contact_direct: 'Téléphone et contact direct visibles',
  photos: 'Photo de la fiche',
  description_enrichie: 'Description enrichie',
  presentation_equipe: "Présentation de l'équipe",
  prise_rdv_en_ligne: 'Prise de rendez-vous en ligne',
  multimedia: 'Multimédia',
  statistiques: 'Statistiques de consultation',
  statistiques_detaillees: 'Statistiques détaillées',
  multi_utilisateurs: 'Comptes multi-utilisateurs',
  support_prioritaire: 'Support prioritaire',
};

const enc = encodeURIComponent;

/**
 * Catalogue PUBLIC (page « Abonnements », sans connexion) : niveaux,
 * avantages et prix indicatifs du pays définis dans la console admin.
 * -> { pays, pays_disponibles, gratuite, abonnement_obligatoire, offres }
 */
export function obtenirCataloguePresence(type, paysId) {
  const qs = paysId ? `?pays_id=${enc(paysId)}` : '';
  return apiFetch(`/abonnements-presence/${enc(type)}/catalogue${qs}`);
}

/** GET -> { type_acteur, fiche, abonnement_requis } (404 si le compte ne gère aucune fiche de ce type). */
export function obtenirMonActeur(type) {
  return apiFetch(`/abonnements-presence/${enc(type)}/mon-acteur`);
}

/** Vue propriétaire : { fiche, contenus, droits, abonnement_requis, abonnement, brouillon, historique } */
export function obtenirGestionPresence(type, acteurId) {
  return apiFetch(`/abonnements-presence/${enc(type)}/gestion?acteur_id=${enc(acteurId)}`);
}

export function obtenirOffresPresence(type, acteurId) {
  return apiFetch(`/abonnements-presence/${enc(type)}/offres?acteur_id=${enc(acteurId)}`);
}

/** -> { abonnement, active } ; `active` : gratuité ou montant nul, déjà actif. */
export function creerBrouillonPresence(type, { acteur_id, niveau_id, duree_mois }) {
  return apiFetch(`/abonnements-presence/${enc(type)}`, {
    method: 'POST',
    body: { acteur_id, niveau_id, duree_mois },
  });
}

export async function demanderPaiementPresence(abonnementId) {
  const data = await apiFetch(`/abonnements-presence/${abonnementId}/paiement`, { method: 'POST' });
  return data.url;
}

export function demanderPaiementCampayPresence(abonnementId, numero) {
  return apiFetch(`/abonnements-presence/${abonnementId}/paiement-campay`, { method: 'POST', body: { numero } });
}

export function obtenirStatutPaiementPresence(abonnementId) {
  return apiFetch(`/abonnements-presence/${abonnementId}/paiement`);
}

export function obtenirDevisPresence(abonnementId, agregateur) {
  return apiFetch(`/abonnements-presence/${abonnementId}/devis?agregateur=${enc(agregateur)}`);
}

export async function obtenirFacturePresence(abonnementId) {
  const data = await apiFetch(`/abonnements-presence/${abonnementId}/facture`);
  return data.facture;
}

export function annulerPaiementPresence(abonnementId) {
  return apiFetch(`/abonnements-presence/${abonnementId}/paiement/annuler`, { method: 'POST' });
}

export function choisirVirementPresence(abonnementId) {
  return apiFetch(`/abonnements-presence/${abonnementId}/virement`, { method: 'POST' });
}

/**
 * Statistiques de consultation de la fiche (gestionnaire) :
 * { disponible, detaillees, totaux: { sept_jours, periode, depuis_le_debut }, serie: [{ jour, vues, visiteurs }] | null }
 * `disponible: false` : non incluses dans l'abonnement (les vues sont tout de même comptées).
 */
export function obtenirStatistiquesPresence(type, acteurId, jours = 30) {
  return apiFetch(`/abonnements-presence/${enc(type)}/statistiques?acteur_id=${enc(acteurId)}&jours=${jours}`);
}
