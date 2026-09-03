// src/services/utilisateurService.js
//
// Couche d'accès API pour le composant "utilisateurs" du back-office :
// gestion des comptes privilégiés (admin / superadmin) UNIQUEMENT.
// Miroir front-end de utilisateurs.controller.js / utilisateurs.routes.js
// (un seul routeur back-end monté sous /api/utilisateurs, donc un seul
// service ici), calqué sur referentielService.js / medecinService.js
// pour rester cohérent avec le reste du front.
//
// ⚠️ Ce service NE gère PAS la création de patients, médecins ou
// agent_xxx : ces comptes sont créés via POST /api/auth/comptes (voir
// authentification.controller.js / authentificationService.js), pas
// ici. Ce composant est strictement borné aux rôles "admin" et
// "superadmin" (cf. ROLES_GERES côté contrôleur) — toute tentative de
// lire/créer/modifier un autre rôle via ces routes est rejetée par le
// serveur (404 en lecture, pour ne pas confirmer/infirmer l'existence
// d'un compte hors périmètre).
//
// S'appuie entièrement sur `apiFetch` (src/lib/apiClient.js) : celui-ci
// ajoute déjà l'access token en mémoire (Authorization: Bearer …), gère
// le cookie httpOnly du refresh token et rejoue automatiquement la
// requête en cas de 401 expiré. On ne réimplémente rien de tout ça ici.
//
// Note : `API_BASE_URL` (dans apiClient.js) inclut déjà le préfixe
// "/api" — les chemins ci-dessous commencent donc directement par
// "/utilisateurs…", pas par "/api/utilisateurs…".
//
// ─── Modèle de permissions (confirmé par utilisateurs.controller.js /
// utilisateurs.routes.js — le serveur reste la seule source de vérité,
// ce service ne fait que relayer ; toute route ci-dessous exige d'être
// authentifié, il n'existe aucune route publique dans ce composant) ──
//
//   Lecture (lister / obtenir)
//   - accessible à "admin" ET "superadmin".
//
//   Écriture (créer / modifier / suspendre / réactiver)
//   - réservée au SEUL "superadmin". Un simple admin reçoit 403 (le
//     contrôleur revérifie le rôle en défense en profondeur, même si
//     la route est censée être déjà filtrée par le middleware
//     autoriser("superadmin")).
//   - un superadmin ne peut ni retirer son propre rôle superadmin
//     (modifierUtilisateur), ni suspendre son propre compte
//     (suspendreUtilisateur), ni faire passer le dernier superadmin
//     actif sous ce seuil (rétrogradation vers admin comme suspension)
//     — le serveur renvoie respectivement 400 et 409 dans ces cas,
//     l'appelant doit prévoir ces messages d'erreur.
//
// apiFetch lève une Error (avec `.status` et `.data`) si le backend
// répond en erreur — chaque fonction ci-dessous se contente de la
// laisser remonter telle quelle à l'appelant.

import { apiFetch } from '../lib/apiClient';

// Seuls rôles gérés par ce composant (voir ROLES_GERES côté
// contrôleur) — utile côté front pour peupler un <select> de filtre ou
// de formulaire sans dupliquer la valeur en dur à plusieurs endroits.
export const ROLES_UTILISATEUR = [
  { valeur: 'admin', libelle: 'Administrateur' },
  { valeur: 'superadmin', libelle: 'Super-administrateur' },
];

export const STATUTS_COMPTE_UTILISATEUR = [
  { valeur: 'actif', libelle: 'Actif' },
  { valeur: 'suspendu', libelle: 'Suspendu' },
];

// Même contrainte que côté serveur (MOT_DE_PASSE_LONGUEUR_MIN dans
// utilisateurs.controller.js) — dupliquée ici pour une validation
// immédiate côté formulaire plutôt qu'un aller-retour réseau inutile.
export const MOT_DE_PASSE_LONGUEUR_MIN = 8;

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
 * GET /api/utilisateurs
 * Liste paginée des comptes admin / superadmin. Accessible en lecture
 * à "admin" et "superadmin".
 * @param {Object} filtres - {
 *   role?,       // 'admin' | 'superadmin' — 400 côté serveur si autre valeur
 *   statut?,     // 'actif' | 'suspendu'   — 400 côté serveur si autre valeur
 *   recherche?,  // recherche texte sur nom / prenom / email
 *   page?,       // défaut 1
 *   limite?,     // défaut 20, max 100 (borné côté serveur)
 * }
 * @returns {Promise<{utilisateurs: Array, pagination: {page, limite, total, total_pages}}>}
 *   réponse brute du backend : chaque utilisateur a déjà `role` en
 *   libellé texte ('admin' | 'superadmin') et jamais de
 *   mot_de_passe_hash (retiré côté serveur, voir serialiserUtilisateur).
 */
export function listerUtilisateurs(filtres = {}) {
  const suffixe = construireParametres(filtres);
  return apiFetch(`/utilisateurs${suffixe}`);
}

