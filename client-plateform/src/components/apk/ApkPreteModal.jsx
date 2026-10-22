// ApkPreteModal.jsx
//
// Modale « Téléchargement terminé » de l'APK (voir useTelechargementApk).
// Une page web ne peut pas lancer l'installateur Android elle-même : le
// bouton « Installer » enregistre le fichier (déjà en mémoire, donc
// instantané), le navigateur affiche alors sa barre « Ouvrir », et la
// modale guide l'utilisateur pour les dernières étapes.
//
// Reprend la coquille .aps-dialog du module feedback.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './apk-prete-modal.css';

const FOCUSABLES = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const estAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

const formaterTaille = (octets) => (octets ? `${(octets / 1024 / 1024).toFixed(1)} Mo` : '');

/** @param {{ apk: ReturnType<import('../../hooks/useTelechargementApk').useTelechargementApk> }} props */
export default function ApkPreteModal({ apk }) {
  if (!apk.fichierPret) return null;
  return <Contenu apk={apk} />;
}

function Contenu({ apk }) {
  const android = estAndroid();
  const [etape, setEtape] = useState('pret'); // 'pret' | 'guide'
  const boite = useRef(null);
  const btnPrincipal = useRef(null);
  const ids = useId();
  const { nomFichier, taille } = apk.fichierPret;

  useEffect(() => {
    const precedent = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (precedent && typeof precedent.focus === 'function') precedent.focus();
    };
  }, []);

  useEffect(() => { btnPrincipal.current?.focus(); }, [etape]);

  const installer = () => {
    apk.installer();
    setEtape('guide');
  };

  const surTouche = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); apk.fermer(); return; }
    if (e.key !== 'Tab') return;
    const elements = boite.current?.querySelectorAll(FOCUSABLES);
    if (!elements?.length) return;
    const premier = elements[0];
    const dernier = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
  };

  const etapesGuide = android
    ? [
        <>Touchez <strong>Ouvrir</strong> dans la barre du navigateur, ou la notification <strong>{nomFichier}</strong>.</>,
        <>Si Android le demande, autorisez votre navigateur à <strong>installer des applications inconnues</strong>, puis revenez en arrière.</>,
        <>Touchez <strong>Installer</strong> : ApSa apparaît dans vos applications.</>,
      ]
    : [
        <>Le fichier <strong>{nomFichier}</strong> est enregistré dans vos téléchargements.</>,
        <>Transférez-le sur votre téléphone Android (câble, e-mail, WhatsApp…), ou ouvrez ce site directement depuis le téléphone.</>,
        <>Sur le téléphone, ouvrez le fichier puis touchez <strong>Installer</strong>.</>,
      ];

  return createPortal(
    <div className="aps-dialog-fond" onMouseDown={(e) => { if (e.target === e.currentTarget) apk.fermer(); }}>
      <div
        ref={boite}
        className="aps-dialog apk-prete"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-titre`}
        onKeyDown={surTouche}
      >
        {etape === 'pret' ? (
          <>
            <span className="apk-prete-icone" aria-hidden="true"><i className="fa-solid fa-check" /></span>
            <h2 id={`${ids}-titre`} className="aps-dialog-titre apk-prete-titre">Téléchargement terminé</h2>
            <p className="aps-dialog-message">
              L&apos;application ApSa est prête à être installée sur votre téléphone.
            </p>
            <div className="apk-prete-fichier">
              <i className="fa-brands fa-android" aria-hidden="true" />
              <span className="apk-prete-nom">{nomFichier}</span>
              {taille ? <span className="apk-prete-taille">{formaterTaille(taille)}</span> : null}
            </div>
            <div className="aps-dialog-actions">
              <button type="button" className="aps-dialog-btn aps-dialog-btn--neutre" onClick={apk.fermer}>
                Plus tard
              </button>
              <button ref={btnPrincipal} type="button" className="aps-dialog-btn aps-dialog-btn--primaire" onClick={installer}>
                <i className={`fa-solid ${android ? 'fa-mobile-screen-button' : 'fa-floppy-disk'}`} aria-hidden="true" />
                {android ? 'Installer' : 'Enregistrer le fichier'}
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="apk-prete-icone" aria-hidden="true"><i className="fa-solid fa-mobile-screen-button" /></span>
            <h2 id={`${ids}-titre`} className="aps-dialog-titre apk-prete-titre">
              {android ? 'Plus qu’une étape' : 'Installez ApSa sur votre téléphone'}
            </h2>
            <ol className="apk-prete-etapes">
              {etapesGuide.map((texte, i) => <li key={i}>{texte}</li>)}
            </ol>
            <div className="aps-dialog-actions">
              <button type="button" className="aps-dialog-btn aps-dialog-btn--neutre" onClick={apk.installer}>
                <i className="fa-solid fa-rotate-right" aria-hidden="true" /> Relancer
              </button>
              <button ref={btnPrincipal} type="button" className="aps-dialog-btn aps-dialog-btn--primaire" onClick={apk.fermer}>
                Terminé
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
