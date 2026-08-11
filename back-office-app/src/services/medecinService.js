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
// "/specialites…", pas par "/api/…".
//
// IMPORTANT — creerMedecin ET modifierMedecin envoient un `FormData`
// (multipart, à cause de gererTeleversementMedecin qui traite les
// fichiers `cni` / `attestation` / `photo`, voir upload.middleware.js)
// et non un objet JSON. apiFetch détecte déjà les instances de
// FormData et laisse passer le corps tel quel, sans JSON.stringify ni
// Content-Type manuel — rien à faire ici de ce côté.
// ⚠️ Les clés FormData attendues par multer sont `cni`, `attestation`
// et `photo` (PAS `cni_url`/`attestation_url`/`photo_url`, qui sont les
// noms des colonnes en base écrites par le contrôleur après upload —
// voir upload.middleware.js, .fields([{name:"cni"},{name:"attestation"},
// {name:"photo"}])).
// `photo` (photo de profil du médecin) est OPTIONNELLE, aussi bien à
// la création qu'en modification (schema.prisma, Medecin.photo_url,
// nullable) — contrairement à cni/attestation qui sont obligatoires à
// la création. C'est confirmé par medecin.controller.js
// (gererTeleversementMedecin, creerMedecin/modifierMedecin :
// `req.files?.photo?.[0]`), ce n'est plus une hypothèse.
//
// creerMedecin : POST /medecins, réservé admin/superadmin. Crée EN
// MÊME TEMPS le compte utilisateur du médecin (rôle "medecin", mot de
// passe temporaire généré côté serveur) et la fiche medecin. Le mot de
// passe temporaire n'est renvoyé qu'une seule fois dans la réponse
// (`utilisateur.mot_de_passe_temporaire`) — à afficher/communiquer par
// l'appelant, jamais re-consultable ensuite.
//
// ⚠️ Comme medecin.controller.js n'a été fourni que partiellement,
// plusieurs éléments ci-dessous restent des HYPOTHÈSES déduites par
// analogie avec les autres services du front (Pharmacie /
// StructureSante / Assurance / Avis Pharmacie), à vérifier/ajuster :
//   - champs acceptés par les POST/PUT non couverts par le contrôleur
//     fourni (avis, abonnements, rendez-vous, ordonnances) ;
//   - valeurs exactes des enums de statut (statut_moderation des avis,
//     statut d'un rendez-vous, etc.), non documentées dans les
//     commentaires de medecin.routes.js.
//
// Point confirmé par medecin.routes.js (et non plus une hypothèse) :
// la spécialité n'est PAS une colonne texte libre de la fiche médecin
// mais une vraie entité référentiel (table Specialite), reliée par FK
// medecin.specialite_id — d'où la section "Spécialités médicales"
// ci-dessous, absente de la version précédente de ce service.
//
// Rappel des règles d'accès côté serveur (confirmées par
// medecin.controller.js / medecin.routes.js — le serveur reste la
// seule source de vérité) :
//
//   Médecins (fiche Annuaire)
//   - GET (liste, détail)  : public, aucun token requis, aucune vue
//     "admin" élargie sur ces deux routes.
//   - POST                 : admin/superadmin uniquement — crée aussi
//     le compte utilisateur lié.
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
//   Spécialités médicales (référentiel)
//   - GET (liste, détail)  : public, aucun token requis (même patron
//     que Langue/Devise/Pays/Ville).
//   - POST / PUT           : admin/superadmin.
//   - DELETE                : superadmin uniquement — le contrôleur
//     renvoie 409 si des fiches medecin référencent encore la
//     spécialité via specialite_id.
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

// Confirmé par rendezVous.controller.js (STATUTS_RDV) : cycle de vie
// complet d'un rendez-vous, y compris le contrôle de présence à
// l'accueil (code_unique / QR) et la contestation a posteriori.
export const STATUTS_RENDEZ_VOUS = [
  { valeur: 'cree', libelle: 'Créé' },
  { valeur: 'confirme', libelle: 'Confirmé' },
  { valeur: 'en_attente_presence', libelle: 'En attente de présence' },
  { valeur: 'honore', libelle: 'Honoré' },
  { valeur: 'non_honore', libelle: 'Non honoré' },
  { valeur: 'annule', libelle: 'Annulé' },
  { valeur: 'conteste', libelle: 'Contesté' },
];

