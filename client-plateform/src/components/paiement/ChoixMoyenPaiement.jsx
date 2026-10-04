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
// Politique de fonds v2 — facture AVANT paiement : le patient voit la facture détaillée
// (consultation + frais d'agrégateur + commission APS, GET /paiement/rendez-vous/:id/facture)
// recalculée selon le moyen de paiement choisi (survol / focus / onglet), et le total
// sous chaque moyen (GET /paiement/rendez-vous/:id/devis). Un moyen dont le barème n'est
// pas encore saisi côté admin (503) est grisé avec le message du serveur.
//
// Le montant n'est jamais envoyé : le serveur le recalcule. Aucun montant n'est calculé ici.
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { demanderPaiementRdv, obtenirDevisPaiement, estPaiementEnCours } from '../../services/paiementService';
import AnnulerPaiementEnCours from './AnnulerPaiementEnCours';
import { FactureRdv } from './FactureRecapitulative';
import { montantDevise } from '../../utils/fonds';

// Résumé du devis sous un moyen de paiement. `d` : undefined = chargement, { erreur } = indisponible.
// Le détail ligne par ligne est dans la facture affichée plus haut.
function DetailDevis({ d }) {
  if (d === undefined) return <small>Calcul du montant…</small>;
  if (d.erreur) return <small className="text-danger">{d.erreur}</small>;
  return (
    <small>
      Total : <strong>{montantDevise(d.total, d.devise)}</strong>
      <br />
      Si vous annulez plus de 24 h à l’avance : remboursement d’environ {montantDevise(d.remboursement_estime, d.devise)}
      {d.remboursement_indicatif && ' (estimation)'}, soit les honoraires moins les frais de remboursement
      (commission APS et frais d’envoi non remboursés).
    </small>
  );
}

const MOYENS = [
  { agregateur: 'stripe', libelle: 'Carte bancaire' },
  { agregateur: 'campay', libelle: 'Mobile Money' },
];

export default function ChoixMoyenPaiement({ rdvId, onFermer, onChoisirMobileMoney }) {
  const [redirection, setRedirection] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [paiementEnCours, setPaiementEnCours] = useState(false); // 409 annulable
  const [infoAnnulation, setInfoAnnulation] = useState(null);
  // Devis par agrégateur : undefined = en cours de calcul, { erreur } = indisponible.
  const [devis, setDevis] = useState({ stripe: undefined, campay: undefined });
  // Moyen dont la facture est affichée (suit le survol / le focus des options ou l'onglet choisi).
  const [apercu, setApercu] = useState('stripe');

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

        {/* Facture détaillée, recalculée par le serveur selon le moyen de paiement */}
        <div className="choix-paiement-facture">
          <div className="choix-paiement-onglets" role="tablist" aria-label="Facture selon le moyen de paiement">
            {MOYENS.map((m) => (
              <button
                key={m.agregateur}
                type="button"
                role="tab"
                aria-selected={apercu === m.agregateur}
                className={`choix-paiement-onglet${apercu === m.agregateur ? ' is-actif' : ''}`}
                onClick={() => setApercu(m.agregateur)}
              >
                {m.libelle}
              </button>
            ))}
          </div>
          {devis[apercu]?.erreur ? (
            <p className="status-card-error"><i className="fa-solid fa-circle-exclamation" /> {devis[apercu].erreur}</p>
          ) : (
            <FactureRdv rdvId={rdvId} agregateur={apercu} compact />
          )}
        </div>

        <div className="choix-paiement-options">
          {/* Carte bancaire (Stripe) */}
          <button
            type="button"
            className="choix-paiement-option"
            onMouseEnter={() => setApercu('stripe')}
            onFocus={() => setApercu('stripe')}
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
            onMouseEnter={() => setApercu('campay')}
            onFocus={() => setApercu('campay')}
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