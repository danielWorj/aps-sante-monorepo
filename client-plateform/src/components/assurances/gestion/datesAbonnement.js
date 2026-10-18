// Dates d'abonnement (jours calendaires UTC, comme le serveur).

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

/** date_fin est exclusive : dernier jour couvert = veille. */
export function dernierJour(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
}
