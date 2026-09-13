import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { listerSpecialites } from '../../services/medecinService';
import OnboardingProgress from './components/OnboardingProgress';

/**
 * Écran 1.1.1 — Choix de la spécialité (étape 1/2 du sous-parcours
 * "Médecins et professionnels").
 *
 * Charge le référentiel des spécialités via listerSpecialites()
 * (medecinService.js, GET /specialites, public) et le présente sous
 * forme de cartes sélectionnables (pattern ".service-type-grid /
 * .opt-card" déjà utilisé dans Home.jsx et creationMedecin.jsx — aucune
 * nouvelle classe CSS nécessaire).
 *
 * La sélection est conservée via un query param (specialite_id, +
 * specialite_nom pour l'affichage du récapitulatif à l'écran suivant)
 * plutôt qu'un state React partagé : l'écran 1.1.2 reste ainsi
 * fonctionnel même après un rechargement de page ou un lien partagé.
 */
export default function OnboardingMedecinSpecialite() {
  const navigate = useNavigate();

  const [specialites, setSpecialites] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [specialiteId, setSpecialiteId] = useState('');

  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    listerSpecialites()
      .then((donnees) => {
        if (!annule) setSpecialites(donnees || []);
      })
      .catch((err) => {
        if (!annule) setErreur(err.message || 'Impossible de charger la liste des spécialités.');
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, []);

  function allerVersEtapeVille() {
    if (!specialiteId) return;
    const specialite = specialites.find((s) => String(s.specialite_id) === String(specialiteId));
    const params = new URLSearchParams({ specialite_id: specialiteId });
    if (specialite?.nom) params.set('specialite_nom', specialite.nom);
    navigate(`/onboarding/medecins/ville?${params.toString()}`);
  }

  return (
    <section className="onboarding-shell onboarding-shell-top">
      <div className="container-aps onboarding-container-lg">
        <OnboardingProgress current={1} total={2} />

        <span className="eyebrow">Médecins et professionnels</span>
        <h1 style={{ fontSize: '1.6rem', marginTop: '.5rem' }}>Quelle spécialité recherchez-vous ?</h1>
        <p className="mb-4">Sélectionnez une spécialité pour affiner la recherche de professionnels.</p>

        {chargement && (
          <div className="info-card" style={{ padding: '2rem', textAlign: 'center' }}>
            Chargement des spécialités...
          </div>
        )}

        {!chargement && erreur && (
          <div className="info-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger, #c0392b)' }}>
            {erreur}
          </div>
        )}

        {!chargement && !erreur && specialites.length === 0 && (
          <div className="info-card" style={{ padding: '2rem', textAlign: 'center' }}>
            Aucune spécialité disponible pour le moment.
          </div>
        )}

        {!chargement && !erreur && specialites.length > 0 && (
          <div className="service-type-grid onboarding-specialite-grid">
            {specialites.map((s) => (
              <label className="service-type-opt" key={s.specialite_id}>
                <input
                  type="radio"
                  name="onboarding-specialite"
                  value={s.specialite_id}
                  checked={String(specialiteId) === String(s.specialite_id)}
                  onChange={(e) => setSpecialiteId(e.target.value)}
                />
                <span className="opt-card">
                  <i className="fa-solid fa-stethoscope" />
                  {s.nom}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="form-nav-actions">
          <Link to="/onboarding/services" className="btn btn-ghost">
            <i className="fa-solid fa-arrow-left" /> Retour
          </Link>
          <button type="button" className="btn btn-primary" disabled={!specialiteId} onClick={allerVersEtapeVille}>
            Suivant <i className="fa-solid fa-arrow-right" />
          </button>
        </div>
      </div>
    </section>
  );
}