// assurance-demandes.jsx — portail assurance, « Demandes ».
//
// Les mises en relation reçues par la fiche (formulaire de contact de la
// fiche publique). L'agent les lit toujours ; le SUIVI (statut + note
// interne, jamais montrée au demandeur) exige le droit « suivi des
// demandes » de l'abonnement — le serveur refuse sinon (403
// SUIVI_DEMANDES_INDISPONIBLE). Ouvrir une demande « nouvelle » la passe
// « en cours » (si le suivi est inclus).
import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useConfirmation, useToast } from '../../feedback';
import { AssurancePortailPage } from '../layouts/assurance.portail-sidebar';
import { obtenirGestionServiceAssurance } from '../../../services/abonnementAssuranceService';
import {
  STATUTS_DEMANDE,
  listerDemandes,
  suivreDemande,
  supprimerDemande,
} from '../../../services/portailAssuranceService';

const LIMITE = 20;
const FILTRES = [['', 'Toutes'], ...Object.entries(STATUTS_DEMANDE).map(([k, v]) => [k, v.label])];
const dateHeure = (iso) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function nomDemandeur(u) {
  return u ? `${u.prenom ?? ''} ${u.nom ?? ''}`.trim() || u.email : 'Utilisateur';
}

function ChipStatut({ statut }) {
  const st = STATUTS_DEMANDE[statut] ?? { label: statut, chip: '', icone: 'fa-circle' };
  return <span className={`chip ${st.chip}`}><i className={`fa-solid ${st.icone}`}></i> {st.label}</span>;
}