// Confirmé par rendezVous.controller.js (TYPES_RDV). structure_id n'a
// de sens que pour "physique" (sinon cabinet libéral, structure_id
// reste null) ; "teleconsultation" exige que le médecin visé ait
// teleconsultation_activee = true, sans quoi le serveur renvoie 400.
export const TYPES_RENDEZ_VOUS = [
  { valeur: 'physique', libelle: 'Consultation physique' },
  { valeur: 'teleconsultation', libelle: 'Téléconsultation' },
];

// motif : champ texte libre optionnel (précision du motif de
// consultation), trim() côté serveur, 1000 caractères maximum — au
// delà le serveur renvoie 400 (voir creerRendezVous / modifierRendezVous
// dans rendezVous.controller.js). Envoyer une chaîne vide ou null en
// modification efface le motif existant.
export const MOTIF_RENDEZ_VOUS_LONGUEUR_MAX = 1000;

// Champs fichier attendus par gererTeleversementMedecin — noms des
// clés multer (.fields([{name:"cni"},{name:"attestation"},
// {name:"photo"}])), PAS les noms des colonnes en base
// (cni_url/attestation_url/photo_url) — voir upload.middleware.js.
const CHAMPS_FICHIERS_MEDECIN = ['cni', 'attestation', 'photo'];

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
 * Construit le FormData envoyé à la création/modification d'une fiche
 * médecin : les champs texte tels quels, et cni / attestation / photo
 * uniquement s'ils contiennent un vrai `File`. En modification, cela
 * permet un envoi partiel : un fichier non re-sélectionné n'est pas
 * renvoyé, donc pas remplacé côté serveur (cni/attestation restent
 * inchangés, et photo aussi — elle est optionnelle même à la création,
 * voir CHAMPS_FICHIERS_MEDECIN ci-dessus).
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

// medecin.controller.js renvoie nom/prenom/email/telephone imbriqués
// sous `medecin.utilisateur.{...}` (relation Prisma), alors que
// Medecin.jsx les lit en propriétés plates directement sur l'objet
// medecin (medecin.nom, medecin.prenom, medecin.email,
// medecin.telephone — voir la fiche détail, le tableau et le
// formulaire d'édition). Sans cet aplatissement, ces 4 champs
// s'affichaient toujours vides ("—") même quand le formulaire avait
// bien été rempli et bien enregistré côté serveur.
// À l'inverse, ville_exercice / pays_exercice restent des objets
// imbriqués (medecin.ville_exercice.nom, medecin.pays_exercice.nom) :
// c'est déjà la forme attendue par le JSX, on ne les touche pas ici.
function normaliserMedecin(m) {
  if (!m) return m;
  return {
    ...m,
    nom: m.nom ?? m.utilisateur?.nom ?? "",
    prenom: m.prenom ?? m.utilisateur?.prenom ?? "",
    email: m.email ?? m.utilisateur?.email ?? "",
    telephone: m.telephone ?? m.utilisateur?.telephone ?? "",
  };
}

/**
 * POST /api/medecins  (admin/superadmin uniquement)
 * Crée en même temps le compte utilisateur du médecin (rôle "medecin")
 * et sa fiche annuaire. cni et attestation sont obligatoires ; photo
 * est optionnelle (schema.prisma, Medecin.photo_url, nullable).
 * @param {Object} donnees - {
 *   nom, prenom, email, telephone?, pays_id,           // compte utilisateur
 *   specialite_id, numero_ordre, pays_exercice_id, ville_exercice_id,
 *   teleconsultation_activee, tarif_indicatif,          // fiche médecin
 *   statut_verification?,                               // admin seulement, sinon "non_publie" par défaut
 *   cni (File), attestation (File),                      // obligatoires
 *   photo? (File)                                        // optionnelle, photo de profil
 * }
 *   specialite_id référence la table Specialite (voir listerSpecialites
 *   ci-dessous) — ce n'est plus un texte libre, cf. schema.prisma.
 * @returns {Promise<Object>} réponse brute du backend :
 *   { message, medecin, utilisateur }. `utilisateur.mot_de_passe_temporaire`
 *   n'est présent qu'ici, une seule fois — à communiquer au médecin,
 *   qui devra le changer à sa première connexion.
 */
export function creerMedecin(donnees) {
  return apiFetch('/medecins', { method: 'POST', body: construireFormDataMedecin(donnees) });
}

/**
 * GET /api/medecins
 * PUBLIQUE, authentification optionnelle côté serveur : un visiteur
 * anonyme ne reçoit que nom/prenom, un admin/superadmin connecté reçoit
 * en plus email/téléphone (voir medecin.controller.js,
 * selectionUtilisateurSelonRole) — apiFetch ajoute déjà le token si
 * l'utilisateur est connecté, rien à faire de plus ici.
 * @param {Object} filtres - { pays_id?, ville_id?, specialite_id?,
 *   statut_verification?, recherche? } — champs devinés par analogie
 *   avec les autres fiches annuaire (Pharmacie / StructureSante), à
 *   confirmer.
 * @returns {Promise<Array>} liste des médecins, avec nom/prenom/email/
 *   telephone aplatis sur chaque objet (voir normaliserMedecin).
 */
