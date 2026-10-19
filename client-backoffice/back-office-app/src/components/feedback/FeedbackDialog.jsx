// FeedbackDialog.jsx
//
// Modale unique servant à la fois de confirmation (remplace window.confirm)
// et de saisie (remplace window.prompt). Échap, clic sur le fond et bouton
// « Annuler » ferment sans valider ; le focus reste piégé dans la modale puis
// revient à l'élément qui l'avait ouverte.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ICONES = {
  primaire: 'fa-circle-question',
  danger: 'fa-trash-can',
  avertissement: 'fa-triangle-exclamation',
};

const FOCUSABLES = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function FeedbackDialog({ demande, onRepondre }) {
  const {
    mode,
    titre,
    message,
    variante = 'primaire',
    icone,
    labelConfirmer = mode === 'saisie' ? 'Valider' : 'Confirmer',
    labelAnnuler = 'Annuler',
    label,
    placeholder,
    type = 'text',
    multiligne = false,
    obligatoire = false,
    maxLength,
    min,
    max,
    valider,
  } = demande;

  const [valeur, setValeur] = useState(demande.valeurInitiale ?? '');
  const [erreur, setErreur] = useState(null);
  const boite = useRef(null);
  const champ = useRef(null);
  const btnAnnuler = useRef(null);
  const btnConfirmer = useRef(null);
  const ids = useId();

  // Focus initial : le champ en saisie ; « Annuler » pour une action
  // destructive (Entrée ne supprime pas par réflexe) ; sinon « Confirmer ».
  useEffect(() => {
    const precedent = document.activeElement;
    const cible = mode === 'saisie' ? champ.current : variante === 'danger' ? btnAnnuler.current : btnConfirmer.current;
    cible?.focus();
    if (mode === 'saisie') champ.current?.select?.();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (precedent && typeof precedent.focus === 'function') precedent.focus();
    };
  }, [mode, variante]);

  const annuler = () => onRepondre(mode === 'saisie' ? null : false);

  const soumettre = (e) => {
    e.preventDefault();
    if (mode !== 'saisie') { onRepondre(true); return; }
    const texte = String(valeur).trim();
    if (obligatoire && !texte) { setErreur('Ce champ est obligatoire.'); champ.current?.focus(); return; }
    const refus = valider ? valider(texte) : null;
    if (refus) { setErreur(refus); champ.current?.focus(); return; }
    onRepondre(texte);
  };

  const surTouche = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); annuler(); return; }
    if (e.key !== 'Tab') return;
    const elements = boite.current?.querySelectorAll(FOCUSABLES);
    if (!elements?.length) return;
    const premier = elements[0];
    const dernier = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
  };

  const proprietesChamp = {
    id: `${ids}-champ`,
    ref: champ,
    className: `aps-dialog-champ${erreur ? ' is-invalide' : ''}`,
    value: valeur,
    placeholder,
    maxLength,
    'aria-invalid': !!erreur,
    'aria-describedby': erreur ? `${ids}-erreur` : undefined,
    onChange: (e) => { setValeur(e.target.value); if (erreur) setErreur(null); },
  };

  return createPortal(
    <div className="aps-dialog-fond" onMouseDown={(e) => { if (e.target === e.currentTarget) annuler(); }}>
      <form
        ref={boite}
        className={`aps-dialog aps-dialog--${variante}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-titre`}
        aria-describedby={message ? `${ids}-message` : undefined}
        onSubmit={soumettre}
        onKeyDown={surTouche}
        noValidate
      >
        <div className="aps-dialog-tete">
          <span className="aps-dialog-icone" aria-hidden="true">
            <i className={`fa-solid ${icone || ICONES[variante] || ICONES.primaire}`}></i>
          </span>
          <h2 id={`${ids}-titre`} className="aps-dialog-titre">{titre}</h2>
        </div>

        {message && <div id={`${ids}-message`} className="aps-dialog-message">{message}</div>}

        {mode === 'saisie' && (
          <div className="aps-dialog-saisie">
            {label && (
              <label htmlFor={`${ids}-champ`} className="aps-dialog-label">
                {label}{obligatoire && <span aria-hidden="true"> *</span>}
              </label>
            )}
            {multiligne
              ? <textarea {...proprietesChamp} rows={3} />
              : <input {...proprietesChamp} type={type} min={min} max={max} inputMode={type === 'number' ? 'decimal' : undefined} />}
            {erreur && <div id={`${ids}-erreur`} className="aps-dialog-erreur">{erreur}</div>}
          </div>
        )}

        <div className="aps-dialog-actions">
          <button ref={btnAnnuler} type="button" className="aps-dialog-btn aps-dialog-btn--neutre" onClick={annuler}>
            {labelAnnuler}
          </button>
          <button ref={btnConfirmer} type="submit" className={`aps-dialog-btn aps-dialog-btn--${variante}`}>
            {labelConfirmer}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
