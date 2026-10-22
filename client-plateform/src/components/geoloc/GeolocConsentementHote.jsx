// GeolocConsentementHote.jsx
//
// Modale d'explication affichée AVANT la demande de localisation du
// navigateur (voir src/lib/geolocConsentement.js). Montée une seule fois dans
// main.jsx ; les demandes simultanées sont mises en file.
//
// Reprend la coquille .aps-dialog du module feedback (même fond, mêmes
// boutons, même comportement Échap / clic sur le fond / piège du focus).
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { enregistrerHoteConsentement } from '../../lib/geolocConsentement';
import './geoloc-consentement.css';

const AVANTAGES = [
  { icone: 'fa-user-doctor', texte: 'Les médecins disponibles près de chez vous' },
  { icone: 'fa-prescription-bottle-medical', texte: 'Les pharmacies et pharmacies de garde les plus proches' },
  { icone: 'fa-hospital', texte: 'Les structures de santé et assureurs de votre secteur' },
];

const FOCUSABLES = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function GeolocConsentementHote() {
  const [file, setFile] = useState([]);

  useEffect(() => enregistrerHoteConsentement((demande) => setFile((f) => [...f, demande])), []);

  const demande = file[0];
  if (!demande) return null;

  const repondre = (accepte) => {
    // Une seule réponse vaut pour toutes les demandes en file (ex. deux
    // composants qui veulent la position au même moment).
    file.forEach((d) => d.resolve(accepte));
    setFile([]);
  };

  return <Modale etat={demande.etat} onRepondre={repondre} />;
}

function Modale({ etat, onRepondre }) {
  const bloquee = etat === 'bloquee';
  const boite = useRef(null);
  const btnActiver = useRef(null);
  const ids = useId();

  useEffect(() => {
    const precedent = document.activeElement;
    btnActiver.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (precedent && typeof precedent.focus === 'function') precedent.focus();
    };
  }, []);

  const surTouche = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onRepondre(false); return; }
    if (e.key !== 'Tab') return;
    const elements = boite.current?.querySelectorAll(FOCUSABLES);
    if (!elements?.length) return;
    const premier = elements[0];
    const dernier = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
  };

  return createPortal(
    <div className="aps-dialog-fond" onMouseDown={(e) => { if (e.target === e.currentTarget) onRepondre(false); }}>
      <div
        ref={boite}
        className="aps-dialog geoloc-consentement"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-titre`}
        aria-describedby={`${ids}-message`}
        onKeyDown={surTouche}
      >
        <div className="geoloc-consentement-visuel" aria-hidden="true">
          <span className="geoloc-consentement-onde" />
          <span className="geoloc-consentement-pin"><i className="fa-solid fa-location-dot" /></span>
        </div>

        <h2 id={`${ids}-titre`} className="aps-dialog-titre geoloc-consentement-titre">
          {bloquee ? 'Votre localisation est désactivée' : 'Des soins toujours plus proches de vous'}
        </h2>

        <div id={`${ids}-message`} className="aps-dialog-message geoloc-consentement-message">
          {bloquee ? (
            <>
              <p>
                Votre navigateur bloque la localisation pour ApSa. Pour voir les services de santé
                autour de vous, réactivez-la :
              </p>
              <ol className="geoloc-consentement-etapes">
                <li>Touchez l&apos;icône <i className="fa-solid fa-lock" aria-hidden="true" /> ou <i className="fa-solid fa-sliders" aria-hidden="true" /> à gauche de l&apos;adresse du site ;</li>
                <li>ouvrez <strong>Autorisations</strong> (ou <strong>Paramètres du site</strong>) ;</li>
                <li>passez <strong>Position</strong> sur <strong>Autoriser</strong>, puis réessayez.</li>
              </ol>
            </>
          ) : (
            <>
              <p>
                Pour vous proposer les services de santé les plus proches, ApSa a besoin de votre
                position :
              </p>
              <ul className="geoloc-consentement-liste">
                {AVANTAGES.map((a) => (
                  <li key={a.icone}>
                    <span className="geoloc-consentement-puce"><i className={`fa-solid ${a.icone}`} aria-hidden="true" /></span>
                    {a.texte}
                  </li>
                ))}
              </ul>
              <p className="geoloc-consentement-note">
                <i className="fa-solid fa-shield-halved" aria-hidden="true" /> Votre position sert
                uniquement à trier les résultats. Elle n&apos;est ni publiée, ni partagée.
              </p>
            </>
          )}
        </div>

        <div className="aps-dialog-actions">
          <button type="button" className="aps-dialog-btn aps-dialog-btn--neutre" onClick={() => onRepondre(false)}>
            Plus tard
          </button>
          <button ref={btnActiver} type="button" className="aps-dialog-btn aps-dialog-btn--primaire" onClick={() => onRepondre(true)}>
            <i className={`fa-solid ${bloquee ? 'fa-rotate-right' : 'fa-location-crosshairs'}`} aria-hidden="true" />
            {bloquee ? 'Réessayer' : 'Activer ma position'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
