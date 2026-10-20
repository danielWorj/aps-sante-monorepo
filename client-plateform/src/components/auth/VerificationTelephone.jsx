// src/components/auth/VerificationTelephone.jsx
//
// Vérification d'un numéro par code reçu (SMS ou WhatsApp), quand le
// serveur l'a activée (GET /auth/configuration-connexion). Deux temps :
// « Recevoir le code » puis saisie du code ; en cas de succès, la `preuve`
// est remontée par onPreuve() et sera consommée par le serveur
// (inscription, changement de numéro, code PIN oublié).
import { useEffect, useState } from 'react';
import authService from '../../services/authService';

const LIBELLE_CANAL = { sms: 'SMS', whatsapp: 'WhatsApp' };

export default function VerificationTelephone({ telephone, pays_iso2, objet, canaux = ['sms'], preuve, onPreuve }) {
  const [canal, setCanal] = useState(canaux[0]);
  // Numéro auquel le code a été envoyé : s'il change, on repart de l'envoi.
  const [envoyePour, setEnvoyePour] = useState(null);
  const etape = envoyePour === `${pays_iso2}|${telephone}` ? 'code' : 'envoi';
  const [code, setCode] = useState('');
  const [info, setInfo] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [attente, setAttente] = useState(0);

  useEffect(() => {
    if (attente <= 0) return undefined;
    const t = setTimeout(() => setAttente((a) => a - 1), 1000);
    return () => clearTimeout(t);
  }, [attente]);

  if (preuve) {
    return (
      <p className="form-hint" style={{ color: 'var(--primary-dark)', fontWeight: 600 }}>
        <i className="fa-solid fa-circle-check" /> Numéro vérifié.
      </p>
    );
  }

  const envoyer = async () => {
    setErreur(null);
    if (!telephone?.trim()) return setErreur('Renseignez d’abord votre numéro.');
    setEnvoi(true);
    try {
      const r = await authService.envoyerCodeTelephone({ telephone, pays_iso2, objet, canal });
      setInfo(r.message);
      setCode('');
      setEnvoyePour(`${pays_iso2}|${telephone}`);
      setAttente(r.delai_renvoi_s ?? 60);
    } catch (err) {
      setErreur(err.message);
      if (err.data?.attente_s) setAttente(err.data.attente_s);
    } finally {
      setEnvoi(false);
    }
  };

  const verifier = async () => {
    setErreur(null);
    setEnvoi(true);
    try {
      const r = await authService.verifierCodeTelephone({ telephone, pays_iso2, objet, code });
      onPreuve?.(r.preuve);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="info-card" style={{ padding: '1rem', margin: '0 0 1rem' }}>
      <strong style={{ display: 'block', marginBottom: '.4rem' }}>
        <i className="fa-solid fa-shield-halved" /> Vérification de votre numéro
      </strong>
      {etape === 'envoi' ? (
        <div className="d-flex flex-wrap gap-2 align-items-center">
          {canaux.length > 1 && (
            <select className="form-select" style={{ maxWidth: 150 }} value={canal} onChange={(e) => setCanal(e.target.value)} aria-label="Recevoir le code par">
              {canaux.map((c) => <option key={c} value={c}>{LIBELLE_CANAL[c] ?? c}</option>)}
            </select>
          )}
          <button type="button" className="btn btn-outline-primary btn-sm-aps" onClick={envoyer} disabled={envoi || attente > 0}>
            {envoi ? 'Envoi…' : attente > 0 ? `Patientez ${attente} s` : `Recevoir le code par ${LIBELLE_CANAL[canal] ?? canal}`}
          </button>
        </div>
      ) : (
        <>
          {info && <p className="form-hint" style={{ marginTop: 0 }}>{info}</p>}
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <input
              className="form-control"
              style={{ maxWidth: 160, letterSpacing: '.4em' }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Code reçu"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              aria-label="Code reçu"
            />
            <button type="button" className="btn btn-primary btn-sm-aps" onClick={verifier} disabled={envoi || code.length < 4}>
              {envoi ? 'Vérification…' : 'Vérifier'}
            </button>
            <button type="button" className="btn btn-link btn-sm" onClick={envoyer} disabled={envoi || attente > 0}>
              {attente > 0 ? `Renvoyer (${attente} s)` : 'Renvoyer le code'}
            </button>
          </div>
        </>
      )}
      {erreur && <p className="form-hint" style={{ color: 'var(--urgence-dark)', marginBottom: 0 }}><i className="fa-solid fa-circle-exclamation" /> {erreur}</p>}
    </div>
  );
}
