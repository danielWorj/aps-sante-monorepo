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

/**
 * PATCH /medecins/:id/publier
 * Réservé à admin/superadmin. Fait passer la fiche à
 * statut_verification="publie". Ne touche jamais statut_compte.
 * @returns {Promise<Object>} le médecin mis à jour (ou message seul
 *   si la fiche était déjà publiée).
 */
export async function publierMedecin(id) {
  return apiFetch(`/medecins/${id}/publier`, { method: 'PATCH' });
}

/**
 * PATCH /medecins/:id/suspendre
 * Réservé à admin/superadmin. Bloque le compte utilisateur lié
 * (statut_compte="suspendu") ET retire la fiche de l'annuaire public
 * (statut_verification repassé à "non_publie") en même temps.
 * Réversible via reactiverMedecin.
 */
export async function suspendreMedecin(id) {
  return apiFetch(`/medecins/${id}/suspendre`, { method: 'PATCH' });
}

/**
 * PATCH /medecins/:id/reactiver
 * Réservé à admin/superadmin. Débloque le compte (statut_compte=
 * "actif") sans republier automatiquement la fiche — appeler
 * publierMedecin() ensuite si nécessaire.
 */
export async function reactiverMedecin(id) {
  return apiFetch(`/medecins/${id}/reactiver`, { method: 'PATCH' });
}

/**
 * POST /medecins/verifier-ordre
 * Route publique — aucune authentification requise. Vérifie
 * l'appartenance au Tableau de l'Ordre National des Médecins du
 * Cameroun (ONMC) à partir d'un numero_ordre, indépendamment de tout
 * enregistrement local (utile avant même la création d'un compte).
 * @param {string} numeroOrdre
 * @returns {Promise<{numero_ordre, appartient_ordre: boolean, nom_complet?, numero_ordre_onmc?}>}
 * @throws {Error} avec .status 400 (numero_ordre manquant) ou 502
 *   (ONMC injoignable — ne signifie PAS que le médecin n'y figure pas).
 */
