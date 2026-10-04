// src/components/paiement/AnnulerPaiementEnCours.jsx
//
// Affiché sous l'erreur « Un paiement est déjà en cours pour ce rendez-vous ».
// Le bouton annule la tentative en cours (POST /paiement/rendez-vous/:id/paiement/annuler)
// puis prévient le parent (`onAnnule`) pour que le patient relance un nouveau paiement.
// Le serveur refuse (409) si le paiement vient d'aboutir : on affiche alors son message.
import { useState } from 'react';
import { annulerPaiementEnCours } from '../../services/paiementService';

export default function AnnulerPaiementEnCours({ rdvId, onAnnule }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  const annuler = async () => {
    if (enCours) return;
    setErreur(null);
    setEnCours(true);
    try {
      await annulerPaiementEnCours(rdvId);
      onAnnule?.();
    } catch (err) {
      setErreur(err?.message || "Impossible d'annuler le paiement. Veuillez réessayer.");
      setEnCours(false);
    }
  };

  return (
    <div className="mt-2 mb-2">
      <button type="button" className="btn btn-outline-primary btn-sm-aps w-100" onClick={annuler} disabled={enCours}>
        {enCours ? (
          <><i className="fa-solid fa-spinner fa-spin" /> Annulation…</>
        ) : (
          <><i className="fa-solid fa-ban" /> Annuler le paiement en cours et recommencer</>
        )}
      </button>
      {erreur && (
        <p className="status-card-error mt-2">
          <i className="fa-solid fa-circle-exclamation" /> {erreur}
        </p>
      )}
    </div>
  );
}