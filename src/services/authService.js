// src/services/authService.js
// Service de consommation des APIs du module "authentification" (voir
// src/routes/authentification.routes.js côté backend), bâti sur le
// même client centralisé src/lib/apiClient.js que medecinService.js
// (apiFetch : Authorization automatique depuis l'access token en
// mémoire, refresh silencieux sur 401, erreurs déjà normalisées avec
// .message/.status).
//
// ⚠️ Ce service ne permet PAS de créer un compte "admin" ni
// "superadmin" :
//  - inscrirePatient() → POST /auth/register, ne peut créer QUE un
//    compte "patient" (imposé côté serveur, voir
//    authentification.controller.js).
//  - creerCompteAdministre() → POST /auth/comptes, réservé à un
//    appelant déjà authentifié en admin/superadmin, et volontairement
//    restreint côté client à la liste ROLES_ADMINISTRABLES (médecin +
//    agent_xxx). "admin" et "superadmin" sont retirés de cette liste :
//    même un admin techniquement autorisé côté serveur à créer un
//    médecin/agent ne doit pas pouvoir, depuis cet écran, s'auto-élever
//    ou créer un pair. Le serveur revalide de toute façon le rôle
//    demandé contre sa propre matrice de permissions (ROLES_CREABLES_PAR)
//    et rejettera "admin"/"superadmin" pour un appelant "admin" — ce
//    garde-fou côté client est une défense en profondeur, pas la seule
//    protection.
//  - La route POST /auth/bootstrap-superadmin (amorçage du tout
//    premier superadmin, verrouillée par le header X-Setup-Token connu
//    uniquement de l'opérateur qui déploie l'environnement) n'est
//    délibérément PAS exposée ici : ce n'est pas un flux applicatif
//    normal, c'est une opération d'infrastructure ponctuelle. Si elle
//    doit un jour être appelée depuis le front, créer un service dédié
//    et séparé plutôt que de l'ajouter ici.

import { apiFetch } from '../lib/apiClient';

/**
 * Rôles créables via creerCompteAdministre(). Volontairement exclus :
 * "patient" (passe par inscrirePatient, en libre-service) et
 * "admin"/"superadmin" (jamais créés depuis ce service, cf. note
 * d'en-tête).
 */
export const ROLES_ADMINISTRABLES = [
  'medecin',
  'agent_structure_sante',
  'agent_pharmacie',
  'agent_ambulance',
  'agent_pompes_funebres',
  'agent_assurance',
];

// Rôles "agent_xxx" pour lesquels le backend exige reference_id
// (structure/pharmacie/service de rattachement) + fonction.
const ROLES_AGENT = ROLES_ADMINISTRABLES.filter((role) => role.startsWith('agent_'));

/**
 * POST /auth/register
 * Route publique. Ne peut créer QU'un compte de rôle "patient" (voir
 * authentification.controller.js) — c'est le seul rôle inscriptible
 * en self-service.
 * @param {Object} donnees - { nom, prenom, email, telephone?,
 *   mot_de_passe, pays_id, date_naissance } — tous requis sauf telephone.
 * @returns {Promise<{message, utilisateur}>} ne renvoie PAS de tokens :
 *   appeler connecter() juste après pour obtenir une session.
 */
export async function inscrirePatient(donnees) {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: donnees,
  });
}

/**
 * POST /auth/comptes
 * Route protégée (authentifier + autoriser("admin", "superadmin")
 * côté serveur) : crée un compte médecin ou agent_xxx pour le compte
 * de l'appelant admin/superadmin déjà connecté. N'accepte PAS "admin"
 * ni "superadmin" comme rôle — voir ROLES_ADMINISTRABLES.
 *
 * @param {Object} donnees
 * @param {string} donnees.nom
 * @param {string} donnees.prenom
 * @param {string} donnees.email
 * @param {string} [donnees.telephone]
 * @param {string} donnees.mot_de_passe
 * @param {string} donnees.pays_id
 * @param {'medecin'|'agent_structure_sante'|'agent_pharmacie'|'agent_ambulance'|'agent_pompes_funebres'|'agent_assurance'} donnees.role
 * @param {string} [donnees.reference_id] - requis si role est un agent_xxx :
 *   identifiant de la structure/pharmacie/service de rattachement.
 * @param {string} [donnees.fonction] - requis si role est un agent_xxx.
 * @returns {Promise<{message, utilisateur}>}
 * @throws {Error} si donnees.role n'est pas dans ROLES_ADMINISTRABLES
 *   (rejeté avant même l'appel réseau ; le serveur revaliderait de
 *   toute façon).
 */
export async function creerCompteAdministre(donnees) {
  const { role } = donnees || {};

  if (!ROLES_ADMINISTRABLES.includes(role)) {
    throw new Error(
      `Rôle "${role}" non autorisé via ce service (admin/superadmin exclus). ` +
        `Rôles acceptés : ${ROLES_ADMINISTRABLES.join(', ')}.`
    );
  }

  if (ROLES_AGENT.includes(role) && (!donnees.reference_id || !donnees.fonction)) {
    throw new Error(
      'reference_id et fonction sont requis pour créer un compte agent.'
    );
  }

  return apiFetch('/auth/comptes', {
    method: 'POST',
    body: donnees,
  });
}