function DetailDemande({ demande, suiviInclus, onMaj, onSupprimee }) {
  const confirmer = useConfirmation();
  const toast = useToast();
  const [note, setNote] = useState(demande.note_interne ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const u = demande.utilisateur;

  const appliquer = async (modifs, message) => {
    setErreur(null);
    setEnvoi(true);
    try {
      const d = await suivreDemande(demande.mise_en_relation_id, modifs);
      onMaj(d.mise_en_relation);
      if (message) toast.succes(message);
    } catch (err) {
      setErreur(err?.message || 'Mise à jour impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = async () => {
    const ok = await confirmer({
      titre: 'Supprimer la demande',
      message: 'Cette demande sera supprimée définitivement.',
      labelConfirmer: 'Supprimer',
      variante: 'danger',
    });
    if (!ok) return;
    try {
      await supprimerDemande(demande.mise_en_relation_id);
      onSupprimee(demande.mise_en_relation_id);
      toast.succes('Demande supprimée.');
    } catch (err) {
      setErreur(err?.message || 'Suppression impossible.');
    }
  };

  return (
    <div className="demande-detail">
      <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-2">
        <div>
          <h3 className="h6 mb-1">{nomDemandeur(u)}</h3>
          <div className="small text-faint">Reçue le {dateHeure(demande.date_creation)}</div>
        </div>
        <ChipStatut statut={demande.statut} />
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        {u?.email && (
          <a className="btn btn-outline-primary btn-sm-aps" href={`mailto:${u.email}`}>
            <i className="fa-solid fa-envelope" /> {u.email}
          </a>
        )}
        {u?.telephone && (
          <a className="btn btn-outline-primary btn-sm-aps" href={`tel:${u.telephone}`}>
            <i className="fa-solid fa-phone" /> {u.telephone}
          </a>
        )}
      </div>

      <blockquote className="demande-message">{demande.message}</blockquote>

      {suiviInclus ? (
        <>
          <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Changer le statut">
            {['en_cours', 'traitee', 'archivee'].map((s) => (
              <button key={s} type="button" disabled={envoi || demande.statut === s}
                className={`btn btn-sm-aps ${demande.statut === s ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => appliquer({ statut: s })}>
                <i className={`fa-solid ${STATUTS_DEMANDE[s].icone}`} /> {STATUTS_DEMANDE[s].label}
              </button>
            ))}
          </div>
          <label className="form-label small fw-semibold" htmlFor={`note-${demande.mise_en_relation_id}`}>
            Note interne <span className="text-faint fw-normal">(visible de votre équipe seulement)</span>
          </label>
          <textarea id={`note-${demande.mise_en_relation_id}`} className="form-control" rows={3} maxLength={2000}
            value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. Rappelé le 18/10, devis famille à envoyer." />
          <div className="d-flex justify-content-between mt-2">
            <button type="button" className="btn btn-ghost btn-sm-aps" onClick={supprimer}>
              <i className="fa-solid fa-trash" /> Supprimer
            </button>
            <button type="button" className="btn btn-primary btn-sm-aps" disabled={envoi || note === (demande.note_interne ?? '')}
              onClick={() => appliquer({ note_interne: note }, 'Note enregistrée.')}>
              Enregistrer la note
            </button>
          </div>
        </>
      ) : (
        <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
          <p className="minimal-note mb-0">
            <i className="fa-solid fa-lock" /> Le suivi (statuts, notes) est inclus dans les abonnements qui le proposent.{' '}
            <Link to="/portail/assurance-abonnement">Voir les formules</Link>
          </p>
          <button type="button" className="btn btn-ghost btn-sm-aps" onClick={supprimer}>
            <i className="fa-solid fa-trash" /> Supprimer
          </button>
        </div>
      )}
      {erreur && <p className="status-card-error mt-2 mb-0"><i className="fa-solid fa-circle-exclamation" /> {erreur}</p>}
    </div>
  );
}

export default function AssuranceDemandes() {
  const { serviceId, rafraichirCompteurs } = useOutletContext();
  const [statut, setStatut] = useState('');
  const [recherche, setRecherche] = useState('');
  const [rechercheAppliquee, setRechercheAppliquee] = useState('');
  const [page, setPage] = useState(1);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [ouverte, setOuverte] = useState(null);
  const [suiviInclus, setSuiviInclus] = useState(false);

  useEffect(() => {
    obtenirGestionServiceAssurance(serviceId)
      .then((d) => setSuiviInclus(!!d.droits?.suivi_demandes))
      .catch(() => setSuiviInclus(false));
  }, [serviceId]);

  const charger = useCallback(
    () =>
      listerDemandes(serviceId, { statut, recherche: rechercheAppliquee, page, limite: LIMITE })
        .then((d) => { setResultat(d); setErreur(null); })
        .catch((err) => setErreur(err?.message || 'Impossible de charger les demandes.')),
    [serviceId, statut, rechercheAppliquee, page]
  );
  useEffect(() => { charger(); }, [charger]);

  const remplacer = (maj) => {
    setResultat((r) => ({
      ...r,
      mises_en_relation: r.mises_en_relation.map((m) => (m.mise_en_relation_id === maj.mise_en_relation_id ? maj : m)),
    }));
    rafraichirCompteurs();
    // Compteurs des onglets à jour sans perdre la demande ouverte.
    listerDemandes(serviceId, { limite: 1 }).then((d) => setResultat((r) => ({ ...r, compteurs: d.compteurs }))).catch(() => {});
  };

  const ouvrir = (m) => {
    const id = m.mise_en_relation_id;
    setOuverte((o) => (o === id ? null : id));
    if (m.statut === 'nouvelle' && suiviInclus) {
      suivreDemande(id, { statut: 'en_cours' }).then((d) => remplacer(d.mise_en_relation)).catch(() => {});
    }
  };

  const changerFiltre = (s) => {
    setStatut(s);
    setPage(1);
    setOuverte(null);
  };

  const pages = resultat ? Math.max(1, Math.ceil(resultat.total / LIMITE)) : 1;
  const compteurs = resultat?.compteurs;
  const totalGlobal = compteurs ? Object.values(compteurs).reduce((a, b) => a + b, 0) : 0;

  return (
    <AssurancePortailPage
      titre="Demandes"
      description="Les personnes qui ont demandé à être mises en relation avec vous depuis votre fiche."
    >
      <div className="info-card">
        <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-3">
          <div className="aps-tabs mb-0" role="tablist" aria-label="Filtrer par statut">
            {FILTRES.map(([cle, libelle]) => (
              <button key={cle || 'toutes'} type="button" role="tab" aria-selected={statut === cle}
                className={statut === cle ? 'active' : ''} onClick={() => changerFiltre(cle)}>
                {libelle}
                {compteurs && <span className="tab-count">{cle ? compteurs[cle] : totalGlobal}</span>}
              </button>
            ))}
          </div>
          <form className="d-flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setRechercheAppliquee(recherche); }}>
            <input type="search" className="form-control form-control-sm" placeholder="Nom, e-mail, message…"
              value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher une demande" />
            <button type="submit" className="btn btn-outline-primary btn-sm-aps" aria-label="Rechercher"><i className="fa-solid fa-magnifying-glass" /></button>
          </form>
        </div>

        {erreur && (
          <div className="alert alert-danger d-flex align-items-center" role="alert">
            <div className="flex-grow-1">{erreur}</div>
            <button className="btn btn-sm btn-outline-danger" onClick={charger}>Réessayer</button>
          </div>
        )}
        {!erreur && !resultat && <div className="text-center py-4"><div className="spinner-border text-primary" role="status" /></div>}
        {resultat && resultat.mises_en_relation.length === 0 && (
          <div className="aps-empty-state">
            <i className="fa-solid fa-inbox"></i>
            <div>{statut || rechercheAppliquee ? 'Aucune demande ne correspond.' : 'Aucune demande reçue pour l’instant.'}</div>
          </div>
        )}
        {resultat && resultat.mises_en_relation.length > 0 && (
          <div className="rdv-list">
            {resultat.mises_en_relation.map((m) => {
              const estOuverte = ouverte === m.mise_en_relation_id;
              return (
                <div key={m.mise_en_relation_id} className={`rdv-item demande-item ${m.statut === 'nouvelle' ? 'is-nouvelle' : ''}`}>
                  <button type="button" className="demande-entete" aria-expanded={estOuverte} onClick={() => ouvrir(m)}>
                    <div className="rdv-body">
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <strong>{nomDemandeur(m.utilisateur)}</strong>
                        <ChipStatut statut={m.statut} />
                        {m.note_interne && <i className="fa-solid fa-note-sticky text-faint" title="Note interne" />}
                      </div>
                      <div className="rdv-meta"><span><i className="fa-regular fa-clock" /> {dateHeure(m.date_creation)}</span></div>
                      {!estOuverte && <div className="small text-faint text-truncate mt-1">{m.message}</div>}
                    </div>
                    <i className={`fa-solid fa-chevron-${estOuverte ? 'up' : 'down'} rdv-chevron`} />
                  </button>
                  {estOuverte && (
                    <DetailDemande
                      key={m.mise_en_relation_id + (m.note_interne ?? '')}
                      demande={m}
                      suiviInclus={suiviInclus}
                      onMaj={remplacer}
                      onSupprimee={() => { setOuverte(null); charger(); rafraichirCompteurs(); }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {resultat && pages > 1 && (
          <nav className="d-flex justify-content-center align-items-center gap-3 mt-3" aria-label="Pagination">
            <button type="button" className="btn btn-ghost btn-sm-aps" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <i className="fa-solid fa-chevron-left" /> Précédentes
            </button>
            <span className="small">Page {page} / {pages}</span>
            <button type="button" className="btn btn-ghost btn-sm-aps" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Suivantes <i className="fa-solid fa-chevron-right" />
            </button>
          </nav>
        )}
      </div>
    </AssurancePortailPage>
  );
}
