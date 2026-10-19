// CourbeTemporelle.jsx — une série dans le temps (jour / semaine / mois),
// en aire (vues, visiteurs) ou en colonnes (comptes : RDV, consultations).
// Une seule série : pas de légende, le titre de la carte la nomme.
// Survol / focus clavier (flèches) : réticule ou colonne en relief + info-
// bulle ; valeur de fin étiquetée ; tableau des valeurs en repli.
import { useEffect, useRef, useState } from 'react';
import { libellePeriode, libelleAxe } from './periodes';

const HAUTEUR = 220;
const MARGES = { haut: 14, droite: 14, bas: 28, gauche: 38 };

/** Plafond « rond » et pas des graduations (0 / 5 / 10…, 0 / 1 k / 2 k…). */
function echelle(max) {
  if (max <= 0) return { plafond: 4, pas: 1 };
  const brut = max / 4;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * puissance).find((p) => p >= brut);
  const pasEntier = Math.max(1, pas);
  return { plafond: Math.ceil(max / pasEntier) * pasEntier, pas: pasEntier };
}

const compact = (n) =>
  n >= 1000 ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k` : n.toLocaleString('fr-FR');

/**
 * @param {{ serie: {cle: string, debut: string, fin: string, valeur: number|null}[],
 *   granularite: 'jour'|'semaine'|'mois', unite: string, forme?: 'aire'|'colonnes',
 *   formatValeur?: (n: number) => string, titreTableau?: string }} props
 */
export default function CourbeTemporelle({ serie, granularite, unite, forme = 'aire', formatValeur, titreTableau = 'Voir les valeurs' }) {
  const conteneur = useRef(null);
  const [largeur, setLargeur] = useState(640);
  const [actif, setActif] = useState(null);

  useEffect(() => {
    const el = conteneur.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setLargeur(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const libelleValeur = (v) => {
    if (v === null || v === undefined) return 'Aucune donnée';
    if (formatValeur) return formatValeur(v);
    return `${v.toLocaleString('fr-FR')} ${unite}${v > 1 ? 's' : ''}`;
  };

  const n = serie.length;
  const w = largeur - MARGES.gauche - MARGES.droite;
  const h = HAUTEUR - MARGES.haut - MARGES.bas;
  const max = Math.max(0, ...serie.map((p) => p.valeur ?? 0));
  const { plafond, pas } = echelle(max);
  const graduations = [];
  for (let t = 0; t <= plafond + 1e-9; t += pas) graduations.push(t);

  const bande = w / Math.max(1, n);
  const x = (i) => (forme === 'colonnes' ? MARGES.gauche + bande * (i + 0.5) : MARGES.gauche + (n === 1 ? w / 2 : (i / (n - 1)) * w));
  const y = (v) => MARGES.haut + h - (v / plafond) * h;

  const points = serie.map((p, i) => (p.valeur === null || p.valeur === undefined ? null : [x(i), y(p.valeur)]));

  // Tracé : segments interrompus sur les valeurs nulles (ex. note sans avis).
  const segments = [];
  let courant = [];
  points.forEach((pt) => {
    if (pt) courant.push(pt);
    else if (courant.length) { segments.push(courant); courant = []; }
  });
  if (courant.length) segments.push(courant);

  const etiquettes = (() => {
    if (n <= 1) return [0];
    const nb = Math.min(n, Math.max(2, Math.floor(w / 90)));
    const idx = new Set();
    for (let k = 0; k < nb; k += 1) idx.add(Math.round((k / (nb - 1)) * (n - 1)));
    return [...idx];
  })();

  const choisir = (clientX) => {
    const rect = conteneur.current.getBoundingClientRect();
    const px = clientX - rect.left - MARGES.gauche;
    const i = forme === 'colonnes' ? Math.floor(px / bande) : Math.round((px / w) * (n - 1));
    setActif(Math.max(0, Math.min(n - 1, i)));
  };

  const clavier = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setActif((a) => Math.min(n - 1, (a ?? -1) + 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setActif((a) => Math.max(0, (a ?? n) - 1)); }
    if (e.key === 'Home') { e.preventDefault(); setActif(0); }
    if (e.key === 'End') { e.preventDefault(); setActif(n - 1); }
    if (e.key === 'Escape') setActif(null);
  };

  const dernier = [...points].reverse().find(Boolean);
  const indexDernier = points.lastIndexOf(dernier);
  const pointActif = actif !== null ? serie[actif] : null;
  const epaisseur = Math.max(2, Math.min(24, bande - 2));

  return (
    <div className="courbe-temporelle">
      <div
        ref={conteneur}
        className="ct-zone"
        onPointerMove={(e) => choisir(e.clientX)}
        onPointerLeave={() => setActif(null)}
      >
        <svg
          width={largeur}
          height={HAUTEUR}
          role="img"
          tabIndex={0}
          aria-label={`Graphique : ${libelleValeur(serie.reduce((a, p) => a + (p.valeur ?? 0), 0))} sur la période. Flèches gauche et droite pour parcourir.`}
          onKeyDown={clavier}
          onBlur={() => setActif(null)}
        >
          {graduations.map((t) => (
            <g key={t}>
              <line x1={MARGES.gauche} x2={largeur - MARGES.droite} y1={y(t)} y2={y(t)} className="ct-grille" />
              <text x={MARGES.gauche - 8} y={y(t)} className="ct-graduation" textAnchor="end" dominantBaseline="middle">
                {compact(t)}
              </text>
            </g>
          ))}

          {forme === 'colonnes'
            ? serie.map((p, i) => {
                if (!p.valeur) return null;
                const hauteur = Math.max(2, (p.valeur / plafond) * h);
                const rayon = Math.min(4, epaisseur / 2, hauteur);
                const x0 = x(i) - epaisseur / 2;
                const y0 = MARGES.haut + h - hauteur;
                // Extrémité arrondie (4 px), base carrée.
                const d = `M${x0},${MARGES.haut + h} V${y0 + rayon} Q${x0},${y0} ${x0 + rayon},${y0} H${x0 + epaisseur - rayon} Q${x0 + epaisseur},${y0} ${x0 + epaisseur},${y0 + rayon} V${MARGES.haut + h} Z`;
                return <path key={p.cle} d={d} className={`ct-colonne ${actif === i ? 'is-actif' : ''} ${actif !== null && actif !== i ? 'is-attenue' : ''}`} />;
              })
            : segments.map((seg, k) => (
                <g key={k}>
                  {seg.length > 1 && (
                    <path
                      className="ct-aire"
                      d={`M${seg[0][0]},${MARGES.haut + h} ${seg.map(([a, b]) => `L${a},${b}`).join(' ')} L${seg[seg.length - 1][0]},${MARGES.haut + h} Z`}
                    />
                  )}
                  <path className="ct-ligne" d={seg.map(([a, b], j) => `${j ? 'L' : 'M'}${a},${b}`).join(' ')} />
                  {seg.length === 1 && <circle cx={seg[0][0]} cy={seg[0][1]} r={4} className="ct-point" />}
                </g>
              ))}

          <line x1={MARGES.gauche} x2={largeur - MARGES.droite} y1={MARGES.haut + h} y2={MARGES.haut + h} className="ct-base" />

          {etiquettes.map((i) => (
            <text
              key={serie[i].cle}
              x={x(i)}
              y={HAUTEUR - 8}
              className="ct-axe"
              textAnchor={forme === 'colonnes' ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            >
              {libelleAxe(serie[i], granularite)}
            </text>
          ))}

          {forme === 'aire' && actif !== null && (
            <line x1={x(actif)} x2={x(actif)} y1={MARGES.haut} y2={MARGES.haut + h} className="ct-reticule" />
          )}
          {forme === 'aire' && actif !== null && points[actif] && (
            <circle cx={points[actif][0]} cy={points[actif][1]} r={5} className="ct-point is-actif" />
          )}
          {forme === 'aire' && dernier && actif === null && (
            <>
              <circle cx={dernier[0]} cy={dernier[1]} r={4} className="ct-point" />
              <text x={dernier[0] - 8} y={dernier[1] - 10} className="ct-etiquette-fin" textAnchor="end">
                {formatValeur ? formatValeur(serie[indexDernier].valeur) : compact(serie[indexDernier].valeur)}
              </text>
            </>
          )}
        </svg>

        {pointActif && (
          <div
            className="ct-bulle"
            role="status"
            style={{
              left: Math.min(Math.max(x(actif), 80), largeur - 80),
              top: MARGES.haut - 6,
            }}
          >
            <strong>{libelleValeur(pointActif.valeur)}</strong>
            <span>{libellePeriode(pointActif, granularite)}</span>
          </div>
        )}
      </div>

      <details className="ct-tableau">
        <summary>{titreTableau}</summary>
        <table className="hours-table">
          <tbody>
            {[...serie].reverse().map((p) => (
              <tr key={p.cle}>
                <td>{libellePeriode(p, granularite)}</td>
                <td className="text-end">{libelleValeur(p.valeur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