/**
 * POST /auth/login
 * Route publique. Pose le refresh token en cookie httpOnly côté
 * serveur et renvoie l'access token (géré ensuite en mémoire par
 * apiClient.js pour les appels suivants).
 *
 * ⚠️ Deux formes de réponse possibles, à distinguer via
 * `mot_de_passe_a_changer` :
 *  - session normale : { access_token, utilisateur } — apiClient.js
 *    doit stocker access_token comme d'habitude.
 *  - mot de passe temporaire détecté (première connexion ou
 *    reconnexion avant expiration de la fenêtre de 24h) :
 *    { mot_de_passe_a_changer: true, token_changement_mot_de_passe,
 *      token_changement_mot_de_passe_expire_le, mot_de_passe_expire_le }
 *    Dans ce cas, AUCUNE session n'est ouverte côté serveur (pas de
 *    cookie refresh_token utile, pas d'access_token de session) : ne
 *    pas stocker token_changement_mot_de_passe comme l'access token
 *    normal, il n'est valable que pour changerMotDePasseInitial().
 * @param {string} email
 * @param {string} mot_de_passe
 * @returns {Promise<Object>} l'une des deux formes ci-dessus.
 */
export async function connecter(email, mot_de_passe) {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: { email, mot_de_passe },
    // Évite qu'un 401 (mauvais identifiants) déclenche une tentative
    // de refresh silencieux inutile sur l'appel de login lui-même.
    skipAuthRetry: true,
  });
}

/**
 * POST /auth/changer-mot-de-passe-initial
 * À appeler juste après un connecter() ayant renvoyé
 * `mot_de_passe_a_changer: true`, typiquement depuis l'écran de
 * changement de mot de passe forcé affiché automatiquement par le
 * routeur (voir note d'intégration ci-dessous).
 *
 * En cas de succès, ouvre directement une session complète (même
 * forme de réponse qu'un connecter() normal : { access_token,
 * utilisateur } + cookie refresh_token posé côté serveur) — pas besoin
 * de rappeler connecter() avec le nouveau mot de passe ensuite.
 *
 * ⚠️ NOTE D'INTÉGRATION : cet appel doit porter
 * `Authorization: Bearer <token_changement_mot_de_passe>` — PAS
 * l'access token de session habituel (il n'y en a justement pas
 * tant que le mot de passe temporaire n'est pas changé). Ceci
 * suppose que apiClient.js expose un moyen de forcer l'en-tête
 * Authorization d'un appel précis plutôt que d'utiliser l'access
 * token en mémoire par défaut (ex. option `authOverride` ci-dessous,
 * à adapter au nom réel exposé par apiClient.js si différent).
 *
 * @param {string} tokenChangementMotDePasse - reçu du connecter() précédent.
 * @param {string} nouveauMotDePasse
 * @returns {Promise<{message, access_token, utilisateur}>}
 */
export async function changerMotDePasseInitial(
  tokenChangementMotDePasse,
  nouveauMotDePasse
) {
  return apiFetch('/auth/changer-mot-de-passe-initial', {
    method: 'POST',
    body: { nouveau_mot_de_passe: nouveauMotDePasse },
    // Pas de session encore ouverte : ne pas tenter de refresh
    // silencieux ni d'injecter l'access token habituel sur cet appel.
    skipAuthRetry: true,
    authOverride: `Bearer ${tokenChangementMotDePasse}`,
  });
}

/**
 * POST /auth/refresh
 * Route publique, appuyée sur le refresh token en cookie httpOnly.
 * apiFetch déclenche déjà ceci automatiquement en silencieux sur un
 * 401 ; cette fonction n'est utile que pour un rafraîchissement
 * explicite (ex. restauration de session au chargement de l'app).
 * @returns {Promise<{access_token: string}>}
 */
export async function rafraichirToken() {
  return apiFetch('/auth/refresh', {
    method: 'POST',
    // Indispensable : sans ce flag, un 401 ici (visiteur jamais
    // connecté, pas de cookie de refresh) fait déclencher à apiFetch
    // sa propre logique de retry — qui rappelle POST /auth/refresh
    // une seconde fois pour rien, doublant l'appel et retardant/
    // perturbant tout ce qui attend la résolution de authStatus
    // (ex. le chargement des pays sur la page Rendez-vous).
    skipAuthRetry: true,
  });
}

/**
 * GET /auth/me
 * Route protégée. Sert ici de simple vérification d'authentification :
 * si aucun access token valide (ni refresh possible), apiFetch rejette
 * avec une erreur .status 401.
 */
export async function obtenirProfilCourant() {
  const data = await apiFetch('/auth/me');
  return data.utilisateur;
}

/**
 * POST /auth/logout
 */
export async function deconnecter() {
  return apiFetch('/auth/logout', {
    method: 'POST',
    // Même logique que login/refresh : pas de retry sur logout lui-même.
    skipAuthRetry: true,
  });
}

export default {
  ROLES_ADMINISTRABLES,
  inscrirePatient,
  creerCompteAdministre,
  connecter,
  changerMotDePasseInitial,
  rafraichirToken,
  obtenirProfilCourant,
  deconnecter,
};