// ImportVillesGoogle.jsx
//
// Fenêtre « Villes d'un pays » du référentiel : recherche de villes Google
// Maps pas encore en base, ajout en un clic. Rendu seulement quand le mode
// Google Maps est réellement appliqué (voir SourceVillesCard).
import { useEffect, useState } from 'react';
import { useToast } from './feedback';
import * as referentielService from '../services/referentielService';

const DELAI_FRAPPE_MS = 300;

export default function ImportVillesGoogle({ pays, onImportee }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [indisponible, setIndisponible] = useState(false);
  const [importEnCours, setImportEnCours] = useState(null);

  useEffect(() => {
    const texte = q.trim();
    if (texte.length < 2) return undefined;
    let annule = false;
    const minuteur = setTimeout(async () => {
      setChargement(true);
      try {
        const r = await referentielService.rechercherVilles({ q: texte, pays_id: pays.pays_id });
        if (annule) return;
        setSuggestions(r.suggestions || []);
        setIndisponible(r.source !== 'google');
      } catch {
        if (!annule) setSuggestions([]);
      } finally {
        if (!annule) setChargement(false);
      }
    }, DELAI_FRAPPE_MS);
    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
  }, [q, pays.pays_id]);

  // Moins de 2 lettres : on n'affiche pas les résultats d'une recherche précédente.
  const visibles = q.trim().length >= 2 ? suggestions : [];

  async function importer(s) {
    setImportEnCours(s.place_id);
    try {
      const { ville, creee } = await referentielService.importerVilleGoogle({ place_id: s.place_id, pays_id: pays.pays_id });
      toast.succes(creee ? `Ville « ${ville.nom} » ajoutée.` : `« ${ville.nom} » était déjà au référentiel : complétée avec Google.`);
      setSuggestions((l) => l.filter((x) => x.place_id !== s.place_id));
      onImportee?.(ville);
    } catch (err) {
      toast.erreur(err.message || 'Ajout impossible.');
    } finally {
      setImportEnCours(null);
    }
  }

  return (
    <div className="aps-card p-3 mb-3">
      <h6 className="mb-2">
        <i className="fa-solid fa-map-location-dot me-2"></i>Ajouter depuis Google Maps
      </h6>
      <div className="aps-search mb-2">
        <i className={`fa-solid ${chargement ? 'fa-spinner fa-spin' : 'fa-magnifying-glass'}`}></i>
        <input
          type="text"
          placeholder={`Rechercher une ville (${pays.nom})…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {indisponible && (
        <div className="aps-notice is-warning mb-2">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <div>Google Maps ne répond pas pour le moment : utilisez l'ajout manuel ci-dessous.</div>
        </div>
      )}
      {q.trim().length >= 2 && !chargement && !indisponible && visibles.length === 0 && (
        <div className="aps-empty-mini">Aucune nouvelle ville trouvée (les villes déjà au référentiel sont masquées).</div>
      )}
      {visibles.length > 0 && (
        <ul className="list-unstyled mb-0" style={{ maxHeight: 200, overflowY: 'auto' }}>
          {visibles.map((s) => (
            <li key={s.place_id} className="d-flex align-items-center justify-content-between gap-2 py-1 border-bottom">
              <div style={{ minWidth: 0 }}>
                <div className="cell-title">{s.nom}</div>
                {s.description && s.description !== s.nom && (
                  <div className="aps-text-muted text-truncate" style={{ fontSize: '.82rem' }}>{s.description}</div>
                )}
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary flex-shrink-0"
                onClick={() => importer(s)}
                disabled={importEnCours !== null}
              >
                {importEnCours === s.place_id ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Ajouter'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
