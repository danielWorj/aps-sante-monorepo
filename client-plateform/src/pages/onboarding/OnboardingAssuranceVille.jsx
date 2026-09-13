import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { listerPays, listerVilles } from '../../services/geoService';
import { detecterPaysUtilisateur } from '../../lib/geoloc';
import OnboardingProgress from './OnboardingProgess';

/**
 * Écran 1.3.1 — Choix de la ville (étape 1/2 du sous-parcours
 * "Assurances", même principe que le sous-parcours "Médecins et
 * professionnels" : 1.3 → 1.3.1 ville → 1.3.2 type d'acteur → 1.3.3
 * annuaire filtré (= /assurance déjà existant).
 *
 * Au montage : tente detecterPaysUtilisateur() (src/lib/geoloc.js) —
 * un script côté client demande la position GPS puis l'envoie au
 * serveur, qui renvoie l'id du pays auquel elle appartient — pour
 * pré-sélectionner le pays de l'utilisateur, en parallèle du
 * chargement de la liste complète des pays via listerPays()
 * (geoService.js). La détection ne bloque jamais l'écran : elle est
 * silencieuse par construction (geoloc.js résout `null` en cas de
 * refus/erreur/timeout) et l'utilisateur peut à tout moment corriger
 * le pays manuellement, ce qui recharge alors les villes
 * correspondantes.
 *
 * pays_id / ville_id peuvent arriver en query params (retour arrière
 * depuis l'Écran 1.3.2 via son lien "Retour") : dans ce cas ils
 * priment sur la détection automatique, pour ne pas faire perdre à
 * l'utilisateur un choix déjà fait.
 *
 * Contrairement au sous-parcours médecins, la ville n'est pas
 * obligatoire ici : GET /services-assurance accepte ville_id vide
 * (annuaire non filtré par ville) — voir assuranceService.js. On
 * autorise donc "Suivant" même sans ville choisie, pour laisser
 * l'utilisateur voir toutes les compagnies d'un pays.
 */
export default function OnboardingAssuranceVille() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const paysInitial = searchParams.get('pays_id') || '';
  const villeInitiale = searchParams.get('ville_id') || '';

  const [pays, setPays] = useState([]);
  const [villes, setVilles] = useState([]);
  const [paysId, setPaysId] = useState(paysInitial);
  const [villeId, setVilleId] = useState(villeInitiale);

  const [chargementPays, setChargementPays] = useState(true);
  const [chargementVilles, setChargementVilles] = useState(false);
  // 'en_cours' | 'reussie' | 'echouee' | 'ignoree' — purement informatif,
  // n'empêche jamais la sélection manuelle du pays. 'ignoree' quand un
  // pays est déjà fourni via les query params (retour depuis l'étape
  // suivante) : la détection serait alors superflue et pourrait écraser
  // le choix de l'utilisateur pendant un court instant.
  const [detectionGeoloc, setDetectionGeoloc] = useState(paysInitial ? 'ignoree' : 'en_cours');

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

    if (paysInitial) return () => { annule = true; };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function allerVersEtapeType() {
    const ville = villes.find((v) => String(v.ville_id) === String(villeId));
    const params = new URLSearchParams();
    if (paysId) params.set('pays_id', paysId);
    if (villeId) params.set('ville_id', villeId);
    if (ville?.nom) params.set('ville_nom', ville.nom);
    navigate(`/onboarding/assurances/type?${params.toString()}`);
  }

  return (
    <section className="onboarding-shell onboarding-shell-top">
      <div className="container-aps onboarding-container-lg">
        <OnboardingProgress current={1} total={2} />

        <span className="eyebrow">Assurances</span>
        <h1 style={{ fontSize: '1.6rem', marginTop: '.5rem' }}>Dans quelle ville ?</h1>

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
            <label className="form-label-aps" htmlFor="onb-assurance-pays">Pays</label>
            <select
              className="form-select"
              id="onb-assurance-pays"
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
            <label className="form-label-aps" htmlFor="onb-assurance-ville">Ville</label>
            <select
              className="form-select"
              id="onb-assurance-ville"
              value={villeId}
              disabled={!paysId || chargementVilles}
              onChange={(e) => setVilleId(e.target.value)}
            >
              <option value="">
                {!paysId
                  ? "Choisissez d'abord un pays"
                  : chargementVilles
                  ? 'Chargement…'
                  : 'Toutes les villes'}
              </option>
              {villes.map((v) => (
                <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-nav-actions">
          <Link to="/onboarding/services" className="btn btn-ghost">
            <i className="fa-solid fa-arrow-left" /> Retour
          </Link>
          <button type="button" className="btn btn-primary" onClick={allerVersEtapeType}>
            Suivant <i className="fa-solid fa-arrow-right" />
          </button>
        </div>
      </div>
    </section>
  );
}