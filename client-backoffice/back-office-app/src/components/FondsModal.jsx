// src/components/FondsModal.jsx
// Modale minimale (Bootstrap 5) pour les pages finance. Fermeture par Échap
// et clic sur le fond, sauf pendant un envoi (`occupe`).
import { useEffect } from 'react';

export default function FondsModal({ titre, ouvert, occupe = false, onFermer, children, pied }) {
  useEffect(() => {
    if (!ouvert) return undefined;
    const surTouche = (e) => { if (e.key === 'Escape' && !occupe) onFermer(); };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [ouvert, occupe, onFermer]);

  if (!ouvert) return null;
  return (
    <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true"
      style={{ background: 'rgba(0,0,0,.45)' }} onClick={occupe ? undefined : onFermer}>
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{titre}</h5>
            <button type="button" className="btn-close" aria-label="Fermer" onClick={onFermer} disabled={occupe} />
          </div>
          <div className="modal-body">{children}</div>
          {pied && <div className="modal-footer">{pied}</div>}
        </div>
      </div>
    </div>
  );
}
