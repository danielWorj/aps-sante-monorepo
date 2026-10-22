// src/utils/roles.js
//
// Seuls ces rôles ont accès au back-office. Le refresh token (cookie
// httpOnly) peut être partagé avec la plateforme publique : une session
// patient/médecin/agent/annonceur ne doit JAMAIS ouvrir l'espace admin.
// Le serveur reste l'autorité (routes admin protégées par autoriser()).
import { estRole } from '../context/AuthContext';

export const ROLES_BACK_OFFICE = ['admin', 'superadmin'];

export const MESSAGE_ACCES_REFUSE = 'Ce compte n’a pas accès à l’espace d’administration.';

export function estAdministrateur(user) {
  return Boolean(estRole(user, ...ROLES_BACK_OFFICE));
}

// ABAC : un admin gère les données de SON pays ; un superadmin gère tout.
// Ces écrans portent des réglages communs à tous les pays (catalogues,
// canaux d'envoi, application mobile…) : le serveur les réserve au
// superadmin (autoriser("superadmin")), le menu les masque donc à l'admin.
export const ROUTES_SUPERADMIN = [
  '/annonces',
  '/apk',
  '/whatsapp',
  '/sms',
  '/messages-contact',
  '/documents-legaux',
  '/emplacement-publicitaire',
  '/niveaux-abonnement-assurance',
  '/niveaux-abonnement-presence',
];

export function estSuperadmin(user) {
  return Boolean(estRole(user, 'superadmin'));
}

/** Vrai si `chemin` est un écran réservé au superadmin. */
export function estRouteSuperadmin(chemin) {
  return ROUTES_SUPERADMIN.some((r) => chemin === r || chemin.startsWith(`${r}/`));
}
