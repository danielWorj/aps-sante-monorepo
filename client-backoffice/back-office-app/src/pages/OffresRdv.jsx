// src/pages/OffresRdv.jsx
//
// RDV aléatoire (RDV sur offre) — suivi des demandes publiées par les patients :
// spécialité, ville, date souhaitée, médecins qui ont répondu (tarif indicatif),
// médecin validé et RDV issu de la demande. Seule action : retirer une demande
// encore ouverte (modération). Le serveur reste la source de vérité.
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useConfirmation, useToast } from '../components/feedback';
import './../assets/style/Referentiel.css';
import * as offreRdvService from '../services/offreRdvService';
import { listerPays } from '../services/referentielService';

const STATUTS = {
  ouverte: { libelle: 'Ouverte', badge: 'is-warning', icone: 'fa-bullhorn' },
  attribuee: { libelle: 'Médecin validé', badge: 'is-success', icone: 'fa-user-check' },
  expiree: { libelle: 'Expirée', badge: 'is-neutral', icone: 'fa-hourglass-end' },
  annulee: { libelle: 'Annulée', badge: 'is-danger', icone: 'fa-ban' },
};
const STATUTS_REPONSE = { proposee: 'Proposée', retiree: 'Retirée', retenue: 'Retenue' };
const STATUTS_RDV = {
  cree: 'En attente de paiement', confirme: 'Confirmé', en_attente_presence: 'En cours', honore: 'Honoré',
  non_honore: 'Non honoré', annule: 'Annulé', conteste: 'Contesté', a_reprogrammer: 'À reprogrammer',
};
const TYPES = { physique: 'Physique', teleconsultation: 'Téléconsultation' };
const LIMITE = 25;

const fcfa = (n) => `${new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0))} FCFA`;
const date = (iso) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const nom = (u, prefixe = '') => (u ? `${prefixe}${u.prenom ?? ''} ${u.nom ?? ''}`.trim() : '—');

