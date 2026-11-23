// ChampVille.jsx
//
// Champ « ville » des formulaires (inscriptions, profils, fiches).
//
// Deux modes, choisis par le serveur (GET /referentiels/villes/source) :
//  - manuel : la liste déroulante habituelle, alimentée par les villes du
//    référentiel que le formulaire charge déjà (prop `villes`) ;
//  - google : un champ de recherche. Il propose les villes déjà en base
//    puis, en dessous, les villes Google Maps pas encore en base. Une ville
//    Google choisie est importée côté serveur et son ville_id est renvoyé
//    au formulaire comme pour une ville ordinaire.
// Si Google tombe en panne en cours de route, le serveur ne renvoie plus
// que les villes en base : le champ continue de fonctionner.
//
// S'utilise comme le <select> qu'il remplace : name, value, onChange
// ({ target: { name, value } }), required, disabled, className.
// `onVilleImportee(ville)` permet au formulaire d'ajouter la ville importée
// à sa propre liste (affichage, récapitulatif).
import { useEffect, useId, useRef, useState } from 'react';
import { importerVilleGoogle, obtenirSourceVilles, rechercherVilles } from '../../services/geoService';
import './ApsSelect.css';
import './ChampVille.css';

const DUREE_CACHE_SOURCE_MS = 5 * 60 * 1000;
const DELAI_FRAPPE_MS = 250;

let cacheSource = null; // { promesse, expireA }

/** Mode des villes, partagé par tous les champs de la page. */
function lireSource() {
  const maintenant = Date.now();
  if (!cacheSource || cacheSource.expireA < maintenant) {
    cacheSource = {
      expireA: maintenant + DUREE_CACHE_SOURCE_MS,
      promesse: obtenirSourceVilles()
        .then((r) => (r?.source === 'google' ? 'google' : 'manuel'))
        .catch(() => 'manuel'),
    };
  }
  return cacheSource.promesse;
}

