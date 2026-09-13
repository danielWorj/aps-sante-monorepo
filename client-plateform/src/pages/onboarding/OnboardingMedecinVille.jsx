import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { listerPays, listerVilles } from '../../services/geoService';
import { detecterPaysUtilisateur } from '../../lib/geoloc';
import OnboardingProgress from './components/OnboardingProgress';

/**
 * Écran 1.1.2 — Choix de la ville (étape 2/2 du sous-parcours
 * "Médecins et professionnels").
 *
 * Au montage : tente detecterPaysUtilisateur() (src/lib/geoloc.js) pour
 * pré-sélectionner le pays de l'utilisateur, en parallèle du
 * chargement de la liste complète des pays via listerPays()
 * (geoService.js). La détection ne bloque jamais l'écran : elle est
 * silencieuse par construction (geoloc.js résout `null` en cas de
 * refus/erreur/timeout) et l'utilisateur peut à tout moment corriger le
 * pays manuellement, ce qui recharge alors les villes correspondantes.
 *
 * Le clic sur "Voir les médecins" déclenche la recherche en réutilisant
 * telle quelle la logique de résultats déjà présente dans Medecin.jsx
 * (listerMedecins) : on navigue vers /medecin avec specialite_id,
 * pays_exercice_id et ville_exercice_id en query params, que Medecin.jsx
 * lit désormais comme valeurs initiales de ses filtres (voir la
 * modification apportée à ce fichier).
 */
export default function OnboardingMedecinVille() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const specialiteId = searchParams.get('specialite_id') || '';
  const specialiteNom = searchParams.get('specialite_nom') || '';

  const [pays, setPays] = useState([]);
  const [villes, setVilles] = useState([]);
  const [paysId, setPaysId] = useState('');
  const [villeId, setVilleId] = useState('');

  const [chargementPays, setChargementPays] = useState(true);
  const [chargementVilles, setChargementVilles] = useState(false);
  // 'en_cours' | 'reussie' | 'echouee' — purement informatif, n'empêche
  // jamais la sélection manuelle du pays.
  const [detectionGeoloc, setDetectionGeoloc] = useState('en_cours');

  /* ---------------------------------------------------------------
     Chargement des pays + tentative de détection automatique
  --------------------------------------------------------------- */
  useEffect(() => {
    let annule = false;

    setChargementPays(true);
    listerPays()
      .then((donnees) => {
        if (!annule) setPays(donnees.pays || []);
      })
      .catch(() => {
        if (!annule) setPays([]);
      })
      .finally(() => {
        if (!annule) setChargementPays(false);
      });

    detecterPaysUtilisateur().then((paysDetecte) => {
      if (annule) return;
      if (paysDetecte?.pays_id) {
        setPaysId(String(paysDetecte.pays_id));
        setDetectionGeoloc('reussie');
      } else {
        setDetectionGeoloc('echouee');
      }
    });

    return () => {
      annule = true;
    };
  }, []);

  /* ---------------------------------------------------------------
     Villes du pays sélectionné (détecté ou choisi manuellement)
  --------------------------------------------------------------- */
  useEffect(() => {
    if (!paysId) {
      setVilles([]);
      return;
    }
    let annule = false;
    setChargementVilles(true);
    listerVilles(paysId)
      .then((donnees) => {
        if (!annule) setVilles(donnees.villes || []);
      })
      .catch(() => {
        if (!annule) setVilles([]);
      })
      .finally(() => {
        if (!annule) setChargementVilles(false);
      });
    return () => {
      annule = true;
    };
  }, [paysId]);

  function changerPays(nouveauPaysId) {
    setPaysId(nouveauPaysId);
    setVilleId(''); // le choix de ville précédent ne vaut plus pour un autre pays
  }

  function voirLesMedecins() {
    if (!villeId) return;
    const params = new URLSearchParams({
      specialite_id: specialiteId,
      pays_exercice_id: paysId,
      ville_exercice_id: villeId,
    });
    navigate(`/medecin?${params.toString()}`);
  }

  // Étape accédée directement sans être passé par le choix de
  // spécialité (lien partagé, retour navigateur après nettoyage des
  // query params...) : on renvoie vers l'étape 1.1.1 plutôt que
  // d'afficher un écran de recherche sans spécialité.
  if (!specialiteId) {
    return <Navigate to="/onboarding/medecins/specialite" replace />;
  }

  return (
    <section className="onboarding-shell onboarding-shell-top">
      <div className="container-aps onboarding-container-lg">
        <OnboardingProgress current={2} total={2} />

        <span className="eyebrow">Médecins et professionnels</span>
        <h1 style={{ fontSize: '1.6rem', marginTop: '.5rem' }}>Dans quelle ville ?</h1>
        {specialiteNom && (
          <p className="mb-4">
            Spécialité sélectionnée : <strong>{specialiteNom}</strong>
          </p>
        )}

        {detectionGeoloc === 'en_cours' && (
          <p className="form-hint mb-3">
            <i className="fa-solid fa-location-crosshairs" /> Détection de votre position en cours…
          </p>
        )}
        {detectionGeoloc === 'reussie' && (
          <p className="form-hint mb-3">
            <i className="fa-solid fa-circle-check" /> Pays détecté automatiquement — modifiable ci-dessous.
          </p>
        )}

        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label-aps" htmlFor="onb-pays">Pays</label>
            <select
              className="form-select"
              id="onb-pays"
              value={paysId}
              disabled={chargementPays}
              onChange={(e) => changerPays(e.target.value)}
            >
              <option value="">{chargementPays ? 'Chargement…' : 'Sélectionner…'}</option>
              {pays.map((p) => (
                <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>
              ))}
            </select>
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label-aps" htmlFor="onb-ville">Ville</label>
            <select
              className="form-select"
              id="onb-ville"
              value={villeId}
              disabled={!paysId || chargementVilles}
              onChange={(e) => setVilleId(e.target.value)}
            >
              <option value="">
                {!paysId ? "Choisissez d'abord un pays" : chargementVilles ? 'Chargement…' : 'Sélectionner…'}
              </option>
              {villes.map((v) => (
                <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-nav-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate('/onboarding/medecins/specialite')}
          >
            <i className="fa-solid fa-arrow-left" /> Retour
          </button>
          <button type="button" className="btn btn-primary" disabled={!villeId} onClick={voirLesMedecins}>
            <i className="fa-solid fa-magnifying-glass" /> Voir les médecins
          </button>
        </div>
      </div>
    </section>
  );
}