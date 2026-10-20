// ApsSelect.jsx
//
// Liste déroulante sur mesure (refonte UI web 2026). Le panneau d'options
// natif d'un <select> est dessiné par le navigateur et ne se stylise
// presque pas : ce composant le remplace par une carte (coche sur l'option
// choisie, recherche au-delà de 8 options, navigation au clavier).
//
// S'utilise comme un <select> : mêmes enfants <option>, mêmes props
// (id, name, value / defaultValue, onChange, disabled, required, className).
// onChange reçoit un objet { target: { id, name, value } } : les handlers
// existants du type (e) => setX(e.target.value) fonctionnent tels quels.
// Un <select> caché reste rendu pour les formulaires (FormData, required).
import { Children, Fragment, isValidElement, useEffect, useId, useMemo, useRef, useState } from 'react';
import './ApsSelect.css';

const SEUIL_RECHERCHE = 8;

/** Aplatis les enfants (<option>, fragments, tableaux issus de .map). */
function lireOptions(children) {
  const options = [];
  const parcourir = (noeuds) => {
    Children.forEach(noeuds, (enfant) => {
      if (!isValidElement(enfant)) return;
      if (enfant.type === Fragment) {
        parcourir(enfant.props.children);
        return;
      }
      if (enfant.type === 'option') {
        const { value, children: libelle, disabled } = enfant.props;
        const texte = Children.toArray(libelle).join('');
        options.push({ value: value != null ? String(value) : texte, label: texte, disabled: Boolean(disabled) });
      }
    });
  };
  parcourir(children);
  return options;
}

function sansAccents(texte) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export default function ApsSelect({
  id,
  name,
  value,
  defaultValue,
  onChange,
  disabled = false,
  required = false,
  className = '',
  variante = 'champ', // 'champ' (aspect .form-select) | 'nu' (barre de recherche composée)
  title,
  children,
  'aria-label': ariaLabel,
}) {
  const options = useMemo(() => lireOptions(children), [children]);
  const controle = value !== undefined;
  const [valeurInterne, setValeurInterne] = useState(defaultValue != null ? String(defaultValue) : options[0]?.value ?? '');
  const valeur = controle ? String(value ?? '') : valeurInterne;

  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(-1);
  const [recherche, setRecherche] = useState('');
  const racine = useRef(null);
  const liste = useRef(null);
  const champRecherche = useRef(null);
  const bouton = useRef(null);
  const idListe = `${useId()}-liste`;

  const choisie = options.find((o) => o.value === valeur) ?? options[0];
  const avecRecherche = options.length > SEUIL_RECHERCHE;
  const visibles = useMemo(() => {
    if (!recherche.trim()) return options;
    const q = sansAccents(recherche.trim());
    return options.filter((o) => sansAccents(o.label).includes(q));
  }, [options, recherche]);

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = (e) => {
      if (racine.current && !racine.current.contains(e.target)) setOuvert(false);
    };
    document.addEventListener('mousedown', fermer);
    return () => document.removeEventListener('mousedown', fermer);
  }, [ouvert]);

  // Garde l'option active visible pendant la navigation au clavier.
  useEffect(() => {
    if (!ouvert || actif < 0) return;
    liste.current?.querySelector(`[data-index="${actif}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [actif, ouvert]);

  function ouvrir() {
    if (disabled) return;
    setRecherche('');
    setActif(Math.max(0, options.findIndex((o) => o.value === valeur)));
    setOuvert(true);
    if (avecRecherche) requestAnimationFrame(() => champRecherche.current?.focus());
  }

  function fermer(rendreFocus = true) {
    setOuvert(false);
    if (rendreFocus) bouton.current?.focus();
  }

  function selectionner(option) {
    if (!option || option.disabled) return;
    if (!controle) setValeurInterne(option.value);
    if (option.value !== valeur) onChange?.({ target: { id, name, value: option.value, type: 'select-one' } });
    fermer();
  }

  function deplacer(pas) {
    if (!visibles.length) return;
    let i = actif;
    for (let n = 0; n < visibles.length; n += 1) {
      i = (i + pas + visibles.length) % visibles.length;
      if (!visibles[i].disabled) break;
    }
    setActif(i);
  }

  function auClavier(e) {
    if (!ouvert) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        ouvrir();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); deplacer(1); break;
      case 'ArrowUp': e.preventDefault(); deplacer(-1); break;
      case 'Home': e.preventDefault(); setActif(0); break;
      case 'End': e.preventDefault(); setActif(visibles.length - 1); break;
      case 'Enter': e.preventDefault(); selectionner(visibles[actif]); break;
      case 'Escape': e.preventDefault(); fermer(); break;
      case 'Tab': fermer(false); break;
      default:
        // Saisie directe d'une lettre (sans champ de recherche) : va à la première option correspondante.
        if (!avecRecherche && e.key.length === 1) {
          const i = visibles.findIndex((o) => sansAccents(o.label).startsWith(sansAccents(e.key)));
          if (i >= 0) setActif(i);
        }
    }
  }

  return (
    <div
      ref={racine}
      className={`aps-select is-${variante} ${ouvert ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`.trim()}
      onKeyDown={auClavier}
    >
      <button
        ref={bouton}
        type="button"
        id={id}
        className="aps-select-bouton"
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        aria-controls={idListe}
        aria-label={ariaLabel}
        onClick={() => (ouvert ? fermer() : ouvrir())}
      >
        <span className={`aps-select-valeur ${choisie && choisie.value === '' ? 'is-vide' : ''}`}>
          {choisie?.label ?? ''}
        </span>
        <i className="fa-solid fa-chevron-down aps-select-chevron" aria-hidden="true" />
      </button>

      {ouvert && (
        <div className="aps-select-panneau">
          {avecRecherche && (
            <div className="aps-select-recherche">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <input
                ref={champRecherche}
                type="text"
                placeholder="Rechercher…"
                value={recherche}
                onChange={(e) => { setRecherche(e.target.value); setActif(0); }}
                aria-label="Filtrer les options"
              />
            </div>
          )}
          <ul
            ref={liste}
            id={idListe}
            className="aps-select-liste"
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={actif >= 0 ? `${idListe}-${actif}` : undefined}
          >
            {visibles.length === 0 && <li className="aps-select-vide">Aucun résultat</li>}
            {visibles.map((o, i) => {
              const estChoisie = o.value === valeur;
              return (
                <li
                  key={`${o.value}-${i}`}
                  id={`${idListe}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={estChoisie}
                  aria-disabled={o.disabled || undefined}
                  className={`aps-select-option ${estChoisie ? 'is-choisie' : ''} ${i === actif ? 'is-active' : ''} ${o.disabled ? 'is-off' : ''} ${o.value === '' ? 'is-tous' : ''}`}
                  onMouseEnter={() => setActif(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectionner(o)}
                >
                  <span>{o.label}</span>
                  {estChoisie && <i className="fa-solid fa-check" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Miroir natif : soumission de formulaire et validation « required ». */}
      {(name || required) && (
        <select
          className="aps-select-natif"
          name={name}
          value={valeur}
          required={required}
          disabled={disabled}
          onChange={() => {}}
          tabIndex={-1}
          aria-hidden="true"
        >
          {options.map((o, i) => (
            <option key={`${o.value}-${i}`} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}
