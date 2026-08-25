// src/services/patientService.js
// Service de consommation des APIs du module "Gestion des médecins" —
// volet fiche `patient` (voir src/routes/patient.routes.js et
// src/controllers/patient.controller.js côté backend), bâti sur le
// client centralisé src/lib/apiClient.js (apiFetch : Authorization
// automatique depuis l'access token en mémoire, refresh silencieux sur
// 401, erreurs déjà normalisées avec .message/.status — donc pas de
// gestion d'erreur supplémentaire ici).
//
// Contrairement à medecinService.js (fiche Annuaire, en grande partie
// publique), la fiche patient est une donnée PRIVÉE : les 3 routes
// consommées ici exigent toutes un utilisateur authentifié côté
// serveur (voir patient.routes.js).
//
// Rendez-vous : pour la prise de rendez-vous, l'annulation, etc., voir
// les fonctions génériques listerRendezVous / creerRendezVous / ... déjà
// exposées par medecinService.js — ce fichier ne fait qu'ajouter la
// variante "rendez-vous d'un patient donné" (GET /patients/:id/rendez-vous),
// utile côté médecin/admin consultant le dossier d'un patient précis.

import { apiFetch } from '../lib/apiClient';

// Réutilisé tel quel côté patient (même cycle de vie qu'un rendez-vous
// médecin, voir medecinService.js) — importer STATUTS_RENDEZ_VOUS
// depuis medecinService.js plutôt que de le redéfinir ici si besoin
// dans un composant qui affiche déjà les deux.
export { STATUTS_RENDEZ_VOUS } from './medecinService';

// Construit une query string à partir d'un objet, en ignorant les
// valeurs vides/undefined/null (apiFetch ne gère pas les params lui-
// même, contrairement à un client axios). Même utilitaire que
// medecinService.js, dupliqué ici pour garder ce fichier autonome.
function construireQueryString(params = {}) {
  const entrees = Object.entries(params).filter(
    ([, valeur]) => valeur !== undefined && valeur !== null && valeur !== ''
  );
  if (entrees.length === 0) return '';
  const recherche = new URLSearchParams(entrees);
  return `?${recherche.toString()}`;
}

/* ===================================================================
 * Profil patient
 * =================================================================== */

/**
 * GET /patients/mon-profil
 * AUTHENTIFIÉ uniquement. Profil complet du patient connecté (déduit
 * du token) : infos utilisateur (nom, prénom, email, téléphone, ...)
 * et un résumé de son activité (nombre de rendez-vous, prochain
 * rendez-vous à venir, nombre d'ordonnances).
 * @returns {Promise<{patient, statistiques}>}
 *   statistiques = { total_rendez_vous, total_ordonnances, prochain_rendez_vous }
 */
export async function obtenirMonProfil() {
  return apiFetch('/patients/mon-profil');
}

/**
 * GET /patients/:id
 * Ouvert au patient concerné, à admin/superadmin (vue complète,
 * coordonnées incluses), ou à un médecin ayant au moins un rendez-vous
 * avec ce patient (vue restreinte : nom/prénom uniquement — le serveur
 * décide du niveau de détail renvoyé, rien à gérer ici).
 * @param {string} id - patient_id
 * @returns {Promise<Object>} la fiche patient
 */
export async function obtenirPatient(id) {
  const data = await apiFetch(`/patients/${id}`);
  return data.patient;
}

/* ===================================================================
 * Rendez-vous d'un patient
 * =================================================================== */

/**
 * GET /patients/:id/rendez-vous
 * Liste des rendez-vous du patient `id`. Accès : le patient lui-même,
 * admin/superadmin, ou un médecin ayant au moins un rendez-vous avec ce
 * patient — dans ce dernier cas, le serveur ne renvoie que SES PROPRES
 * rendez-vous avec ce patient (pas ceux pris avec d'autres médecins).
 * @param {string} id - patient_id
 * @param {Object} [filtres] - { statut? } — `statut` doit être une
 *   valeur de STATUTS_RENDEZ_VOUS (voir medecinService.js).
 * @returns {Promise<Array>} liste des rendez-vous du patient
 */
export async function listerRendezVousPatient(id, filtres = {}) {
  const data = await apiFetch(`/patients/${id}/rendez-vous${construireQueryString(filtres)}`);
  return data.rendez_vous;
}

/**
 * GET /patients/:id/rendez-vous — variante dédiée à l'espace patient
 * connecté (tableau de bord "Mes rendez-vous").
 *
 * Combine obtenirMonProfil() (pour récupérer patient_id à partir du
 * token) puis listerRendezVousPatient(patient_id, filtres) — plus
 * pratique côté composant que d'enchaîner les deux appels soi-même.
 *
 * ⚠️ Fait donc DEUX appels réseau, et ce n'est PAS optionnel dans l'état
 * actuel du code : `useAuth().user` (AuthContext.jsx) vient de
 * GET /auth/me, qui renvoie l'entité `Utilisateur` telle quelle
 * (serialiserUtilisateur dans authentification.controller.js) — nom,
 * prénom, email, role, ... mais PAS patient_id (ce champ n'existe que
 * sur la table `Patient`, pas sur `Utilisateur`). Le seul moyen de
 * connaître le patient_id du compte connecté est donc bien un appel à
 * GET /patients/mon-profil, que ce soit ici ou fait une fois par le
 * composant appelant.
 *
 * Si un composant a besoin de patient_id à plusieurs endroits, mieux
 * vaut appeler obtenirMonProfil() une seule fois (ex. au montage,
 * mis en cache dans un state local ou un contexte dédié) plutôt que
 * de rappeler listerMesRendezVous() à chaque fois — chaque appel
 * refait le aller-retour /patients/mon-profil.
 *
 * @param {Object} [filtres] - { statut? }
 * @returns {Promise<Array>} liste des rendez-vous du patient connecté
 */
export async function listerMesRendezVous(filtres = {}) {
  const { patient } = await obtenirMonProfil();
  return listerRendezVousPatient(patient.patient_id, filtres);
}

export default {
  obtenirMonProfil,
  obtenirPatient,
  listerRendezVousPatient,
  listerMesRendezVous,
};