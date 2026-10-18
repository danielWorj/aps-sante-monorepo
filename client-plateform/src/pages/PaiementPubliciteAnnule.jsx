// PaiementPubliciteAnnule.jsx
// Retour quand l'annonceur quitte Stripe Checkout sans payer : la publicité
// reste payable jusqu'à sa date limite (rappelée sur la page de paiement).
import { Link, useSearchParams } from 'react-router-dom';

export default function PaiementPubliciteAnnule() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('publicite_id');
  return (
    <div className="container-aps status-page">
      <div className="status-card is-cancel">
        <div className="status-card-icon"><i className="fa-solid fa-xmark" /></div>
        <span className="status-card-badge">Paiement non abouti</span>
        <h1>Paiement annulé</h1>
        <p className="status-card-text">
          Votre publicité n&apos;est pas programmée tant que le paiement n&apos;est pas effectué. Vous pouvez reprendre
          le paiement jusqu&apos;à la date limite indiquée ; ensuite, la position est libérée.
        </p>
        <div className="status-card-actions">
          {id && (
            <Link to={`/publicite/${id}/paiement`} className="btn btn-primary btn-lg-aps">
              <i className="fa-solid fa-rotate-right" /> Reprendre le paiement
            </Link>
          )}
          <Link to="/portail/annonceur" className="btn btn-outline-primary btn-lg-aps">Mes publicités</Link>
        </div>
      </div>
    </div>
  );
}
