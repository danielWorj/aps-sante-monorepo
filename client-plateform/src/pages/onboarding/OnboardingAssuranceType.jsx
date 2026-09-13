import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import OnboardingProgress from './OnboardingProgess';

/**
 * Écran 1.3.2 — Choix du type d'acteur (étape 2/2 du sous-parcours
 * "Assurances", après la ville — voir Écran 1.3.1).
 *
 * Contrairement à la spécialité médecin (référentiel chargé depuis
 * l'API), le type d'acteur est une énumération fixe côté serveur —
 * voir `type_acteur` dans assurance.routes.js / assuranceService.js
 * (`listerServicesAssurance`) : uniquement 'compagnie' ou 'courtier'.
 * Aucun appel réseau n'est donc nécessaire ici, la liste est statique
 * et reprend les libellés déjà utilisés dans pages/Assurance.jsx
 * (LABEL_TYPE_ACTEUR).
 *
 * pays_id et ville_id sont repris tels quels des query params
 * (renseignés par l'Écran 1.3.1, ville_id facultatif) et transmis à
 * l'Écran 1.3.3 (annuaire filtré = /assurance déjà existant) au clic
 * sur "Voir l'annuaire".
 *
 * Le lien "Retour" renvoie vers l'Écran 1.3.1 en conservant le pays et
 * la ville déjà choisis, pour ne pas faire perdre ce choix à
 * l'utilisateur qui veut seulement le corriger.
 */
const TYPES_ACTEUR = [
  { valeur: '', label: 'Tous les acteurs', icone: 'fa-shield-heart' },
  { valeur: 'compagnie', label: "Compagnie d'assurance", icone: 'fa-building-shield' },
  { valeur: 'courtier', label: 'Courtier', icone: 'fa-handshake' },
];

export default function OnboardingAssuranceType() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const paysId = searchParams.get('pays_id') || '';
  const villeId = searchParams.get('ville_id') || '';
  const villeNom = searchParams.get('ville_nom') || '';

  // Présélectionné sur "Tous les acteurs" : le type, comme la ville,
  // n'est pas obligatoire pour consulter l'annuaire assurances (voir
  // note de OnboardingAssuranceVille.jsx) — l'utilisateur peut donc
  // avancer sans rien changer.
  const [typeActeur, setTypeActeur] = useState('');

  function voirLAnnuaire() {
    const params = new URLSearchParams();
    if (typeActeur) params.set('type_acteur', typeActeur);
    if (paysId) params.set('pays_id', paysId);
    if (villeId) params.set('ville_id', villeId);
    const qs = params.toString();
    navigate(`/assurance${qs ? `?${qs}` : ''}`);
  }

  function retourEtapeVille() {
    const params = new URLSearchParams();
    if (paysId) params.set('pays_id', paysId);
    if (villeId) params.set('ville_id', villeId);
    navigate(`/onboarding/assurances/ville?${params.toString()}`);
  }

  return (
    <section className="onboarding-shell onboarding-shell-top">
      <div className="container-aps onboarding-container-lg">
        <OnboardingProgress current={2} total={2} />

        <span className="eyebrow">Assurances</span>
        <h1 style={{ fontSize: '1.6rem', marginTop: '.5rem' }}>Quel type d&apos;acteur recherchez-vous ?</h1>
        {villeNom && (
          <p className="mb-4">
            Recherche à : <strong>{villeNom}</strong>
          </p>
        )}

        <div className="service-type-grid onboarding-specialite-grid">
          {TYPES_ACTEUR.map((t) => (
            <label className="service-type-opt" key={t.valeur || 'tous'}>
              <input
                type="radio"
                name="onboarding-type-acteur"
                value={t.valeur}
                checked={typeActeur === t.valeur}
                onChange={(e) => setTypeActeur(e.target.value)}
              />
              <span className="opt-card">
                <i className={`fa-solid ${t.icone}`} />
                {t.label}
              </span>
            </label>
          ))}
        </div>

        <div className="form-nav-actions">
          <button type="button" className="btn btn-ghost" onClick={retourEtapeVille}>
            <i className="fa-solid fa-arrow-left" /> Retour
          </button>
          <button type="button" className="btn btn-primary" onClick={voirLAnnuaire}>
            <i className="fa-solid fa-magnifying-glass" /> Voir l&apos;annuaire
          </button>
        </div>
      </div>
    </section>
  );
}