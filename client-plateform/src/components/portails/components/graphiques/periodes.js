// periodes.js — libellés des seaux du tableau de bord médecin (jour /
// semaine / mois), dates en UTC comme côté serveur.

const opts = (o) => ({ ...o, timeZone: 'UTC' });
const d = (iso) => new Date(`${iso}T00:00:00Z`);

/** Libellé court sous l'axe : « 12 oct. », « 12 oct. » (lundi), « oct. 26 ». */
export function libelleAxe(seau, granularite) {
  if (granularite === 'mois') return d(seau.cle).toLocaleDateString('fr-FR', opts({ month: 'short', year: '2-digit' }));
  return d(seau.debut).toLocaleDateString('fr-FR', opts({ day: 'numeric', month: 'short' }));
}

/** Libellé complet d'un seau (info-bulle, tableau). */
export function libellePeriode(seau, granularite) {
  if (granularite === 'jour') {
    return d(seau.debut).toLocaleDateString('fr-FR', opts({ weekday: 'long', day: 'numeric', month: 'long' }));
  }
  if (granularite === 'mois' && seau.debut.slice(8) === '01' && seau.cle === seau.debut) {
    const finMois = new Date(Date.UTC(d(seau.cle).getUTCFullYear(), d(seau.cle).getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    if (seau.fin === finMois) return d(seau.cle).toLocaleDateString('fr-FR', opts({ month: 'long', year: 'numeric' }));
  }
  const court = (iso) => d(iso).toLocaleDateString('fr-FR', opts({ day: 'numeric', month: 'short' }));
  return seau.debut === seau.fin ? court(seau.debut) : `Du ${court(seau.debut)} au ${court(seau.fin)}`;
}

/** Plage lisible d'une période : « du 20 sept. au 19 oct. 2026 ». */
export function plageLisible(du, au) {
  const long = (iso) => d(iso).toLocaleDateString('fr-FR', opts({ day: 'numeric', month: 'short', year: 'numeric' }));
  const court = (iso) => d(iso).toLocaleDateString('fr-FR', opts({ day: 'numeric', month: 'short' }));
  return du.slice(0, 4) === au.slice(0, 4) ? `du ${court(du)} au ${long(au)}` : `du ${long(du)} au ${long(au)}`;
}
