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
// Politique de fonds v2 §1 — devis AVANT paiement : sous chaque moyen, le patient
// voit « total = honoraires + frais d'envoi » (GET /paiement/rendez-vous/:id/devis).
// Aucune taxe ni commission APS dans ce qu'il paie. Un moyen dont le barème n'est
// pas encore saisi côté admin (503) est grisé avec le message du serveur.
//
// Le montant n'est jamais envoyé : le serveur le recalcule.
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { demanderPaiementRdv, obtenirDevisPaiement, estPaiementEnCours } from '../../services/paiementService';
import AnnulerPaiementEnCours from './AnnulerPaiementEnCours';
import { montantDevise } from '../../utils/fonds';

// Détail du devis sous un moyen de paiement. `d` : undefined = chargement, { erreur } = indisponible.
function DetailDevis({ d }) {
  if (d === undefined) return <small>Calcul du montant…</small>;
  if (d.erreur) return <small className="text-danger">{d.erreur}</small>;
  return (
    <small>
      <strong>{montantDevise(d.total, d.devise)}</strong>
      {' '}= honoraires {montantDevise(d.honoraires, d.devise)} + frais d’envoi {montantDevise(d.frais_envoi, d.devise)}
      <br />
      Annulation possible avec remboursement d’environ {montantDevise(d.remboursement_estime, d.devise)}
      {d.remboursement_indicatif && ' (estimation)'}
    </small>
  );
}

export default function ChoixMoyenPaiement({ rdvId, onFermer, onChoisirMobileMoney }) {
  const [redirection, setRedirection] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [paiementEnCours, setPaiementEnCours] = useState(false); // 409 annulable
  const [infoAnnulation, setInfoAnnulation] = useState(null);
  // Devis par agrégateur : undefined = en cours de calcul, { erreur } = indisponible.
  const [devis, setDevis] = useState({ stripe: undefined, campay: undefined });

  // Pendant la redirection vers Stripe, on ne ferme plus par accident.
  const fermer = useCallback(() => {
    if (!redirection) onFermer?.();
  }, [redirection, onFermer]);

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') fermer(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fermer]);

  // Chargement des deux devis en parallèle ; l'échec de l'un n'affecte pas l'autre.
  useEffect(() => {
    if (!rdvId) return undefined;
    let annule = false;
    setDevis({ stripe: undefined, campay: undefined });
    ['stripe', 'campay'].forEach(async (agregateur) => {
      try {
        const d = await obtenirDevisPaiement(rdvId, agregateur);
        if (!annule) setDevis((p) => ({ ...p, [agregateur]: d }));
      } catch (err) {
        if (!annule) setDevis((p) => ({ ...p, [agregateur]: { erreur: err?.message || 'Montant indisponible.' } }));
      }
    });
    return () => { annule = true; };
  }, [rdvId]);

  const payerParCarte = async () => {
    if (redirection || !rdvId) return;
    setErreur(null);
    setInfoAnnulation(null);
    setPaiementEnCours(false);
    setRedirection(true);
    try {
      window.location.href = await demanderPaiementRdv(rdvId); // Stripe Checkout
    } catch (err) {
      setErreur(err?.message || 'Impossible de lancer le paiement. Veuillez réessayer.');
      setPaiementEnCours(estPaiementEnCours(err));
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
        {paiementEnCours && (
          <AnnulerPaiementEnCours
            rdvId={rdvId}
            onAnnule={() => {
              setErreur(null);
              setPaiementEnCours(false);
              setInfoAnnulation('Le paiement précédent a été annulé. Vous pouvez choisir un moyen de paiement.');
            }}
          />
        )}
        {infoAnnulation && <p className="status-card-text">{infoAnnulation}</p>}

        <div className="choix-paiement-options">
          {/* Carte bancaire (Stripe) */}
          <button
            type="button"
            className="choix-paiement-option"
            onClick={payerParCarte}
            disabled={redirection || !!devis.stripe?.erreur}
          >
            <span className="choix-paiement-option-icon">
              {redirection
                ? <span className="spinner-border spinner-border-sm" />
                : <i className="fa-solid fa-credit-card" />}
            </span>
            <span className="choix-paiement-option-body">
              <strong>Carte bancaire</strong>
              {redirection ? <small>Redirection vers Stripe…</small> : <DetailDevis d={devis.stripe} />}
            </span>
            <i className="fa-solid fa-chevron-right choix-paiement-option-arrow" />
          </button>

          {/* Mobile Money (CamPay) */}
          <button
            type="button"
            className="choix-paiement-option"
            onClick={() => onChoisirMobileMoney?.()}
            disabled={redirection || !!devis.campay?.erreur}
          >
            <span className="choix-paiement-option-icon">
              <i className="fa-solid fa-mobile-screen" />
            </span>
            <span className="choix-paiement-option-body">
              <strong>Mobile Money</strong>
              <DetailDevis d={devis.campay} />
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