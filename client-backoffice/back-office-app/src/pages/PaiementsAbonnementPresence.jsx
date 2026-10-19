// src/pages/PaiementsAbonnementPresence.jsx
//
// Paiements des abonnements de présence d'un type d'acteur — même écran
// que PaiementsAbonnementAssurance.jsx :
//   1. transactions d'abonnement (paiement direct à la plateforme, HORS
//      escrow) ;
//   2. paiements tardifs : argent encaissé SANS activation. Remboursement
//      EXCEPTIONNEL validé ici (Stripe : au clic ; Mobile Money / virement :
//      fonds renvoyés hors de cette page, puis clôture avec les frais réels).
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/feedback';
import './../assets/style/Referentiel.css';
import FondsModal from '../components/FondsModal';
import {
  TYPES_PRESENCE,
  listerPaiements,
  listerPaiementsTardifs,
  traiterPaiementTardif,
  STATUTS_ABONNEMENT,
} from '../services/abonnementPresenceService';
import { dateHeure, montantDevise } from '../utils/fonds';

const STATUTS_TRANSACTION = {
  en_attente: { libelle: 'En attente', badge: 'is-warning' },
  reussie: { libelle: 'Réussie', badge: 'is-success' },
  echouee: { libelle: 'Échouée', badge: 'is-neutral' },
  remboursee: { libelle: 'Remboursée', badge: 'is-info' },
};
const FOURNISSEURS = { stripe: 'Carte (Stripe)', campay: 'Mobile Money', virement: 'Virement' };

