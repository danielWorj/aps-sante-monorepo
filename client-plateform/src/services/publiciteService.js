// src/services/publiciteService.js
//
// Publicité (v9) : slider des pages, réservation d'un espace, paiement de la
// publicité acceptée (lien reçu par WhatsApp), portail annonceur.
//
// Règle d'or : le montant n'est JAMAIS envoyé. Le client choisit un forfait
// (page + position + durée) ; le serveur fige le prix à la soumission.

import { apiFetch } from '../lib/apiClient';

// Codes des pages (emplacements) — partagés avec le back-office et le mobile.
export const PAGES_PUBLICITE = {
  accueil: 'PAGE_ACCUEIL',
  medecin: 'PAGE_MEDECIN',
  pharmacie: 'PAGE_PHARMACIE',
  structure: 'PAGE_STRUCTURE_SANTE',
  assurances: 'PAGE_ASSURANCES',
};

export const STATUTS_PUBLICITE = {
  en_moderation: { libelle: "En cours d'examen", variante: 'warning' },
  en_attente_paiement: { libelle: 'Acceptée — à payer', variante: 'info' },
  payee: { libelle: 'Payée', variante: 'success' },
  expiree: { libelle: 'Délai de paiement dépassé', variante: 'neutral' },
  rejetee: { libelle: 'Rejetée', variante: 'danger' },
  annulee: { libelle: 'Annulée', variante: 'neutral' },
};

export const libellePosition = (r) => (Number(r) === 1 ? '1re position' : `${r}e position`);

function qs(params = {}) {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/* ----------------------------- Diffusion ----------------------------- */

/** GET /publicites/par-page/:code -> { emplacement, publicites, reservation_possible } (null si aucun emplacement) */
export async function obtenirSliderPage(code, pays_id) {
  try {
    return await apiFetch(`/publicites/par-page/${encodeURIComponent(code)}${qs({ pays_id })}`);
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

/** POST /publicites/evenements — impressions / clics ; ne lève jamais. */
export function signalerEvenementPublicite(type, publicite_ids) {
  if (!publicite_ids?.length) return;
  apiFetch('/publicites/evenements', { method: 'POST', body: { type, publicite_ids } }).catch(() => {});
}

/* ----------------------------- Réservation ----------------------------- */

/** GET /forfaits-publicitaires?code_page=&pays_id= -> forfaits vendables de la page */
export const listerForfaitsPage = (code_page, pays_id) =>
  apiFetch(`/forfaits-publicitaires${qs({ code_page, pays_id })}`).then((d) => d.forfaits ?? []);

/** GET /publicites/disponibilites?forfait_publicitaire_id= */
export const obtenirDisponibilites = (forfait_publicitaire_id) =>
  apiFetch(`/publicites/disponibilites${qs({ forfait_publicitaire_id })}`);

/** GET /publicites/profil-annonceur -> { annonceur, pays_id } */
export const obtenirProfilAnnonceur = () => apiFetch('/publicites/profil-annonceur');

/** POST /publicites (multipart : champs + fichier « visuel ») */
export function reserverEspace(champs, visuel) {
  const fd = new FormData();
  Object.entries(champs).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') fd.append(k, v);
  });
  fd.append('visuel', visuel);
  return apiFetch('/publicites', { method: 'POST', body: fd });
}

/**
 * POST /publicites/reservation-avec-compte (public, multipart) : crée le compte
 * annonceur et la demande, ouvre la session.
 * -> { publicite, access_token, utilisateur }
 */
export function reserverEspaceAvecCompte(champs, visuel) {
  const fd = new FormData();
  Object.entries(champs).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') fd.append(k, v);
  });
  fd.append('visuel', visuel);
  return apiFetch('/publicites/reservation-avec-compte', { method: 'POST', body: fd });
}

/* ----------------------------- Portail annonceur ----------------------------- */

export const listerMesPublicites = () => apiFetch('/publicites/mes-publicites');
export const obtenirPublicite = (id) => apiFetch(`/publicites/${id}`).then((d) => d.publicite);
export const obtenirStatistiquesPublicite = (id) => apiFetch(`/publicites/${id}/statistiques`);
export const annulerDemandePublicite = (id) => apiFetch(`/publicites/${id}/annuler`, { method: 'POST' });

/* ----------------------------- Paiement ----------------------------- */

/** GET /publicites/:id/devis?agregateur= -> facture récapitulative (devis) + résumé de la publicité */
export const obtenirDevisPublicite = (id, agregateur = 'stripe') =>
  apiFetch(`/publicites/${id}/devis${qs({ agregateur })}`);

export const demanderPaiementPublicite = (id) =>
  apiFetch(`/publicites/${id}/paiement`, { method: 'POST' }).then((d) => d.url);

export const demanderPaiementCampayPublicite = (id, numero) =>
  apiFetch(`/publicites/${id}/paiement-campay`, { method: 'POST', body: { numero } });

export const obtenirStatutPaiementPublicite = (id) => apiFetch(`/publicites/${id}/paiement`);

export const annulerPaiementPublicite = (id) => apiFetch(`/publicites/${id}/paiement/annuler`, { method: 'POST' });

export const obtenirFacturePublicite = (id) => apiFetch(`/publicites/${id}/facture`).then((d) => d.facture);
