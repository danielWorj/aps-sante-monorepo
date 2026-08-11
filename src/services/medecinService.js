// src/services/medecinService.js
// Service de consommation des APIs du module "Gestion des médecins"
// (voir src/routes/medecin.routes.js et src/controllers/medecin.controller.js
// côté backend), bâti sur le client centralisé src/lib/apiClient.js
// (apiFetch : Authorization automatique depuis l'access token en
// mémoire, refresh silencieux sur 401, erreurs déjà normalisées avec
// .message/.status — donc pas de gestion d'erreur supplémentaire ici).
//
// Rendez-vous : section ajoutée pour couvrir la prise de rendez-vous
// patient/médecin, avec le champ `motif` (précision libre du motif de
// consultation, optionnel, 1000 caractères max — voir
// MOTIF_RENDEZ_VOUS_LONGUEUR_MAX et la section "Rendez-vous" plus bas).
//
// Référentiels Pays / Ville : NE sont PAS redéfinis ici. Ils sont déjà
// exposés par src/services/geoService.js (routes génériques
// src/routes/referentiels.routes.js, GET /pays et GET /villes,
// publiques, partagées par tous les modules annuaire). Importer
// listerPays/listerVilles depuis geoService.js plutôt que d'ici.

import { apiFetch } from '../lib/apiClient';

// Cycle de vie d'un rendez-vous (statut), y compris le contrôle de
// présence à l'accueil (code_unique / QR) et la contestation a
// posteriori — voir la section "Rendez-vous" plus bas.
export const STATUTS_RENDEZ_VOUS = [
  { valeur: 'cree', libelle: 'Créé' },
  { valeur: 'confirme', libelle: 'Confirmé' },
  { valeur: 'en_attente_presence', libelle: 'En attente de présence' },
  { valeur: 'honore', libelle: 'Honoré' },
  { valeur: 'non_honore', libelle: 'Non honoré' },
  { valeur: 'annule', libelle: 'Annulé' },
  { valeur: 'conteste', libelle: 'Contesté' },
];

// structure_id n'a de sens que pour "physique" (sinon cabinet libéral,
// structure_id reste null) ; "teleconsultation" exige que le médecin
// visé ait teleconsultation_activee = true, sans quoi le serveur
// renvoie 400.
export const TYPES_RENDEZ_VOUS = [
  { valeur: 'physique', libelle: 'Consultation physique' },
  { valeur: 'teleconsultation', libelle: 'Téléconsultation' },
];

// motif : champ texte libre optionnel (précision du motif de
// consultation), trim() côté serveur, 1000 caractères maximum — au
// delà le serveur renvoie 400. Envoyer une chaîne vide ou null en
// modification efface le motif existant.
export const MOTIF_RENDEZ_VOUS_LONGUEUR_MAX = 1000;

// Construit une query string à partir d'un objet, en ignorant les
// valeurs vides/undefined/null (apiFetch ne gère pas les params lui-
// même, contrairement à un client axios).
function construireQueryString(params = {}) {
  const entrees = Object.entries(params).filter(
    ([, valeur]) => valeur !== undefined && valeur !== null && valeur !== ''
  );
  if (entrees.length === 0) return '';
  const recherche = new URLSearchParams(entrees);
  return `?${recherche.toString()}`;
}

// Construit un FormData à partir des champs texte/nombre/booléen et
// des fichiers. Les booléens sont convertis en chaîne ("true"/"false")
// car FormData ne transporte que des chaînes ou des Blob — le backend
// les reconvertit via Boolean(...) (voir creerMedecin côté contrôleur).
function construireFormData(donnees, fichiers) {
  const formData = new FormData();

  Object.entries(donnees).forEach(([cle, valeur]) => {
    if (valeur === undefined || valeur === null) return;
    formData.append(cle, typeof valeur === 'boolean' ? String(valeur) : valeur);
  });

  Object.entries(fichiers).forEach(([champ, fichier]) => {
    if (fichier) formData.append(champ, fichier);
  });

  return formData;
}

/* ===================================================================
 * Médecins (fiche Annuaire)
 * =================================================================== */

/**
 * GET /medecins
 * Route publique (authentification optionnelle) — l'access token, s'il
 * existe, est ajouté automatiquement par apiFetch et permet au backend
 * d'enrichir la réponse (email/téléphone) si l'appelant est admin/superadmin.
 * @param {Object} filtres - { specialite_id, specialite, ville_exercice_id, pays_exercice_id, recherche }
 * @returns {Promise<Array>} liste des médecins
 */
export async function listerMedecins(filtres = {}) {
  const data = await apiFetch(`/medecins${construireQueryString(filtres)}`);
  return data.medecins;
}

/**
 * GET /medecins/:id
 * Route publique (authentification optionnelle).
 */
export async function obtenirMedecin(id) {
  const data = await apiFetch(`/medecins/${id}`);
  return data.medecin;
}

/**
 * POST /medecins
 * Réservé à admin/superadmin côté backend (voir medecin.routes.js).
 * Envoie un multipart/form-data car cni et attestation sont obligatoires
 * (photo optionnelle). `donnees` regroupe tous les champs texte/nombre,
 * `fichiers` regroupe { cni, attestation, photo? } (objets File du navigateur).
 *
 * @param {Object} donnees - { nom, prenom, email, telephone?, pays_id,
 *   specialite_id, numero_ordre, pays_exercice_id, ville_exercice_id,
 *   teleconsultation_activee, tarif_indicatif, statut_verification? }
 * @param {Object} fichiers - { cni: File, attestation: File, photo?: File }
 * @returns {Promise<{medecin, utilisateur}>} utilisateur.mot_de_passe_temporaire
 *   n'est renvoyé qu'une seule fois par le backend — à afficher immédiatement
 *   à l'appelant, jamais restocké.
 */
