// src/services/publiciteService.js
//
// Couche d'accès API pour le module autonome "Présence, publicité &
// boost commercial" (diagramme 09_presence_publicite_boost) :
// emplacement_publicitaire, forfait_publicitaire,
// ligne_forfait_publicitaire, publicite. Miroir front-end de
// publicite.controller.js / publicite.routes.js.
//
// v8 — RÉÉCRITURE COMPLÈTE : ce service ciblait auparavant
// publicite_pharmacie / page_website (sous-module Pharmacie), qui
// n'existent plus côté backend (voir schema.prisma). Le module est
// désormais totalement isolé de Pharmacie et de toute autre fiche
// annuaire : une publicité est portée directement par l'utilisateur
// qui la dépose (utilisateur_id, déduit du token côté serveur) et le
// pays où elle est diffusée (pays_id).
//
// S'appuie entièrement sur `apiFetch` (src/lib/apiClient.js) : celui-ci
// ajoute déjà l'access token en mémoire (Authorization: Bearer …), gère
// le cookie httpOnly du refresh token et rejoue automatiquement la
// requête en cas de 401 expiré. On ne réimplémente rien de tout ça ici.
//
// Note : `API_BASE_URL` (dans apiClient.js) inclut déjà le préfixe
// "/api" — les chemins ci-dessous commencent donc directement par
// "/emplacements-publicitaires…", "/forfaits-publicitaires…",
// "/lignes-forfait-publicitaire…", "/publicites…", pas par "/api/…".
//
// IMPORTANT — creerPublicite / modifierPublicite envoient un
// `FormData` (multipart, à cause du fichier "visuel") et non un objet
// JSON. apiFetch détecte déjà les instances de FormData et laisse
// passer le corps tel quel, sans JSON.stringify ni Content-Type
// manuel — rien à faire ici de ce côté.
//
// Rappel des règles d'accès côté serveur (appliquées ici uniquement
// pour l'UX — le serveur reste la seule source de vérité, voir
// publicite.controller.js) :
//
//   Emplacements publicitaires (référentiel transverse)
//   - GET (liste, détail)  : public.
//   - POST / PUT           : admin ou superadmin.
//   - DELETE                : superadmin uniquement (409 si des
//     forfaits référencent encore l'emplacement).
//
//   Forfaits publicitaires (catalogue commercial)
//   - GET (liste, détail)  : public. La liste accepte un filtre
//     ?emplacement_publicitaire_id=... .
//   - POST / PUT           : admin ou superadmin.
//   - DELETE                : superadmin uniquement (409 si des
//     publicités référencent encore le forfait).
//
//   Lignes d'avantages (ligne_forfait_publicitaire)
//   - Ajout (sur le forfait) / modification / suppression : admin ou
//     superadmin, même autorisation que le forfait parent.
//
//   Publicités
//   - GET (liste, détail)  : public, mais filtré selon qui consulte —
//     un visiteur (ou un utilisateur qui n'est ni l'auteur ni
//     admin/superadmin) ne voit que les publicités "validee".
//     L'auteur et l'admin/superadmin voient tout le cycle de vie
//     (en_attente / validee / rejetee).
//   - POST                 : tout utilisateur authentifié, quel que
//     soit son rôle. Toujours créée "en_attente" côté serveur, quelle
//     que soit la valeur envoyée — personne ne peut publier
//     directement sa propre publicité.
//   - PUT                  : l'auteur (titre / visuel / dates, tant
//     que "en_attente" uniquement — 409 sinon) OU
//     admin/superadmin (statut_moderation à tout moment, jamais les
//     autres champs).
//   - DELETE                : l'auteur (quel que soit le statut) ou
//     admin/superadmin.
//
// apiFetch lève une Error (avec `.status` et `.data`) si le backend
// répond en erreur — chaque fonction ci-dessous se contente de la
// laisser remonter telle quelle à l'appelant.

import { apiFetch } from '../lib/apiClient';
import { listerPays as listerPaysReferentiel } from './referentielService';

export const STATUTS_MODERATION_PUBLICITE = [
  { valeur: 'en_attente', libelle: 'En attente' },
  { valeur: 'validee', libelle: 'Validée' },
  { valeur: 'rejetee', libelle: 'Rejetée' },
];

// Seul champ fichier attendu par le backend pour une publicité (voir
// upload.middleware.js / publicite.controller.js : req.files.visuel).
const CHAMP_FICHIER_VISUEL = 'visuel';

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

/**
 * Construit le FormData envoyé à la création/modification d'une
 * publicité : les champs texte tels quels, et le champ fichier
 * "visuel" uniquement s'il contient un vrai `File` (permet un envoi
 * partiel en modification : pas de nouveau fichier => le visuel actuel
 * n'est pas remplacé côté serveur).
 */
