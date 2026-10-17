// src/lib/dates.js
// Calculs de dates calendaires en UTC (abonnements assurances — guide v3,
// §1.5.6). Module SANS dépendance : testable sans base.

/**
 * Ajoute `n` mois à une date en bornant le jour au dernier jour du mois
 * cible : 31 janvier + 1 mois = 28 (ou 29) février, jamais 3 mars.
 * @param {Date} date
 * @param {number} n
 * @returns {Date} minuit UTC
 */
export function ajouterMois(date, n) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1));
  const dernierJour = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(date.getUTCDate(), dernierJour));
  return d;
}

/** Ajoute `n` jours (n peut être négatif). @returns {Date} */
export function ajouterJours(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/** Nombre de jours entiers entre deux dates à minuit UTC (b − a). */
export function joursEntre(a, b) {
  return Math.round((b - a) / 86_400_000);
}
