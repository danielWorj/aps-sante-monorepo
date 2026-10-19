// ResumeNotes.jsx — synthèse des notes d'un médecin : note moyenne, nombre
// d'avis, répartition 5 → 1 (cliquable pour filtrer), moyenne par critère et
// taux de recommandation. Données : `resume` renvoyé par le serveur
// (resumeNotes, services/avisMedecin.service.js).
import { Etoiles } from './Etoiles';
import { CRITERES_AVIS } from '../../services/reputationMedecinService';

const fr1 = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

/**
 * @param {{ resume: object, filtreNote?: number|null, onFiltrerNote?: (n: number|null) => void }} props
 */
export default function ResumeNotes({ resume, filtreNote = null, onFiltrerNote }) {
  const { nombre, moyenne, distribution, criteres, taux_recommandation, recommandations_exprimees } = resume;
  const max = Math.max(1, ...Object.values(distribution));
  const criteresRenseignes = CRITERES_AVIS.filter((c) => criteres[c.cle] !== null);

  if (!nombre) {
    return (
      <div className="resume-notes resume-notes-vide">
        <div className="resume-vide-icone"><i className="fa-regular fa-star" /></div>
        <div>
          <strong>Pas encore d&apos;avis</strong>
          <p className="mb-0">Les avis sont déposés par des patients après une consultation réalisée via APS Santé.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="resume-notes">
      <div className="resume-score">
        <div className="resume-score-valeur">{fr1(moyenne)}<span>/5</span></div>
        <Etoiles valeur={moyenne} taille="lg" />
        <div className="resume-score-nombre">{nombre.toLocaleString('fr-FR')} avis vérifiés</div>
        {taux_recommandation !== null && (
          <div className="resume-reco" title={`${recommandations_exprimees} patients se sont prononcés`}>
            <i className="fa-solid fa-thumbs-up" /> <strong>{taux_recommandation} %</strong> recommandent
          </div>
        )}
      </div>

      <div className="resume-distribution" role="group" aria-label="Répartition des notes">
        {[5, 4, 3, 2, 1].map((n) => {
          const nb = distribution[n] ?? 0;
          const actif = filtreNote === n;
          const contenu = (
            <>
              <span className="rd-libelle">{n} <i className="fa-solid fa-star" /></span>
              <span className="rd-piste"><span style={{ width: `${(nb / max) * 100}%` }} /></span>
              <span className="rd-nombre">{nb.toLocaleString('fr-FR')}</span>
            </>
          );
          return onFiltrerNote ? (
            <button
              key={n}
              type="button"
              className={`rd-ligne ${actif ? 'is-actif' : ''}`}
              aria-pressed={actif}
              disabled={!nb && !actif}
              onClick={() => onFiltrerNote(actif ? null : n)}
              aria-label={`${n} étoile${n > 1 ? 's' : ''} : ${nb} avis${actif ? ' (filtre actif)' : ''}`}
            >
              {contenu}
            </button>
          ) : (
            <div key={n} className="rd-ligne">{contenu}</div>
          );
        })}
      </div>

      {criteresRenseignes.length > 0 && (
        <div className="resume-criteres">
          {criteresRenseignes.map((c) => (
            <div key={c.cle} className="rc-ligne">
              <div className="rc-entete">
                <span><i className={`fa-solid ${c.icone}`} /> {c.libelle}</span>
                <strong>{fr1(criteres[c.cle])}</strong>
              </div>
              <div className="rc-piste" role="meter" aria-valuemin={0} aria-valuemax={5} aria-valuenow={criteres[c.cle]} aria-label={c.libelle}>
                <span style={{ width: `${(criteres[c.cle] / 5) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
