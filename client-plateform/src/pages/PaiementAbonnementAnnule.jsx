// PaiementAbonnementAnnule.jsx
// Retour quand le promoteur quitte Stripe Checkout sans payer un abonnement
// (cancel_url = /paiement/abonnement/annule?abonnement_id=...). Le brouillon
// reste payable (24 h) : on renvoie vers /pricing pour réessayer.
// Guide abonnements v3, §2.2.4. L'échec Mobile Money, lui, s'affiche dans
// la fenêtre <PaiementMobileMoney />.
import { Link } from 'react-router-dom';

export default function PaiementAbonnementAnnule() {
  return (
    <div className="container-aps status-page">
      <div className="status-card is-cancel">
        <div className="status-card-icon"><i className="fa-solid fa-xmark" /></div>
        <span className="status-card-badge">Paiement non abouti</span>
        <h1>Paiement annulé</h1>
        <p className="status-card-text">
          Votre abonnement n&apos;est pas activé tant que le paiement n&apos;est pas effectué.
          Vous pouvez réessayer à tout moment.
        </p>
        <div className="status-card-actions">
          <Link to="/pricing" className="btn btn-primary btn-lg-aps">
            <i className="fa-solid fa-rotate-right" /> Réessayer
          </Link>
          <Link to="/mon-espace-assurance" className="btn btn-outline-primary btn-lg-aps">Mon espace</Link>
        </div>
      </div>
    </div>
  );
}