export async function verifierAppartenanceOrdre(numeroOrdre) {
  return apiFetch('/medecins/verifier-ordre', {
    method: 'POST',
    body: { numero_ordre: numeroOrdre },
  });
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

/**
 * POST /specialites
 * Réservé à admin/superadmin.
 * @param {Object} donnees - { nom, description? } — nom requis et
 *   unique.
 */
export async function creerSpecialite(donnees) {
  const data = await apiFetch('/specialites', {
    method: 'POST',
    body: donnees,
  });
  return data.specialite;
}

/**
 * PUT /specialites/:id
 * Réservé à admin/superadmin.
 * @param {Object} donnees - champs partiels parmi { nom, description }.
 */
export async function modifierSpecialite(id, donnees = {}) {
  const data = await apiFetch(`/specialites/${id}`, {
    method: 'PUT',
    body: donnees,
  });
  return data.specialite;
}

/**
 * DELETE /specialites/:id
 * Réservé à superadmin. Le serveur renvoie 409 si des médecins
 * référencent encore cette spécialité.
 */
export async function supprimerSpecialite(id) {
  return apiFetch(`/specialites/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * Avis médecin
 *
 * Lecture publique mais enrichie si connecté (l'auteur voit son propre
 * avis en attente/rejeté, admin/superadmin voit tout — authentification
 * optionnelle côté serveur, déjà gérée automatiquement par apiFetch qui
 * ajoute le token s'il existe). Dépôt réservé aux utilisateurs
 * authentifiés (patient inclus).
 *
 * ⚠️ src/controllers/avis.controller.js n'a pas été fourni pour cette
 * tâche (medecin.controller.js le ré-exporte tel quel, voir son
 * en-tête) : la forme exacte des champs d'un avis (note, commentaire,
 * statut_moderation, etc.) n'est donc pas connue avec certitude ici.
 * Les fonctions ci-dessous suivent le seul contrat observable côté
 * routes (medecin.routes.js) : `donnees` est transmis tel quel au
 * serveur, qui reste responsable de sa validation.
 * =================================================================== */

/**
 * GET /avis-medecin
 * @param {Object} filtres - { medecin_id?, statut_moderation?, ... } —
 *   selon ce qu'accepte le serveur.
 * @returns {Promise<Array>} liste des avis
 */
export async function listerAvisMedecin(filtres = {}) {
  const data = await apiFetch(`/avis-medecin${construireQueryString(filtres)}`);
  return data.avis;
}

/**
 * GET /avis-medecin/:id
 */
export async function obtenirAvisMedecin(id) {
  const data = await apiFetch(`/avis-medecin/${id}`);
  return data.avis;
}

/**
 * POST /avis-medecin
 * Réservé aux utilisateurs authentifiés.
 * @param {Object} donnees - contenu de l'avis (ex. medecin_id, note,
 *   commentaire) — voir avis.controller.js côté serveur pour le détail
 *   exact des champs acceptés.
 */
export async function creerAvisMedecin(donnees) {
  const data = await apiFetch('/avis-medecin', {
    method: 'POST',
    body: donnees,
  });
  return data.avis;
}

/**
 * PUT /avis-medecin/:id
 * Ouvert à l'auteur (tant que "en_attente") ou admin/superadmin (peut
 * en plus modifier statut_moderation).
 */
export async function modifierAvisMedecin(id, donnees = {}) {
  const data = await apiFetch(`/avis-medecin/${id}`, {
    method: 'PUT',
    body: donnees,
  });
  return data.avis;
}

/**
 * DELETE /avis-medecin/:id
 * Ouvert à l'auteur (quel que soit le statut) ou admin/superadmin.
 */
export async function supprimerAvisMedecin(id) {
  return apiFetch(`/avis-medecin/${id}`, { method: 'DELETE' });
}

/* ===================================================================
 * Abonnements médecin
 *
 * Donnée commerciale interne : jamais publique, authentification
 * requise partout, autorisation fine (médecin souscripteur vs
 * admin/superadmin) gérée côté serveur.
 *
 * v9 : abonnement_medecin n'a plus de medecin_id direct — c'est une
 * offre reliée aux médecins par la table de jointure N-N
 * forfait_abonnement_medecin. La souscription initiale se fait à la
 * création ; l'ajout/retrait d'un médecin à un abonnement déjà
 * existant passe par ajouterMedecinAbonnement/retirerMedecinAbonnement
 * (réservés à admin/superadmin).
 *
 * ⚠️ src/controllers/abonnementMedecin.controller.js n'a pas été
 * fourni pour cette tâche (même remarque que pour Avis médecin
 * ci-dessus) : la forme exacte des champs n'est pas connue avec
 * certitude, les fonctions suivent le contrat observable côté routes.
 * =================================================================== */

/**
 * GET /abonnements-medecin
 * @param {Object} filtres - selon ce qu'accepte le serveur.
 * @returns {Promise<Array>} liste des abonnements
 */
export async function listerAbonnementsMedecin(filtres = {}) {
  const data = await apiFetch(`/abonnements-medecin${construireQueryString(filtres)}`);
  return data.abonnements;
}

/**
 * GET /abonnements-medecin/:id
 */
export async function obtenirAbonnementMedecin(id) {
  const data = await apiFetch(`/abonnements-medecin/${id}`);
  return data.abonnement;
}

/**
 * POST /abonnements-medecin
 * @param {Object} donnees - contenu de l'offre + souscripteurs
 *   initiaux (un ou plusieurs médecins) — voir
 *   abonnementMedecin.controller.js côté serveur.
 */
export async function creerAbonnementMedecin(donnees) {
  const data = await apiFetch('/abonnements-medecin', {
    method: 'POST',
    body: donnees,
  });
  return data.abonnement;
}

/**
 * PUT /abonnements-medecin/:id
 */
export async function modifierAbonnementMedecin(id, donnees = {}) {
  const data = await apiFetch(`/abonnements-medecin/${id}`, {
    method: 'PUT',
    body: donnees,
  });
  return data.abonnement;
}

/**
 * DELETE /abonnements-medecin/:id
 */
export async function supprimerAbonnementMedecin(id) {
  return apiFetch(`/abonnements-medecin/${id}`, { method: 'DELETE' });
}

/**
 * POST /abonnements-medecin/:id/medecins
 * Réservé à admin/superadmin. Ajoute un médecin aux souscripteurs
 * d'un abonnement groupé déjà existant.
 * @param {string} abonnementId
 * @param {string} medecinId
 */
export async function ajouterMedecinAbonnement(abonnementId, medecinId) {
  return apiFetch(`/abonnements-medecin/${abonnementId}/medecins`, {
    method: 'POST',
    body: { medecin_id: medecinId },
  });
}

/**
 * DELETE /abonnements-medecin/:id/medecins/:medecinId
 * Réservé à admin/superadmin.
 */
export async function retirerMedecinAbonnement(abonnementId, medecinId) {
  return apiFetch(`/abonnements-medecin/${abonnementId}/medecins/${medecinId}`, {
    method: 'DELETE',
  });
}

/**
 * POST /abonnements-medecin/:id/lignes
 * Ajoute une ligne d'avantage à un abonnement.
 * @param {string} abonnementId
 * @param {Object} donnees - contenu de la ligne d'avantage.
 */
export async function ajouterLigneAbonnementMedecin(abonnementId, donnees) {
  return apiFetch(`/abonnements-medecin/${abonnementId}/lignes`, {
    method: 'POST',
    body: donnees,
  });
}

/**
 * PUT /lignes-abonnement-medecin/:ligneId
 * Route indépendante (pas nichée sous /:id), comme documenté dans
 * medecin.routes.js.
 */
export async function modifierLigneAbonnementMedecin(ligneId, donnees = {}) {
  return apiFetch(`/lignes-abonnement-medecin/${ligneId}`, {
    method: 'PUT',
    body: donnees,
  });
}

/**
 * DELETE /lignes-abonnement-medecin/:ligneId
 */
export async function supprimerLigneAbonnementMedecin(ligneId) {
  return apiFetch(`/lignes-abonnement-medecin/${ligneId}`, { method: 'DELETE' });
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

/* ===================================================================
 * Ordonnances
 *
 * Donnée médicale nominative : authentification requise partout.
 * Création réservée au médecin du rendez-vous concerné (même un admin
 * ne peut émettre à sa place). Modification ouverte au médecin auteur
 * ou admin/superadmin. Suppression réservée à admin/superadmin — jamais
 * par le médecin après émission.
 *
 * ⚠️ src/controllers/rendezVous.controller.js (qui porte aussi les
 * handlers Ordonnances, voir en-tête de medecin.controller.js) n'a pas
 * été fourni pour cette tâche : la forme exacte des champs d'une
 * ordonnance n'est pas connue avec certitude, les fonctions suivent le
 * contrat observable côté routes (medecin.routes.js).
 * =================================================================== */

/**
 * GET /ordonnances
 * Toujours scopé à l'utilisateur courant côté serveur (son propre
 * profil patient ou médecin), sauf admin/superadmin.
 * @param {Object} filtres - { rendez_vous_id?, medecin_id?, patient_id? }
 *   — selon ce qu'accepte le serveur.
 * @returns {Promise<Array>} liste des ordonnances
 */
export async function listerOrdonnances(filtres = {}) {
  const data = await apiFetch(`/ordonnances${construireQueryString(filtres)}`);
  return data.ordonnances;
}

/**
 * GET /ordonnances/:id
 */
export async function obtenirOrdonnance(id) {
  const data = await apiFetch(`/ordonnances/${id}`);
  return data.ordonnance;
}

/**
 * POST /ordonnances
 * Réservé au médecin du rendez-vous concerné.
 * @param {Object} donnees - contenu de l'ordonnance (ex. rendez_vous_id,
 *   contenu/prescriptions) — voir rendezVous.controller.js côté serveur
 *   pour le détail exact des champs acceptés.
 */
export async function creerOrdonnance(donnees) {
  const data = await apiFetch('/ordonnances', {
    method: 'POST',
    body: donnees,
  });
  return data.ordonnance;
}

/**
 * PUT /ordonnances/:id
 * Ouvert au médecin auteur ou admin/superadmin.
 */
export async function modifierOrdonnance(id, donnees = {}) {
  const data = await apiFetch(`/ordonnances/${id}`, {
    method: 'PUT',
    body: donnees,
  });
  return data.ordonnance;
}

/**
 * DELETE /ordonnances/:id
 * Réservé à admin/superadmin.
 */
export async function supprimerOrdonnance(id) {
  return apiFetch(`/ordonnances/${id}`, { method: 'DELETE' });
}

export default {
  // Médecins
  listerMedecins,
  obtenirMedecin,
  creerMedecin,
  modifierMedecin,
  supprimerMedecin,
  publierMedecin,
  suspendreMedecin,
  reactiverMedecin,
  verifierAppartenanceOrdre,
  // Spécialités
  listerSpecialites,
  obtenirSpecialite,
  creerSpecialite,
  modifierSpecialite,
  supprimerSpecialite,
  // Avis médecin
  listerAvisMedecin,
  obtenirAvisMedecin,
  creerAvisMedecin,
  modifierAvisMedecin,
  supprimerAvisMedecin,
  // Abonnements médecin
  listerAbonnementsMedecin,
  obtenirAbonnementMedecin,
  creerAbonnementMedecin,
  modifierAbonnementMedecin,
  supprimerAbonnementMedecin,
  ajouterMedecinAbonnement,
  retirerMedecinAbonnement,
  ajouterLigneAbonnementMedecin,
  modifierLigneAbonnementMedecin,
  supprimerLigneAbonnementMedecin,
  // Rendez-vous
  STATUTS_RENDEZ_VOUS,
  TYPES_RENDEZ_VOUS,
  MOTIF_RENDEZ_VOUS_LONGUEUR_MAX,
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
};