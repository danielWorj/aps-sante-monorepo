// ToastStack.jsx
//
// Pile de toasts affichée en bas à droite (bas centré sur mobile). Chaque
// toast se ferme seul après sa durée ; le survol ou le focus met le minuteur
// en pause. Les erreurs sont annoncées en `role="alert"`, le reste en
// `role="status"` pour les lecteurs d'écran.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const ICONES = {
  succes: 'fa-circle-check',
  erreur: 'fa-circle-xmark',
  avertissement: 'fa-triangle-exclamation',
  info: 'fa-circle-info',
};

function ToastItem({ toast, onFermer }) {
  const minuteur = useRef(null);
  const reste = useRef(toast.duree);
  const debut = useRef(0);

  const demarrer = () => {
    if (!toast.duree || toast.sortie) return;
    debut.current = Date.now();
    minuteur.current = setTimeout(() => onFermer(toast.id), reste.current);
  };
  const suspendre = () => {
    if (!minuteur.current) return;
    clearTimeout(minuteur.current);
    minuteur.current = null;
    reste.current = Math.max(0, reste.current - (Date.now() - debut.current));
  };

  useEffect(() => {
    demarrer();
    return () => clearTimeout(minuteur.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  return (
    <div
      className={`aps-toast aps-toast--${toast.type}${toast.sortie ? ' is-sortie' : ''}`}
      role={toast.type === 'erreur' ? 'alert' : 'status'}
      onMouseEnter={suspendre}
      onMouseLeave={demarrer}
      onFocus={suspendre}
      onBlur={demarrer}
    >
      <i className={`fa-solid ${ICONES[toast.type]} aps-toast-icone`} aria-hidden="true"></i>
      <div className="aps-toast-corps">
        {toast.titre && <strong className="aps-toast-titre">{toast.titre}</strong>}
        <div className="aps-toast-message">{toast.message}</div>
      </div>
      <button type="button" className="aps-toast-fermer" onClick={() => onFermer(toast.id)} aria-label="Fermer la notification">
        <i className="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
      {toast.duree > 0 && (
        <span className="aps-toast-progression" style={{ animationDuration: `${toast.duree}ms` }} aria-hidden="true" />
      )}
    </div>
  );
}

export default function ToastStack({ toasts, onFermer }) {
  return createPortal(
    <div className="aps-toast-pile" aria-live="polite">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} onFermer={onFermer} />)}
    </div>,
    document.body,
  );
}
