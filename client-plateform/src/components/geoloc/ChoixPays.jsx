// ChoixPays.jsx
//
// Bandeau « Pays » réutilisable : affiche le pays actif du site
// (PaysContext), permet d'en choisir un autre et de relancer la
// localisation. Le choix vaut pour tout le site (annuaires, accueil…).
import { useState } from 'react';
import ApsSelect from '../ui/ApsSelect';
import { usePays } from '../../context/PaysContext';
import './choix-pays.css';

const ORIGINES = {
  gps: 'selon votre position',
  navigateur: 'selon votre appareil',
  compte: 'selon votre compte',
};

export default function ChoixPays({ id = 'choix-pays', libelle = 'Votre pays', className = '' }) {
  const { listePays, paysId, source, changerPays, localiser } = usePays();
  const [localisation, setLocalisation] = useState(false);

  async function relancer() {
    setLocalisation(true);
    try {
      await localiser();
    } finally {
      setLocalisation(false);
    }
  }

  if (!listePays.length) return null;

  return (
    <div className={`choix-pays ${className}`}>
      <i className="fa-solid fa-location-dot choix-pays-ic" aria-hidden="true" />
      <label htmlFor={id} className="choix-pays-lbl">{libelle}</label>
      <div className="choix-pays-sel">
        <ApsSelect variante="nu" id={id} value={paysId} onChange={(e) => changerPays(e.target.value)}>
          <option value="">Tous les pays</option>
          {listePays.map((p) => (
            <option key={p.pays_id} value={String(p.pays_id)}>{p.nom}</option>
          ))}
        </ApsSelect>
      </div>
      {paysId && ORIGINES[source] && <span className="choix-pays-orig">{ORIGINES[source]}</span>}
      <button type="button" className="choix-pays-loc" onClick={relancer} disabled={localisation}>
        <i className={`fa-solid ${localisation ? 'fa-spinner fa-spin' : 'fa-location-crosshairs'}`} />
        Me localiser
      </button>
    </div>
  );
}
