// src/utils/mobileMoney.js
//
// Helpers Mobile Money (CamPay) côté client.
// Miroir de `normaliserNumeroCM` (server/src/lib/campayService.js) : ces
// contrôles ne servent qu'au confort de saisie. Le serveur revalide toujours
// (erreur ER101) — ne jamais s'y fier pour la sécurité.

/** Retire espaces, points, tirets, parenthèses et « + ». */
function nettoyer(saisie) {
  return String(saisie ?? '').replace(/[\s.\-()+]/g, '');
}

/**
 * Numéro saisi -> format CamPay `2376XXXXXXXX`.
 * Accepte `6XXXXXXXX` (9 chiffres) ou `2376XXXXXXXX`.
 * @returns {string|null} le numéro normalisé, ou null s'il est invalide.
 */
export function normaliserNumeroCM(saisie) {
  const chiffres = nettoyer(saisie);
  if (/^6\d{8}$/.test(chiffres)) return `237${chiffres}`;
  if (/^2376\d{8}$/.test(chiffres)) return chiffres;
  return null;
}

/** true si la saisie est un mobile camerounais exploitable. */
export function estNumeroCMValide(saisie) {
  return normaliserNumeroCM(saisie) !== null;
}

/**
 * Formate pour l'affichage : `237677123456` / `677123456` -> `6 77 12 34 56`.
 * Si la saisie est invalide, elle est renvoyée telle quelle.
 */
export function formaterNumeroAffichage(saisie) {
  const norm = normaliserNumeroCM(saisie);
  if (!norm) return String(saisie ?? '');
  const local = norm.slice(3); // 9 chiffres
  return `${local[0]} ${local.slice(1, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}