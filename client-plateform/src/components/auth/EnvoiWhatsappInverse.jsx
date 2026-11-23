// src/components/auth/EnvoiWhatsappInverse.jsx
//
// Vérification WhatsApp « inversée » : au lieu de recevoir un code,
// l'utilisateur ENVOIE le code affiché à notre numéro WhatsApp (gratuit,
// rien à recopier). Le bouton ouvre WhatsApp avec le message déjà écrit ;
// la page sonde le serveur toutes les 3 s et remonte la preuve dès que le
// message est reçu.
//
// `demande` : réponse du serveur { verification_id, code, lien_whatsapp,
// numero_whatsapp, expire_le }.
import { useEffect, useRef, useState } from 'react';
import authService from '../../services/authService';

export default function EnvoiWhatsappInverse({ demande, onPreuve, onExpire }) {
  const [etat, setEtat] = useState('en_attente');
  const rappels = useRef({ onPreuve, onExpire });
  useEffect(() => { rappels.current = { onPreuve, onExpire }; });

  useEffect(() => {
    if (!demande?.verification_id) return undefined;
    let actif = true;
    let minuteur;
    const sonder = async () => {
      try {
        const r = await authService.statutVerificationInverse(demande.verification_id);
        if (!actif) return;
        if (r.statut === 'verifie' && r.preuve) {
          setEtat('verifie');
          rappels.current.onPreuve?.(r.preuve);
          return;
        }
        if (r.statut === 'expiree') {
          setEtat('expiree');
          rappels.current.onExpire?.();
          return;
        }
      } catch {
        // réseau instable : on réessaie
      }
      if (actif) minuteur = setTimeout(sonder, 3000);
    };
    minuteur = setTimeout(sonder, 3000);
    return () => { actif = false; clearTimeout(minuteur); };
  }, [demande?.verification_id]);

  if (!demande) return null;

  if (etat === 'verifie') {
    return (
      <p className="form-hint" style={{ color: 'var(--primary-dark)', fontWeight: 600 }}>
        <i className="fa-solid fa-circle-check" /> Message reçu : numéro confirmé.
      </p>
    );
  }
  if (etat === 'expiree') {
    return (
      <p className="form-hint" style={{ color: 'var(--urgence-dark)' }}>
        <i className="fa-solid fa-clock" /> Le délai est dépassé. Recommencez.
      </p>
    );
  }

  return (
    <div className="text-center" role="status">
      <p style={{ margin: '0 0 .4rem', fontWeight: 600 }}>
        Envoyez ce code sur WhatsApp, depuis votre numéro :
      </p>
      <div style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '.18em' }}>{demande.code}</div>
      <a
        href={demande.lien_whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-primary btn-block-aps mt-2"
        style={{ background: '#1f9d55', borderColor: '#1f9d55' }}
      >
        <i className="fa-brands fa-whatsapp" /> Ouvrir WhatsApp et envoyer
      </a>
      <p className="text-muted-soft" style={{ fontSize: '.8rem', margin: '.6rem 0 0' }}>
        Le message est déjà écrit : touchez simplement « Envoyer ».
        <br />Destinataire : {demande.numero_whatsapp}
      </p>
      <p className="text-muted-soft" style={{ fontSize: '.8rem', margin: '.4rem 0 0' }}>
        <i className="fa-solid fa-spinner fa-spin" /> En attente de votre message…
      </p>
    </div>
  );
}
