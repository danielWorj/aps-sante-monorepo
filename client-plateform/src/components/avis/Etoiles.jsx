// Etoiles.jsx — affichage d'une note sur 5 (fractions comprises) et saisie
// accessible d'une note (groupe radio, survol = aperçu, flèches clavier).
import { useState } from 'react';
import { LIBELLES_NOTE } from '../../services/reputationMedecinService';

/**
 * Note en étoiles, lecture seule. `valeur` peut être fractionnaire (4.3).
 * @param {{ valeur: number|null, taille?: 'sm'|'md'|'lg', libelle?: string }} props
 */
export function Etoiles({ valeur, taille = 'md', libelle }) {
  const v = Math.max(0, Math.min(5, Number(valeur) || 0));
  return (
    <span
      className={`etoiles etoiles-${taille}`}
      role="img"
      aria-label={libelle ?? (valeur === null || valeur === undefined ? 'Aucune note' : `${v.toLocaleString('fr-FR')} sur 5`)}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="etoile" aria-hidden="true">
          <i className="fa-solid fa-star etoile-fond" />
          <span className="etoile-remplie" style={{ width: `${Math.max(0, Math.min(1, v - i)) * 100}%` }}>
            <i className="fa-solid fa-star" />
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * Saisie d'une note de 1 à 5.
 * @param {{ valeur: number|null, onChange: (n: number) => void, nom: string,
 *   libelle: string, taille?: 'md'|'lg', afficherLibelle?: boolean, disabled?: boolean }} props
 */
export function SaisieEtoiles({ valeur, onChange, nom, libelle, taille = 'lg', afficherLibelle = true, disabled = false }) {
  const [survol, setSurvol] = useState(null);
  const affichee = survol ?? valeur ?? 0;

  const clavier = (e, n) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(5, n + 1)); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(1, n - 1)); }
  };

  return (
    <div className={`saisie-etoiles saisie-etoiles-${taille}`}>
      <div role="radiogroup" aria-label={libelle} className="saisie-etoiles-groupe" onMouseLeave={() => setSurvol(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            name={nom}
            aria-checked={valeur === n}
            aria-label={`${n} sur 5 — ${LIBELLES_NOTE[n]}`}
            tabIndex={valeur ? (valeur === n ? 0 : -1) : n === 1 ? 0 : -1}
            className={`saisie-etoile ${n <= affichee ? 'is-on' : ''}`}
            onMouseEnter={() => setSurvol(n)}
            onClick={() => onChange(n)}
            onKeyDown={(e) => clavier(e, valeur ?? 0)}
            disabled={disabled}
          >
            <i className="fa-solid fa-star" />
          </button>
        ))}
      </div>
      {afficherLibelle && (
        <span className="saisie-etoiles-libelle" aria-live="polite">
          {affichee ? LIBELLES_NOTE[affichee] : 'Touchez une étoile'}
        </span>
      )}
    </div>
  );
}
