// Page "Assurances" — annuaire des compagnies d'assurance et courtiers santé.
// Dynamisée : les fiches proviennent de GET /api/services-assurance.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import pub3 from "../assets/img/ads/pub3.jpg";
import { listerServicesAssurance } from "../services/assuranceService";
import { useGeolocation } from "../hooks/useGeolocation";

// Rayons proposés pour le filtre "Autour de moi" (voir
// server/src/lib/geo.js : rayon par défaut 10 km si non précisé).
const RAYONS_KM = [5, 10, 25, 50];

const LABEL_TYPE_ACTEUR = {
  compagnie: "Compagnie d'assurance",
  courtier: "Courtier",
};

// Construit le lien "Itinéraire" Google Maps. `origine` (facultative)
// vient du hook useGeolocation déjà instancié par la page (filtre
// "Autour de moi") : si elle est disponible, elle devient le point de
// départ ; sinon Google Maps demandera lui-même le point de départ à
// l'ouverture du lien (fallback silencieux, jamais de blocage).
function lienItineraire(destLat, destLng, origine) {
  if (destLat == null || destLng == null) return null;
  const destination = `${destLat},${destLng}`;
  return origine
    ? `https://www.google.com/maps/dir/?api=1&origin=${origine.latitude},${origine.longitude}&destination=${destination}`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

function InsurerCard({ insurer, positionActuelle, demanderPosition }) {
  const ficheUrl = `/assurances/${insurer.service_assurance_id}`;
  const estVerifie = insurer.statut_verification === "publie";

  // Coordonnées renvoyées par le backend sous insurer.geolocalisation
  // (voir assurance.controller.js — avecGeolocalisation), pas à plat.
  const destLat = insurer.geolocalisation?.latitude;
  const destLng = insurer.geolocalisation?.longitude;
  const hrefItineraire = lienItineraire(destLat, destLng, positionActuelle);

  return (
    <div className="insurer-card">
      <div className="insurer-head">
        <div className="d-flex gap-3">
          <div className="insurer-logo">
            {insurer.image_url ? (
              <img
                src={insurer.image_url}
                alt={insurer.nom}
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
              />
            ) : (
              <i className="fa-solid fa-building-shield" />
            )}
          </div>
          <div>
            <h3 style={{ marginBottom: ".3rem" }}>
              <Link to={ficheUrl} style={{ color: "var(--ink)" }}>
                {insurer.nom}
              </Link>
            </h3>
            <div className="practitioner-meta">
              <span>{LABEL_TYPE_ACTEUR[insurer.type_acteur] || insurer.type_acteur}</span>
              <span>&middot;</span>
              <span>
                <i className="fa-solid fa-location-dot" /> {insurer.ville?.nom}, {insurer.pays?.nom}
              </span>
              {typeof insurer.distance_km === "number" && (
                <>
                  <span>&middot;</span>
                  <span>
                    <i className="fa-solid fa-route" /> {insurer.distance_km.toFixed(1)} km
                  </span>
                </>
              )}
            </div>
            <div className="practitioner-tags mt-2">
              {estVerifie && (
                <span className="chip chip-verifie">
                  <i className="fa-solid fa-circle-check" /> Vérifiée APS
                </span>
              )}
              <span className="chip chip-complet">Agrément {insurer.agrement}</span>
            </div>
          </div>
        </div>
        <div className="practitioner-actions" style={{ marginLeft: 0 }}>
          <Link to={ficheUrl} className="btn btn-sm-aps btn-outline-primary">
            Voir la fiche
          </Link>
          {hrefItineraire && (
            <a
              href={hrefItineraire}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline-primary btn-sm-aps"
              onClick={(e) => {
                e.stopPropagation();
                // Si on n'a pas encore la position de l'utilisateur, on
                // la demande pour les prochains clics (celui-ci s'ouvre
                // sans origin — Google Maps la demandera lui-même).
                if (!positionActuelle) demanderPosition();
              }}
            >
              <i className="fa-solid fa-diamond-turn-right" /> Itinéraire
            </a>
          )}
        </div>
      </div>

      {insurer.description && (
        <p className="mt-3 mb-1" style={{ fontSize: ".86rem" }}>
          {insurer.description}
        </p>
      )}
    </div>
  );
}

export default function Assurance() {
  const navigate = useNavigate();
  // Écran 1.3.3 du parcours d'onboarding (croquis) : arrivée ici
  // depuis OnboardingAssuranceType.jsx avec type_acteur, pays_id et
  // ville_id déjà choisis en query params (ville_id et type_acteur
  // facultatifs, voir notes du sous-parcours) — ils servent de
  // valeurs initiales des filtres pour que l'annuaire soit déjà
  // pré-filtré, sans que l'utilisateur ait à ressaisir sa recherche.
  const [searchParams] = useSearchParams();

  const [services, setServices] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  const [typeActeur, setTypeActeur] = useState(searchParams.get("type_acteur") || "");
  const [paysId, setPaysId] = useState(searchParams.get("pays_id") || "");
  const [villeId, setVilleId] = useState(searchParams.get("ville_id") || "");
  const [recherche, setRecherche] = useState("");

  // Filtre "Autour de moi" — API navigateur native (voir
  // src/hooks/useGeolocation.js), aucune librairie carto. Refus de
  // permission / navigateur non compatible : on retombe silencieusement
  // sur les filtres pays/ville existants (aucun lat/lng envoyé), avec
  // un message discret affiché sous le sélecteur de rayon.
  const {
    position: positionActuelle,
    loading: geoEnCours,
    error: geoErreur,
    demanderPosition,
  } = useGeolocation();
  const [autourDeMoi, setAutourDeMoi] = useState(false);
  const [rayonKm, setRayonKm] = useState(10);

  function handleToggleAutourDeMoi(actif) {
    setAutourDeMoi(actif);
    if (actif && !positionActuelle) {
      demanderPosition();
    }
  }

  const charger = async () => {
    setChargement(true);
    setErreur("");
    try {
      const filtresProximite =
        autourDeMoi && positionActuelle
          ? { lat: positionActuelle.latitude, lng: positionActuelle.longitude, rayon_km: rayonKm }
          : {};
      const data = await listerServicesAssurance({
        statut_verification: "publie",
        type_acteur: typeActeur || undefined,
        pays_id: paysId || undefined,
        ville_id: villeId || undefined,
        recherche: recherche || undefined,
        ...filtresProximite,
      });
      setServices(data.services_assurance || []);
    } catch (err) {
      setErreur(err.data?.message || err.message || "Impossible de charger l'annuaire.");
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Relance automatiquement la recherche dès qu'une position est
  // obtenue pendant que "Autour de moi" est actif (la demande de
  // localisation est asynchrone : au moment du clic sur "Rechercher",
  // la position n'est pas encore forcément disponible).
  useEffect(() => {
    if (autourDeMoi && positionActuelle) {
      charger();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionActuelle]);

  // Options pays/villes dérivées des résultats déjà chargés — évite de
  // dépendre d'un endpoint géo dédié pour le simple filtrage de la liste.
  const paysOptions = useMemo(() => {
    const map = new Map();
    services.forEach((s) => s.pays && map.set(s.pays.pays_id, s.pays.nom));
    return [...map.entries()];
  }, [services]);

  const villeOptions = useMemo(() => {
    const map = new Map();
    services
      .filter((s) => !paysId || s.pays?.pays_id === paysId)
      .forEach((s) => s.ville && map.set(s.ville.ville_id, s.ville.nom));
    return [...map.entries()];
  }, [services, paysId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    charger();
  };

  return (
    <>
      {/* ============================ EN-TÊTE PAGE ============================ */}
      <section style={{ padding: "2.5rem 0 0" }}>
        <div className="container-aps">
          <span className="eyebrow">Annuaire &amp; mise en relation</span>
          <h1 style={{ fontSize: "1.9rem", marginTop: ".5rem" }}>
            Compagnies d'assurance &amp; courtiers santé
          </h1>
          <p className="mt-2" style={{ maxWidth: "660px" }}>
            Consultez les compagnies, leurs produits et leur réseau d'agences. APS ne
            porte aucun service professionnel d'assurance : ni comparateur, ni
            souscription en ligne, ni gestion de sinistre. La mise en relation se fait
            directement avec l'assureur.
          </p>
        </div>
      </section>

      {/* ============================ PUBLICITÉ ============================ */}
      <section style={{ paddingTop: "1.5rem", paddingBottom: 0 }}>
        <div className="container-aps">
          <a href="#" className="ad-slot ad-banner-top">
            <span className="ad-tag">Publicité</span>
            <img src={pub3} alt="Publicité — AXA Assurance" />
          </a>
        </div>
      </section>

      {/* ============================ FILTRES + RESULTATS ============================ */}
      <section style={{ paddingTop: 0 }}>
        <div className="container-aps">
          <div className="row g-4">
            {/* Colonne filtres */}
            <div className="col-md-4">
              <div className="filter-bar filter-sidebar">
                <h3 style={{ marginBottom: "1rem" }}>
                  <i className="fa-solid fa-sliders" /> Filtrer
                </h3>
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-type">
                      Type d'acteur
                    </label>
                    <select
                      className="form-select"
                      id="f-type"
                      value={typeActeur}
                      onChange={(e) => setTypeActeur(e.target.value)}
                    >
                      <option value="">Tous</option>
                      <option value="compagnie">Compagnie d'assurance</option>
                      <option value="courtier">Courtier</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-pays">
                      Pays
                    </label>
                    <select
                      className="form-select"
                      id="f-pays"
                      value={paysId}
                      onChange={(e) => {
                        setPaysId(e.target.value);
                        setVilleId("");
                      }}
                    >
                      <option value="">Tous les pays</option>
                      {paysOptions.map(([id, nom]) => (
                        <option key={id} value={id}>{nom}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-ville">
                      Ville
                    </label>
                    <select
                      className="form-select"
                      id="f-ville"
                      value={villeId}
                      onChange={(e) => setVilleId(e.target.value)}
                    >
                      <option value="">Toutes les villes</option>
                      {villeOptions.map(([id, nom]) => (
                        <option key={id} value={id}>{nom}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-recherche">
                      Recherche
                    </label>
                    <input
                      id="f-recherche"
                      className="form-control"
                      placeholder="Nom de la compagnie…"
                      value={recherche}
                      onChange={(e) => setRecherche(e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="chip chip-verifie" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={autourDeMoi}
                        onChange={(e) => handleToggleAutourDeMoi(e.target.checked)}
                        style={{ marginRight: ".35rem" }}
                      />
                      <i className="fa-solid fa-location-crosshairs" /> Autour de
                      moi
                    </label>
                  </div>
                  {autourDeMoi && (
                    <div className="mb-3">
                      <label className="form-label-aps" htmlFor="f-rayon">
                        Rayon de recherche
                      </label>
                      <select
                        className="form-select"
                        id="f-rayon"
                        value={rayonKm}
                        onChange={(e) => setRayonKm(Number(e.target.value))}
                      >
                        {RAYONS_KM.map((km) => (
                          <option key={km} value={km}>
                            {km} km
                          </option>
                        ))}
                      </select>
                      {geoEnCours && (
                        <p className="minimal-note mt-2">Localisation en cours…</p>
                      )}
                      {geoErreur && (
                        <p className="minimal-note mt-2">
                          <i className="fa-solid fa-triangle-exclamation" /> {geoErreur}
                        </p>
                      )}
                    </div>
                  )}
                  <button type="submit" className="btn btn-primary btn-block-aps">
                    <i className="fa-solid fa-magnifying-glass" /> Rechercher
                  </button>
                </form>
              </div>
            </div>

            {/* Colonne résultats */}
            <div className="col-md-8">
              <div className="banner-institutionnel">
                <i className="fa-solid fa-circle-info" />
                <span>
                  Présentation seulement : aucune comparaison de produits, aucune
                  souscription en ligne, aucune gestion de sinistre ou de réclamation
                  sur APS.
                </span>
              </div>

              <div className="results-toolbar" style={{ marginTop: 0 }}>
                <span className="text-muted-soft" style={{ fontSize: ".9rem" }}>
                  <strong style={{ color: "var(--ink)" }}>{services.length}</strong>{" "}
                  compagnies &amp; courtiers référencés
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm-aps"
                  onClick={() => navigate("/assurances/creation")}
                >
                  <i className="fa-solid fa-plus" /> Déclarer une compagnie
                </button>
              </div>

              {chargement && <p className="minimal-note">Chargement de l'annuaire…</p>}
              {erreur && (
                <p className="minimal-note" style={{ color: "var(--danger, #c0392b)" }}>
                  <i className="fa-solid fa-triangle-exclamation" /> {erreur}
                </p>
              )}
              {!chargement && !erreur && services.length === 0 && (
                <p className="minimal-note">Aucune compagnie ne correspond à ces critères.</p>
              )}

              {services.map((insurer) => (
                <InsurerCard
                  key={insurer.service_assurance_id}
                  insurer={insurer}
                  positionActuelle={positionActuelle}
                  demanderPosition={demanderPosition}
                />
              ))}
            </div>
          </div>
        </div>
      </section>


    </>
  );
}