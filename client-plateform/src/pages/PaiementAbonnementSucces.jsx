// PaiementAbonnementSucces.jsx
// Retour après paiement d'un abonnement assurance (Stripe Checkout :
// success_url = /paiement/abonnement/succes?abonnement_id=... ; Mobile Money :
// redirection depuis <PaiementMobileMoney />). Guide abonnements v3, §2.2.4.
// Source de vérité : le serveur (webhook / callback). On interroge le statut
// jusqu'à voir le paiement « reussie » ET l'abonnement « actif ».
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  obtenirStatutPaiementAbonnement,
  obtenirFactureAbonnement,
} from '../services/abonnementAssuranceService';
import { FactureChargee } from '../components/paiement/FactureRecapitulative';

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

function dernierJour(iso) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
}

function StatusCard({ variant, icon, spinner, badge, title, text, children }) {
  return (
    <div className="container-aps status-page">
      <div className={`status-card is-${variant}`}>
        {spinner ? <div className="status-card-spinner" /> : <div className="status-card-icon"><i className={`fa-solid ${icon}`} /></div>}
        {badge && <span className="status-card-badge">{badge}</span>}
        <h1>{title}</h1>
        <p className="status-card-text">{text}</p>
        {children}
      </div>
    </div>
  );
}

export default function PaiementAbonnementSucces() {
  const [searchParams] = useSearchParams();
  const abonnementId = searchParams.get('abonnement_id');
  // Attendre la restauration de session avant tout appel (sinon deux refresh
  // concurrents du même cookie — même règle que PaiementSucces.jsx).
  const { status: authStatus } = useAuth();
  const [statut, setStatut] = useState('verification');
  const [donnees, setDonnees] = useState(null);

  useEffect(() => {
    if (!abonnementId || authStatus !== 'authenticated') return undefined;
    let annule = false;
    let tentatives = 0;
    let timer;

    async function verifier() {
      try {
        const data = await obtenirStatutPaiementAbonnement(abonnementId);
        if (annule) return;
        if (data.paiement?.statut === 'reussie' && data.statut_abonnement !== 'en_attente_paiement') {
          setDonnees(data);
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
  }, [abonnementId, authStatus]);

  if (!abonnementId) {
    return (
      <StatusCard variant="neutral" icon="fa-file-circle-xmark" title="Abonnement introuvable"
        text="Le lien utilisé ne référence aucun abonnement. Repartez de la page des abonnements.">
        <div className="status-card-actions">
          <Link to="/pricing" className="btn btn-primary btn-lg-aps">Voir les abonnements</Link>
        </div>
      </StatusCard>
    );
  }

  if (authStatus === 'unauthenticated') {
    return (
      <StatusCard variant="neutral" icon="fa-lock" title="Session expirée"
        text="Reconnectez-vous pour consulter l'état de votre paiement en toute sécurité.">
        <div className="status-card-actions">
          <Link to="/login" state={{ from: `/paiement/abonnement/succes?abonnement_id=${abonnementId}` }} className="btn btn-primary btn-lg-aps">
            Se reconnecter
          </Link>
        </div>
      </StatusCard>
    );
  }

  if (authStatus === 'loading' || statut === 'verification') {
    return (
      <StatusCard variant="pending" spinner badge="Vérification" title="Vérification du paiement…"
        text="Un instant, nous confirmons votre paiement auprès de notre partenaire." />
    );
  }

  if (statut === 'confirme') {
    const abo = donnees.abonnement;
    const actif = donnees.statut_abonnement === 'actif';
    return (
      <StatusCard
        variant="success"
        icon="fa-check"
        badge="Paiement réussi"
        title={actif ? 'Abonnement activé' : 'Paiement reçu'}
        text={
          actif
            ? `Votre abonnement « ${abo.niveau.libelle} » est actif du ${formatDate(abo.date_debut)} au ${formatDate(dernierJour(abo.date_fin))} inclus.`
            : "Votre paiement a bien été reçu. Notre équipe le vérifie et revient vers vous rapidement."
        }
      >
        {abo.facture_numero && (
          <div className="mb-3">
            <FactureChargee cle={`facture-abonnement:${abonnementId}`} charger={() => obtenirFactureAbonnement(abonnementId)} />
          </div>
        )}
        <div className="status-card-actions">
          <Link to={`/assurances/${abo.service_assurance_id}/gestion`} className="btn btn-primary btn-lg-aps">
            <i className="fa-solid fa-sliders" /> Gérer ma fiche
          </Link>
        </div>
      </StatusCard>
    );
  }

  return (
    <StatusCard variant="pending" icon="fa-clock" badge="En attente" title="Paiement en cours de traitement"
      text="Votre paiement est en cours de traitement. Votre abonnement sera activé dès sa confirmation ; vous en serez informé dans votre espace.">
      <div className="status-card-actions">
        <Link to="/mon-espace-assurance" className="btn btn-outline-primary btn-lg-aps">Mon espace</Link>
      </div>
    </StatusCard>
  );
}
