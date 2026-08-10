// src/services/medecinService.js
//
// Couche d'accès API pour le module transverse "Gestion des médecins"
// (diagramme médecin : fiche annuaire, avis, abonnements + lignes
// d'avantages, rendez-vous, ordonnances). Miroir front-end unique de
// medecin.controller.js / medecin.routes.js — un seul routeur back-end
// monté sous /api, donc un seul service ici aussi, calqué sur
// pharmacieService.js / assuranceService.js pour rester cohérent avec
// le reste du front.
//
// S'appuie entièrement sur `apiFetch` (src/lib/apiClient.js) : celui-ci
// ajoute déjà l'access token en mémoire (Authorization: Bearer …), gère
// le cookie httpOnly du refresh token et rejoue automatiquement la
// requête en cas de 401 expiré. On ne réimplémente rien de tout ça ici.
//
// Note : `API_BASE_URL` (dans apiClient.js) inclut déjà le préfixe
// "/api" — les chemins ci-dessous commencent donc directement par
// "/medecins…", "/avis-medecin…", "/abonnements-medecin…",
// "/lignes-abonnement-medecin…", "/rendez-vous…", "/ordonnances…",
// pas par "/api/…".
//
// IMPORTANT — modifierMedecin envoie un `FormData` (multipart, à cause
// de gererTeleversementMedecin qui traite cni_url / attestation_url,
// voir medecin.routes.js) et non un objet JSON. apiFetch détecte déjà
// les instances de FormData et laisse passer le corps tel quel, sans
// JSON.stringify ni Content-Type manuel — rien à faire ici de ce côté.
// Aucune route de création de fiche médecin n'existe dans
// medecin.routes.js (pas de POST /medecins) : la fiche est
// vraisemblablement créée ailleurs (inscription du compte médecin),
// d'où l'absence d'un `creerMedecin` ci-dessous.
//
// ⚠️ Comme medecin.controller.js n'a pas été fourni, plusieurs éléments
// ci-dessous sont des HYPOTHÈSES déduites par analogie avec les autres
// services du front (Pharmacie / StructureSante / Assurance / Avis
// Pharmacie), à vérifier/ajuster une fois le contrôleur réel
// disponible :
//   - noms exacts des clés de réponse JSON (`d.medecins`, `d.medecin`,
//     etc.) — parfois camelCase (StructureSanteService,
//     pharmacieService), parfois snake_case (assuranceService) selon
//     les fichiers déjà fournis ; camelCase retenu ici par défaut ;
//   - champs acceptés par chaque POST/PUT (listés à titre indicatif) ;
//   - valeurs exactes des enums de statut (statut_moderation des avis,
//     statut d'un rendez-vous, etc.), non documentées dans les
//     commentaires de medecin.routes.js.
//
// Rappel des règles d'accès côté serveur (déduites des commentaires de
// medecin.routes.js — le serveur reste la seule source de vérité) :
//
//   Médecins (fiche Annuaire)
//   - GET (liste, détail)  : public, aucun token requis, aucune vue
//     "admin" élargie sur ces deux routes.
//   - PUT                  : le médecin propriétaire (déduit du token)
//     ou admin/superadmin.
//   - DELETE                : superadmin uniquement.
//
//   Avis médecin
//   - GET (liste, détail)  : public, mais enrichi si connecté — auteur
//     voit son propre avis quel que soit son statut, admin/superadmin
//     voit tout.
//   - POST                 : tout utilisateur authentifié.
//   - PUT                  : auteur (tant que "en_attente") ou
//     admin/superadmin (statut_moderation).
//   - DELETE                : auteur (quel que soit le statut) ou
//     admin/superadmin.
//
//   Abonnements médecin + lignes d'avantages
//   - Donnée commerciale interne : jamais publique, authentifié
//     partout ; autorisation fine (médecin concerné vs
//     admin/superadmin) gérée côté serveur dans chaque handler.
//
//   Rendez-vous
//   - Donnée privée patient/médecin : authentifié partout ;
//     autorisation fine (patient concerné, médecin concerné,
//     admin/superadmin) gérée côté serveur.
//   - DELETE (suppression physique) réservé à admin/superadmin — un
//     rendez-vous s'annule normalement via PUT (statut="annule").
//
//   Ordonnances
//   - GET/POST/PUT : authentifié, autorisation fine côté serveur.
//     Création réservée au médecin du rendez-vous concerné. PUT :
//     médecin auteur ou admin/superadmin.
//   - DELETE                : admin/superadmin uniquement, jamais par
//     le médecin après émission.
//
// apiFetch lève une Error (avec `.status` et `.data`) si le backend
// répond en erreur — chaque fonction ci-dessous se contente de la
// laisser remonter telle quelle à l'appelant.

