// Petits.jsx — petites visualisations du tableau de bord médecin :
//   Sparkline     : tendance d'une tuile (une série, sans axe) ;
//   Variation     : écart en % avec la période précédente (icône + signe) ;
//   Entonnoir     : parcours visiteur -> consultation, taux entre étapes ;
//   CarteCreneaux : jour de la semaine × tranche de la journée (une teinte,
//                   du clair au foncé).

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/** @param {{ valeurs: (number|null)[], libelle: string }} props */
export function Sparkline({ valeurs, libelle }) {
  const v = valeurs.map((x) => x ?? 0);
  if (v.length < 2 || v.every((x) => x === 0)) return <span className="sparkline is-vide" aria-hidden="true" />;
  const W = 96;
  const H = 30;
  const max = Math.max(...v);
  const min = Math.min(...v);
  const y = (x) => H - 3 - ((x - min) / Math.max(1, max - min)) * (H - 6);
  const pts = v.map((x, i) => [(i / (v.length - 1)) * (W - 4) + 2, y(x)]);
  const d = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
  const [fx, fy] = pts[pts.length - 1];
  return (
    <svg className="sparkline" width={W} height={H} role="img" aria-label={libelle}>
      <path d={`${d} L${fx},${H} L2,${H} Z`} className="spark-aire" />
      <path d={d} className="spark-ligne" />
      <circle cx={fx} cy={fy} r={3} className="spark-point" />
    </svg>
  );
}

/**
 * @param {{ valeur: number|null, inverse?: boolean, suffixe?: string }} props
 *   inverse : une hausse est une mauvaise nouvelle (annulations).
 */
export function Variation({ valeur, inverse = false, suffixe = 'vs période précédente' }) {
  if (valeur === null || valeur === undefined) {
    return <span className="variation is-neutre">— <span className="variation-suffixe">{suffixe}</span></span>;
  }
  const sens = valeur === 0 ? 'neutre' : (valeur > 0) !== inverse ? 'positif' : 'negatif';
  const icone = valeur === 0 ? 'fa-minus' : valeur > 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
  return (
    <span className={`variation is-${sens}`}>
      <i className={`fa-solid ${icone}`} aria-hidden="true" />
      {valeur > 0 ? '+' : ''}{valeur} %
      <span className="variation-suffixe"> {suffixe}</span>
    </span>
  );
}

/** @param {{ etapes: { libelle: string, icone: string, valeur: number }[] }} props */
export function Entonnoir({ etapes }) {
  const base = Math.max(1, etapes[0]?.valeur ?? 0);
  return (
    <ol className="entonnoir">
      {etapes.map((e, i) => {
        const prec = i > 0 ? etapes[i - 1].valeur : null;
        const taux = prec ? Math.round((e.valeur / prec) * 1000) / 10 : null;
        return (
          <li key={e.libelle} className="ent-etape">
            <div className="ent-entete">
              <span className="ent-libelle"><i className={`fa-solid ${e.icone}`} aria-hidden="true" /> {e.libelle}</span>
              <span className="ent-valeur">{e.valeur.toLocaleString('fr-FR')}</span>
            </div>
            <div className="ent-piste" aria-hidden="true">
              <span style={{ width: `${Math.max(e.valeur ? 1.5 : 0, (e.valeur / base) * 100)}%` }} />
            </div>
            {i > 0 && (
              <div className="ent-taux">
                {taux === null ? '—' : `${taux.toLocaleString('fr-FR')} %`} <span>de l&apos;étape précédente</span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** @param {{ carte: { tranches: {cle, libelle}[], grille: number[][], total: number } }} props */
export function CarteCreneaux({ carte }) {
  const max = Math.max(1, ...carte.grille.flat());
  let meilleur = null;
  carte.grille.forEach((ligne, j) => ligne.forEach((v, t) => {
    if (v && (!meilleur || v > meilleur.v)) meilleur = { v, j, t };
  }));

  return (
    <div className="carte-creneaux">
      <table>
        <caption className="visually-hidden">Rendez-vous payés par jour de la semaine et moment de la journée</caption>
        <thead>
          <tr>
            <th scope="col"><span className="visually-hidden">Jour</span></th>
            {carte.tranches.map((t) => <th key={t.cle} scope="col">{t.libelle}</th>)}
          </tr>
        </thead>
        <tbody>
          {carte.grille.map((ligne, j) => (
            <tr key={JOURS[j]}>
              <th scope="row">{JOURS[j].slice(0, 3)}.</th>
              {ligne.map((v, t) => {
                const intensite = v ? 14 + Math.round((v / max) * 76) : 0;
                return (
                  <td key={carte.tranches[t].cle}>
                    <span
                      className={`cc-case ${intensite > 52 ? 'is-fonce' : ''} ${v ? '' : 'is-vide'}`}
                      style={v ? { '--cc-intensite': `${intensite}%` } : undefined}
                      title={`${JOURS[j]}, ${carte.tranches[t].libelle.toLowerCase()} : ${v} rendez-vous`}
                    >
                      {v || ''}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="cc-note">
        {meilleur
          ? <>Moment le plus demandé : <strong>{JOURS[meilleur.j].toLowerCase()} {carte.tranches[meilleur.t].libelle.toLowerCase()}</strong> ({meilleur.v} RDV).</>
          : 'Aucun rendez-vous payé sur la période.'}
      </p>
    </div>
  );
}
