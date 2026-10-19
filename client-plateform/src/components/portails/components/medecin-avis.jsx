// medecin-avis.jsx — portail médecin, « Avis & notes ».
//
// Avis PUBLIÉS des patients (GET /medecins/mon-espace/avis) : synthèse des
// notes (moyenne, répartition cliquable, critères, recommandation), liste
// filtrable et paginée. Le médecin peut répondre publiquement (une réponse,
// modifiable ou retirable) et signaler un avis à APS Santé ; il ne peut ni
// le modifier ni le masquer. Les avis en attente de modération ne sont que
// comptés (contenu pas encore vérifié).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortailSidebar from '../layouts/portail-sidebar';
import ResumeNotes from '../../avis/ResumeNotes';
import CarteAvis from '../../avis/CarteAvis';
import { useAuth } from '../../../context/AuthContext';
import { useConfirmation, useSaisie, useToast } from '../../feedback';
import {
  REPONSE_AVIS_MAX,
  listerMesAvisMedecin,
  repondreAvis,
  signalerAvis,
  supprimerReponseAvis,
} from '../../../services/reputationMedecinService';

const FILTRES_REPONSE = [
  { cle: '', libelle: 'Tous' },
  { cle: 'sans', libelle: 'Sans réponse' },
  { cle: 'avec', libelle: 'Avec réponse' },
];
const TRIS = [
  { cle: 'recent', libelle: 'Plus récents' },
  { cle: 'ancien', libelle: 'Plus anciens' },
  { cle: 'note_basse', libelle: 'Notes les plus basses' },
  { cle: 'note_haute', libelle: 'Notes les plus hautes' },
];

