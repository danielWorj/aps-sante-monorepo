// presenceOutils.js — outils (non composants) partagés par les pages des
// portails pharmacie et centre de santé : libellés, dates, chargement.
import { useCallback, useEffect, useState } from 'react';
import { TYPES_STRUCTURE } from '../../../services/structureSanteService';

export const LIBELLES_TYPE_STRUCTURE = Object.fromEntries(TYPES_STRUCTURE.map((t) => [t.valeur, t.libelle]));

export const dateCourte = (iso) =>
  (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export const dateHeure = (iso) =>
  (iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * Charge une ressource du portail : { donnees, erreur, recharger }.
 * `charger` doit être stable (useCallback) ; il est rappelé quand il change.
 */
export function useRessource(charger) {
  const [etat, setEtat] = useState({ donnees: null, erreur: null });
  const recharger = useCallback(
    () => charger()
      .then((donnees) => setEtat({ donnees, erreur: null }))
      .catch((err) => setEtat((e) => ({ donnees: e.donnees, erreur: err?.message || 'Chargement impossible.' }))),
    [charger]
  );
  useEffect(() => { recharger(); }, [recharger]);
  return { ...etat, recharger };
}
