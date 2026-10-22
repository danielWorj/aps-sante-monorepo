// src/pages/AvisLaboratoire.jsx
//
// Modération des avis déposés sur les laboratoires (GET/PATCH
// /admin/avis-laboratoire). Un avis n'est visible du public qu'une fois
// « publié » ; un avis modifié par son auteur revient « en attente ».

import { useCallback, useEffect, useState } from 'react';
import { useConfirmation, useToast } from '../components/feedback';
import {
  STATUTS_MODERATION_AVIS,
  listerAvisLaboratoire,
  listerLaboratoiresAdmin,
  modererAvisLaboratoire,
  supprimerAvisLaboratoire,
} from '../services/laboratoireService';

const META = Object.fromEntries(STATUTS_MODERATION_AVIS.map((s) => [s.valeur, s]));
const LIMITE = 20;

function Etoiles({ note }) {
  return (
    <span aria-label={`${note} sur 5`} style={{ color: '#E0A100', whiteSpace: 'nowrap' }}>
      {[1, 2, 3, 4, 5].map((n) => <i key={n} className={`fa-${n <= note ? 'solid' : 'regular'} fa-star`}></i>)}
    </span>
  );
}

export default function AvisLaboratoire() {
  const confirmer = useConfirmation();
  const toast = useToast();
  const [statut, setStatut] = useState('en_attente');
  const [laboratoireId, setLaboratoireId] = useState('');
  const [page, setPage] = useState(1);
  const [donnees, setDonnees] = useState(null);
  const [labos, setLabos] = useState([]);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(
    () => listerAvisLaboratoire({ statut_moderation: statut, laboratoire_id: laboratoireId, page, limite: LIMITE })
      .then((d) => { setDonnees(d); setErreur(null); })
      .catch((err) => setErreur(err.message || 'Avis indisponibles.')),
    [statut, laboratoireId, page]
  );

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { listerLaboratoiresAdmin({}).then(setLabos).catch(() => setLabos([])); }, []);

  const moderer = async (avis, nouveau) => {
    try {
      await modererAvisLaboratoire(avis.avis_id, nouveau);
      toast.succes(nouveau === 'publie' ? 'Avis publié.' : nouveau === 'rejete' ? 'Avis rejeté.' : 'Avis remis en attente.');
      charger();
    } catch (err) {
      toast.erreur(err.message || 'Modération impossible.');
    }
  };

  const supprimer = async (avis) => {
    const ok = await confirmer({
      titre: "Supprimer l'avis",
      message: 'Cet avis sera supprimé définitivement.',
      labelConfirmer: 'Supprimer',
      variante: 'danger',
    });
    if (!ok) return;
    try {
      await supprimerAvisLaboratoire(avis.avis_id);
      toast.succes('Avis supprimé.');
      charger();
    } catch (err) {
      toast.erreur(err.message || 'Suppression impossible.');
    }
  };

  const nbPages = donnees ? Math.max(1, Math.ceil(donnees.total / LIMITE)) : 1;

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <nav className="aps-breadcrumb">
            <span>Annuaire &amp; Utilisateurs</span><span className="sep">/</span>
            <span>Laboratoires</span><span className="sep">/</span><span>Avis</span>
          </nav>
          <h1>Avis sur les laboratoires</h1>
          <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
            Un avis n&apos;est visible sur la fiche publique qu&apos;après publication.
          </p>
        </div>
      </div>

      <div className="aps-card mb-3">
        <div className="aps-card__body">
          <div className="row g-3 align-items-end">
            <div className="col-md-6">
              <label className="form-label">Statut</label>
              <div className="d-flex gap-2 flex-wrap">
                {STATUTS_MODERATION_AVIS.map((s) => (
                  <button key={s.valeur} type="button"
                    className={`btn btn-sm ${statut === s.valeur ? 'btn-primary' : 'btn-light'}`}
                    onClick={() => { setStatut(s.valeur); setPage(1); }}>
                    {s.libelle} {donnees?.compteurs ? `(${donnees.compteurs[s.valeur] ?? 0})` : ''}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-md-6">
              <label className="form-label">Laboratoire</label>
              <select className="form-select" value={laboratoireId} onChange={(e) => { setLaboratoireId(e.target.value); setPage(1); }}>
                <option value="">Tous les laboratoires</option>
                {labos.map((l) => <option key={l.laboratoire_id} value={l.laboratoire_id}>{l.nom}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {erreur && <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreur}</div></div>}
      {!donnees && !erreur && <div className="aps-text-muted">Chargement…</div>}

      {donnees && (
        <div className="aps-card">
          <div className="table-responsive">
            <table className="aps-table table mb-0">
              <thead>
                <tr><th>Date</th><th>Laboratoire</th><th>Auteur</th><th>Note</th><th style={{ minWidth: 260 }}>Commentaire</th><th>Statut</th><th className="text-end">Actions</th></tr>
              </thead>
              <tbody>
                {donnees.avis.length === 0 && (
                  <tr><td colSpan={7} className="text-center aps-text-muted py-4">Aucun avis.</td></tr>
                )}
                {donnees.avis.map((a) => (
                  <tr key={a.avis_id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(a.date_creation).toLocaleDateString('fr-FR')}</td>
                    <td>{a.laboratoire?.nom}</td>
                    <td>
                      {a.utilisateur?.prenom} {a.utilisateur?.nom}
                      <div className="aps-text-muted" style={{ fontSize: 12 }}>{a.utilisateur?.email}</div>
                    </td>
                    <td><Etoiles note={a.note} /></td>
                    <td style={{ whiteSpace: 'pre-line', fontSize: 13 }}>{a.commentaire || <span className="aps-text-muted">Sans commentaire</span>}</td>
                    <td><span className={`aps-badge ${META[a.statut_moderation]?.badge}`}>{META[a.statut_moderation]?.libelle}</span></td>
                    <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                      {a.statut_moderation !== 'publie' && (
                        <button type="button" className="btn btn-sm btn-success me-1" title="Publier" onClick={() => moderer(a, 'publie')}>
                          <i className="fa-solid fa-check"></i>
                        </button>
                      )}
                      {a.statut_moderation !== 'rejete' && (
                        <button type="button" className="btn btn-sm btn-outline-danger me-1" title="Rejeter" onClick={() => moderer(a, 'rejete')}>
                          <i className="fa-solid fa-ban"></i>
                        </button>
                      )}
                      <button type="button" className="btn btn-sm btn-light" title="Supprimer" onClick={() => supprimer(a)}>
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nbPages > 1 && (
            <div className="aps-pagination">
              <div>Page <strong>{page}</strong> sur <strong>{nbPages}</strong></div>
              <div className="pages">
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}><i className="fa-solid fa-chevron-left"></i></button>
                <button type="button" disabled={page >= nbPages} onClick={() => setPage(page + 1)}><i className="fa-solid fa-chevron-right"></i></button>
              </div>
              <div />
            </div>
          )}
        </div>
      )}
    </main>
  );
}