export default function MedecinAvis() {
  const { user } = useAuth();
  const toast = useToast();
  const confirmer = useConfirmation();
  const saisir = useSaisie();

  const [filtres, setFiltres] = useState({ note: null, reponse: '', commentaire: '', tri: 'recent', page: 1 });
  const [donnees, setDonnees] = useState(null);
  const [filtresCharges, setFiltresCharges] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [edition, setEdition] = useState(null); // { avis_id, texte }
  const [envoi, setEnvoi] = useState(false);

  const nomMedecin = `Dr ${user?.prenom ?? ''} ${user?.nom ?? ''}`.trim();

  // « En chargement » = la liste affichée n'est pas celle des filtres courants.
  const chargement = filtresCharges !== filtres;
  const charger = useCallback(
    () =>
      listerMesAvisMedecin(filtres)
        .then((d) => { setDonnees(d); setErreur(null); })
        .catch((err) => setErreur(err?.status === 404 ? "Aucune fiche médecin n'est associée à ce compte." : err?.message || 'Avis indisponibles.'))
        .finally(() => setFiltresCharges(filtres)),
    [filtres]
  );
  useEffect(() => { charger(); }, [charger]);

  const filtrer = (patch) => setFiltres((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));

  const remplacerAvis = (avis) =>
    setDonnees((d) => ({
      ...d,
      avis: d.avis.map((a) => (a.avis_id === avis.avis_id ? { ...a, ...avis } : a)),
    }));

  const enregistrerReponse = async () => {
    const texte = edition.texte.trim();
    if (!texte) return;
    setEnvoi(true);
    try {
      const r = await repondreAvis(edition.avis_id, texte);
      const etaitSansReponse = !donnees.avis.find((a) => a.avis_id === edition.avis_id)?.reponse;
      remplacerAvis(r.avis);
      if (etaitSansReponse) setDonnees((d) => ({ ...d, sans_reponse: Math.max(0, d.sans_reponse - 1) }));
      setEdition(null);
      toast.succes('Réponse publiée sous l’avis.');
    } catch (err) {
      toast.erreur(err?.message || 'Réponse non enregistrée.');
    } finally {
      setEnvoi(false);
    }
  };

  const retirerReponse = async (avis) => {
    if (!(await confirmer({
      titre: 'Retirer votre réponse',
      message: 'Votre réponse ne sera plus visible sous cet avis. Vous pourrez en écrire une nouvelle.',
      labelConfirmer: 'Retirer',
      variante: 'danger',
    }))) return;
    try {
      const r = await supprimerReponseAvis(avis.avis_id);
      remplacerAvis(r.avis);
      setDonnees((d) => ({ ...d, sans_reponse: d.sans_reponse + 1 }));
      toast.succes('Réponse retirée.');
    } catch (err) {
      toast.erreur(err?.message || 'Impossible de retirer la réponse.');
    }
  };

  const signaler = async (avis) => {
    const motif = await saisir({
      titre: 'Signaler cet avis',
      label: 'Pourquoi cet avis ne respecte-t-il pas les règles ? (propos injurieux, personne inconnue, informations médicales…)',
      placeholder: 'Décrivez le problème (10 caractères au moins)',
      labelConfirmer: 'Signaler',
      multiligne: true,
      obligatoire: true,
      maxLength: 500,
      valider: (v) => (v.trim().length < 10 ? 'Précisez le motif (10 caractères au moins).' : null),
    });
    if (!motif) return;
    try {
      const r = await signalerAvis(avis.avis_id, motif);
      remplacerAvis({ avis_id: avis.avis_id, signalement: { date: new Date().toISOString(), motif } });
      toast.succes(r?.message || 'Avis signalé.');
    } catch (err) {
      toast.erreur(err?.message || 'Signalement non envoyé.');
    }
  };

  return (
    <div className="container-aps">
      <div className="portail-shell">
        <main className="portail-main espace-avis">
          <header className="portail-head">
            <div>
              <span className="eyebrow">Espace médecin</span>
              <h1>Avis &amp; notes</h1>
              <p>Ce que vos patients disent de leurs consultations. Seuls les patients ayant consulté peuvent laisser un avis.</p>
            </div>
            <Link to="/portail/medecin-tableau-de-bord" className="btn btn-outline-primary btn-sm-aps">
              <i className="fa-solid fa-chart-line" /> Tableau de bord
            </Link>
          </header>

          {erreur && (
            <div className="alert alert-danger d-flex align-items-center" role="alert">
              <i className="fa-solid fa-circle-exclamation me-2" />
              <div className="flex-grow-1">{erreur}</div>
              <button className="btn btn-sm btn-outline-danger" onClick={charger}>Réessayer</button>
            </div>
          )}
          {!donnees && !erreur && <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /></div>}

          {donnees && (
            <>
              <section className="info-card espace-avis-resume">
                <ResumeNotes resume={donnees.resume} filtreNote={filtres.note} onFiltrerNote={(note) => filtrer({ note })} />
                {(donnees.sans_reponse > 0 || donnees.en_attente_moderation > 0) && (
                  <div className="espace-avis-alertes">
                    {donnees.sans_reponse > 0 && (
                      <button type="button" className="ea-alerte" onClick={() => filtrer({ reponse: 'sans' })}>
                        <i className="fa-solid fa-reply" />
                        <span><strong>{donnees.sans_reponse}</strong> avis attendent votre réponse</span>
                        <i className="fa-solid fa-chevron-right" />
                      </button>
                    )}
                    {donnees.en_attente_moderation > 0 && (
                      <div className="ea-alerte is-info">
                        <i className="fa-solid fa-hourglass-half" />
                        <span><strong>{donnees.en_attente_moderation}</strong> nouvel{donnees.en_attente_moderation > 1 ? 's' : ''} avis en cours de vérification par APS Santé</span>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <div className="espace-avis-barre" role="toolbar" aria-label="Filtrer les avis">
                <div className="tdb-segment" role="group" aria-label="Réponse">
                  {FILTRES_REPONSE.map((f) => (
                    <button key={f.cle} type="button" className={filtres.reponse === f.cle ? 'is-actif' : ''} aria-pressed={filtres.reponse === f.cle} onClick={() => filtrer({ reponse: f.cle })}>
                      {f.libelle}
                    </button>
                  ))}
                </div>
                <label className="ea-check">
                  <input type="checkbox" checked={filtres.commentaire === 'avec'} onChange={(e) => filtrer({ commentaire: e.target.checked ? 'avec' : '' })} />
                  Avec commentaire
                </label>
                {filtres.note && (
                  <button type="button" className="ea-filtre-actif" onClick={() => filtrer({ note: null })}>
                    {filtres.note} <i className="fa-solid fa-star" /> <i className="fa-solid fa-xmark" aria-label="Retirer le filtre" />
                  </button>
                )}
                <select className="form-select form-select-sm ea-tri" value={filtres.tri} onChange={(e) => filtrer({ tri: e.target.value })} aria-label="Trier">
                  {TRIS.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
                </select>
              </div>

              <div className={`espace-avis-liste ${chargement ? 'is-chargement' : ''}`} aria-busy={chargement}>
                {donnees.avis.length === 0 ? (
                  <div className="aps-empty-state">
                    <i className="fa-regular fa-comments" />
                    <div>{donnees.resume.nombre ? 'Aucun avis ne correspond à ces filtres.' : 'Vous n’avez pas encore d’avis publié.'}</div>
                  </div>
                ) : (
                  donnees.avis.map((avis) => {
                    const enEdition = edition?.avis_id === avis.avis_id;
                    return (
                      <CarteAvis
                        key={avis.avis_id}
                        avis={avis}
                        nomMedecin={nomMedecin}
                        signalement={avis.signalement}
                        actions={
                          !enEdition && (
                            <>
                              {avis.reponse ? (
                                <>
                                  <button type="button" className="btn btn-ghost btn-sm-aps" onClick={() => setEdition({ avis_id: avis.avis_id, texte: avis.reponse.texte })}>
                                    <i className="fa-solid fa-pen" /> Modifier la réponse
                                  </button>
                                  <button type="button" className="btn btn-ghost btn-sm-aps" onClick={() => retirerReponse(avis)}>
                                    <i className="fa-solid fa-trash-can" /> Retirer
                                  </button>
                                </>
                              ) : (
                                <button type="button" className="btn btn-primary btn-sm-aps" onClick={() => setEdition({ avis_id: avis.avis_id, texte: '' })}>
                                  <i className="fa-solid fa-reply" /> Répondre
                                </button>
                              )}
                              {!avis.signalement && (
                                <button type="button" className="btn btn-ghost btn-sm-aps ms-auto ea-signaler" onClick={() => signaler(avis)}>
                                  <i className="fa-regular fa-flag" /> Signaler
                                </button>
                              )}
                            </>
                          )
                        }
                      >
                        {enEdition ? (
                          <div className="editeur-reponse">
                            <label htmlFor={`reponse-${avis.avis_id}`} className="form-label fw-semibold mb-1">Votre réponse publique</label>
                            <textarea
                              id={`reponse-${avis.avis_id}`}
                              className="form-control"
                              rows={3}
                              autoFocus
                              maxLength={REPONSE_AVIS_MAX}
                              value={edition.texte}
                              onChange={(e) => setEdition({ ...edition, texte: e.target.value })}
                              placeholder="Remerciez le patient, apportez une précision… Ne mentionnez jamais d’information médicale le concernant."
                              disabled={envoi}
                            />
                            <div className="d-flex justify-content-between align-items-center mt-2 gap-2 flex-wrap">
                              <span className="text-faint" style={{ fontSize: '.78rem' }}>
                                Visible par tous sous l’avis · {edition.texte.length}/{REPONSE_AVIS_MAX}
                              </span>
                              <div className="d-flex gap-2">
                                <button type="button" className="btn btn-ghost btn-sm-aps" onClick={() => setEdition(null)} disabled={envoi}>Annuler</button>
                                <button type="button" className="btn btn-primary btn-sm-aps" onClick={enregistrerReponse} disabled={envoi || !edition.texte.trim()}>
                                  {envoi && <span className="spinner-border spinner-border-sm me-1" />}Publier
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : undefined}
                      </CarteAvis>
                    );
                  })
                )}
              </div>

              {donnees.pagination.pages > 1 && (
                <nav className="espace-avis-pagination" aria-label="Pagination des avis">
                  <button type="button" className="btn btn-ghost btn-sm-aps" disabled={filtres.page <= 1} onClick={() => filtrer({ page: filtres.page - 1 })}>
                    <i className="fa-solid fa-chevron-left" /> Précédents
                  </button>
                  <span>Page {donnees.pagination.page} sur {donnees.pagination.pages}</span>
                  <button type="button" className="btn btn-ghost btn-sm-aps" disabled={filtres.page >= donnees.pagination.pages} onClick={() => filtrer({ page: filtres.page + 1 })}>
                    Suivants <i className="fa-solid fa-chevron-right" />
                  </button>
                </nav>
              )}
            </>
          )}
        </main>
        <PortailSidebar />
      </div>
    </div>
  );
}