function construireFormDataPublicite(donnees = {}) {
  const formData = new FormData();
  Object.entries(donnees).forEach(([cle, valeur]) => {
    if (valeur === undefined || valeur === null || valeur === '') return;
    if (cle === CHAMP_FICHIER_VISUEL) {
      if (valeur instanceof File) formData.append(cle, valeur);
      return;
    }
    formData.append(cle, valeur);
  });
  return formData;
}

/* ===================================================================
 * Emplacements publicitaires (emplacement_publicitaire)
 * =================================================================== */

/**
 * GET /api/emplacements-publicitaires
 * @returns {Promise<Array>} liste des emplacements ({ emplacement_publicitaire_id, code, libelle, description })
 */
export function listerEmplacementsPublicitaires() {
  return apiFetch('/emplacements-publicitaires').then((d) => d.emplacements ?? []);
}

/**
 * GET /api/emplacements-publicitaires/:id
 */
export function obtenirEmplacementPublicitaire(id) {
  return apiFetch(`/emplacements-publicitaires/${id}`).then((d) => d.emplacement);
}

/**
 * POST /api/emplacements-publicitaires  (admin/superadmin)
 * @param {Object} donnees - { code, libelle, description? }
 */
export function creerEmplacementPublicitaire(donnees) {
  return apiFetch('/emplacements-publicitaires', { method: 'POST', body: donnees }).then(
    (d) => d.emplacement
  );
}

/**
 * PUT /api/emplacements-publicitaires/:id  (admin/superadmin)
 */
export function modifierEmplacementPublicitaire(id, donnees) {
  return apiFetch(`/emplacements-publicitaires/${id}`, { method: 'PUT', body: donnees }).then(
    (d) => d.emplacement
  );
}

/**
 * DELETE /api/emplacements-publicitaires/:id  (superadmin)
 * 409 si des forfaits référencent encore cet emplacement.
 */
export function supprimerEmplacementPublicitaire(id) {
  return apiFetch(`/emplacements-publicitaires/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * Forfaits publicitaires (forfait_publicitaire)
 * =================================================================== */

/**
 * GET /api/forfaits-publicitaires
 * @param {Object} filtres - { emplacement_publicitaire_id? }
 * @returns {Promise<Array>} liste des forfaits, chacun avec `lignes` inclus
 */
export function listerForfaitsPublicitaires(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/forfaits-publicitaires${suffixe}`).then((d) => d.forfaits ?? []);
}

/**
 * GET /api/forfaits-publicitaires/:id
 */
export function obtenirForfaitPublicitaire(id) {
  return apiFetch(`/forfaits-publicitaires/${id}`).then((d) => d.forfait);
}

/**
 * POST /api/forfaits-publicitaires  (admin/superadmin)
 * @param {Object} donnees - { emplacement_publicitaire_id, libelle, prix, duree_jours,
 *   lignes?: Array<{ libelle_avantage, description?, ordre_affichage? }> }
 *   `lignes` est optionnel : si fourni, les lignes sont créées dans la
 *   même transaction que le forfait.
 */
export function creerForfaitPublicitaire(donnees) {
  return apiFetch('/forfaits-publicitaires', { method: 'POST', body: donnees }).then(
    (d) => d.forfait
  );
}

/**
 * PUT /api/forfaits-publicitaires/:id  (admin/superadmin)
 * @param {Object} donnees - { emplacement_publicitaire_id?, libelle?, prix?, duree_jours? }
 *   Ne permet pas de modifier les lignes ici : voir
 *   ajouterLigneForfait / modifierLigneForfait / supprimerLigneForfait.
 */
export function modifierForfaitPublicitaire(id, donnees) {
  return apiFetch(`/forfaits-publicitaires/${id}`, { method: 'PUT', body: donnees }).then(
    (d) => d.forfait
  );
}

/**
 * DELETE /api/forfaits-publicitaires/:id  (superadmin)
 * 409 si des publicités référencent encore ce forfait. Les lignes
 * rattachées sont supprimées côté serveur dans la même transaction.
 */
