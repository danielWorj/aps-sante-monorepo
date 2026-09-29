// src/components/paiement/ChoixMoyenPaiement.jsx
//
// Pop-up « Choisissez votre moyen de paiement », affichée au clic sur « Payer ».
// Même apparence que la carte de PaiementSucces.jsx (status-card), avec des
// bords rectangulaires. Deux cartes cliquables :
//   - Carte bancaire (Stripe)  : POST /paiement/rendez-vous/:id/paiement puis
//                                redirection vers Stripe Checkout ;
//   - Mobile Money (CamPay)    : appelle onChoisirMobileMoney, le parent ferme
//                                cette pop-up et ouvre <PaiementMobileMoney />.
//
// Le montant n'est jamais envoyé : le serveur le recalcule.
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { demanderPaiementRdv } from '../../services/paiementService';

export default function ChoixMoyenPaiement({ rdvId, onFermer, onChoisirMobileMoney }) {
  const [redirection, setRedirection] = useState(false);
  const [erreur, setErreur] = useState(null);

  // Pendant la redirection vers Stripe, on ne ferme plus par accident.
  const fermer = useCallback(() => {
    if (!redirection) onFermer?.();
  }, [redirection, onFermer]);

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') fermer(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fermer]);

  const payerParCarte = async () => {
    if (redirection || !rdvId) return;
    setErreur(null);
    setRedirection(true);
    try {
      window.location.href = await demanderPaiementRdv(rdvId); // Stripe Checkout
    } catch (err) {
      setErreur(err?.message || 'Impossible de lancer le paiement. Veuillez réessayer.');
      setRedirection(false);
    }
  };

  return createPortal(
    <div className="rdv-modal-overlay" onClick={fermer}>
      <div
        className="status-card is-success choix-paiement-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="choix-paiement-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="rdv-modal-close" onClick={fermer} aria-label="Fermer">
          <i className="fa-solid fa-xmark" />
        </button>

        <div className="status-card-icon"><i className="fa-solid fa-wallet" /></div>
        <span className="status-card-badge">Paiement sécurisé</span>
        <h1 id="choix-paiement-titre">Comment souhaitez-vous payer ?</h1>
        <p className="status-card-text">
          Choisissez votre moyen de paiement. Votre rendez-vous sera confirmé dès la réception du règlement.
        </p>

        {erreur && (
          <p className="status-card-error">
            <i className="fa-solid fa-circle-exclamation" /> {erreur}
          </p>
        )}

        <div className="choix-paiement-options">
          <button
            type="button"
            className="choix-paiement-option"
            onClick={payerParCarte}
            disabled={redirection}
          >
            <span className="choix-paiement-option-icon">
              {redirection
                ? <span className="spinner-border spinner-border-sm" />
                : <i className="fa-solid fa-credit-card" />}
            </span>
            <span className="choix-paiement-option-body">
              <strong>Carte bancaire</strong>
              <small>{redirection ? 'Redirection vers Stripe…' : 'Visa, Mastercard — paiement via Stripe'}</small>
            </span>
            <i className="fa-solid fa-chevron-right choix-paiement-option-arrow" />
          </button>

          <button
            type="button"
            className="choix-paiement-option"
            onClick={() => onChoisirMobileMoney?.()}
            disabled={redirection}
          >
            <span className="choix-paiement-option-icon">
              <i className="fa-solid fa-mobile-screen" />
            </span>
            <span className="choix-paiement-option-body">
              <strong>Mobile Money</strong>
              <small>MTN / Orange — paiement via CamPay</small>
            </span>
            <i className="fa-solid fa-chevron-right choix-paiement-option-arrow" />
          </button>
        </div>

        <button type="button" className="btn btn-ghost btn-sm-aps w-100 mt-3" onClick={fermer} disabled={redirection}>
          Annuler
        </button>
      </div>
    </div>,
    document.body
  );
}