export function listerMedecins(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/medecins${suffixe}`).then((d) => (d.medecins ?? []).map(normaliserMedecin));
}

/**
 * GET /api/medecins/:id
 * PUBLIQUE, authentification optionnelle (mêmes règles que
 * listerMedecins ci-dessus).
 * @returns {Promise<Object>} le médecin, avec nom/prenom/email/
 *   telephone aplatis (voir normaliserMedecin).
 */
export function obtenirMedecin(id) {
  return apiFetch(`/medecins/${id}`).then((d) => normaliserMedecin(d.medecin));
}

/**
 * PUT /api/medecins/:id  (médecin propriétaire ou admin/superadmin)
 * @param {Object} donnees - champs partiels à mettre à jour ;
 *   cni? / attestation? / photo? (File) optionnels — n'envoyer que les
 *   fichiers à remplacer (gérés par gererTeleversementMedecin côté
 *   serveur) ; un fichier omis reste inchangé côté serveur, y compris
 *   photo qui est optionnelle même à la création.
 *   statut_verification n'est vraisemblablement honoré tel quel que
 *   pour admin/superadmin (par analogie avec Pharmacie/StructureSante,
 *   à confirmer).
 *   nom / prenom / telephone sont désormais bien pris en compte par le
 *   serveur (ils vivent sur le compte utilisateur lié, pas sur la
 *   fiche medecin — voir medecin.controller.js, CHAMPS_MODIFIABLES_
 *   UTILISATEUR) : ne plus les omettre côté appelant.
 * @returns {Promise<Object>} le médecin mis à jour, avec nom/prenom/
 *   email/telephone aplatis (voir normaliserMedecin).
 */
export function modifierMedecin(id, donnees) {
  return apiFetch(`/medecins/${id}`, {
    method: 'PUT',
    body: construireFormDataMedecin(donnees),
  }).then((d) => normaliserMedecin(d.medecin));
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
 * côté serveur dans chaque handler (voir rendezVous.controller.js).
 *
 * Confirmé par rendezVous.controller.js (n'est plus une hypothèse) :
 *   - champ de créneau : `date_creneau` (PAS `date_heure`) ;
 *   - le back-end répond `{ rendez_vous: ... }` (snake_case, singulier
 *     même pour la liste) sur les 4 routes ci-dessous — d'où
 *     `d.rendez_vous` et non `d.rendezVous` dans les extracteurs ;
 *   - `patient_id` est TOUJOURS déduit du token côté serveur à la
 *     création (jamais lu dans req.body) : un compte sans profil
 *     patient reçoit 403. Inutile donc de l'envoyer depuis le front.
 *   - `motif` (string, optionnelle, 1000 caractères max, trim() côté
 *     serveur) : champ libre de précision du motif de consultation.
 *     Envoyer '' ou null en modification l'efface. Voir
 *     MOTIF_RENDEZ_VOUS_LONGUEUR_MAX ci-dessus pour la validation
 *     front (même limite que le serveur, pour un message d'erreur
 *     immédiat plutôt qu'un aller-retour réseau).
 * =================================================================== */

/**
 * GET /api/rendez-vous
 * Toujours scopé à l'utilisateur courant (son propre profil patient
 * ou médecin) côté serveur, sauf admin/superadmin qui peut filtrer
 * librement.
 * @param {Object} filtres - { statut?, medecin_id?, patient_id? } —
 *   seuls filtres reconnus par le contrôleur ; `statut` doit être une
 *   valeur de STATUTS_RENDEZ_VOUS sous peine de 400.
 * @returns {Promise<Array>} liste des rendez-vous
 */
export function listerRendezVous(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/rendez-vous${suffixe}`).then((d) => d.rendez_vous ?? []);
}

/**
 * GET /api/rendez-vous/:id
 * @returns {Promise<Object>} le rendez-vous
 */
export function obtenirRendezVous(id) {
  return apiFetch(`/rendez-vous/${id}`).then((d) => d.rendez_vous);
}

