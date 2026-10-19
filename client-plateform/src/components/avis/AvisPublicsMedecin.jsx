// AvisPublicsMedecin.jsx — onglet « Avis » de la fiche publique d'un
// médecin (GET /medecins/:id/avis) : synthèse des notes, filtre par note
// (clic sur la répartition), tri, « Voir plus » (pages de 5).
import { useCallback, useEffect, useState } from 'react';
import ResumeNotes from './ResumeNotes';
import CarteAvis from './CarteAvis';
import { listerAvisPublics } from '../../services/reputationMedecinService';

const TRIS = [
  { cle: 'recent', libelle: 'Plus récents' },
  { cle: 'note_haute', libelle: 'Meilleures notes' },
  { cle: 'note_basse', libelle: 'Notes les plus basses' },
];

/** @param {{ medecinId: string, nomMedecin: string }} props */
export default function AvisPublicsMedecin({ medecinId, nomMedecin }) {
  const [filtres, setFiltres] = useState({ note: null, tri: 'recent' });
  const [page, setPage] = useState(1);
  const [resume, setResume] = useState(null);
  const [avis, setAvis] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [pageChargee, setPageChargee] = useState(null);
  const [erreur, setErreur] = useState(null);

  // « En chargement » = la dernière page reçue n'est pas celle demandée.
  const chargement = pageChargee !== page;
  const charger = useCallback(
    (numero) =>
      listerAvisPublics(medecinId, { ...filtres, page: numero })
        .then((d) => {
          setResume(d.resume);
          setAvis((prec) => (numero === 1 ? d.avis : [...prec, ...d.avis]));
          setPagination(d.pagination);
          setErreur(null);
        })
        .catch((err) => setErreur(err?.message || 'Avis indisponibles.'))
        .finally(() => setPageChargee(numero)),
    [medecinId, filtres]
  );

  useEffect(() => { charger(1); }, [charger]);

  const filtrer = (patch) => { setPage(1); setPageChargee(null); setFiltres((f) => ({ ...f, ...patch })); };
  const voirPlus = () => { const p = page + 1; setPage(p); charger(p); };

  if (erreur && !resume) {
    return <div className="info-card"><p className="mb-0 text-faint">{erreur}</p></div>;
  }
  if (!resume) {
    return <div className="info-card text-center py-4"><div className="spinner-border spinner-border-sm text-primary" role="status" /></div>;
  }

  return (
    <div className="avis-publics">
      <div className="info-card">
        <ResumeNotes resume={resume} filtreNote={filtres.note} onFiltrerNote={(note) => filtrer({ note })} />
      </div>

      {resume.nombre > 0 && (
        <>
          <div className="avis-publics-barre">
            <span className="text-faint small">
              {pagination?.total ?? 0} avis{filtres.note ? ` à ${filtres.note} étoile${filtres.note > 1 ? 's' : ''}` : ''}
              {filtres.note && (
                <button type="button" className="btn btn-link btn-sm p-0 ms-2" onClick={() => filtrer({ note: null })}>Tout afficher</button>
              )}
            </span>
            <select className="form-select form-select-sm" style={{ width: 'auto' }} value={filtres.tri} onChange={(e) => filtrer({ tri: e.target.value })} aria-label="Trier les avis">
              {TRIS.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
            </select>
          </div>

          <div className="avis-publics-liste">
            {avis.map((a) => <CarteAvis key={a.avis_id} avis={a} nomMedecin={nomMedecin} />)}
          </div>

          {pagination && pagination.page < pagination.pages && (
            <div className="text-center mt-3">
              <button type="button" className="btn btn-outline-primary btn-sm-aps" onClick={voirPlus} disabled={chargement}>
                {chargement && <span className="spinner-border spinner-border-sm me-1" />}Voir plus d&apos;avis
              </button>
            </div>
          )}
        </>
      )}

      <p className="avis-publics-note">
        <i className="fa-solid fa-shield-halved" /> Seuls les patients ayant consulté ce médecin via APS Santé peuvent laisser un avis.
        Chaque avis est vérifié avant publication.
      </p>
    </div>
  );
}