import { apiFetch } from '../lib/apiClient';
import {
  listerPays as listerPaysReferentiel,
  listerVilles as listerVillesReferentiel,
} from './referentielService';

// Hypothèse, par analogie avec Pharmacie / StructureSante (mêmes
// pièces cni_url / attestation_url à vérifier) — à confirmer.
export const STATUTS_VERIFICATION_MEDECIN = [
  { valeur: 'non_publie', libelle: 'Non publié' },
  { valeur: 'en_cours', libelle: 'En cours de vérification' },
  { valeur: 'publie', libelle: 'Publié' },
];

// Hypothèse, par analogie avec avisPharmacieService.js — nommage exact
// non confirmé (medecin.routes.js ne documente que "statut_moderation"
// sans lister ses valeurs).
export const STATUTS_MODERATION_AVIS_MEDECIN = [
  { valeur: 'en_attente', libelle: 'En attente' },
  { valeur: 'publie', libelle: 'Publié' },
  { valeur: 'rejete', libelle: 'Rejeté' },
];

// Hypothèse : le commentaire de medecin.routes.js mentionne
// explicitement statut="annule" pour l'annulation ; les autres valeurs
// (cycle de vie avant/après le rendez-vous) sont devinées par usage
// courant — à confirmer avec le contrôleur réel.
export const STATUTS_RENDEZ_VOUS = [
  { valeur: 'planifie', libelle: 'Planifié' },
  { valeur: 'confirme', libelle: 'Confirmé' },
  { valeur: 'termine', libelle: 'Terminé' },
  { valeur: 'annule', libelle: 'Annulé' },
];

// Champs fichier attendus par gererTeleversementMedecin (voir
// medecin.routes.js / upload.middleware.js).
const CHAMPS_FICHIERS_MEDECIN = ['cni_url', 'attestation_url'];

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
 * Construit le FormData envoyé à la modification d'une fiche médecin :
 * les champs texte tels quels, et cni_url / attestation_url
 * uniquement s'ils contiennent un vrai `File` (permet un envoi
 * partiel : un fichier non re-sélectionné n'est pas renvoyé, donc pas
 * remplacé côté serveur).
 */
function construireFormDataMedecin(donnees = {}) {
  const formData = new FormData();
  Object.entries(donnees).forEach(([cle, valeur]) => {
    if (valeur === undefined || valeur === null || valeur === '') return;
    if (CHAMPS_FICHIERS_MEDECIN.includes(cle)) {
      if (valeur instanceof File) formData.append(cle, valeur);
      return;
    }
    formData.append(cle, valeur);
  });
  return formData;
}

/* ===================================================================
 * Médecins (fiche Annuaire)
 * =================================================================== */

/**
 * GET /api/medecins
 * PUBLIQUE, aucune vue "admin" élargie côté serveur sur cette route.
 * @param {Object} filtres - { pays_id?, ville_id?, specialite?,
 *   statut_verification?, recherche? } — champs devinés par analogie
 *   avec les autres fiches annuaire (Pharmacie / StructureSante), à
 *   confirmer.
 * @returns {Promise<Array>} liste des médecins
 */