/**
 * POST /api/rendez-vous  (réservé à un compte PATIENT — 403 sinon)
 * `code_unique` / `qr_token_secret` (contrôle de présence à l'accueil)
 * sont générés côté serveur, jamais saisis ici.
 * @param {Object} donnees - {
 *   medecin_id,                 // requis
 *   type_rdv,                   // requis — 'physique' | 'teleconsultation'
 *   date_creneau,                // requis — ISO date/heure
 *   structure_id?,               // optionnel, sens uniquement si type_rdv === 'physique'
 *   motif?,                      // optionnel, texte libre, 1000 caractères max
 * }
 * @returns {Promise<Object>} le rendez-vous créé
 */
export function creerRendezVous(donnees) {
  return apiFetch('/rendez-vous', { method: 'POST', body: donnees }).then((d) => d.rendez_vous);
}

/**
 * PUT /api/rendez-vous/:id
 * Ouvert au patient concerné, au médecin concerné, ou à
 * admin/superadmin (ex. confirmation, reprogrammation, annulation
 * douce via statut, contestation, correction du motif).
 * @param {Object} donnees - champs partiels parmi { statut, date_creneau,
 *   structure_id, motif } — envoyer motif: '' ou motif: null efface le
 *   motif existant. `statut` doit être une valeur de
 *   STATUTS_RENDEZ_VOUS ; le serveur valide seulement l'appartenance à
 *   l'enum, pas la cohérence de la transition avec le rôle appelant.
 * @returns {Promise<Object>} le rendez-vous mis à jour
 */
export function modifierRendezVous(id, donnees) {
  return apiFetch(`/rendez-vous/${id}`, { method: 'PUT', body: donnees }).then((d) => d.rendez_vous);
}

/**
 * DELETE /api/rendez-vous/:id  (admin/superadmin uniquement)
 * Suppression PHYSIQUE — un rendez-vous s'annule normalement via
 * modifierRendezVous(id, { statut: 'annule' }). Le serveur renvoie 409
 * si une ordonnance est encore rattachée à ce rendez-vous.
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
 * Spécialités médicales (référentiel)
 *
 * Table de référence autonome (même patron que Langue/Devise/Pays/
 * Ville) : lecture publique, écriture réservée à admin/superadmin,
 * suppression réservée à superadmin. Une fiche médecin référence sa
 * spécialité via specialite_id (FK) — voir creerMedecin/modifierMedecin
 * ci-dessus.
 * =================================================================== */

/**
 * GET /api/specialites
 * PUBLIQUE, aucune authentification requise.
 * @param {Object} filtres - { recherche? } — champ deviné par analogie
 *   avec les autres référentiels, à confirmer.
 * @returns {Promise<Array>} liste des spécialités
 */
export function listerSpecialites(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/specialites${suffixe}`).then((d) => d.specialites ?? []);
}

/**
 * GET /api/specialites/:id
 * PUBLIQUE.
 * @returns {Promise<Object>} la spécialité
 */
export function obtenirSpecialite(id) {
  return apiFetch(`/specialites/${id}`).then((d) => d.specialite);
}

/**
 * POST /api/specialites  (admin/superadmin uniquement)
 * @param {Object} donnees - { nom, description? } — champs devinés par
 *   analogie avec les autres référentiels, à confirmer avec le
 *   contrôleur réel.
 * @returns {Promise<Object>} la spécialité créée
 */
export function creerSpecialite(donnees) {
  return apiFetch('/specialites', { method: 'POST', body: donnees }).then((d) => d.specialite);
}

/**
 * PUT /api/specialites/:id  (admin/superadmin uniquement)
 * @param {Object} donnees - champs partiels à mettre à jour.
 * @returns {Promise<Object>} la spécialité mise à jour
 */
export function modifierSpecialite(id, donnees) {
  return apiFetch(`/specialites/${id}`, { method: 'PUT', body: donnees }).then(
    (d) => d.specialite
  );
}

/**
 * DELETE /api/specialites/:id  (superadmin uniquement)
 * ⚠️ Le contrôleur renvoie 409 si une ou plusieurs fiches medecin
 * référencent encore cette spécialité via specialite_id — l'appelant
 * doit prévoir la gestion de ce cas (message d'erreur adapté plutôt
 * qu'un échec silencieux).
 */
export function supprimerSpecialite(id) {
  return apiFetch(`/specialites/${id}`, { method: 'DELETE' });
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
  TYPES_RENDEZ_VOUS,
  MOTIF_RENDEZ_VOUS_LONGUEUR_MAX,
  // Médecins
  creerMedecin,
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
  // Spécialités médicales
  listerSpecialites,
  obtenirSpecialite,
  creerSpecialite,
  modifierSpecialite,
  supprimerSpecialite,
  // Référentiels
  listerPays,
  listerVilles,
};

export default MedecinService;