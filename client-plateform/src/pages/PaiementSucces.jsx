// PaiementSucces.jsx
// Page de retour après Stripe Checkout (success_url = /paiement/succes?rdv_id=...).
// La source de vérité est le webhook côté serveur : on interroge l'API
// jusqu'à voir le paiement "reussie" (le webhook peut arriver quelques
// secondes après la redirection).
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { obtenirStatutPaiementRdv } from '../services/paiementService';

function formaterMontant(montant, devise) {
  if (montant === undefined || montant === null) return null;
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: (devise || 'XAF').toUpperCase(),
      maximumFractionDigits: 0,
    }).format(montant);
  } catch {
    return `${montant} ${(devise || '').toUpperCase()}`;
  }
}

function StatusCard({ variant, icon, spinner, badge, title, text, amount, children }) {
  return (
    <div className="container-aps status-page">
      <div className={`status-card is-${variant}`}>
        {spinner ? <div className="status-card-spinner" /> : <div className="status-card-icon"><i className={`fa-solid ${icon}`} /></div>}
        {badge && <span className="status-card-badge">{badge}</span>}
        <h1>{title}</h1>
        <p className="status-card-text">{text}</p>
        {amount && (
          <div className="status-card-amount">
            <span>Montant réglé</span>
            <strong>{amount}</strong>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export default function PaiementSucces() {
  const [searchParams] = useSearchParams();
  const rdvId = searchParams.get('rdv_id');
  // Après la redirection depuis Stripe, la page est rechargée : la
  // session est restaurée en asynchrone (AuthContext). On attend qu'elle
  // soit prête avant d'appeler l'API, sinon l'appel part sans token et
  // déclenche un 2e refresh concurrent du même cookie (rotation stricte).
  const { status: authStatus } = useAuth();
  const [statut, setStatut] = useState('verification');
  const [paiement, setPaiement] = useState(null);

  useEffect(() => {
    if (!rdvId || authStatus !== 'authenticated') return undefined;
    let annule = false;
    let tentatives = 0;
    let timer;

    async function verifier() {
      try {
        const data = await obtenirStatutPaiementRdv(rdvId);
        if (annule) return;
        if (data.paiement?.statut === 'reussie') {
          setPaiement(data.paiement);
          return setStatut('confirme');
        }
      } catch { /* on retente */ }
      tentatives += 1;
      if (annule) return;
      if (tentatives < 10) timer = setTimeout(verifier, 1500);
      else setStatut('en_attente');
    }
    verifier();
    return () => { annule = true; clearTimeout(timer); };
  }, [rdvId, authStatus]);

  if (!rdvId) {
    return (
      <StatusCard
        variant="neutral"
        icon="fa-calendar-xmark"
        title="Rendez-vous introuvable"
        text="Le lien utilisé ne référence aucun rendez-vous. Vérifiez le lien ou repartez de vos rendez-vous."
      >
        <div className="status-card-actions">
          <Link to="/portail/patient-rdv" className="btn btn-primary btn-lg-aps">Voir mes rendez-vous</Link>
        </div>
      </StatusCard>
    );
  }

  if (authStatus === 'unauthenticated') {
    return (
      <StatusCard
        variant="neutral"
        icon="fa-lock"
        title="Session expirée"
        text="Reconnectez-vous pour consulter l'état de votre paiement en toute sécurité."
      >
        <div className="status-card-actions">
          <Link to="/login" className="btn btn-primary btn-lg-aps">Se reconnecter</Link>
        </div>
      </StatusCard>
    );
  }

  if (authStatus === 'loading' || statut === 'verification') {
    return (
      <StatusCard
        variant="pending"
        spinner
        badge="Vérification"
        title="Vérification du paiement…"
        text="Un instant, nous confirmons votre paiement auprès de notre partenaire bancaire."
      />
    );
  }

  if (statut === 'confirme') {
    return (
      <StatusCard
        variant="success"
        icon="fa-check"
        badge="Paiement réussi"
        title="Paiement confirmé"
        text="Votre rendez-vous est confirmé. Un récapitulatif vous a été envoyé par email."
        amount={formaterMontant(paiement?.montant, paiement?.devise)}
      >
        <div className="status-card-actions">
          <Link to="/portail/patient-rdv" className="btn btn-primary btn-lg-aps">
            <i className="fa-solid fa-calendar-check" /> Voir mes rendez-vous
          </Link>
        </div>
      </StatusCard>
    );
  }

  return (
    <StatusCard
      variant="pending"
      icon="fa-clock"
      badge="En attente"
      title="Confirmation en cours"
      text="Le paiement met un peu plus de temps que prévu à se confirmer. Réessayez dans une minute."
    >
      <div className="status-card-actions">
        <Link to="/portail/patient-rdv" className="btn btn-outline-primary btn-lg-aps">Mes rendez-vous</Link>
      </div>
    </StatusCard>
  );
}