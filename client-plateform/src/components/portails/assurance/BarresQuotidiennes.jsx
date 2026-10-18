// BarresQuotidiennes.jsx — histogramme d'UNE série jour par jour (vues ou
// demandes) pour le tableau de bord du portail assurance. Une série = pas
// de légende (le titre la nomme) ; info-bulle au survol / focus de chaque
// barre ; tableau des valeurs en repli pour la lecture sans graphe.
import { useState } from 'react';

const jourCourt = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const jourLong = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * @param {{ titre: string, serie: {jour: string}[], cle: string, unite: string }} props
 *   unite : libellé au singulier (« vue », « demande ») — pluriel en « s ».
 */
export default function BarresQuotidiennes({ titre, serie, cle, unite }) {
  const [actif, setActif] = useState(null);
  const max = Math.max(1, ...serie.map((p) => p[cle]));
  const total = serie.reduce((a, p) => a + p[cle], 0);
  const libelle = (n) => `${n.toLocaleString('fr-FR')} ${unite}${n > 1 ? 's' : ''}`;
  const point = actif !== null ? serie[actif] : null;

  return (
    <figure className="barres-quotidiennes">
      <figcaption>
        <strong>{titre}</strong>
        <span className="text-faint"> · {libelle(total)} sur {serie.length} jours</span>
      </figcaption>
      <div className="bq-zone" onMouseLeave={() => setActif(null)}>
        <div className="bq-max text-faint" aria-hidden="true">{max.toLocaleString('fr-FR')}</div>
        <div className="bq-barres" role="list">
          {serie.map((p, i) => (
            <button
              key={p.jour}
              type="button"
              role="listitem"
              className={`bq-colonne ${actif === i ? 'is-actif' : ''}`}
              aria-label={`${jourLong(p.jour)} : ${libelle(p[cle])}`}
              onMouseEnter={() => setActif(i)}
              onFocus={() => setActif(i)}
              onBlur={() => setActif(null)}
            >
              <span className="bq-barre" style={{ height: p[cle] ? `${Math.max(4, (p[cle] / max) * 100)}%` : 0 }} />
            </button>
          ))}
        </div>
        {point && (
          <div className="bq-bulle" role="status" style={{ left: `${((actif + 0.5) / serie.length) * 100}%` }}>
            <span className="text-faint">{jourLong(point.jour)}</span>
            <strong>{libelle(point[cle])}</strong>
          </div>
        )}
      </div>
      <div className="bq-axe text-faint" aria-hidden="true">
        <span>{jourCourt(serie[0].jour)}</span>
        <span>{jourCourt(serie[serie.length - 1].jour)}</span>
      </div>
      <details className="mt-2">
        <summary className="small" style={{ cursor: 'pointer' }}>Voir les valeurs</summary>
        <table className="hours-table mt-2" style={{ width: '100%', fontSize: '.85rem' }}>
          <tbody>
            {[...serie].reverse().map((p) => (
              <tr key={p.jour}><td>{jourLong(p.jour)}</td><td>{libelle(p[cle])}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
