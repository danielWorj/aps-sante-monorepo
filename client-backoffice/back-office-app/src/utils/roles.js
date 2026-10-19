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
