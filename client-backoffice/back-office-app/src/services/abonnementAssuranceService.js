// src/services/abonnementAssuranceService.js
//
// Administration des abonnements des assurances (guide abonnements
// assurances v3, §1.4.3 et §3). Toutes les routes /admin/... exigent un
// rôle admin ou superadmin côté serveur ; apiFetch ajoute le jeton.
// apiFetch lève une Error (.status, .data) en cas d'erreur : on la laisse
// remonter telle quelle.

import { apiFetch } from '../lib/apiClient';

function qs(filtres = {}) {
  const p = new URLSearchParams();
  Object.entries(filtres).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

/* ─── Niveaux ─────────────────────────────────────────────────── */
export const listerNiveaux = () => apiFetch('/admin/niveaux-assurance').then((d) => d.niveaux ?? []);
export const creerNiveau = (donnees) =>
  apiFetch('/admin/niveaux-assurance', { method: 'POST', body: donnees }).then((d) => d.niveau);
export const modifierNiveau = (id, donnees) =>
  apiFetch(`/admin/niveaux-assurance/${id}`, { method: 'PUT', body: donnees }).then((d) => d.niveau);

/* ─── Tarifs et remises de durée ──────────────────────────────── */
export const listerTarifs = (paysId) =>
  apiFetch(`/admin/tarifs-abonnement-assurance${qs({ pays_id: paysId })}`).then((d) => d.tarifs ?? []);
/** { niveau_id, pays_id, type_acteur|null, devise, prix_mensuel, prix_usd_indicatif?, actif } */
export const enregistrerTarif = (donnees) =>
  apiFetch('/admin/tarifs-abonnement-assurance', { method: 'PUT', body: donnees }).then((d) => d.tarif);

export const listerRemises = () => apiFetch('/admin/remises-duree-abonnement-assurance').then((d) => d.remises ?? []);
/** remises : [{ duree_mois, remise_pourcent }] */
export const enregistrerRemises = (remises) =>
  apiFetch('/admin/remises-duree-abonnement-assurance', { method: 'PUT', body: { remises } }).then((d) => d.remises);
export const supprimerRemise = (duree) =>
  apiFetch(`/admin/remises-duree-abonnement-assurance/${duree}`, { method: 'DELETE' });

/* ─── Paramètres par pays (gratuité d'amorçage, grâce) ────────── */
export const listerConfigs = () => apiFetch('/admin/config-abonnement-assurance').then((d) => d.configs ?? []);
export const enregistrerConfig = (paysId, donnees) =>
  apiFetch(`/admin/config-abonnement-assurance/${paysId}`, { method: 'PUT', body: donnees }).then((d) => d.config);

/* ─── Abonnements ─────────────────────────────────────────────── */
/** filtres : { statut, pays_id, echeance_jours, service_assurance_id } */
export const listerAbonnements = (filtres) =>
  apiFetch(`/admin/abonnements-assurance${qs(filtres)}`).then((d) => d.abonnements ?? []);
export const obtenirTableauDeBord = () => apiFetch('/admin/abonnements-assurance/tableau-de-bord');
/** { service_assurance_id, niveau_id, duree_mois, origine: 'geste'|'virement', motif } */
export const creerAbonnementAdmin = (donnees) =>
  apiFetch('/admin/abonnements-assurance', { method: 'POST', body: donnees }).then((d) => d.abonnement);
export const constaterEncaissement = (id, donnees = {}) =>
  apiFetch(`/admin/abonnements-assurance/${id}/encaissement-constate`, { method: 'POST', body: donnees }).then((d) => d.abonnement);
export const suspendreAbonnement = (id, motif) =>
  apiFetch(`/admin/abonnements-assurance/${id}/suspendre`, { method: 'PATCH', body: { motif } }).then((d) => d.abonnement);
export const retablirAbonnement = (id, motif) =>
  apiFetch(`/admin/abonnements-assurance/${id}/retablir`, { method: 'PATCH', body: { motif } }).then((d) => d.abonnement);
/** { jours?, mois?, motif } */
export const prolongerAbonnement = (id, donnees) =>
  apiFetch(`/admin/abonnements-assurance/${id}/prolonger`, { method: 'PATCH', body: donnees }).then((d) => d.abonnement);

/* ─── Paiements ───────────────────────────────────────────────── */
export const listerPaiements = (filtres) =>
  apiFetch(`/admin/paiements-abonnement-assurance${qs(filtres)}`).then((d) => d.paiements ?? []);
export const listerPaiementsTardifs = (statut = 'a_traiter') =>
  apiFetch(`/admin/paiements-tardifs-abonnement-assurance${qs({ statut })}`).then((d) => d.remboursements ?? []);
/** CamPay / virement : { frais_reels } ; Stripe : remboursement effectué chez Stripe. */
export const traiterPaiementTardif = (id, donnees = {}) =>
  apiFetch(`/admin/paiements-tardifs-abonnement-assurance/${id}/traiter`, { method: 'POST', body: donnees }).then((d) => d.remboursement);

/* ─── Fiches (tous statuts) ───────────────────────────────────── */
export const listerFichesAssurance = (filtres) =>
  apiFetch(`/admin/services-assurance${qs(filtres)}`).then((d) => d.services_assurance ?? []);

/* ─── Libellés partagés ───────────────────────────────────────── */
export const DRAPEAUX_APPLIQUES = [
  ['siege_complet', 'Siège complet (contacts, agrément, présentation)'],
  ['afficher_activites', 'Activités visibles'],
  ['afficher_agences', 'Agences visibles'],
  ['formulaire_contact', 'Formulaire de mise en relation'],
  ['suivi_demandes', 'Suivi des demandes (statut, notes)'],
  // Appliqués par le portail assurance (médiathèque, tableau de bord).
  ['video_presentation', 'Vidéos de présentation (médiathèque)'],
  ['stats_completes', 'Statistiques complètes (courbes quotidiennes)'],
];
export const DRAPEAUX_RESERVES = [
  ['vitrine_premium', 'Vitrine premium'],
  ['export_stats', 'Export des statistiques'],
];
export const STATUTS_ABONNEMENT = {
  en_attente_paiement: { libelle: 'En attente de paiement', badge: 'is-warning' },
  actif: { libelle: 'Actif', badge: 'is-success' },
  expire: { libelle: 'Expiré', badge: 'is-neutral' },
  annule: { libelle: 'Annulé', badge: 'is-neutral' },
  suspendu: { libelle: 'Suspendu', badge: 'is-danger' },
  remplace: { libelle: 'Remplacé', badge: 'is-info' },
};
export const ORIGINES_ABONNEMENT = {
  self_service: 'En ligne',
  admin: 'Administration',
  virement: 'Virement',
  geste: 'Geste commercial',
  gratuite: 'Gratuité',
};

/** date_fin est EXCLUSIVE (premier jour non couvert) : dernier jour couvert = veille. */
export function dernierJourCouvert(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

export const dateCourte = (d) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
