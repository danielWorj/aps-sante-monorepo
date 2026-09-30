// src/pages/RemboursementsCampay.jsx
//
// Politique de fonds v2 §2 — exécution manuelle des remboursements CamPay.
// Flux : (1) retrait Mobile Money vers le payeur hors de cette page,
// (2) clôture ici avec les FRAIS RÉELS. Le net est recalculé côté serveur.
import { useCallback, useEffect, useMemo, useState } from 'react';
import './../assets/style/Referentiel.css';
import FondsModal from '../components/FondsModal';
import { cloturerRemboursementCampay, listerRemboursementsCampay } from '../services/fondsService';
import { dateHeure, montantDevise } from '../utils/fonds';

export default function RemboursementsCampay() {
  const [statut, setStatut] = useState('a_traiter');
  const [lignes, setLignes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [cible, setCible] = useState(null);
  const [fraisReels, setFraisReels] = useState('');
  const [erreurForm, setErreurForm] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      setLignes((await listerRemboursementsCampay(statut)) || []);
    } catch (err) {
      setErreur(err.message || 'Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }, [statut]);
  useEffect(() => { charger(); }, [charger]);

  const totalBrut = useMemo(() => lignes.reduce((t, l) => t + Number(l.montant_brut), 0), [lignes]);

  const ouvrir = (l) => {
    setCible(l);
    setFraisReels(l.estimation ? String(l.estimation.frais_estimes) : '');
    setErreurForm(null);
  };

  const frais = fraisReels === '' ? null : Number(fraisReels);
  const fraisValide = frais !== null && Number.isInteger(frais) && frais >= 0;
  const netPrevu = cible && fraisValide ? Math.max(0, cible.montant_brut - frais) : null; // aperçu ; le serveur recalcule

  const cloturer = async (e) => {
    e.preventDefault();
    if (!fraisValide) return setErreurForm('Les frais réels doivent être un entier positif ou nul (XAF, sans décimales).');
    setEnvoi(true);
    setErreurForm(null);
    try {
      const rep = await cloturerRemboursementCampay(cible.remboursement_id, frais);
      const r = rep.remboursement;
      setMessage(`${rep.message} Net versé au patient : ${montantDevise(r.net_verse, cible.devise)}.`);
      setCible(null);
      await charger();
    } catch (err) {
      setErreurForm(err.message || 'Clôture impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">Back-office <span className="sep">/</span> Finance <span className="sep">/</span> Remboursements CamPay</div>
          <h1>Remboursements CamPay</h1>
        </div>
        <button className="btn btn-light" onClick={charger} disabled={chargement}><i className="fa-solid fa-rotate me-2"></i>Actualiser</button>
      </div>

      <div className="alert alert-info">
        <strong>Procédure :</strong> 1) effectuez le retrait Mobile Money vers le numéro du patient, 2) cliquez sur « Clôturer »
        et saisissez les frais réels du retrait. Le patient reçoit le montant brut moins ces frais.
      </div>
      {message && <div className="alert alert-success" role="status">{message}</div>}
      {erreur && <div className="alert alert-danger">{erreur}</div>}

      <div className="aps-card">
        <div className="aps-toolbar p-3 d-flex gap-3 align-items-center">
          <select className="form-select" style={{ maxWidth: 220 }} value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="a_traiter">À traiter</option>
            <option value="traite">Traités</option>
          </select>
          {statut === 'a_traiter' && <span className="aps-text-muted">{lignes.length} en attente · {montantDevise(totalBrut)} brut</span>}
        </div>
        <div className="aps-table-wrap">
          <table className="table aps-table">
            <thead>
              <tr>
                <th>Date</th><th>Numéro du patient</th><th>Motif</th>
                <th className="text-end">Brut</th>
                <th className="text-end">{statut === 'a_traiter' ? 'Estimation' : 'Frais réels'}</th>
                <th className="text-end">{statut === 'a_traiter' ? 'Actions' : 'Net versé'}</th>
              </tr>
            </thead>
            <tbody>
              {chargement ? (
                <tr><td colSpan={6}><div className="aps-empty-mini">Chargement…</div></td></tr>
              ) : lignes.length === 0 ? (
                <tr><td colSpan={6}><div className="aps-empty-mini">Aucun remboursement.</div></td></tr>
              ) : lignes.map((l) => (
                <tr key={l.remboursement_id}>
                  <td>{dateHeure(l.date_creation)}</td>
                  <td>{l.numero_payeur || '—'}</td>
                  <td>{String(l.motif || '').replaceAll('_', ' ')}</td>
                  <td className="text-end"><strong>{montantDevise(l.montant_brut, l.devise)}</strong></td>
                  {statut === 'a_traiter' ? (
                    <>
                      <td className="text-end">
                        {l.estimation
                          ? <>net ≈ {montantDevise(l.estimation.net_estime, l.devise)}<div className="small aps-text-muted">frais ≈ {montantDevise(l.estimation.frais_estimes, l.devise)}</div></>
                          : <span className="small text-danger">{l.estimation_erreur || 'Estimation indisponible'}</span>}
                      </td>
                      <td className="text-end"><button className="btn btn-sm btn-primary" onClick={() => ouvrir(l)}>Clôturer</button></td>
                    </>
                  ) : (
                    <>
                      <td className="text-end">{montantDevise(l.frais_reels, l.devise)}</td>
                      <td className="text-end"><strong>{montantDevise(l.net_verse, l.devise)}</strong></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FondsModal
        titre="Clôturer le remboursement"
        ouvert={!!cible}
        occupe={envoi}
        onFermer={() => setCible(null)}
        pied={
          <>
            <button className="btn btn-light" onClick={() => setCible(null)} disabled={envoi}>Annuler</button>
            <button className="btn btn-primary" type="submit" form="form-cloture" disabled={envoi || !fraisValide}>
              {envoi && <span className="spinner-border spinner-border-sm me-2" />}Clôturer
            </button>
          </>
        }
      >
        {cible && (
          <form id="form-cloture" onSubmit={cloturer}>
            {erreurForm && <div className="alert alert-danger">{erreurForm}</div>}
            <p className="mb-2">Payeur : <strong>{cible.numero_payeur || '—'}</strong><br />Montant brut : <strong>{montantDevise(cible.montant_brut, cible.devise)}</strong></p>
            <label className="form-label" htmlFor="frais-reels">Frais réels du retrait (FCFA)</label>
            <input id="frais-reels" type="number" min="0" step="1" className="form-control" value={fraisReels}
              onChange={(e) => setFraisReels(e.target.value)} disabled={envoi} autoFocus />
            <small className="aps-text-muted d-block mt-2">
              Pré-rempli avec l’estimation ; remplacez-le par les frais constatés.
              {netPrevu !== null && <> Net versé au patient : <strong>{montantDevise(netPrevu, cible.devise)}</strong>.</>}
            </small>
            <small className="text-danger d-block mt-2">Action définitive : les frais d’une ligne clôturée ne peuvent plus être modifiés.</small>
          </form>
        )}
      </FondsModal>
    </main>
  );
}
