// PaiementAnnule.jsx
// Page de retour quand le patient quitte Stripe Checkout sans payer
// (cancel_url = /paiement/annule?rdv_id=...). Le RDV reste "cree" : on
// propose donc de relancer le paiement (nouvelle session Checkout).
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { demanderPaiementRdv } from '../services/paiementService';

export default function PaiementAnnule() {
  const [searchParams] = useSearchParams();
  const rdvId = searchParams.get('rdv_id');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  const reessayer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      window.location.href = await demanderPaiementRdv(rdvId); // redirection vers Stripe
    } catch (err) {
      setErreur(err?.message || 'Impossible de relancer le paiement.');
      setEnCours(false);
    }
  };

  return (
    <div className="container-aps status-page">
      <div className="status-card is-cancel">
        <div className="status-card-icon"><i className="fa-solid fa-xmark" /></div>
        <span className="status-card-badge">Paiement non abouti</span>
        <h1>Paiement annulé</h1>
        <p className="status-card-text">
          Votre rendez-vous n&apos;est pas confirmé tant que le paiement n&apos;est pas effectué.
          Vous pouvez réessayer à tout moment.
        </p>
        {erreur && <p className="status-card-error">{erreur}</p>}
        <div className="status-card-actions">
          {rdvId && (
            <button type="button" className="btn btn-primary btn-lg-aps" onClick={reessayer} disabled={enCours}>
              {enCours ? <><i className="fa-solid fa-spinner fa-spin" /> Redirection…</> : <><i className="fa-solid fa-rotate-right" /> Réessayer le paiement</>}
            </button>
          )}
          <Link to="/portail/patient-rdv" className="btn btn-outline-primary btn-lg-aps">Mes rendez-vous</Link>
        </div>
      </div>
    </div>
  );
}