/**
 * GET /api/utilisateurs/:id
 * Détail d'un compte admin / superadmin. Accessible en lecture à
 * "admin" et "superadmin".
 * ⚠️ Renvoie 404 (pas 403) si l'id existe mais correspond à un rôle
 * hors périmètre (patient, medecin, agent_xxx) — ce n'est pas une
 * erreur d'autorisation, l'appelant ne doit pas la traiter comme telle.
 * @returns {Promise<Object>} l'utilisateur (role en libellé texte)
 */
export function obtenirUtilisateur(id) {
  return apiFetch(`/utilisateurs/${id}`).then((d) => d.utilisateur);
}

/**
 * POST /api/utilisateurs  (superadmin uniquement)
 * Crée un compte admin OU superadmin.
 * @param {Object} donnees - {
 *   nom, prenom, email, mot_de_passe, pays_id, role,  // requis
 *   telephone?,                                         // optionnel
 * }
 *   role doit valoir 'admin' ou 'superadmin' (400 sinon).
 *   mot_de_passe : MOT_DE_PASSE_LONGUEUR_MIN caractères minimum (400
 *   sinon côté serveur — voir validerMotDePasse).
 *   email : normalisé (trim + lowercase) et validé côté serveur ; 409
 *   si déjà utilisé.
 *   pays_id : doit référencer un pays existant (400 sinon).
 *   Le compte est créé avec statut_compte: 'actif' d'office — pas de
 *   champ à envoyer pour ça.
 * @returns {Promise<Object>} l'utilisateur créé (role en libellé texte)
 */
export function creerUtilisateur(donnees) {
  return apiFetch('/utilisateurs', { method: 'POST', body: donnees }).then((d) => d.utilisateur);
}

/**
 * PATCH /api/utilisateurs/:id  (superadmin uniquement)
 * Met à jour l'identité / le pays / le rôle d'un compte admin ou
 * superadmin. Ne touche JAMAIS au mot de passe (changement de mot de
 * passe hors périmètre de ce service) ni au statut_compte (voir
 * suspendreUtilisateur / reactiverUtilisateur ci-dessous).
 * @param {Object} donnees - champs partiels parmi { nom?, prenom?,
 *   telephone?, pays_id?, role? } — au moins un champ requis (400 si
 *   objet vide côté serveur).
 *   ⚠️ Un superadmin ne peut pas retirer son propre rôle superadmin en
 *   se ciblant lui-même avec role !== 'superadmin' (400 côté serveur).
 *   ⚠️ Rétrograder le dernier superadmin actif vers 'admin' renvoie 409
 *   ("Impossible de rétrograder le dernier superadmin actif").
 * @returns {Promise<Object>} l'utilisateur mis à jour (role en libellé texte)
 */
export function modifierUtilisateur(id, donnees) {
  return apiFetch(`/utilisateurs/${id}`, { method: 'PATCH', body: donnees }).then(
    (d) => d.utilisateur
  );
}

/**
 * PATCH /api/utilisateurs/:id/suspendre  (superadmin uniquement)
 * Passe statut_compte à 'suspendu'.
 * ⚠️ Un superadmin ne peut pas suspendre son propre compte (400 côté
 * serveur : "Vous ne pouvez pas suspendre votre propre compte").
 * ⚠️ Le dernier superadmin actif ne peut pas être suspendu (409 :
 * "Impossible de suspendre le dernier superadmin actif").
 * ⚠️ Idempotence NON garantie ici (contrairement à publier/reactiver
 * côté médecin) : un compte déjà suspendu renvoie 409 ("Ce compte est
 * déjà suspendu"), pas 200 — à distinguer des deux 409 précédents côté
 * appelant si un message dédié est nécessaire.
 * @returns {Promise<Object>} l'utilisateur mis à jour (role en libellé texte)
 */
export function suspendreUtilisateur(id) {
  return apiFetch(`/utilisateurs/${id}/suspendre`, { method: 'PATCH' }).then(
    (d) => d.utilisateur
  );
}

/**
 * PATCH /api/utilisateurs/:id/reactiver  (superadmin uniquement)
 * Repasse statut_compte à 'actif'.
 * ⚠️ Idempotence NON garantie : un compte déjà actif renvoie 409 ("Ce
 * compte est déjà actif"), pas 200.
 * @returns {Promise<Object>} l'utilisateur mis à jour (role en libellé texte)
 */
export function reactiverUtilisateur(id) {
  return apiFetch(`/utilisateurs/${id}/reactiver`, { method: 'PATCH' }).then(
    (d) => d.utilisateur
  );
}

const UtilisateurService = {
  ROLES_UTILISATEUR,
  STATUTS_COMPTE_UTILISATEUR,
  MOT_DE_PASSE_LONGUEUR_MIN,
  listerUtilisateurs,
  obtenirUtilisateur,
  creerUtilisateur,
  modifierUtilisateur,
  suspendreUtilisateur,
  reactiverUtilisateur,
};

export default UtilisateurService;