export async function creerMedecin(donnees, fichiers = {}) {
  return apiFetch('/medecins', {
    method: 'POST',
    body: construireFormData(donnees, fichiers),
  });
}

/**
 * PUT /medecins/:id
 * Ouvert au médecin propriétaire ou à admin/superadmin. cni/attestation/
 * photo sont optionnels ici (remplacement d'un fichier existant
 * uniquement).
 */
export async function modifierMedecin(id, donnees = {}, fichiers = {}) {
  return apiFetch(`/medecins/${id}`, {
    method: 'PUT',
    body: construireFormData(donnees, fichiers),
  });
}

/**
 * DELETE /medecins/:id
 * Réservé à superadmin côté backend.
 */
export async function supprimerMedecin(id) {
  return apiFetch(`/medecins/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * Spécialités médicales (référentiel — /specialites, confirmé dans
 * medecin.routes.js)
 * =================================================================== */

/**
 * GET /specialites
 * Publique. @param {string} recherche - filtre optionnel sur le nom.
 */
export async function listerSpecialites(recherche) {
  const data = await apiFetch(`/specialites${construireQueryString({ recherche })}`);
  return data.specialites;
}

/**
 * GET /specialites/:id
 * Publique.
 */
export async function obtenirSpecialite(id) {
  const data = await apiFetch(`/specialites/${id}`);
  return data.specialite;
}

/* ===================================================================
 * Rendez-vous
 *
 * Donnée privée patient/médecin : authentification requise partout.
 * Autorisation fine (patient concerné, médecin concerné, admin/
 * superadmin) gérée côté serveur dans chaque handler.
 *
 * `patient_id` est TOUJOURS déduit du token côté serveur à la création
 * (jamais lu dans le corps de la requête) — inutile de l'envoyer
 * depuis le front. `code_unique` / `qr_token_secret` (contrôle de
 * présence à l'accueil) sont eux aussi générés côté serveur.
 *
 * `motif` (string, optionnelle, 1000 caractères max, trim() côté
 * serveur) : précision libre du motif de
 * consultation saisie par le patient. Envoyer '' ou null en
 * modification efface le motif existant — voir
 * MOTIF_RENDEZ_VOUS_LONGUEUR_MAX ci-dessus pour valider la longueur
 * côté front avant l'appel réseau.
 * =================================================================== */

/**
 * GET /rendez-vous
 * Toujours scopé à l'utilisateur courant (son propre profil patient
 * ou médecin) côté serveur, sauf admin/superadmin qui peut filtrer
 * librement.
 * @param {Object} filtres - { statut?, medecin_id?, patient_id? } —
 *   `statut` doit être une valeur de STATUTS_RENDEZ_VOUS.
 * @returns {Promise<Array>} liste des rendez-vous
 */
export async function listerRendezVous(filtres = {}) {
  const data = await apiFetch(`/rendez-vous${construireQueryString(filtres)}`);
  return data.rendez_vous;
}

/**
 * GET /rendez-vous/:id
 */
export async function obtenirRendezVous(id) {
  const data = await apiFetch(`/rendez-vous/${id}`);
  return data.rendez_vous;
}

/**
 * POST /rendez-vous
 * Réservé à un compte PATIENT (403 sinon).
 * @param {Object} donnees - {
 *   medecin_id,       // requis
 *   type_rdv,         // requis — 'physique' | 'teleconsultation'
 *   date_creneau,     // requis — date/heure ISO
 *   structure_id?,    // optionnel, pertinent seulement si type_rdv === 'physique'
 *   motif?,           // optionnel, texte libre, 1000 caractères max — motif de la consultation
 * }
 * @returns {Promise<Object>} le rendez-vous créé
 */
export async function creerRendezVous(donnees) {
  const data = await apiFetch('/rendez-vous', {
    method: 'POST',
    body: donnees,
  });
  return data.rendez_vous;
}

/**
 * PUT /rendez-vous/:id
 * Ouvert au patient concerné, au médecin concerné, ou à
 * admin/superadmin (ex. confirmation, reprogrammation, annulation
 * douce via statut, contestation, correction du motif).
 * @param {Object} donnees - champs partiels parmi { statut, date_creneau,
 *   structure_id, motif } — envoyer motif: '' ou motif: null efface le
 *   motif existant. `statut` doit être une valeur de STATUTS_RENDEZ_VOUS.
 * @returns {Promise<Object>} le rendez-vous mis à jour
 */
export async function modifierRendezVous(id, donnees = {}) {
  const data = await apiFetch(`/rendez-vous/${id}`, {
    method: 'PUT',
    body: donnees,
  });
  return data.rendez_vous;
}

/**
 * DELETE /rendez-vous/:id
 * Réservé à admin/superadmin — suppression PHYSIQUE. Un rendez-vous
 * s'annule normalement via modifierRendezVous(id, { statut: 'annule' }).
 * Le serveur renvoie 409 si une ordonnance est encore rattachée à ce
 * rendez-vous.
 */
export async function supprimerRendezVous(id) {
  return apiFetch(`/rendez-vous/${id}`, { method: 'DELETE' });
}

export default {
  // Médecins
  listerMedecins,
  obtenirMedecin,
  creerMedecin,
  modifierMedecin,
  supprimerMedecin,
  // Spécialités
  listerSpecialites,
  obtenirSpecialite,
  // Rendez-vous
  STATUTS_RENDEZ_VOUS,
  TYPES_RENDEZ_VOUS,
  MOTIF_RENDEZ_VOUS_LONGUEUR_MAX,
  listerRendezVous,
  obtenirRendezVous,
  creerRendezVous,
  modifierRendezVous,
  supprimerRendezVous,
};