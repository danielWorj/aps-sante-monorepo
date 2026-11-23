// src/components/auth/ValidationAppareil.jsx
//
// Connexion depuis un appareil inconnu (réponse « appareil_a_valider ») :
// l'utilisateur confirme que c'est bien lui, soit
//   - depuis l'application déjà connectée sur son téléphone (il y touche le
//     code à 2 chiffres affiché ici),
//   - soit par WhatsApp : il envoie un code à notre numéro (gratuit).
// Une fois confirmé, onSession(data) reçoit la session (access_token,
// utilisateur, espaces), comme une connexion normale.
import { useEffect, useRef, useState } from 'react';
import authService from '../../services/authService';
import EnvoiWhatsappInverse from './EnvoiWhatsappInverse';
import { NOM_MARQUE } from '../../lib/marque';

export default function ValidationAppareil({ validation, onSession, onAnnuler }) {
  const token = validation.token_validation_appareil;
  const methodes = validation.methodes ?? [];
  const [methode, setMethode] = useState(null);
  const [demandeApp, setDemandeApp] = useState(null);
  const [demandeWa, setDemandeWa] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const onSessionRef = useRef(onSession);
  useEffect(() => { onSessionRef.current = onSession; });

  const erreurLisible = (err) => {
    if (err?.data?.code === 'VALIDATION_EXPIREE') return 'Le délai est dépassé : reconnectez-vous.';
    return err?.message || 'Une erreur est survenue. Réessayez.';
  };

  // Lance la méthode choisie (au clic).
  const lancer = async (m) => {
    setDemandeApp(null);
    setDemandeWa(null);
    setErreur(null);
    setMethode(m);
    setEnvoi(true);
    try {
      if (m === 'application') setDemandeApp(await authService.demanderValidationApplication(token));
      else setDemandeWa(await authService.demanderValidationWhatsapp(token));
    } catch (err) {
      setErreur(erreurLisible(err));
      setMethode(null);
    } finally {
      setEnvoi(false);
    }
  };

  // Sondage de la confirmation depuis l'application (toutes les 2 s).
  useEffect(() => {
    if (!demandeApp) return undefined;
    let actif = true;
    let minuteur;
    const sonder = async () => {
      try {
        const r = await authService.sonderConnexionApplication(demandeApp.demande_id, demandeApp.secret);
        if (!actif) return;
        if (r.access_token) { onSessionRef.current?.(r); return; }
        if (r.statut === 'refusee' || r.statut === 'expiree') {
          setDemandeApp(null);
          setMethode(null);
          setErreur(r.statut === 'refusee' ? 'Confirmation refusée depuis le téléphone.' : 'Le délai est dépassé. Réessayez.');
          return;
        }
      } catch (err) {
        if (!actif) return;
        setDemandeApp(null);
        setMethode(null);
        setErreur(erreurLisible(err));
        return;
      }
      minuteur = setTimeout(sonder, 2000);
    };
    minuteur = setTimeout(sonder, 2000);
    return () => { actif = false; clearTimeout(minuteur); };
  }, [demandeApp]);

  const validerParPreuve = async (preuve) => {
    setEnvoi(true);
    setErreur(null);
    try {
      onSessionRef.current?.(await authService.validerAppareil(token, preuve));
    } catch (err) {
      setErreur(erreurLisible(err));
      setDemandeWa(null);
      setMethode(null);
    } finally {
      setEnvoi(false);
    }
  };

  const changerMethode = lancer;

  return (
    <div className="info-card" style={{ padding: '1.4rem', marginBottom: '1.2rem' }}>
      <div className="text-center">
        <i className="fa-solid fa-shield-halved" style={{ fontSize: '1.6rem', color: 'var(--primary)' }} />
        <h2 style={{ fontSize: '1.15rem', margin: '.5rem 0 .3rem' }}>Nouvel appareil</h2>
        <p className="text-muted-soft" style={{ fontSize: '.88rem' }}>
          C’est la première fois que vous vous connectez ici. Confirmez que c’est bien vous
          {validation.telephone_masque ? ` (${validation.telephone_masque})` : ''}.
        </p>
      </div>

      {erreur && (
        <div role="alert" className="alert alert-danger d-flex align-items-center gap-2">
          <i className="fa-solid fa-circle-exclamation" /> {erreur}
        </div>
      )}

      {!methode && (
        <div className="d-grid gap-2">
          {methodes.includes('application') && (
            <button type="button" className="btn btn-primary btn-block-aps" onClick={() => changerMethode('application')} disabled={envoi}>
              <i className="fa-solid fa-mobile-screen-button" /> Confirmer depuis mon téléphone ({NOM_MARQUE})
            </button>
          )}
          {methodes.includes('whatsapp') && (
            <button type="button" className="btn btn-outline-primary btn-block-aps" onClick={() => changerMethode('whatsapp')} disabled={envoi}>
              <i className="fa-brands fa-whatsapp" /> Confirmer par WhatsApp
            </button>
          )}
        </div>
      )}

      {methode && envoi && !demandeApp && !demandeWa && (
        <p className="text-center text-muted-soft"><i className="fa-solid fa-spinner fa-spin" /> Préparation…</p>
      )}

      {methode === 'application' && demandeApp && (
        <div className="text-center" role="status">
          <p style={{ margin: '.2rem 0 .3rem', fontWeight: 600 }}>
            Ouvrez l’application {NOM_MARQUE} sur votre téléphone et touchez ce code :
          </p>
          <div style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '.15em' }}>{demandeApp.code}</div>
          <p className="text-muted-soft" style={{ fontSize: '.82rem' }}>
            <i className="fa-solid fa-spinner fa-spin" /> En attente de votre confirmation (2 minutes)…
          </p>
        </div>
      )}

      {methode === 'whatsapp' && demandeWa && (
        <EnvoiWhatsappInverse
          demande={demandeWa}
          onPreuve={validerParPreuve}
          onExpire={() => { setDemandeWa(null); setMethode(null); setErreur('Le délai est dépassé. Réessayez.'); }}
        />
      )}

      <div className="d-flex justify-content-center flex-wrap gap-2 mt-2">
        {methode === 'application' && methodes.includes('whatsapp') && (
          <button type="button" className="btn btn-link btn-sm" onClick={() => changerMethode('whatsapp')}>
            Je n’ai pas mon téléphone : confirmer par WhatsApp
          </button>
        )}
        {methode === 'whatsapp' && methodes.includes('application') && (
          <button type="button" className="btn btn-link btn-sm" onClick={() => changerMethode('application')}>
            Confirmer plutôt depuis l’application
          </button>
        )}
        <button type="button" className="btn btn-link btn-sm" onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  );
}
