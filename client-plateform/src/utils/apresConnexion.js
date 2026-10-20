// src/utils/apresConnexion.js
//
// Où aller après une connexion réussie (numéro + PIN ou email + mot de passe) :
//   1. connexion par email d'un compte sans PIN : proposer de créer son
//      numéro de connexion + code PIN (« Plus tard » possible) ;
//   2. page demandée avant la connexion (`retour`), si elle existe et que
//      le rôle de la session peut l'ouvrir (sinon on l'ignore : la page
//      d'un autre compte ou d'un autre espace finirait sur un refus) ;
//   3. plusieurs espaces : « Choisir mon espace » ;
//   4. sinon l'accueil de l'unique espace (ou du rôle).
import { accueilEspace, accueilParRole, cheminAccessible } from './roles';

const ROLES_SANS_PIN = ['admin', 'superadmin'];

/** Chemin interne sûr à partir de `location.state.from` (chaîne ou objet location). */
export function cheminRetour(from) {
  const retour = typeof from === 'string' ? from : from?.pathname ? `${from.pathname}${from.search ?? ''}` : null;
  return typeof retour === 'string' && retour.startsWith('/') && !retour.startsWith('//') ? retour : null;
}

/**
 * @param {{ utilisateur: object, espaces: object[], retour?: string|null, proposerPin?: boolean }} p
 * @returns {{ to: string, state?: object }}
 */
export function destinationApresConnexion({ utilisateur, espaces = [], retour = null, proposerPin = false }) {
  const role = utilisateur?.role;
  if (proposerPin && !utilisateur?.pin_defini && !ROLES_SANS_PIN.includes(role)) {
    return { to: '/creer-mon-pin', state: { retour } };
  }
  return destinationEspace({ role, espaces, retour });
}

/** Étapes 2 à 4 seulement (après la création du PIN, ou « Plus tard »). */
export function destinationEspace({ role, espaces = [], retour = null }) {
  if (retour && cheminAccessible(retour, role)) return { to: retour };
  if (espaces.length > 1) return { to: '/choisir-espace' };
  if (espaces.length === 1) return { to: accueilEspace(espaces[0]) };
  return { to: accueilParRole(role) };
}
