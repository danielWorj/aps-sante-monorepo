// PaiementSucces.jsx
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { obtenirStatutPaiementRdv } from '../services/paiementService';

export default function PaiementSucces() {
  const [searchParams] = useSearchParams();
  const rdvId = searchParams.get('rdv_id');
  const [statut, setStatut] = useState('verification');

  useEffect(() => {
    if (!rdvId) return;
    let annule = false, tentatives = 0;
    async function verifier() {
      try {
        const data = await obtenirStatutPaiementRdv(rdvId);
        if (!annule && data.paiement?.statut === 'reussie') return setStatut('confirme');
      } catch { /* on retente */ }
      tentatives += 1;
      if (!annule) tentatives < 10 ? setTimeout(verifier, 1500) : setStatut('en_attente');
    }
    verifier();
    return () => { annule = true; };
  }, [rdvId]);

  if (statut === 'verification') return <p>Vérification du paiement…</p>;
  if (statut === 'confirme') return <div><h1>Paiement confirmé ✅</h1><Link to="/portail/patient/rendez-vous">Voir mes rendez-vous</Link></div>;
  return <p>Confirmation en cours, réessayez dans une minute.</p>;
}