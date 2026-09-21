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
    <div className="container-aps" style={{ padding: '2rem 0' }}>
      <h1>Paiement annulé</h1>
      <p>Votre rendez-vous n&apos;est pas confirmé tant que le paiement n&apos;est pas effectué.</p>
      {erreur && <p className="text-danger">{erreur}</p>}
      <div className="d-flex gap-2">
        {rdvId && (
          <button type="button" className="btn btn-primary" onClick={reessayer} disabled={enCours}>
            {enCours ? 'Redirection…' : 'Réessayer le paiement'}
          </button>
        )}
        <Link to="/portail/patient-rdv" className="btn btn-outline-primary">Mes rendez-vous</Link>
      </div>
    </div>
  );
}