export function supprimerForfaitPublicitaire(id) {
  return apiFetch(`/forfaits-publicitaires/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * Lignes d'avantages (ligne_forfait_publicitaire)
 * =================================================================== */

/**
 * POST /api/forfaits-publicitaires/:id/lignes  (admin/superadmin)
 * @param {string} forfaitId
 * @param {Object} donnees - { libelle_avantage, description?, ordre_affichage? }
 */
export function ajouterLigneForfait(forfaitId, donnees) {
  return apiFetch(`/forfaits-publicitaires/${forfaitId}/lignes`, {
    method: 'POST',
    body: donnees,
  }).then((d) => d.ligne);
}

/**
 * PUT /api/lignes-forfait-publicitaire/:ligneId  (admin/superadmin)
 */
export function modifierLigneForfait(ligneId, donnees) {
  return apiFetch(`/lignes-forfait-publicitaire/${ligneId}`, { method: 'PUT', body: donnees }).then(
    (d) => d.ligne
  );
}

/**
 * DELETE /api/lignes-forfait-publicitaire/:ligneId  (admin/superadmin)
 */
export function supprimerLigneForfait(ligneId) {
  return apiFetch(`/lignes-forfait-publicitaire/${ligneId}`, { method: 'DELETE' });
}

/* ===================================================================
 * Publicités (publicite)
 * =================================================================== */

/**
 * GET /api/publicites
 * @param {Object} filtres - { forfait_publicitaire_id?, emplacement_publicitaire_id?, pays_id?, statut_moderation? }
 *   `statut_moderation` n'est honoré par le serveur que pour un
 *   admin/superadmin authentifié — un visiteur (ou l'auteur consultant
 *   sans filtre dédié) reçoit toujours uniquement les publicités
 *   "validee" côté grand public ; l'auteur voit ses propres publicités
 *   à tous les statuts grâce à `filtrerSelonVisibilite` côté serveur.
 * @returns {Promise<Array>} liste des publicités
 */
export function listerPublicites(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/publicites${suffixe}`).then((d) => d.publicites ?? []);
}

/**
 * GET /api/publicites/:id
 * @returns {Promise<Object>} la publicité
 */
export function obtenirPublicite(id) {
  return apiFetch(`/publicites/${id}`).then((d) => d.publicite);
}

/**
 * POST /api/publicites  (tout utilisateur authentifié)
 * @param {Object} donnees - { forfait_publicitaire_id, emplacement_publicitaire_id,
 *   pays_id, titre, date_debut, date_fin, visuel (File, obligatoire) }
 *   emplacement_publicitaire_id DOIT correspondre à l'emplacement du
 *   forfait choisi (vérifié côté serveur, 400 sinon).
 *   statut_moderation n'est pas envoyé : toujours forcé "en_attente"
 *   par le serveur, quel que soit le rôle de l'appelant.
 * @returns {Promise<Object>} la publicité créée
 */
export function creerPublicite(donnees) {
  return apiFetch('/publicites', {
    method: 'POST',
    body: construireFormDataPublicite(donnees),
  }).then((d) => d.publicite);
}

/**
 * PUT /api/publicites/:id
 * @param {Object} donnees - selon le rôle de l'appelant (vérifié côté
 *   serveur, ce service n'est qu'un relais) :
 *   - auteur : { titre?, date_debut?, date_fin?, visuel? (File) } —
 *     uniquement tant que statut_moderation === "en_attente" (409 sinon).
 *     forfait_publicitaire_id / emplacement_publicitaire_id ne sont
 *     jamais modifiables après création.
 *   - admin/superadmin : { statut_moderation } — ne touche jamais au
 *     reste du contenu de la publicité.
 * @returns {Promise<Object>} la publicité mise à jour
 */
export function modifierPublicite(id, donnees) {
  return apiFetch(`/publicites/${id}`, {
    method: 'PUT',
    body: construireFormDataPublicite(donnees),
  }).then((d) => d.publicite);
}

/**
 * DELETE /api/publicites/:id  (auteur ou admin/superadmin)
 */
export function supprimerPublicite(id) {
  return apiFetch(`/publicites/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * Référentiel géographique (pour peupler un select pays)
 * Ré-exporté depuis referentielService.js plutôt que dupliqué ici,
 * pour éviter que les deux implémentations divergent avec le temps.
 * =================================================================== */

/**
 * GET /api/referentiels/pays
 */
export function listerPays() {
  return listerPaysReferentiel().then((pays) => pays ?? []);
}

const PubliciteService = {
  STATUTS_MODERATION_PUBLICITE,
  listerEmplacementsPublicitaires,
  obtenirEmplacementPublicitaire,
  creerEmplacementPublicitaire,
  modifierEmplacementPublicitaire,
  supprimerEmplacementPublicitaire,
  listerForfaitsPublicitaires,
  obtenirForfaitPublicitaire,
  creerForfaitPublicitaire,
  modifierForfaitPublicitaire,
  supprimerForfaitPublicitaire,
  ajouterLigneForfait,
  modifierLigneForfait,
  supprimerLigneForfait,
  listerPublicites,
  obtenirPublicite,
  creerPublicite,
  modifierPublicite,
  supprimerPublicite,
  listerPays,
};

export default PubliciteService;