// src/components/auth/GardePin.jsx
//
// Demande du code PIN pour les opérations protégées : le serveur répond
// 403 { code: "PIN_REQUIS" } (retrait, moyens de paiement, entrée dans un
// espace professionnel) ; apiClient.js appelle alors ce composant, qui
// demande le PIN, le confirme (POST /auth/pin/verifier, nouveau jeton
// valable 5 minutes) puis laisse apiClient rejouer la requête.
// Monté une seule fois (main.jsx).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch, setAccessToken, setPinRequisHandler } from '../../lib/apiClient';

export default function GardePin() {
  const [demande, setDemande] = useState(null); // { resoudre }
  const [pin, setPin] = useState('');
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef(null);

  useEffect(() => {
    setPinRequisHandler(() => new Promise((resoudre) => {
      setPin('');
      setErreur(null);
      setDemande({ resoudre });
    }));
    return () => setPinRequisHandler(null);
  }, []);

  useEffect(() => {
    if (demande) champ.current?.focus();
  }, [demande]);

  if (!demande) return null;

  const fermer = (ok) => {
    demande.resoudre(ok);
    setDemande(null);
  };

  const valider = async (e) => {
    e.preventDefault();
    if (pin.length !== 6) return setErreur('Le code PIN comporte 6 chiffres.');
    setEnvoi(true);
    setErreur(null);
    try {
      const data = await apiFetch('/auth/pin/verifier', { method: 'POST', body: { pin }, skipPinRetry: true });
      setAccessToken(data.access_token);
      fermer(true);
    } catch (err) {
      setPin('');
      setErreur(err?.message || 'Code PIN incorrect.');
    } finally {
      setEnvoi(false);
    }
  };

  return createPortal(
    <div className="aps-dialog-fond" onMouseDown={(e) => { if (e.target === e.currentTarget && !envoi) fermer(false); }}>
      <form className="aps-dialog aps-dialog--primaire" role="dialog" aria-modal="true" aria-labelledby="garde-pin-titre" onSubmit={valider}>
        <div className="aps-dialog-tete">
          <span className="aps-dialog-icone" aria-hidden="true"><i className="fa-solid fa-key"></i></span>
          <h2 id="garde-pin-titre" className="aps-dialog-titre">Confirmez avec votre code PIN</h2>
        </div>
        <div className="aps-dialog-message">Par sécurité, cette opération demande votre code PIN à 6 chiffres.</div>
        <div className="aps-dialog-saisie">
          <input
            ref={champ}
            className={`aps-dialog-champ${erreur ? ' is-invalide' : ''}`}
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            aria-label="Code PIN"
            style={{ letterSpacing: '.5em', textAlign: 'center' }}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            disabled={envoi}
          />
          {erreur && <div className="aps-dialog-erreur" role="alert">{erreur}</div>}
        </div>
        <div className="aps-dialog-actions">
          <button type="button" className="aps-dialog-btn aps-dialog-btn--neutre" onClick={() => fermer(false)} disabled={envoi}>Annuler</button>
          <button type="submit" className="aps-dialog-btn aps-dialog-btn--primaire" disabled={envoi}>
            {envoi ? 'Vérification…' : 'Confirmer'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
