// PaiementSucces.jsx
// Page de retour après Stripe Checkout (success_url = /paiement/succes?rdv_id=...).
// La source de vérité est le webhook côté serveur : on interroge l'API
// jusqu'à voir le paiement "reussie" (le webhook peut arriver quelques
// secondes après la redirection).
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { obtenirStatutPaiementRdv } from '../services/paiementService';

export default function PaiementSucces() {
  const [searchParams] = useSearchParams();
  const rdvId = searchParams.get('rdv_id');
  // Après la redirection depuis Stripe, la page est rechargée : la
  // session est restaurée en asynchrone (AuthContext). On attend qu'elle
  // soit prête avant d'appeler l'API, sinon l'appel part sans token et
  // déclenche un 2e refresh concurrent du même cookie (rotation stricte).
  const { status: authStatus } = useAuth();
  const [statut, setStatut] = useState('verification');

  useEffect(() => {
    if (!rdvId || authStatus !== 'authenticated') return undefined;
    let annule = false;
    let tentatives = 0;
    let timer;

    async function verifier() {
      try {
        const data = await obtenirStatutPaiementRdv(rdvId);
        if (annule) return;
        if (data.paiement?.statut === 'reussie') return setStatut('confirme');
      } catch { /* on retente */ }
      tentatives += 1;
      if (annule) return;
      if (tentatives < 10) timer = setTimeout(verifier, 1500);
      else setStatut('en_attente');
    }
    verifier();
    return () => { annule = true; clearTimeout(timer); };
  }, [rdvId, authStatus]);

  if (!rdvId) return <p className="container-aps">Rendez-vous introuvable.</p>;
  if (authStatus === 'unauthenticated') {
    return (
      <p className="container-aps">
        Session expirée : <Link to="/login">reconnectez-vous</Link> pour voir l&apos;état de votre paiement.
      </p>
    );
  }
  if (authStatus === 'loading' || statut === 'verification') return <p className="container-aps">Vérification du paiement…</p>;
  if (statut === 'confirme') {
    return (
      <div className="container-aps">
        <h1>Paiement confirmé ✅</h1>
        <Link to="/portail/patient-rdv">Voir mes rendez-vous</Link>
      </div>
    );
  }
  return (
    <p className="container-aps">
      Confirmation en cours, réessayez dans une minute. <Link to="/portail/patient-rdv">Mes rendez-vous</Link>
    </p>
  );
}