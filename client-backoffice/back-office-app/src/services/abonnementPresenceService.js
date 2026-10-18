// src/services/abonnementPresenceService.js
//
// Administration des abonnements de présence des pharmacies, centres de
// santé et médecins. Même contrat que abonnementAssuranceService.js, avec
// le type d'acteur dans l'URL : /admin/abonnements-presence/:type/...
// (type : "pharmacie" | "structure" | "medecin"). Toutes les routes exigent
// un rôle admin ou superadmin côté serveur.

import { apiFetch } from '../lib/apiClient';

export {
  STATUTS_ABONNEMENT,
  ORIGINES_ABONNEMENT,
  dernierJourCouvert,
  dateCourte,
} from './abonnementAssuranceService';

function qs(filtres = {}) {
  const p = new URLSearchParams();
  Object.entries(filtres).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

const base = (type) => `/admin/abonnements-presence/${encodeURIComponent(type)}`;

/* ─── Types d'acteur ──────────────────────────────────────────── */
// drapeaux : avantages APPLIQUÉS par le serveur pour ce type ; les autres
// sont « réservés » (stockés, sans effet pour l'instant).
export const TYPES_PRESENCE = {
  pharmacie: {
    libelle: 'Pharmacies',
    singulier: 'Pharmacie',
    icone: 'fa-mortar-pestle',
    drapeaux: [
      ['contact_direct', 'Téléphone et bouton d’appel'],
      ['photos', 'Photo de la fiche'],
      ['description_enrichie', 'Description enrichie et services particuliers'],
      ['statistiques', 'Statistiques de consultation (vues, visiteurs)'],
      ['statistiques_detaillees', 'Statistiques détaillées (jour par jour)'],
    ],
    note: 'Nom, adresse, ville, géolocalisation, horaires et calendrier de garde restent publics et gratuits en toutes circonstances (EF-PHA-06).',
  },
  structure: {
    libelle: 'Centres de santé',
    singulier: 'Centre de santé',
    icone: 'fa-hospital',
    drapeaux: [
      ['contact_direct', 'Téléphone (contact direct)'],
      ['photos', 'Photo de la fiche'],
      ['description_enrichie', 'Présentation des spécialités (description enrichie)'],
      ['presentation_equipe', 'Présentation de l’équipe'],
      ['statistiques', 'Statistiques de consultation (vues, visiteurs)'],
      ['statistiques_detaillees', 'Statistiques détaillées (jour par jour)'],
    ],
    note: 'Sans abonnement, la fiche reste au palier Basique : identité, type, adresse et localisation.',
  },
  medecin: {
    libelle: 'Médecins',
    singulier: 'Médecin',
    icone: 'fa-user-doctor',
    drapeaux: [
      ['contact_direct', 'Téléphone (contact direct)'],
      ['photos', 'Photo de profil'],
      ['description_enrichie', 'Biographie, CV et LinkedIn'],
      ['prise_rdv_en_ligne', 'Prise de rendez-vous en ligne'],
      ['statistiques', 'Statistiques de consultation (vues, visiteurs)'],
      ['statistiques_detaillees', 'Statistiques détaillées (jour par jour)'],
    ],
    note: 'Information factuelle uniquement, sans message promotionnel. Boost commercial exclu. L’abonnement ne s’applique que dans les pays où il est rendu obligatoire (Tarifs & paramètres).',
  },
};

export const TOUS_DRAPEAUX = [
  ['contact_direct', 'Contact direct'],
  ['photos', 'Photos'],
  ['description_enrichie', 'Description enrichie'],
  ['presentation_equipe', 'Présentation de l’équipe'],
  ['prise_rdv_en_ligne', 'Prise de RDV en ligne'],
  ['multimedia', 'Multimédia'],
  ['statistiques', 'Statistiques de base'],
  ['statistiques_detaillees', 'Statistiques détaillées'],
  ['multi_utilisateurs', 'Comptes multi-utilisateurs'],
  ['support_prioritaire', 'Support prioritaire / dédié'],
];

/** [appliqués, réservés] pour un type. */
export function drapeauxDuType(type) {
  const appliques = TYPES_PRESENCE[type]?.drapeaux ?? [];
  const cles = new Set(appliques.map(([c]) => c));
  return [appliques, TOUS_DRAPEAUX.filter(([c]) => !cles.has(c))];
}

/* ─── Niveaux ─────────────────────────────────────────────────── */
export const listerNiveaux = (type) => apiFetch(`${base(type)}/niveaux`).then((d) => d.niveaux ?? []);
export const creerNiveau = (type, donnees) =>
  apiFetch(`${base(type)}/niveaux`, { method: 'POST', body: donnees }).then((d) => d.niveau);
export const modifierNiveau = (type, id, donnees) =>
  apiFetch(`${base(type)}/niveaux/${id}`, { method: 'PUT', body: donnees }).then((d) => d.niveau);

/* ─── Tarifs et remises de durée ──────────────────────────────── */
export const listerTarifs = (type, paysId) =>
  apiFetch(`${base(type)}/tarifs${qs({ pays_id: paysId })}`).then((d) => d.tarifs ?? []);
/** { niveau_id, pays_id, devise, prix_mensuel, prix_usd_indicatif?, actif } */
export const enregistrerTarif = (type, donnees) =>
  apiFetch(`${base(type)}/tarifs`, { method: 'PUT', body: donnees }).then((d) => d.tarif);

export const listerRemises = (type) => apiFetch(`${base(type)}/remises`).then((d) => d.remises ?? []);
export const enregistrerRemises = (type, remises) =>
  apiFetch(`${base(type)}/remises`, { method: 'PUT', body: { remises } }).then((d) => d.remises);
export const supprimerRemise = (type, duree) => apiFetch(`${base(type)}/remises/${duree}`, { method: 'DELETE' });

/* ─── Paramètres par pays (gratuité, grâce, obligation médecin) ─ */
export const listerConfigs = (type) => apiFetch(`${base(type)}/configs`).then((d) => d.configs ?? []);
/** { gratuite_active, gratuite_niveau_id, gratuite_jusqu_au, grace_jours, abonnement_obligatoire (médecins) } */
export const enregistrerConfig = (type, paysId, donnees) =>
  apiFetch(`${base(type)}/configs/${paysId}`, { method: 'PUT', body: donnees }).then((d) => d.config);

/* ─── Abonnements ─────────────────────────────────────────────── */
/** filtres : { statut, pays_id, echeance_jours, acteur_id } */
export const listerAbonnements = (type, filtres) =>
  apiFetch(`${base(type)}/abonnements${qs(filtres)}`).then((d) => d.abonnements ?? []);
export const obtenirTableauDeBord = (type) => apiFetch(`${base(type)}/tableau-de-bord`);
/** { acteur_id, niveau_id, duree_mois, origine: 'geste'|'virement', motif } */
export const creerAbonnementAdmin = (type, donnees) =>
  apiFetch(`${base(type)}/abonnements`, { method: 'POST', body: donnees }).then((d) => d.abonnement);
export const constaterEncaissement = (type, id, donnees = {}) =>
  apiFetch(`${base(type)}/abonnements/${id}/encaissement-constate`, { method: 'POST', body: donnees }).then((d) => d.abonnement);
export const suspendreAbonnement = (type, id, motif) =>
  apiFetch(`${base(type)}/abonnements/${id}/suspendre`, { method: 'PATCH', body: { motif } }).then((d) => d.abonnement);
export const retablirAbonnement = (type, id, motif) =>
  apiFetch(`${base(type)}/abonnements/${id}/retablir`, { method: 'PATCH', body: { motif } }).then((d) => d.abonnement);
/** { jours?, mois?, motif } */
export const prolongerAbonnement = (type, id, donnees) =>
  apiFetch(`${base(type)}/abonnements/${id}/prolonger`, { method: 'PATCH', body: donnees }).then((d) => d.abonnement);

/* ─── Paiements ───────────────────────────────────────────────── */
export const listerPaiements = (type, filtres) =>
  apiFetch(`${base(type)}/paiements${qs(filtres)}`).then((d) => d.paiements ?? []);
export const listerPaiementsTardifs = (type, statut = 'a_traiter') =>
  apiFetch(`${base(type)}/paiements-tardifs${qs({ statut })}`).then((d) => d.remboursements ?? []);
export const traiterPaiementTardif = (type, id, donnees = {}) =>
  apiFetch(`${base(type)}/paiements-tardifs/${id}/traiter`, { method: 'POST', body: donnees }).then((d) => d.remboursement);

/* ─── Fiches (tous statuts) ───────────────────────────────────── */
export const listerFiches = (type, filtres) =>
  apiFetch(`${base(type)}/fiches${qs(filtres)}`).then((d) => d.fiches ?? []);
