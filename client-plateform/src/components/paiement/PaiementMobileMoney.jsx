// src/components/paiement/PaiementMobileMoney.jsx
//
// Modale « Payer par Mobile Money » (CamPay — MTN / Orange).
//
// Flux :
//   1. saisie   : le patient renseigne son numéro ;
//   2. attente  : POST /paiement/rendez-vous/:id/paiement-campay envoie une
//                 demande de validation sur son téléphone ; on interroge
//                 ensuite GET /paiement/rendez-vous/:id/paiement ;
//   3. succès   : dès que `paiement.statut === 'reussie'` (confirmé par le
//                 SERVEUR), redirection vers /paiement/succes ;
//   4. echec / delai : refus, expiration, RDV annulé, ou pas de réponse.
//
// Règle d'or : le client ne confirme jamais rien lui-même. Le montant n'est
// pas envoyé non plus : le serveur le recalcule.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  demanderPaiementCampay,
  obtenirStatutPaiementRdv,
} from '../../services/paiementService';
import {
  estNumeroCMValide,
  formaterNumeroAffichage,
} from '../../utils/mobileMoney';

const INTERVALLE_MS = 3000;
const TENTATIVES_MAX = 30; // ~90 s : le temps de valider sur le téléphone

export default function PaiementMobileMoney({ rdvId, telephoneInitial = '', onFermer }) {
  const navigate = useNavigate();
  const [numero, setNumero] = useState(telephoneInitial || '');
  const [etape, setEtape] = useState('saisie'); // saisie | attente | echec | delai
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [info, setInfo] = useState(null); // { reference, ussd_code, operateur }
  const [erreur, setErreur] = useState(null);

  const timer = useRef(null);
  const demonte = useRef(false);

  useEffect(() => {
    demonte.current = false;
    return () => {
      demonte.current = true;
      clearTimeout(timer.current);
    };
  }, []);

  // Échap = fermer
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onFermer?.(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onFermer]);

  const surveiller = useCallback(function boucle(essai = 0) {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (demonte.current) return;
      try {
        const data = await obtenirStatutPaiementRdv(rdvId);
        if (demonte.current) return;

        if (data.paiement?.statut === 'reussie') {
          navigate(`/paiement/succes?rdv_id=${rdvId}`); // page existante, inchangée
          return;
        }
        if (data.statut_rdv === 'annule') {
          setErreur('Ce rendez-vous a été annulé.');
          setEtape('echec');
          return;
        }
        if (data.tentative_campay?.statut === 'echouee') {
          setErreur(null);
          setEtape('echec');
          return;
        }
      } catch {
        /* erreur réseau transitoire : on retente */
      }
      if (demonte.current) return;
      if (essai + 1 >= TENTATIVES_MAX) {
        setEtape('delai');
        return;
      }
      boucle(essai + 1);
    }, INTERVALLE_MS);
  }, [rdvId, navigate]);

  const numeroValide = estNumeroCMValide(numero);

  const payer = async () => {
    if (envoiEnCours || !numeroValide) return;
    setErreur(null);
    setEnvoiEnCours(true);
    try {
      const data = await demanderPaiementCampay(rdvId, numero);
      if (demonte.current) return;
      setInfo(data);
      setEtape('attente');
      surveiller();
    } catch (err) {
      if (demonte.current) return;
      setErreur(
        err?.status === 429
          ? 'Trop de tentatives. Réessayez dans quelques minutes.'
          : err?.message || 'Impossible de lancer le paiement. Veuillez réessayer.'
      );
      setEtape('saisie');
    } finally {
      if (!demonte.current) setEnvoiEnCours(false);
    }
  };

  const reessayer = () => {
    setErreur(null);
    setInfo(null);
    setEtape('saisie');
  };

  const reverifier = () => {
    setEtape('attente');
    surveiller();
  };

  return (
    <div className="rdv-modal-overlay" onClick={onFermer}>
      <div
        className="rdv-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="momo-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="rdv-modal-close" onClick={onFermer} aria-label="Fermer">
          <i className="fa-solid fa-xmark" />
        </button>

        <h3 id="momo-titre" className="mb-3" style={{ fontSize: '1.15rem' }}>
          <i className="fa-solid fa-mobile-screen me-2" />
          Payer par Mobile Money
        </h3>

        {etape === 'saisie' && (
          <>
            <label htmlFor="momo-numero" className="form-label">
              Numéro MTN ou Orange
            </label>
            <input
              id="momo-numero"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              className={`form-control ${numero && !numeroValide ? 'is-invalid' : ''}`}
              placeholder="6XX XXX XXX"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') payer(); }}
              disabled={envoiEnCours}
            />
            {numero && !numeroValide && (
              <div className="invalid-feedback d-block">
                Saisissez un numéro camerounais valide (format 6XXXXXXXX).
              </div>
            )}
            <p className="text-faint mt-2 mb-3" style={{ fontSize: '.82rem' }}>
              Le numéro peut être celui d&apos;un proche. Une demande de validation y sera envoyée.
            </p>
            {erreur && (
              <p className="status-card-error">
                <i className="fa-solid fa-circle-exclamation" /> {erreur}
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary btn-block-aps w-100"
              onClick={payer}
              disabled={!numeroValide || envoiEnCours}
            >
              {envoiEnCours ? (
                <><i className="fa-solid fa-spinner fa-spin" /> Envoi de la demande…</>
              ) : (
                'Envoyer la demande de paiement'
              )}
            </button>
          </>
        )}

        {etape === 'attente' && (
          <div className="text-center">
            <div className="status-card-spinner" />
            <p className="mt-3">
              Une demande de paiement a été envoyée au{' '}
              <strong>{formaterNumeroAffichage(numero)}</strong>
              {info?.operateur ? <> ({info.operateur})</> : null}.
              <br />
              Validez-la sur votre téléphone avec votre code secret.
            </p>
            {info?.ussd_code && (
              <p className="text-faint" style={{ fontSize: '.85rem' }}>
                Sinon, composez : <strong>{info.ussd_code}</strong>
              </p>
            )}
            <p className="text-faint" style={{ fontSize: '.8rem' }}>
              Ne fermez pas cette fenêtre : la confirmation est automatique.
            </p>
          </div>
        )}

        {etape === 'echec' && (
          <div className="text-center">
            <p className="status-card-error justify-content-center">
              <i className="fa-solid fa-circle-exclamation" />{' '}
              {erreur || 'Le paiement a été refusé ou a expiré.'}
            </p>
            {!erreur?.includes('annulé') && (
              <button type="button" className="btn btn-primary btn-block-aps w-100" onClick={reessayer}>
                <i className="fa-solid fa-rotate-right" /> Réessayer
              </button>
            )}
          </div>
        )}

        {etape === 'delai' && (
          <div className="text-center">
            <p>
              Nous attendons encore la confirmation de l&apos;opérateur. Si vous avez déjà validé,
              patientez un instant.
            </p>
            <button type="button" className="btn btn-outline-primary btn-block-aps w-100" onClick={reverifier}>
              Vérifier à nouveau
            </button>
          </div>
        )}

        <button type="button" className="btn btn-ghost btn-sm-aps w-100 mt-2" onClick={onFermer}>
          Fermer
        </button>
      </div>
    </div>
  );
}