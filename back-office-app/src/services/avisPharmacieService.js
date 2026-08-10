// src/services/avisPharmacieService.js
//
// Couche d'accès API pour le sous-module "Pharmacie — Avis" (table
// avis_pharmacie : avis déposés par les clients sur une pharmacie de
// l'annuaire, avec modération et signalement). Miroir front-end d'un
// avis.controller.js / avis.routes.js supposé, aligné sur la maquette
// avis_pharmacie.html (statuts, badges, encart "Signalement").
//
// S'appuie entièrement sur `apiFetch` (src/lib/apiClient.js) : celui-ci
// ajoute déjà l'access token en mémoire (Authorization: Bearer …), gère
// le cookie httpOnly du refresh token et rejoue automatiquement la
// requête en cas de 401 expiré. On ne réimplémente rien de tout ça ici.
//
// Note : `API_BASE_URL` (dans apiClient.js) inclut déjà le préfixe
// "/api" — les chemins ci-dessous commencent donc directement par
// "/avis-pharmacie…", pas par "/api/…".
//
// Pas de fichier envoyé ici (pas de photo, pas de pièce justificative) :
// un avis est un simple objet JSON (note + commentaire) — apiFetch gère
// déjà la sérialisation JSON par défaut, pas de FormData nécessaire.
//
// IMPORTANT — nommage des statuts : contrairement à
// publiciteService.js (en_attente / validee / rejetee), la maquette
// avis_pharmacie.html utilise explicitement en_attente / publie /
// rejete (voir <select id="mStatutSelect"> et les data-statut des
// cartes). On respecte ici ce nommage propre au sous-module Avis,
// même s'il diffère des autres sous-modules Pharmacie — à confirmer
// une fois le contrôleur réel disponible.
//
// Hypothèses de règles d'accès côté serveur (aucun contrôleur dédié
// fourni ici, donc à vérifier/adapter) :
//   - GET (liste, détail) : public, mais filtré selon qui consulte —
//     un visiteur/tiers ne voit que les avis "publie" ; l'agent de la
//     pharmacie concernée et l'admin/superadmin voient tout le cycle
//     de vie (en_attente / publie / rejete).
//   - POST : ouvert à tout le monde, y compris un visiteur non
//     connecté (n'importe quel client doit pouvoir déposer un avis sur
//     la fiche publique d'une pharmacie). Toujours créé "en_attente",
//     sauf pour admin/superadmin qui peut publier directement. Ce
//     sous-module d'administration (voir avisPharmacie.jsx) n'utilise
//     pas cette fonction — la création se fait côté vitrine publique —
//     mais elle est exposée ici pour rester disponible à un futur
//     formulaire public.
//   - PUT (admin/superadmin, depuis le back-office) : modération
//     complète — commentaire, note et statut_moderation. Une pharmacie
//     peut par ailleurs signaler un avis comme abusif via un autre
//     canal (non modélisé ici, faute de route fournie) ; ce signalement
//     est seulement reflété en lecture via les champs `signale` /
//     `motif_signalement`.
//   - DELETE : admin/superadmin uniquement.
//
// apiFetch lève une Error (avec `.status` et `.data`) si le backend
// répond en erreur — chaque fonction ci-dessous se contente de la
// laisser remonter telle quelle à l'appelant.

import { apiFetch } from '../lib/apiClient';
import {
  listerPays as listerPaysReferentiel,
} from './referentielService';

export const STATUTS_MODERATION_AVIS = [
  { valeur: 'en_attente', libelle: 'En attente', badge: 'is-warning' },
  { valeur: 'publie', libelle: 'Publié', badge: 'is-success' },
  { valeur: 'rejete', libelle: 'Rejeté', badge: 'is-danger' },
];

// Échelle de notation attendue par le backend (avis "en étoiles").
export const NOTE_MIN = 1;
export const NOTE_MAX = 5;

function construireParametres(filtres = {}) {
  const params = new URLSearchParams();
  Object.entries(filtres).forEach(([cle, valeur]) => {
    if (valeur !== undefined && valeur !== null && valeur !== '') {
      params.append(cle, valeur);
    }
  });
  const chaine = params.toString();
  return chaine ? `?${chaine}` : '';
}

/* ===================================================================
 * Avis (avis_pharmacie)
 * =================================================================== */

/**
 * GET /api/avis-pharmacie
 * @param {Object} filtres - { pharmacie_id, pays_id, statut_moderation,
 *   note, signale, recherche }
 *   Un visiteur public (ou tout utilisateur qui n'est ni l'agent de la
 *   pharmacie ni admin/superadmin) ne reçoit que les avis "publie" —
 *   c'est le backend qui tranche, pas ce paramètre.
 * @returns {Promise<Array>} liste des avis (avec pharmacie et auteur associés)
 */
export function listerAvisPharmacie(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/avis-pharmacie${suffixe}`).then((d) => d.avis ?? []);
}

/**
 * GET /api/avis-pharmacie/:id
 * @returns {Promise<Object>} l'avis
 */
export function obtenirAvisPharmacie(id) {
  return apiFetch(`/avis-pharmacie/${id}`).then((d) => d.avis);
}

/**
 * POST /api/avis-pharmacie  (ouvert à tout visiteur, connecté ou non —
 * dépôt d'avis côté vitrine publique, non utilisé par le back-office)
 * @param {Object} donnees - { pharmacie_id, note (1 à 5), commentaire,
 *   auteur_nom, statut_moderation? (admin/superadmin uniquement —
 *   sinon toujours forcé "en_attente" côté serveur) }
 * @returns {Promise<Object>} l'avis créé
 */
export function creerAvisPharmacie(donnees) {
  return apiFetch('/avis-pharmacie', { method: 'POST', body: donnees }).then((d) => d.avis);
}

/**
 * PUT /api/avis-pharmacie/:id  (admin/superadmin, modération back-office)
 * @param {Object} donnees - champs partiels parmi { commentaire, note,
 *   statut_moderation }.
 * @returns {Promise<Object>} l'avis mis à jour
 */
export function modifierAvisPharmacie(id, donnees) {
  return apiFetch(`/avis-pharmacie/${id}`, { method: 'PUT', body: donnees }).then((d) => d.avis);
}

/**
 * DELETE /api/avis-pharmacie/:id  (admin/superadmin)
 */
export function supprimerAvisPharmacie(id) {
  return apiFetch(`/avis-pharmacie/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * Référentiel géographique (pour peupler un filtre pays éventuel)
 * Ré-exporté depuis referentielService.js plutôt que dupliqué ici,
 * pour éviter que les deux implémentations divergent avec le temps.
 * =================================================================== */

/**
 * GET /api/referentiels/pays
 */
export function listerPays() {
  return listerPaysReferentiel().then((pays) => pays ?? []);
}

const AvisPharmacieService = {
  STATUTS_MODERATION_AVIS,
  NOTE_MIN,
  NOTE_MAX,
  listerAvisPharmacie,
  obtenirAvisPharmacie,
  creerAvisPharmacie,
  modifierAvisPharmacie,
  supprimerAvisPharmacie,
  listerPays,
};

export default AvisPharmacieService;