// src/pages/Retraits.jsx
//
// Validation des retraits des médecins (décaissement Mobile Money via CamPay).
// Le serveur reste la source de vérité : cette page ne fait que lister, approuver, rejeter
// et dénouer les cas à issue incertaine (voir server/src/services/retrait.service.js).
import { useCallback, useEffect, useMemo, useState } from 'react';
import './../assets/style/Referentiel.css';
import * as retraitService from '../services/retraitService';

const STATUTS = {
  en_attente_validation: { libelle: 'À valider', badge: 'is-warning', icone: 'fa-hourglass-half' },
  en_cours: { libelle: 'Envoi en cours', badge: 'is-info', icone: 'fa-paper-plane' },
  reussie: { libelle: 'Effectué', badge: 'is-success', icone: 'fa-circle-check' },
  echouee: { libelle: 'Échoué', badge: 'is-danger', icone: 'fa-circle-xmark' },
  rejetee: { libelle: 'Rejeté', badge: 'is-neutral', icone: 'fa-ban' },
};

const fcfa = (n) => `${new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0))} FCFA`;
const date = (iso) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const nomMedecin = (d) => {
  const u = d.medecin?.utilisateur;
  return u ? `Dr ${u.prenom} ${u.nom}` : d.medecin?.medecin_id ?? '—';
};

