// src/utils/montants.js
// Politique de fonds v2 — arrondis monétaires partagés par les services
// purs (politiqueFonds, fraisAgregateur). Module SANS dépendance (ni
// Prisma ni Stripe) pour rester testable sans base ni clés API.

// Devises « zéro-décimale » (miroir de DEVISES_ZERO_DECIMALE dans
// lib/stripeService.js, dupliqué ici volontairement : stripeService
// instancie le client Stripe à l'import, ce qui interdirait les tests
// purs). XAF/XOF sont les devises réellement utilisées par APS.
const DEVISES_ZERO_DECIMALE = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg",
  "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/**
 * Nombre de décimales à utiliser pour un montant : 0 pour CamPay
 * (XAF, l'API refuse les décimales — ER201) et pour toute devise
 * zéro-décimale, 2 sinon (Decimal(12, 2) en base).
 * @param {{ fournisseur?: string|null, devise?: string|null }} p
 * @returns {0|2}
 */
export function decimalesPourMontant({ fournisseur, devise } = {}) {
  if (fournisseur === "campay") return 0;
  if (devise && DEVISES_ZERO_DECIMALE.has(String(devise).toLowerCase())) return 0;
  return 2;
}

/**
 * Arrondi commercial (moitié vers le haut) à `decimales` décimales.
 * Deux protections contre le flottant : (1) on nettoie le bruit binaire
 * à 12 chiffres significatifs (10001 × 0,015 vaut 150,01499999999999 en
 * flottant, alors que le montant exact est 150,015) ; (2) le décalage
 * se fait par notation exponentielle plutôt que par multiplication.
 */
export function arrondir(valeur, decimales = 2) {
  const propre = Number(Number(valeur).toPrecision(12));
  return Number(Math.round(Number(`${propre.toFixed(10)}e${decimales}`)) + `e-${decimales}`);
}