function nouveauJeton() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sansAccents(texte) {
  return String(texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export default function ChampVille({
  id,
  name,
  value,
  onChange,
  paysId,
  villes = [],
  onVilleImportee,
  required = false,
  disabled = false,
  className = 'form-select',
  placeholder,
  'aria-label': ariaLabel,
}) {
  const [source, setSource] = useState(null);

  useEffect(() => {
    let actif = true;
    lireSource().then((s) => actif && setSource(s));
    return () => {
      actif = false;
    };
  }, []);

  const texteVide = placeholder ?? (paysId === undefined || paysId ? 'Sélectionner…' : "Choisissez d'abord un pays");

  // Mode manuel (ou source pas encore connue) : la liste habituelle.
  if (source !== 'google') {
    return (
      <select
        id={id}
        className={className}
        name={name}
        value={value ?? ''}
        onChange={onChange}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
      >
        <option value="">{texteVide}</option>
        {villes.map((v) => (
          <option key={v.ville_id} value={v.ville_id}>
            {v.nom}
          </option>
        ))}
      </select>
    );
  }

  return (
    <RechercheVilleGoogle
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      paysId={paysId}
      villes={villes}
      onVilleImportee={onVilleImportee}
      required={required}
      disabled={disabled}
      texteVide={texteVide}
      ariaLabel={ariaLabel}
    />
  );
}

function RechercheVilleGoogle({ id, name, value, onChange, paysId, villes, onVilleImportee, required, disabled, texteVide, ariaLabel }) {
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [resultat, setResultat] = useState({ villes: [], suggestions: [] });
  const [chargement, setChargement] = useState(false);
  const [importEnCours, setImportEnCours] = useState(null);
  const [erreur, setErreur] = useState('');
  const [actif, setActif] = useState(0);
  const [libelleImporte, setLibelleImporte] = useState(null); // { ville_id, nom }
  const racine = useRef(null);
  const champ = useRef(null);
  const bouton = useRef(null);
  const jeton = useRef(nouveauJeton());
  const idListe = `${useId()}-liste`;
  // Liste du formulaire, lue seulement en secours : une ref évite de
  // relancer la recherche quand le parent recrée le tableau à chaque rendu.
  const villesLocales = useRef(villes);
  useEffect(() => {
    villesLocales.current = villes;
  }, [villes]);

  const valeur = value ?? '';
  const libelle =
    villes.find((v) => v.ville_id === valeur)?.nom ??
    (libelleImporte?.ville_id === valeur ? libelleImporte.nom : '');

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = (e) => {
      if (racine.current && !racine.current.contains(e.target)) setOuvert(false);
    };
    document.addEventListener('mousedown', fermer);
    return () => document.removeEventListener('mousedown', fermer);
  }, [ouvert]);

  // Recherche serveur (villes en base + suggestions Google), avec repli
  // local sur la liste du formulaire si le serveur ne répond pas.
  useEffect(() => {
    if (!ouvert) return undefined;
    let annule = false;
    const minuteur = setTimeout(async () => {
      setChargement(true);
      try {
        const r = await rechercherVilles({ q: recherche.trim(), paysId, jetonSession: jeton.current });
        if (!annule) setResultat({ villes: r?.villes || [], suggestions: r?.suggestions || [] });
      } catch {
        if (!annule) {
          const q = sansAccents(recherche.trim());
          setResultat({ villes: villesLocales.current.filter((v) => sansAccents(v.nom).includes(q)), suggestions: [] });
        }
      } finally {
        if (!annule) {
          setChargement(false);
          setActif(0);
        }
      }
    }, recherche.trim() ? DELAI_FRAPPE_MS : 0);
    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
  }, [ouvert, recherche, paysId]);

  const elements = [
    ...resultat.villes.map((v) => ({ type: 'ville', cle: v.ville_id, nom: v.nom, ville: v })),
    ...resultat.suggestions.map((s) => ({ type: 'google', cle: s.place_id, nom: s.nom, description: s.description, suggestion: s })),
  ];

  function ouvrir() {
    if (disabled) return;
    setRecherche('');
    setErreur('');
    setOuvert(true);
    requestAnimationFrame(() => champ.current?.focus());
  }

  function fermer(rendreFocus = true) {
    setOuvert(false);
    if (rendreFocus) bouton.current?.focus();
  }

  function emettre(ville) {
    if (ville.ville_id !== valeur) onChange?.({ target: { id, name, value: ville.ville_id, type: 'select-one' } });
  }

  async function choisir(element) {
    if (!element || importEnCours) return;
    if (element.type === 'ville') {
      emettre(element.ville);
      fermer();
      return;
    }
    setImportEnCours(element.cle);
    setErreur('');
    try {
      const { ville } = await importerVilleGoogle({
        placeId: element.suggestion.place_id,
        paysId,
        jetonSession: jeton.current,
      });
      jeton.current = nouveauJeton(); // une session Google = une ville choisie
      setLibelleImporte({ ville_id: ville.ville_id, nom: ville.nom });
      onVilleImportee?.(ville);
      emettre(ville);
      fermer();
    } catch (err) {
      setErreur(err?.message || "Impossible d'ajouter cette ville pour le moment.");
    } finally {
      setImportEnCours(null);
    }
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
      case 'ArrowDown': e.preventDefault(); setActif((i) => Math.min(i + 1, elements.length - 1)); break;
      case 'ArrowUp': e.preventDefault(); setActif((i) => Math.max(i - 1, 0)); break;
      case 'Enter': e.preventDefault(); choisir(elements[actif]); break;
      case 'Escape': e.preventDefault(); fermer(); break;
      case 'Tab': fermer(false); break;
      default:
    }
  }

  const indexPremiereSuggestion = resultat.villes.length;

  return (
    <div
      ref={racine}
      className={`aps-select is-champ champ-ville ${ouvert ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`}
      onKeyDown={auClavier}
    >
      <button
        ref={bouton}
        type="button"
        id={id}
        className="aps-select-bouton"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        aria-controls={idListe}
        aria-label={ariaLabel}
        onClick={() => (ouvert ? fermer() : ouvrir())}
      >
        <span className={`aps-select-valeur ${libelle ? '' : 'is-vide'}`}>{libelle || texteVide}</span>
        <i className="fa-solid fa-chevron-down aps-select-chevron" aria-hidden="true" />
      </button>

      {ouvert && (
        <div className="aps-select-panneau champ-ville-panneau">
          <div className="aps-select-recherche">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input
              ref={champ}
              type="text"
              placeholder="Rechercher une ville…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              aria-label="Rechercher une ville"
              aria-controls={idListe}
            />
            {chargement && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />}
          </div>

          {erreur && <div className="champ-ville-erreur" role="alert">{erreur}</div>}

          <ul id={idListe} className="aps-select-liste" role="listbox" tabIndex={-1}>
            {!chargement && elements.length === 0 && (
              <li className="aps-select-vide">
                {recherche.trim().length < 2 ? 'Tapez le nom de votre ville' : 'Aucune ville trouvée'}
              </li>
            )}
            {elements.map((el, i) => (
              <li key={`${el.type}-${el.cle}`} role="presentation">
                {el.type === 'google' && i === indexPremiereSuggestion && (
                  <div className="champ-ville-section">Autres villes · Google Maps</div>
                )}
                <div
                  role="option"
                  aria-selected={el.type === 'ville' && el.cle === valeur}
                  className={`aps-select-option ${el.type === 'ville' && el.cle === valeur ? 'is-choisie' : ''} ${i === actif ? 'is-active' : ''}`}
                  onMouseEnter={() => setActif(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choisir(el)}
                >
                  <span className="champ-ville-libelle">
                    <span>{el.nom}</span>
                    {el.type === 'google' && el.description && el.description !== el.nom && (
                      <small>{el.description}</small>
                    )}
                  </span>
                  {importEnCours === el.cle && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />}
                  {el.type === 'ville' && el.cle === valeur && <i className="fa-solid fa-check" aria-hidden="true" />}
                </div>
              </li>
            ))}
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
          <option value="" />
          {valeur && <option value={valeur}>{libelle}</option>}
        </select>
      )}
    </div>
  );
}
