import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { listerSpecialites } from '../../services/medecinService';
import OnboardingProgress from './components/OnboardingProgress';

/**
 * Écran 1.1.2 — Choix de la spécialité (étape 2/2 du sous-parcours
 * "Médecins et professionnels", après la ville — voir Écran 1.1.1).
 *
 * Charge le référentiel des spécialités via listerSpecialites()
 * (medecinService.js, GET /specialites, public) et le présente sous
 * forme de cartes sélectionnables (pattern ".service-type-grid /
 * .opt-card" déjà utilisé dans Home.jsx et creationMedecin.jsx — aucune
 * nouvelle classe CSS nécessaire).
 *
 * pays_exercice_id et ville_exercice_id sont repris tels quels des
 * query params (renseignés par l'Écran 1.1.1) et transmis à l'Écran
 * 1.1.3 (liste des médecins obtenus, = /medecin déjà existant) au clic
 * sur "Voir les médecins".
 *
 * Le lien "Retour" renvoie vers l'Écran 1.1.1 en conservant le pays et
 * la ville déjà choisis (le croquis note explicitement qu'on peut
 * "passer de 1.1.2 → 1.1.1"), pour ne pas faire perdre ce choix à
 * l'utilisateur qui veut seulement le corriger.
 */
export default function OnboardingMedecinSpecialite() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const paysId = searchParams.get('pays_exercice_id') || '';
  const villeId = searchParams.get('ville_exercice_id') || '';
  const villeNom = searchParams.get('ville_nom') || '';

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

  function voirLesMedecins() {
    if (!specialiteId) return;
    const params = new URLSearchParams({
      specialite_id: specialiteId,
      pays_exercice_id: paysId,
      ville_exercice_id: villeId,
    });
    navigate(`/medecin?${params.toString()}`);
  }

  function retourEtapeVille() {
    const params = new URLSearchParams({ pays_exercice_id: paysId, ville_exercice_id: villeId });
    navigate(`/onboarding/medecins/ville?${params.toString()}`);
  }

  // Étape accédée directement sans être passé par le choix de ville
  // (lien partagé, retour navigateur après nettoyage des query
  // params...) : on renvoie vers l'étape 1.1.1 plutôt que d'afficher
  // un écran de spécialités sans ville de recherche.
  if (!paysId || !villeId) {
    return <Navigate to="/onboarding/medecins/ville" replace />;
  }

  return (
    <section className="onboarding-shell onboarding-shell-top">
      <div className="container-aps onboarding-container-lg">
        <OnboardingProgress current={2} total={2} />

        <span className="eyebrow">Médecins et professionnels</span>
        <h1 style={{ fontSize: '1.6rem', marginTop: '.5rem' }}>Quelle spécialité recherchez-vous ?</h1>
        {villeNom && (
          <p className="mb-4">
            Recherche à : <strong>{villeNom}</strong>
          </p>
        )}

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
          <button type="button" className="btn btn-ghost" onClick={retourEtapeVille}>
            <i className="fa-solid fa-arrow-left" /> Retour
          </button>
          <button type="button" className="btn btn-primary" disabled={!specialiteId} onClick={voirLesMedecins}>
            <i className="fa-solid fa-magnifying-glass" /> Voir les médecins
          </button>
        </div>
      </div>
    </section>
  );
}