function Paiements({ type }) {
  const [filtres, setFiltres] = useState({ statut: '', fournisseur: '' });
  const [lignes, setLignes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(
    () =>
      listerPaiements(type, filtres)
        .then((l) => { setLignes(l); setErreur(null); })
        .catch((err) => setErreur(err.message || 'Chargement impossible.'))
        .finally(() => setChargement(false)),
    [type, filtres]
  );
  useEffect(() => { charger(); }, [charger]);

  return (
    <div className="aps-card mb-4">
      <div className="aps-toolbar p-3 d-flex gap-2 flex-wrap align-items-center">
        <h2 className="h6 mb-0 me-auto"><i className="fa-solid fa-receipt me-2"></i>Paiements d&apos;abonnement</h2>
        <select className="form-select" style={{ maxWidth: 200 }} value={filtres.statut} onChange={(e) => setFiltres({ ...filtres, statut: e.target.value })}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS_TRANSACTION).map(([v, s]) => <option key={v} value={v}>{s.libelle}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 200 }} value={filtres.fournisseur} onChange={(e) => setFiltres({ ...filtres, fournisseur: e.target.value })}>
          <option value="">Tous les moyens</option>
          {Object.entries(FOURNISSEURS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn btn-light btn-sm" onClick={() => { setChargement(true); charger(); }} disabled={chargement}><i className="fa-solid fa-rotate"></i></button>
      </div>
      {erreur && <div className="alert alert-danger m-3">{erreur}</div>}
      <div className="aps-table-wrap">
        <table className="table aps-table">
          <thead>
            <tr><th>Date</th><th>{TYPES_PRESENCE[type].singulier}</th><th>Moyen</th><th>Référence</th><th className="text-end">Montant</th><th>Paiement</th><th>Abonnement</th></tr>
          </thead>
          <tbody>
            {chargement ? (
              <tr><td colSpan={7}><div className="aps-empty-mini">Chargement…</div></td></tr>
            ) : lignes.length === 0 ? (
              <tr><td colSpan={7}><div className="aps-empty-mini">Aucun paiement.</div></td></tr>
            ) : lignes.map((t) => {
              const st = STATUTS_TRANSACTION[t.statut] ?? {};
              const sa = STATUTS_ABONNEMENT[t.abonnement?.statut] ?? {};
              return (
                <tr key={t.transaction_id}>
                  <td className="small">{dateHeure(t.date_creation)}</td>
                  <td>{t.abonnement?.fiche?.nom ?? '—'}<div className="small aps-text-muted">{t.abonnement?.niveau?.libelle}</div></td>
                  <td>{FOURNISSEURS[t.fournisseur] ?? t.fournisseur}{t.numero_payeur && <div className="small aps-text-muted">{t.numero_payeur}</div>}</td>
                  <td className="small text-break">{t.reference ?? '—'}</td>
                  <td className="text-end"><strong>{montantDevise(t.montant, t.devise)}</strong></td>
                  <td><span className={`aps-badge ${st.badge ?? 'is-neutral'}`}>{st.libelle ?? t.statut}</span></td>
                  <td>{t.abonnement ? <span className={`aps-badge ${sa.badge ?? 'is-neutral'}`}>{sa.libelle ?? t.abonnement.statut}</span> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaiementsTardifs({ type }) {
  const [statut, setStatut] = useState('a_traiter');
  const [lignes, setLignes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const toast = useToast();
  const [cible, setCible] = useState(null);
  const [fraisReels, setFraisReels] = useState('0');
  const [erreurForm, setErreurForm] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(
    () =>
      listerPaiementsTardifs(type, statut)
        .then((l) => { setLignes(l); setErreur(null); })
        .catch((err) => setErreur(err.message || 'Chargement impossible.'))
        .finally(() => setChargement(false)),
    [type, statut]
  );
  useEffect(() => { charger(); }, [charger]);

  const estStripe = cible?.transaction?.fournisseur === 'stripe';
  const frais = Number(fraisReels);
  const fraisValide = estStripe || (fraisReels !== '' && Number.isInteger(frais) && frais >= 0);

  const traiter = async (e) => {
    e.preventDefault();
    if (!fraisValide) return setErreurForm('Les frais réels doivent être un entier positif ou nul.');
    setEnvoi(true);
    setErreurForm(null);
    try {
      await traiterPaiementTardif(type, cible.remboursement_id, estStripe ? {} : { frais_reels: frais });
      toast.succes(estStripe ? 'Remboursement effectué chez Stripe.' : 'Remboursement clôturé.');
      setCible(null);
      await charger();
    } catch (err) {
      setErreurForm(err.message || 'Traitement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="aps-card">
      <div className="aps-toolbar p-3 d-flex gap-2 align-items-center">
        <h2 className="h6 mb-0 me-auto"><i className="fa-solid fa-rotate-left me-2"></i>Paiements tardifs à rembourser</h2>
        <select className="form-select" style={{ maxWidth: 200 }} value={statut} onChange={(e) => setStatut(e.target.value)}>
          <option value="a_traiter">À traiter</option>
          <option value="effectue">Remboursés (Stripe)</option>
          <option value="traite">Clôturés (Mobile Money / virement)</option>
        </select>
      </div>
      <div className="px-3">
        <p className="small aps-text-muted mb-2">
          Paiement reçu alors que la demande d&apos;abonnement était déjà annulée, ou second paiement pour le même
          abonnement : rien n&apos;a été activé. Mobile Money / virement : renvoyez d&apos;abord les fonds au payeur,
          puis clôturez avec les frais réels.
        </p>
        {erreur && <div className="alert alert-danger">{erreur}</div>}
      </div>
      <div className="aps-table-wrap">
        <table className="table aps-table">
          <thead><tr><th>Date</th><th>Moyen</th><th>Payeur / référence</th><th className="text-end">Montant</th><th className="text-end">{statut === 'a_traiter' ? 'Action' : 'Frais réels'}</th></tr></thead>
          <tbody>
            {chargement ? (
              <tr><td colSpan={5}><div className="aps-empty-mini">Chargement…</div></td></tr>
            ) : lignes.length === 0 ? (
              <tr><td colSpan={5}><div className="aps-empty-mini">Aucun paiement tardif.</div></td></tr>
            ) : lignes.map((r) => (
              <tr key={r.remboursement_id}>
                <td className="small">{dateHeure(r.date_creation)}</td>
                <td>{FOURNISSEURS[r.transaction?.fournisseur] ?? r.transaction?.fournisseur}</td>
                <td className="small text-break">
                  {r.transaction?.numero_payeur ?? ''}
                  <div className="aps-text-muted">{r.transaction?.campay_reference ?? r.transaction?.stripe_payment_intent_id ?? r.transaction_id}</div>
                </td>
                <td className="text-end"><strong>{montantDevise(r.montant, r.transaction?.devise)}</strong></td>
                <td className="text-end">
                  {statut === 'a_traiter'
                    ? <button className="btn btn-sm btn-primary" onClick={() => { setCible(r); setFraisReels('0'); setErreurForm(null); }}>Rembourser</button>
                    : r.frais_reels == null ? '—' : montantDevise(r.frais_reels, r.transaction?.devise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FondsModal
        titre="Remboursement exceptionnel"
        ouvert={!!cible}
        occupe={envoi}
        onFermer={() => setCible(null)}
        pied={
          <>
            <button className="btn btn-light" onClick={() => setCible(null)} disabled={envoi}>Annuler</button>
            <button className="btn btn-danger" type="submit" form="form-tardif-presence" disabled={envoi || !fraisValide}>
              {envoi && <span className="spinner-border spinner-border-sm me-2" />}{estStripe ? 'Rembourser via Stripe' : 'Clôturer'}
            </button>
          </>
        }
      >
        {cible && (
          <form id="form-tardif-presence" onSubmit={traiter}>
            {erreurForm && <div className="alert alert-danger">{erreurForm}</div>}
            <p>Montant : <strong>{montantDevise(cible.montant, cible.transaction?.devise)}</strong></p>
            {estStripe ? (
              <p className="small">Le montant est remboursé immédiatement sur la carte du payeur. Action définitive et journalisée.</p>
            ) : (
              <>
                <label className="form-label" htmlFor="tardif-presence-frais">Frais réels du retour des fonds</label>
                <input id="tardif-presence-frais" type="number" min="0" step="1" className="form-control" value={fraisReels} onChange={(e) => setFraisReels(e.target.value)} />
                <small className="text-danger d-block mt-2">Confirmez d&apos;abord que les fonds ont bien été renvoyés au payeur. Action définitive et journalisée.</small>
              </>
            )}
          </form>
        )}
      </FondsModal>
    </div>
  );
}

export default function PaiementsAbonnementPresence({ type }) {
  const config = TYPES_PRESENCE[type];
  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">Back-office <span className="sep">/</span> {config.libelle} <span className="sep">/</span> Paiements d&apos;abonnement</div>
          <h1>Paiements d&apos;abonnement — {config.libelle}</h1>
        </div>
      </div>
      <Paiements type={type} />
      <PaiementsTardifs type={type} />
    </main>
  );
}