export default function OffresRdv() {
  const confirmer = useConfirmation();
  const toast = useToast();
  const [filtre, setFiltre] = useState('');
  const [paysId, setPaysId] = useState('');
  const [page, setPage] = useState(1);
  const [pays, setPays] = useState([]);
  const [donnees, setDonnees] = useState({ offres: [], total: 0, statistiques: {} });
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [ouverte, setOuverte] = useState(null); // offre_id dont le détail est déplié
  const [actionEnCours, setActionEnCours] = useState(null);

  // setState seulement après l'await : l'indicateur de chargement est posé par
  // les gestes de l'utilisateur (filtres, pages, actualiser).
  const charger = useCallback(async () => {
    try {
      const d = await offreRdvService.listerOffres({ statut: filtre, pays_id: paysId, page, limite: LIMITE });
      setDonnees(d);
      setErreur(null);
    } catch (err) {
      setErreur(err.message || 'Impossible de charger les demandes.');
    } finally {
      setLoading(false);
    }
  }, [filtre, paysId, page]);

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const d = await offreRdvService.listerOffres({ statut: filtre, pays_id: paysId, page, limite: LIMITE });
        if (actif) {
          setDonnees(d);
          setErreur(null);
        }
      } catch (err) {
        if (actif) setErreur(err.message || 'Impossible de charger les demandes.');
      } finally {
        if (actif) setLoading(false);
      }
    })();
    return () => { actif = false; };
  }, [filtre, paysId, page]);
  useEffect(() => {
    listerPays().then((p) => setPays(p || [])).catch(() => setPays([]));
  }, []);

  const recharger = () => {
    setLoading(true);
    charger();
  };

  const retirer = async (o) => {
    const ok = await confirmer({
      titre: 'Retirer la demande',
      message: `${o.specialite?.nom} du ${date(o.date_souhaitee)}.\nLes médecins ne pourront plus y répondre.`,
      labelConfirmer: 'Retirer',
      variante: 'danger',
    });
    if (!ok) return;
    setActionEnCours(o.offre_id);
    try {
      await offreRdvService.retirerOffre(o.offre_id);
      toast.succes('Demande retirée.');
    } catch (err) {
      toast.erreur(err.message || 'Action impossible.');
    } finally {
      setActionEnCours(null);
      await charger();
    }
  };

  const { offres, total, statistiques } = donnees;
  const pages = Math.max(1, Math.ceil(total / LIMITE));

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">
            Back-office <span className="sep">/</span> Mise en relation <span className="sep">/</span> Demandes de RDV
          </div>
          <h1>Demandes de RDV (aléatoires)</h1>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-light" onClick={recharger} disabled={loading}>
            <i className="fa-solid fa-rotate me-2"></i>Actualiser
          </button>
        </div>
      </div>

      <div className="row g-3 mb-4">
        {Object.entries(STATUTS).map(([cle, s]) => (
          <div className="col-6 col-md-3" key={cle}>
            <div className="aps-kpi">
              <div className="aps-kpi__label"><i className={`fa-solid ${s.icone} me-1`}></i>{s.libelle}</div>
              <div className="aps-kpi__value">{statistiques?.[cle] ?? '…'}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="aps-card">
        <div className="aps-toolbar p-3 d-flex gap-2 flex-wrap">
          <select className="form-select" style={{ maxWidth: 240 }} value={filtre}
            onChange={(e) => { setLoading(true); setFiltre(e.target.value); setPage(1); }}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUTS).map(([v, s]) => <option key={v} value={v}>{s.libelle}</option>)}
          </select>
          <select className="form-select" style={{ maxWidth: 240 }} value={paysId}
            onChange={(e) => { setLoading(true); setPaysId(e.target.value); setPage(1); }}>
            <option value="">Tous les pays</option>
            {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
          </select>
        </div>

        {erreur && <div className="alert alert-danger m-3">{erreur}</div>}

        <div className="aps-table-wrap">
          <table className="table aps-table">
            <thead>
              <tr>
                <th>Publiée le</th>
                <th>Patient</th>
                <th>Besoin</th>
                <th>Date souhaitée</th>
                <th className="text-center">Réponses</th>
                <th>Statut</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}><div className="aps-empty-mini">Chargement…</div></td></tr>
              ) : offres.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="aps-empty-mini">
                      <i className="fa-solid fa-bullhorn d-block mb-2" style={{ fontSize: 22 }}></i>
                      Aucune demande pour ces filtres.
                    </div>
                  </td>
                </tr>
              ) : (
                offres.map((o) => {
                  const st = STATUTS[o.statut] || { libelle: o.statut, badge: 'is-neutral', icone: 'fa-circle' };
                  const actives = o.reponses.filter((r) => r.statut !== 'retiree').length;
                  const retenue = o.reponses.find((r) => r.statut === 'retenue');
                  const deplie = ouverte === o.offre_id;
                  return (
                    <Fragment key={o.offre_id}>
                      <tr>
                        <td>{date(o.date_creation)}</td>
                        <td>
                          <span className="cell-title">{nom(o.patient?.utilisateur)}</span>
                          <div className="aps-text-muted small">{o.patient?.utilisateur?.telephone || o.patient?.utilisateur?.email}</div>
                        </td>
                        <td>
                          <span className="cell-title">{o.specialite?.nom}</span>
                          <div className="aps-text-muted small">{TYPES[o.type_rdv]} · {o.ville?.nom}, {o.pays?.nom}</div>
                        </td>
                        <td>{date(o.date_souhaitee)}</td>
                        <td className="text-center">{actives}</td>
                        <td>
                          <span className={`aps-badge ${st.badge}`}><i className={`fa-solid ${st.icone} me-1`}></i>{st.libelle}</span>
                          {retenue && <div className="small mt-1">{nom(retenue.medecin?.utilisateur, 'Dr ')}</div>}
                          {o.rendez_vous && (
                            <div className="small aps-text-muted">RDV : {STATUTS_RDV[o.rendez_vous.statut] || o.rendez_vous.statut}</div>
                          )}
                        </td>
                        <td className="text-end">
                          <div className="aps-row-actions">
                            <button className="btn btn-sm btn-light" onClick={() => setOuverte(deplie ? null : o.offre_id)}
                              title="Détail des réponses">
                              <i className={`fa-solid ${deplie ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                            </button>
                            {o.statut === 'ouverte' && (
                              <button className="btn btn-sm btn-outline-danger" disabled={actionEnCours === o.offre_id}
                                onClick={() => retirer(o)} title="Retirer la demande">
                                <i className="fa-solid fa-xmark me-1"></i>Retirer
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {deplie && (
                        <tr>
                          <td colSpan={7} className="bg-light">
                            {o.motif && <p className="small mb-2"><strong>Motif :</strong> {o.motif}</p>}
                            {o.reponses.length === 0 ? (
                              <div className="small aps-text-muted">Aucun médecin n'a répondu.</div>
                            ) : (
                              <table className="table table-sm mb-0">
                                <thead>
                                  <tr><th>Médecin</th><th className="text-end">Tarif indicatif</th><th>Réponse</th><th>Mot</th><th>Statut</th></tr>
                                </thead>
                                <tbody>
                                  {o.reponses.map((r) => (
                                    <tr key={r.reponse_id}>
                                      <td>{nom(r.medecin?.utilisateur, 'Dr ')}</td>
                                      <td className="text-end">{fcfa(r.medecin?.tarif_indicatif)}</td>
                                      <td>{date(r.date_creation)}</td>
                                      <td className="small">{r.message || '—'}</td>
                                      <td>{STATUTS_REPONSE[r.statut] || r.statut}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="d-flex justify-content-between align-items-center p-3">
            <span className="aps-text-muted small">{total} demande(s) · page {page} / {pages}</span>
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-light" disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage((p) => p - 1); }}>Précédente</button>
              <button className="btn btn-sm btn-light" disabled={page >= pages || loading} onClick={() => { setLoading(true); setPage((p) => p + 1); }}>Suivante</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
