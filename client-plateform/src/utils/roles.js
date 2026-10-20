// src/utils/roles.js
//
// Référentiel unique des rôles côté plateforme : qui a accès à quel
// espace, et où renvoyer chaque rôle après connexion (ou s'il tente
// d'ouvrir l'espace d'un autre rôle). Les libellés sont ceux du claim
// `role` de l'access token / de GET /auth/me (table `role` côté serveur).
//
// Le serveur reste l'autorité (chaque route revérifie le rôle et la
// propriété des données) : ces gardes empêchent seulement d'afficher un
// espace qui n'est pas celui de l'utilisateur.

export const ROLES = Object.freeze({
  PATIENT: 'patient',
  MEDECIN: 'medecin',
  AGENT_ASSURANCE: 'agent_assurance',
  AGENT_PHARMACIE: 'agent_pharmacie',
  AGENT_STRUCTURE_SANTE: 'agent_structure_sante',
  ANNONCEUR: 'annonceur',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
});

// Rôles autorisés par espace (voir router.jsx).
export const ROLES_ESPACE = Object.freeze({
  patient: [ROLES.PATIENT],
  medecin: [ROLES.MEDECIN],
  // Salle de téléconsultation : les deux parties du rendez-vous.
  consultation: [ROLES.PATIENT, ROLES.MEDECIN],
  assurance: [ROLES.AGENT_ASSURANCE],
  pharmacie: [ROLES.AGENT_PHARMACIE],
  structure: [ROLES.AGENT_STRUCTURE_SANTE],
  // « Mes publicités » : tout compte non administrateur peut réserver un
  // espace publicitaire (ReserverPublicite.jsx) ; le serveur ne renvoie
  // que ses propres publicités. Les administrateurs modèrent depuis le
  // back-office.
  publicite: [
    ROLES.ANNONCEUR,
    ROLES.PATIENT,
    ROLES.MEDECIN,
    ROLES.AGENT_ASSURANCE,
    ROLES.AGENT_PHARMACIE,
    ROLES.AGENT_STRUCTURE_SANTE,
  ],
  // /mes-annonces : espaces sans portail dédié (les autres rôles ont la
  // rubrique dans leur portail).
  annonces: [ROLES.AGENT_PHARMACIE, ROLES.AGENT_STRUCTURE_SANTE, ROLES.ANNONCEUR],
});

const ACCUEIL_PAR_ROLE = Object.freeze({
  [ROLES.PATIENT]: '/portail/patient-rdv',
  [ROLES.MEDECIN]: '/portail/medecin-agenda',
  [ROLES.AGENT_ASSURANCE]: '/portail/assurance',
  [ROLES.AGENT_PHARMACIE]: '/mon-espace-pharmacie',
  [ROLES.AGENT_STRUCTURE_SANTE]: '/mon-espace-structure',
  [ROLES.ANNONCEUR]: '/portail/annonceur',
});

/** Page d'accueil de l'espace du rôle, ou '/home' s'il n'en a pas sur la plateforme. */
export function accueilParRole(role) {
  return ACCUEIL_PAR_ROLE[role] ?? '/home';
}

export function aUnRole(user, roles) {
  return Boolean(user?.role) && roles.includes(user.role);
}