export function listerMedecins(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/medecins${suffixe}`).then((d) => d.medecins ?? []);
}

/**
 * GET /api/medecins/:id
 * PUBLIQUE.
 * @returns {Promise<Object>} le médecin
 */
export function obtenirMedecin(id) {
  return apiFetch(`/medecins/${id}`).then((d) => d.medecin);
}

/**
 * PUT /api/medecins/:id  (médecin propriétaire ou admin/superadmin)
 * @param {Object} donnees - champs partiels à mettre à jour ;
 *   cni_url / attestation_url optionnels (n'envoyer que les fichiers à
 *   remplacer — gérés par gererTeleversementMedecin côté serveur).
 *   statut_verification n'est vraisemblablement honoré tel quel que
 *   pour admin/superadmin (par analogie avec Pharmacie/StructureSante,
 *   à confirmer).
 * @returns {Promise<Object>} le médecin mis à jour
 */
export function modifierMedecin(id, donnees) {
  return apiFetch(`/medecins/${id}`, {
    method: 'PUT',
    body: construireFormDataMedecin(donnees),
  }).then((d) => d.medecin);
}

/**
 * DELETE /api/medecins/:id  (superadmin uniquement)
 */
export function supprimerMedecin(id) {
  return apiFetch(`/medecins/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * Avis médecin
 * =================================================================== */

/**
 * GET /api/avis-medecin
 * Lecture publique, enrichie si connecté (auteur voit son propre avis
 * quel que soit son statut, admin/superadmin voit tout le cycle de
 * vie) — le serveur tranche selon le token, ce service ne fait que
 * relayer un filtre optionnel.
 * @param {Object} filtres - { medecin_id?, statut_moderation?, note? }
 * @returns {Promise<Array>} liste des avis
 */
export function listerAvisMedecin(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/avis-medecin${suffixe}`).then((d) => d.avis ?? []);
}

/**
 * GET /api/avis-medecin/:id
 * Lecture publique, enrichie si connecté (cf. listerAvisMedecin).
 * @returns {Promise<Object>} l'avis
 */
export function obtenirAvisMedecin(id) {
  return apiFetch(`/avis-medecin/${id}`).then((d) => d.avis);
}

/**
 * POST /api/avis-medecin  (tout utilisateur authentifié)
 * @param {Object} donnees - { medecin_id, note, commentaire }
 *   statut_moderation n'est pas envoyé : vraisemblablement toujours
 *   forcé "en_attente" côté serveur, quel que soit le rôle (par
 *   analogie avec publiciteService.js, à confirmer).
 * @returns {Promise<Object>} l'avis créé
 */
export function creerAvisMedecin(donnees) {
  return apiFetch('/avis-medecin', { method: 'POST', body: donnees }).then((d) => d.avis);
}

/**
 * PUT /api/avis-medecin/:id
 * @param {Object} donnees - selon l'appelant (vérifié côté serveur) :
 *   - auteur : { note?, commentaire? } tant que "en_attente" uniquement ;
 *   - admin/superadmin : { statut_moderation }.
 * @returns {Promise<Object>} l'avis mis à jour
 */
export function modifierAvisMedecin(id, donnees) {
  return apiFetch(`/avis-medecin/${id}`, { method: 'PUT', body: donnees }).then((d) => d.avis);
}

/**
 * DELETE /api/avis-medecin/:id  (auteur, quel que soit le statut, ou admin/superadmin)
 */
export function supprimerAvisMedecin(id) {
  return apiFetch(`/avis-medecin/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * Abonnements médecin + lignes d'avantages
 *
 * Donnée commerciale interne : jamais publique, authentifier partout ;
 * autorisation fine (médecin concerné vs admin/superadmin) gérée côté
 * serveur dans chaque handler.
 * =================================================================== */

/**
 * GET /api/abonnements-medecin
 * @param {Object} filtres - { medecin_id?, statut? }
 * @returns {Promise<Array>} liste des abonnements (chacun avec `lignes` inclus)
 */
export function listerAbonnementsMedecin(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/abonnements-medecin${suffixe}`).then((d) => d.abonnements ?? []);
}

/**
 * GET /api/abonnements-medecin/:id
 * @returns {Promise<Object>} l'abonnement (avec `lignes` inclus)
 */
export function obtenirAbonnementMedecin(id) {
  return apiFetch(`/abonnements-medecin/${id}`).then((d) => d.abonnement);
}

/**
 * POST /api/abonnements-medecin
 * @param {Object} donnees - { medecin_id, libelle?, prix?, duree_jours?,
 *   lignes?: Array<{ libelle_avantage, description?, ordre_affichage? }> }
 *   `lignes` optionnel : si fourni, créées dans la même transaction
 *   que l'abonnement (par analogie avec forfait_publicitaire, à
 *   confirmer).
 * @returns {Promise<Object>} l'abonnement créé
 */
export function creerAbonnementMedecin(donnees) {
  return apiFetch('/abonnements-medecin', { method: 'POST', body: donnees }).then(
    (d) => d.abonnement
  );
}

/**
 * PUT /api/abonnements-medecin/:id
 * @param {Object} donnees - champs partiels, hors lignes (voir
 *   ajouterLigneAbonnementMedecin / modifierLigneAbonnementMedecin /
 *   supprimerLigneAbonnementMedecin).
 * @returns {Promise<Object>} l'abonnement mis à jour
 */
export function modifierAbonnementMedecin(id, donnees) {
  return apiFetch(`/abonnements-medecin/${id}`, { method: 'PUT', body: donnees }).then(
    (d) => d.abonnement
  );
}

/**
 * DELETE /api/abonnements-medecin/:id
 */
export function supprimerAbonnementMedecin(id) {
  return apiFetch(`/abonnements-medecin/${id}`, { method: 'DELETE' });
}

/**
 * POST /api/abonnements-medecin/:id/lignes
 * @param {string} abonnementId
 * @param {Object} donnees - { libelle_avantage, description?, ordre_affichage? }
 */
export function ajouterLigneAbonnementMedecin(abonnementId, donnees) {
  return apiFetch(`/abonnements-medecin/${abonnementId}/lignes`, {
    method: 'POST',
    body: donnees,
  }).then((d) => d.ligne);
}

/**
 * PUT /api/lignes-abonnement-medecin/:ligneId
 * Route indépendante (pas nichée sous /abonnements-medecin/:id), telle
 * que documentée dans medecin.routes.js.
 */
export function modifierLigneAbonnementMedecin(ligneId, donnees) {
  return apiFetch(`/lignes-abonnement-medecin/${ligneId}`, { method: 'PUT', body: donnees }).then(
    (d) => d.ligne
  );
}

/**
 * DELETE /api/lignes-abonnement-medecin/:ligneId
 */
export function supprimerLigneAbonnementMedecin(ligneId) {
  return apiFetch(`/lignes-abonnement-medecin/${ligneId}`, { method: 'DELETE' });
}

/* ===================================================================
 * Rendez-vous
 *
 * Donnée privée patient/médecin : authentifier partout. Autorisation
 * fine (patient concerné, médecin concerné, admin/superadmin) gérée
 * côté serveur dans chaque handler.
 * =================================================================== */

/**
 * GET /api/rendez-vous
 * @param {Object} filtres - { medecin_id?, patient_id?, statut?,
 *   date_debut?, date_fin? }
 * @returns {Promise<Array>} liste des rendez-vous
 */
export function listerRendezVous(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/rendez-vous${suffixe}`).then((d) => d.rendezVous ?? []);
}

/**
 * GET /api/rendez-vous/:id
 * @returns {Promise<Object>} le rendez-vous
 */
export function obtenirRendezVous(id) {
  return apiFetch(`/rendez-vous/${id}`).then((d) => d.rendezVous);
}

/**
 * POST /api/rendez-vous  (tout utilisateur authentifié)
 * @param {Object} donnees - { medecin_id, patient_id?, date_heure, motif? }
 *   patient_id vraisemblablement déduit du token pour un patient
 *   (comme utilisateur_id ailleurs dans le front), envoyable
 *   explicitement seulement par un admin/superadmin — à confirmer.
 * @returns {Promise<Object>} le rendez-vous créé
 */
export function creerRendezVous(donnees) {
  return apiFetch('/rendez-vous', { method: 'POST', body: donnees }).then((d) => d.rendezVous);
}

/**
 * PUT /api/rendez-vous/:id
 * @param {Object} donnees - champs partiels, typiquement { statut } pour
 *   confirmer/annuler ("annule" = annulation "douce", cf. commentaire
 *   de medecin.routes.js), ou { date_heure, motif } pour un
 *   déplacement.
 * @returns {Promise<Object>} le rendez-vous mis à jour
 */
export function modifierRendezVous(id, donnees) {
  return apiFetch(`/rendez-vous/${id}`, { method: 'PUT', body: donnees }).then((d) => d.rendezVous);
}

/**
 * DELETE /api/rendez-vous/:id  (admin/superadmin uniquement)
 * Suppression PHYSIQUE — un rendez-vous s'annule normalement via
 * modifierRendezVous(id, { statut: 'annule' }).
 */
export function supprimerRendezVous(id) {
  return apiFetch(`/rendez-vous/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * Ordonnances
 * =================================================================== */

/**
 * GET /api/ordonnances
 * @param {Object} filtres - { rendez_vous_id?, medecin_id?, patient_id? }
 * @returns {Promise<Array>} liste des ordonnances
 */
export function listerOrdonnances(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/ordonnances${suffixe}`).then((d) => d.ordonnances ?? []);
}

/**
 * GET /api/ordonnances/:id
 * @returns {Promise<Object>} l'ordonnance
 */
export function obtenirOrdonnance(id) {
  return apiFetch(`/ordonnances/${id}`).then((d) => d.ordonnance);
}

/**
 * POST /api/ordonnances  (réservé au médecin du rendez-vous concerné —
 * pièce médicale nominative, même un admin ne peut émettre à sa place)
 * @param {Object} donnees - { rendez_vous_id, contenu, ... } — champs
 *   exacts non documentés dans medecin.routes.js, à confirmer avec le
 *   contrôleur réel.
 * @returns {Promise<Object>} l'ordonnance créée
 */
export function creerOrdonnance(donnees) {
  return apiFetch('/ordonnances', { method: 'POST', body: donnees }).then((d) => d.ordonnance);
}

/**
 * PUT /api/ordonnances/:id  (médecin auteur ou admin/superadmin)
 * @param {Object} donnees - champs partiels à mettre à jour.
 * @returns {Promise<Object>} l'ordonnance mise à jour
 */
export function modifierOrdonnance(id, donnees) {
  return apiFetch(`/ordonnances/${id}`, { method: 'PUT', body: donnees }).then((d) => d.ordonnance);
}

/**
 * DELETE /api/ordonnances/:id  (admin/superadmin uniquement — jamais
 * par le médecin après émission)
 */
export function supprimerOrdonnance(id) {
  return apiFetch(`/ordonnances/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * Référentiels géographiques (pour peupler un formulaire pays / ville,
 * ex. filtre de recherche de médecins)
 * Ré-exportés depuis referentielService.js plutôt que dupliqués ici,
 * pour éviter que les deux implémentations divergent avec le temps.
 * =================================================================== */

/**
 * GET /api/referentiels/pays
 */
export function listerPays() {
  return listerPaysReferentiel().then((pays) => pays ?? []);
}

/**
 * GET /api/referentiels/villes?pays_id=...
 * @param {string} [paysId] - filtre optionnel par pays
 */
export function listerVilles(paysId) {
  return listerVillesReferentiel(paysId).then((villes) => villes ?? []);
}

const MedecinService = {
  STATUTS_VERIFICATION_MEDECIN,
  STATUTS_MODERATION_AVIS_MEDECIN,
  STATUTS_RENDEZ_VOUS,
  // Médecins
  listerMedecins,
  obtenirMedecin,
  modifierMedecin,
  supprimerMedecin,
  // Avis médecin
  listerAvisMedecin,
  obtenirAvisMedecin,
  creerAvisMedecin,
  modifierAvisMedecin,
  supprimerAvisMedecin,
  // Abonnements médecin + lignes
  listerAbonnementsMedecin,
  obtenirAbonnementMedecin,
  creerAbonnementMedecin,
  modifierAbonnementMedecin,
  supprimerAbonnementMedecin,
  ajouterLigneAbonnementMedecin,
  modifierLigneAbonnementMedecin,
  supprimerLigneAbonnementMedecin,
  // Rendez-vous
  listerRendezVous,
  obtenirRendezVous,
  creerRendezVous,
  modifierRendezVous,
  supprimerRendezVous,
  // Ordonnances
  listerOrdonnances,
  obtenirOrdonnance,
  creerOrdonnance,
  modifierOrdonnance,
  supprimerOrdonnance,
  // Référentiels
  listerPays,
  listerVilles,
};

export default MedecinService;