export default function Retraits() {
  const [filtre, setFiltre] = useState('en_attente_validation');
  const [lignes, setLignes] = useState([]);
  const [soldeCampay, setSoldeCampay] = useState(null); // { total, mtn, orange, devise } | { erreur }
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null); // { type, texte }
  const [actionEnCours, setActionEnCours] = useState(null); // id de la demande en traitement

  const charger = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      setLignes(await retraitService.listerRetraits(filtre || undefined));
    } catch (err) {
      setErreur(err.message || 'Impossible de charger les retraits.');
    } finally {
      setLoading(false);
    }
  }, [filtre]);

  const chargerSolde = useCallback(async () => {
    try {
      setSoldeCampay(await retraitService.obtenirSoldeCampay());
    } catch (err) {
      setSoldeCampay({ erreur: err.message || 'Solde CamPay indisponible.' });
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { chargerSolde(); }, [chargerSolde]);

  const kpiAValider = useMemo(() => lignes.filter((l) => l.statut === 'en_attente_validation').length, [lignes]);
  const kpiMontantAValider = useMemo(
    () => lignes.filter((l) => l.statut === 'en_attente_validation').reduce((t, l) => t + Number(l.montant), 0),
    [lignes]
  );

  // Exécute une action admin puis recharge ; le message d'erreur du serveur est affiché tel quel.
  const executer = async (id, action, messageSucces) => {
    setActionEnCours(id);
    setMessage(null);
    try {
      const rep = await action();
      setMessage({
        type: rep?.incertain ? 'warning' : 'success',
        texte: rep?.incertain
          ? "Issue incertaine : CamPay n'a pas confirmé la réception. Ne PAS renvoyer ; le système vérifie automatiquement (webhook + cron)."
          : messageSucces,
      });
    } catch (err) {
      setMessage({ type: 'danger', texte: err.message || 'Action impossible.' });
    } finally {
      setActionEnCours(null);
      await Promise.all([charger(), chargerSolde()]);
    }
  };

  const approuver = (d) => {
    const sentence =
      `Envoyer ${fcfa(d.montant)} à ${d.numero} ?\n\n` +
      `Titulaire déclaré : ${d.titulaire_declare || '—'}\n` +
      `Titulaire CamPay : ${d.titulaire_campay || 'non vérifiable'}` +
      (d.titulaire_concordant === false ? '\n\n⚠ LES NOMS NE CORRESPONDENT PAS.' : '');
    if (!window.confirm(sentence)) return;
    executer(d.demande_retrait_id, () => retraitService.approuverRetrait(d.demande_retrait_id), 'Retrait envoyé à CamPay.');
  };

  const rejeter = (d) => {
    const motif = window.prompt(`Motif du rejet du retrait de ${fcfa(d.montant)} (visible par le médecin) :`);
    if (!motif || !motif.trim()) return;
    executer(d.demande_retrait_id, () => retraitService.rejeterRetrait(d.demande_retrait_id, motif.trim()), 'Retrait rejeté, montant recrédité.');
  };

  const rattacher = (d) => {
    const reference = window.prompt(
      `Référence CamPay du décaissement dont external_reference = ${d.demande_retrait_id} :`
    );
    if (!reference || !reference.trim()) return;
    executer(d.demande_retrait_id, () => retraitService.rattacherReference(d.demande_retrait_id, reference.trim()), 'Référence rattachée.');
  };

  const marquerEchoue = (d) => {
    const motif = window.prompt(
      'ATTENTION : à ne faire qu\'après avoir vérifié dans le tableau de bord CamPay qu\'AUCUN décaissement n\'existe pour cette demande.\n\nMotif :'
    );
    if (!motif || !motif.trim()) return;
    executer(d.demande_retrait_id, () => retraitService.marquerEchoue(d.demande_retrait_id, motif.trim()), 'Retrait marqué échoué, montant recrédité.');
  };

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">
            Back-office <span className="sep">/</span> Finance <span className="sep">/</span> Retraits des médecins
          </div>
          <h1>Retraits des médecins</h1>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-light" onClick={() => { charger(); chargerSolde(); }} disabled={loading}>
            <i className="fa-solid fa-rotate me-2"></i>Actualiser
          </button>
        </div>
      </div>

      {message && (
        <div className={`aps-notice is-${message.type === 'success' ? 'info' : message.type} mb-3`} role="status">
          <i className="fa-solid fa-circle-info"></i>
          <div>{message.texte}</div>
        </div>
      )}

      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="aps-kpi">
            <div className="aps-kpi__label">Solde CamPay disponible</div>
            <div className="aps-kpi__value">
              {!soldeCampay ? '…' : soldeCampay.erreur ? '—' : fcfa(soldeCampay.total)}
            </div>
            {soldeCampay?.erreur && <small className="text-danger">{soldeCampay.erreur}</small>}
            {soldeCampay && !soldeCampay.erreur && (
              <small className="aps-text-muted">MTN {fcfa(soldeCampay.mtn)} · Orange {fcfa(soldeCampay.orange)}</small>
            )}
          </div>
        </div>
        <div className="col-md-4">
          <div className="aps-kpi">
            <div className="aps-kpi__label">Demandes à valider (liste affichée)</div>
            <div className="aps-kpi__value">{kpiAValider}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="aps-kpi">
            <div className="aps-kpi__label">Montant à décaisser (liste affichée)</div>
            <div className="aps-kpi__value">{fcfa(kpiMontantAValider)}</div>
            {soldeCampay && !soldeCampay.erreur && kpiMontantAValider > soldeCampay.total && (
              <small className="text-danger">Supérieur au solde CamPay : rechargez le compte.</small>
            )}
          </div>
        </div>
      </div>

      <div className="aps-card">
        <div className="aps-toolbar p-3">
          <select className="form-select" style={{ maxWidth: 260 }} value={filtre} onChange={(e) => setFiltre(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUTS).map(([valeur, s]) => (
              <option key={valeur} value={valeur}>{s.libelle}</option>
            ))}
          </select>
        </div>

        {erreur && <div className="alert alert-danger m-3">{erreur}</div>}

        <div className="aps-table-wrap">
          <table className="table aps-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Médecin</th>
                <th className="text-end">Montant</th>
                <th>Destination</th>
                <th>Statut</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><div className="aps-empty-mini">Chargement…</div></td></tr>
              ) : lignes.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="aps-empty-mini">
                      <i className="fa-solid fa-money-bill-transfer d-block mb-2" style={{ fontSize: 22 }}></i>
                      Aucune demande de retrait pour ce filtre.
                    </div>
                  </td>
                </tr>
              ) : (
                lignes.map((d) => {
                  const st = STATUTS[d.statut] || { libelle: d.statut, badge: 'is-neutral', icone: 'fa-circle' };
                  const occupe = actionEnCours === d.demande_retrait_id;
                  return (
                    <tr key={d.demande_retrait_id}>
                      <td>{date(d.date_creation)}</td>
                      <td>
                        <span className="cell-title">{nomMedecin(d)}</span>
                        <div className="aps-text-muted small">{d.medecin?.utilisateur?.telephone || d.medecin?.utilisateur?.email}</div>
                      </td>
                      <td className="text-end"><strong>{fcfa(d.montant)}</strong></td>
                      <td>
                        <div>{d.numero}</div>
                        <div className="small">
                          {d.titulaire_declare || '—'}
                          {d.titulaire_concordant === true && <span className="aps-badge is-success ms-2">Nom vérifié</span>}
                          {d.titulaire_concordant === false && (
                            <span className="aps-badge is-danger ms-2" title={`CamPay : ${d.titulaire_campay}`}>Nom différent : {d.titulaire_campay}</span>
                          )}
                          {d.titulaire_concordant === null && <span className="aps-badge is-neutral ms-2">Non vérifiable</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`aps-badge ${st.badge}`}><i className={`fa-solid ${st.icone} me-1`}></i>{st.libelle}</span>
                        {d.statut === 'en_cours' && !d.campay_reference && (
                          <div className="small text-danger mt-1">Sans référence CamPay : à vérifier</div>
                        )}
                        {d.motif_rejet && <div className="small aps-text-muted mt-1">Motif : {d.motif_rejet}</div>}
                        {d.derniere_erreur && d.statut !== 'reussie' && (
                          <div className="small text-danger mt-1">{d.derniere_erreur}</div>
                        )}
                      </td>
                      <td className="text-end">
                        <div className="aps-row-actions">
                          {d.statut === 'en_attente_validation' && (
                            <>
                              <button className="btn btn-sm btn-primary" disabled={occupe} onClick={() => approuver(d)} title="Approuver et envoyer">
                                <i className="fa-solid fa-check me-1"></i>Approuver
                              </button>
                              <button className="btn btn-sm btn-outline-danger" disabled={occupe} onClick={() => rejeter(d)} title="Rejeter">
                                <i className="fa-solid fa-xmark me-1"></i>Rejeter
                              </button>
                            </>
                          )}
                          {d.statut === 'en_cours' && !d.campay_reference && (
                            <>
                              <button className="btn btn-sm btn-outline-primary" disabled={occupe} onClick={() => rattacher(d)}>
                                Rattacher référence
                              </button>
                              <button className="btn btn-sm btn-outline-danger" disabled={occupe} onClick={() => marquerEchoue(d)}>
                                Marquer échoué
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}