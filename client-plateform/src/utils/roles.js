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
  AGENT_LABORATOIRE: 'agent_laboratoire',
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
  laboratoire: [ROLES.AGENT_LABORATOIRE],
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
    ROLES.AGENT_LABORATOIRE,
  ],
  // Pages du compte lui-même (choisir son espace, créer son code PIN) :
  // tout compte non administrateur.
  compte: [
    ROLES.PATIENT,
    ROLES.MEDECIN,
    ROLES.AGENT_ASSURANCE,
    ROLES.AGENT_PHARMACIE,
    ROLES.AGENT_STRUCTURE_SANTE,
    ROLES.AGENT_LABORATOIRE,
    ROLES.ANNONCEUR,
  ],
  // /mes-annonces : espace annonceur (sans portail à rubriques) ; les autres
  // rôles ont la rubrique dans leur portail.
  annonces: [ROLES.ANNONCEUR],
});

const ACCUEIL_PAR_ROLE = Object.freeze({
  [ROLES.PATIENT]: '/portail/patient-rdv',
  [ROLES.MEDECIN]: '/portail/medecin-tableau-de-bord',
  [ROLES.AGENT_ASSURANCE]: '/portail/assurance',
  [ROLES.AGENT_PHARMACIE]: '/portail/pharmacie',
  [ROLES.AGENT_STRUCTURE_SANTE]: '/portail/structure',
  [ROLES.AGENT_LABORATOIRE]: '/portail/laboratoire',
  [ROLES.ANNONCEUR]: '/portail/annonceur',
});

// Page d'accueil de chaque type d'espace (voir GET /auth/espaces).
const ACCUEIL_PAR_ESPACE = Object.freeze({
  patient: '/portail/patient-rdv',
  medecin: '/portail/medecin-tableau-de-bord',
  assurance: '/portail/assurance',
  pharmacie: '/portail/pharmacie',
  structure: '/portail/structure',
  laboratoire: '/portail/laboratoire',
  publicites: '/portail/annonceur',
});

/** Page d'accueil d'un espace (objet renvoyé par GET /auth/espaces). */
export function accueilEspace(espace) {
  return ACCUEIL_PAR_ESPACE[espace?.type] ?? '/home';
}

/** Page d'accueil de l'espace du rôle, ou '/home' s'il n'en a pas sur la plateforme. */
export function accueilParRole(role) {
  return ACCUEIL_PAR_ROLE[role] ?? '/home';
}

export function aUnRole(user, roles) {
  return Boolean(user?.role) && roles.includes(user.role);
}

// Chemins privés -> rôles admis, dans le même ordre que les gardes de
// router.jsx (à tenir à jour avec lui). Sert à écarter une page de retour
// après connexion qui n'est pas celle du compte connecté (ex. retour vers
// le portail médecin mémorisé à la déconnexion, puis connexion patient).
const ROLES_PAR_CHEMIN = [
  [/^\/portail\/medecin-/, ROLES_ESPACE.medecin],
  [/^\/portail\/patient-/, ROLES_ESPACE.patient],
  [/^\/portail\/consultation\//, ROLES_ESPACE.consultation],
  [/^\/portail\/assurance/, ROLES_ESPACE.assurance],
  [/^\/portail\/laboratoire/, ROLES_ESPACE.laboratoire],
  [/^\/portail\/pharmacie/, ROLES_ESPACE.pharmacie],
  [/^\/portail\/structure/, ROLES_ESPACE.structure],
  [/^\/portail\/annonceur/, ROLES_ESPACE.publicite],
  [/^\/publicite\/[^/]+\/paiement/, ROLES_ESPACE.publicite],
  [/^\/mon-espace-assurance/, ROLES_ESPACE.assurance],
  [/^\/assurances\/[^/]+\/gestion/, ROLES_ESPACE.assurance],
  [/^\/mon-espace-pharmacie/, ROLES_ESPACE.pharmacie],
  [/^\/pharmacie\/[^/]+\/gestion/, ROLES_ESPACE.pharmacie],
  [/^\/mon-espace-structure/, ROLES_ESPACE.structure],
  [/^\/structure-sante\/[^/]+\/gestion/, ROLES_ESPACE.structure],
  [/^\/mes-annonces/, ROLES_ESPACE.annonces],
  [/^\/choisir-espace/, ROLES_ESPACE.compte],
];

/** Le rôle peut-il ouvrir ce chemin ? Toujours vrai pour une page publique. */
export function cheminAccessible(chemin, role) {
  const regle = ROLES_PAR_CHEMIN.find(([motif]) => motif.test(chemin));
  return !regle || (Boolean(role) && regle[1].includes(role));
}
