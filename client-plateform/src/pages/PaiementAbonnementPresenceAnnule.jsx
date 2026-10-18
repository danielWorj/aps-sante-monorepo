// PaiementAbonnementPresenceAnnule.jsx
// Retour quand le gestionnaire quitte Stripe Checkout sans payer son
// abonnement de présence. Le brouillon reste payable 24 h depuis son espace.
import { Link } from 'react-router-dom';

export default function PaiementAbonnementPresenceAnnule() {
  return (
    <div className="container-aps status-page">
      <div className="status-card is-cancel">
        <div className="status-card-icon"><i className="fa-solid fa-xmark" /></div>
        <span className="status-card-badge">Paiement non abouti</span>
        <h1>Paiement annulé</h1>
        <p className="status-card-text">
          Votre abonnement n&apos;est pas activé tant que le paiement n&apos;est pas effectué. Vous pouvez reprendre
          le paiement depuis votre espace pendant 24 heures, ou choisir une autre formule.
        </p>
        <div className="status-card-actions">
          <Link to="/pricing" className="btn btn-primary btn-lg-aps">
            <i className="fa-solid fa-rotate-right" /> Voir les abonnements
          </Link>
        </div>
      </div>
    </div>
  );
}
