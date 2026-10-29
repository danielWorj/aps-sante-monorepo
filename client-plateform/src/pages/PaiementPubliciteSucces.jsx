// PaiementPubliciteSucces.jsx
// Retour après paiement d'une publicité : Stripe Checkout (success_url) ou
// Mobile Money (<PaiementMobileMoney />). Le serveur fait foi (webhook /
// callback) : on interroge le statut jusqu'à voir la publicité « payee »,
// puis on affiche la facture. L'annonceur reçoit aussi la confirmation et
// le récapitulatif de facture par WhatsApp.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { obtenirFacturePublicite, obtenirStatutPaiementPublicite } from '../services/publiciteService';
import { FactureChargee } from '../components/paiement/FactureRecapitulative';

const formatJour = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
const veille = (iso) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
};

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

export default function PaiementPubliciteSucces() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('publicite_id');
  const { status: authStatus } = useAuth();
  const [statut, setStatut] = useState('verification');
  const [donnees, setDonnees] = useState(null);

  useEffect(() => {
    if (!id || authStatus !== 'authenticated') return undefined;
    let annule = false;
    let tentatives = 0;
    let timer;
    async function verifier() {
      try {
        const data = await obtenirStatutPaiementPublicite(id);
        if (annule) return;
        setDonnees(data);
        if (data.statut_publicite === 'payee') return setStatut('confirme');
        if (data.tentative_campay?.statut === 'echouee') return setStatut('echec');
      } catch { /* on retente */ }
      tentatives += 1;
      if (annule) return;
      if (tentatives < 10) timer = setTimeout(verifier, 1500);
      else setStatut('en_attente');
    }
    verifier();
    return () => { annule = true; clearTimeout(timer); };
  }, [id, authStatus]);

  if (!id) {
    return (
      <StatusCard variant="neutral" icon="fa-file-circle-xmark" title="Publicité introuvable"
        text="Le lien utilisé ne référence aucune publicité.">
        <div className="status-card-actions"><Link to="/portail/annonceur" className="btn btn-primary btn-lg-aps">Mes publicités</Link></div>
      </StatusCard>
    );
  }
  if (authStatus === 'unauthenticated') {
    return (
      <StatusCard variant="neutral" icon="fa-lock" title="Session expirée"
        text="Reconnectez-vous pour consulter l'état de votre paiement en toute sécurité.">
        <div className="status-card-actions">
          <Link to="/login" state={{ from: `/paiement/publicite/succes?publicite_id=${id}` }} className="btn btn-primary btn-lg-aps">Se reconnecter</Link>
        </div>
      </StatusCard>
    );
  }
  if (authStatus === 'loading' || statut === 'verification') {
    return <StatusCard variant="pending" spinner badge="Vérification" title="Vérification du paiement…"
      text="Un instant, nous confirmons votre paiement auprès de notre partenaire." />;
  }

  if (statut === 'confirme') {
    const p = donnees.publicite;
    return (
      <StatusCard variant="success" icon="fa-check" badge="Paiement réussi" title="Votre publicité est programmée"
        text={`« ${p.titre} » sera diffusée du ${formatJour(p.date_debut)} au ${formatJour(veille(p.date_fin))} inclus. Une confirmation avec votre facture vous a été envoyée par le canal que vous avez choisi.`}>
        {p.facture_numero && (
          <div className="mb-3">
            <FactureChargee cle={`facture-publicite:${id}`} charger={() => obtenirFacturePublicite(id)} />
          </div>
        )}
        <div className="status-card-actions">
          <Link to={`/portail/annonceur/publicites/${id}`} className="btn btn-primary btn-lg-aps">
            <i className="fa-solid fa-chart-line" /> Suivre mes statistiques
          </Link>
        </div>
      </StatusCard>
    );
  }

  if (statut === 'echec') {
    return (
      <StatusCard variant="cancel" icon="fa-xmark" badge="Paiement échoué" title="Le paiement n’a pas abouti"
        text="Votre opérateur a refusé ou n’a pas confirmé le paiement. Aucun montant n’a été validé : vous pouvez réessayer.">
        <div className="status-card-actions">
          <Link to={`/publicite/${id}/paiement`} className="btn btn-primary btn-lg-aps"><i className="fa-solid fa-rotate-right" /> Réessayer</Link>
        </div>
      </StatusCard>
    );
  }

  return (
    <StatusCard variant="pending" icon="fa-clock" badge="En attente" title="Paiement en cours de traitement"
      text="Votre paiement est en cours de confirmation. Vous recevrez un message dès qu’il sera validé.">
      <div className="status-card-actions">
        <Link to={`/portail/annonceur/publicites/${id}`} className="btn btn-outline-primary btn-lg-aps">Ma publicité</Link>
      </div>
    </StatusCard>
  );
}
