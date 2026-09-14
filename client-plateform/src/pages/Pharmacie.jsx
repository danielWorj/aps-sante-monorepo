import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import pharmaPlaceholder from "../assets/img/pharma1.jpg";
import pub5 from "../assets/img/ads/pub5.jpg";

import { listerPharmacies, listerGardesPharmacie } from "../services/pharmacieService";
import { listerPays, listerVilles } from "../services/geoService";
import { useGeolocation } from "../hooks/useGeolocation";

// Rayons proposés pour le filtre "Autour de moi" (voir
// server/src/lib/geo.js : rayon par défaut 10 km si non précisé).
const RAYONS_KM = [5, 10, 25, 50];

// Page "Pharmacies" — annuaire des pharmacies, alimenté par l'API
// (module pharmacie) : liste publique + repérage des pharmacies de
// garde à l'instant présent. Le bouton "Déclarer une pharmacie"
// renvoie vers la page dédiée CreationPharmacie
// (src/components/pharmacie/creationPharmacie.jsx), qui porte le
// formulaire multi-étapes et appelle elle-même
// pharmacieService.creerPharmacie — cette page-ci ne fait plus que
// rediriger vers /pharmacies/creer.

const STATUT_PUBLIC = "publie"; // seules les fiches validées sont montrées au public

/* ===================================================================
 * Carte pharmacie
 * =================================================================== */

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

function PharmacyCard({ pharmacy, enGarde, positionActuelle, demanderPosition }) {
  const ville = pharmacy.ville?.nom;
  const pays = pharmacy.pays?.nom;
  const localisation = [ville, pays].filter(Boolean).join(" — ");

  // Coordonnées renvoyées par le backend sous pharmacy.geolocalisation
  // (voir pharmacie.controller.js — avecGeolocalisation), pas à plat.
  const destLat = pharmacy.geolocalisation?.latitude;
  const destLng = pharmacy.geolocalisation?.longitude;
  const hrefItineraire = lienItineraire(destLat, destLng, positionActuelle);

  return (
    <div className="pharmacy-card">
      {/* Zone cliquable : ouvre la fiche détaillée de la pharmacie.
          display:contents pour que la photo et le bloc infos gardent
          exactement la même disposition qu'avant (le lien n'ajoute pas
          de boîte dans le flex du .pharmacy-card). */}
      <Link
        to={`/pharmacie/${pharmacy.pharmacie_id}`}
        style={{ display: "contents", color: "inherit", textDecoration: "none" }}
      >
        <div className="pharmacy-photo">
          <img src={pharmacy.image_url || pharmaPlaceholder} alt={pharmacy.nom} />
        </div>
        <div>
          <span className={`pharmacy-status ${enGarde ? "is-garde" : "is-open"}`}>
            <i className={enGarde ? "fa-solid fa-moon" : "fa-solid fa-circle-check"} />{" "}
            {enGarde ? "De garde en ce moment" : "Fiche vérifiée"}
          </span>
          <h3>{pharmacy.nom}</h3>
          <div className="practitioner-meta">
            {localisation && (
              <>
                <span>
                  <i className="fa-solid fa-location-dot" /> {localisation}
                </span>
                <span>&middot;</span>
              </>
            )}
            <span>
              <i className="fa-solid fa-id-card" /> N° ordre {pharmacy.numero_ordre_titulaire}
            </span>
            {typeof pharmacy.distance_km === "number" && (
              <>
                <span>&middot;</span>
                <span>
                  <i className="fa-solid fa-route" /> {pharmacy.distance_km.toFixed(1)} km
                </span>
              </>
            )}
          </div>
        </div>
      </Link>
      <div className="practitioner-actions" style={{ marginLeft: "auto" }}>
        <a
          href={`tel:${pharmacy.telephone}`}
          className="btn btn-urgence btn-sm-aps"
          onClick={(e) => e.stopPropagation()}
        >
          <i className="fa-solid fa-phone" /> Appeler
        </a>
        {hrefItineraire && (
          <a
            href={hrefItineraire}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline-primary btn-sm-aps"
            onClick={(e) => {
              e.stopPropagation();
              // Si on n'a pas encore la position de l'utilisateur, on la
              // demande pour les prochains clics (celui-ci s'ouvre sans
              // origin — Google Maps la demandera lui-même le temps
              // qu'on l'obtienne côté app).
              if (!positionActuelle) demanderPosition();
            }}
          >
            <i className="fa-solid fa-diamond-turn-right" /> Itinéraire
          </a>
        )}
      </div>
    </div>
  );
}



export default function Pharmacie() {
  const navigate = useNavigate();

  const [pharmacies, setPharmacies] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState("");

  const [paysListe, setPaysListe] = useState([]);
  const [villesListe, setVillesListe] = useState([]);

  const [paysId, setPaysId] = useState("");
  const [villeId, setVilleId] = useState("");
  const [recherche, setRecherche] = useState("");
  const [rechercheSaisie, setRechercheSaisie] = useState("");
  const [gardeOnly, setGardeOnly] = useState(false);

  const [gardePharmacieIds, setGardePharmacieIds] = useState(new Set());

  // Filtre "Autour de moi" — API navigateur native (voir
  // src/hooks/useGeolocation.js), aucune librairie carto. Refus de
  // permission / navigateur non compatible : on retombe silencieusement
  // sur les filtres pays/ville existants (aucun lat/lng envoyé), avec
  // un message discret affiché sous le bouton.
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

  // Référentiel Pays (une fois)
  useEffect(() => {
    listerPays()
      .then((data) => setPaysListe(data.pays || []))
      .catch(() => setPaysListe([]));
  }, []);

  // Référentiel Villes (dépend du pays sélectionné dans les filtres)
  useEffect(() => {
    if (!paysId) {
      setVillesListe([]);
      setVilleId("");
      return;
    }
    let annule = false;
    listerVilles(paysId)
      .then((data) => {
        if (!annule) setVillesListe(data.villes || []);
      })
      .catch(() => {
        if (!annule) setVillesListe([]);
      });
    return () => {
      annule = true;
    };
  }, [paysId]);

  // Liste des pharmacies (fiches publiées uniquement). Le filtre de
  // proximité (lat/lng/rayon_km) n'est envoyé au backend
  // (server/src/lib/geo.js) que si "Autour de moi" est actif ET
  // qu'une position a effectivement été obtenue ; sinon on reste sur
  // les filtres pays/ville habituels — le tri par distance renvoyé par
  // le serveur n'est jamais recalculé côté front.
  function chargerPharmacies() {
    setChargement(true);
    setErreurChargement("");
    const filtresProximite =
      autourDeMoi && positionActuelle
        ? { lat: positionActuelle.latitude, lng: positionActuelle.longitude, rayon_km: rayonKm }
        : {};
    listerPharmacies({
      pays_id: paysId || undefined,
      ville_id: villeId || undefined,
      recherche: recherche || undefined,
      statut_verification: STATUT_PUBLIC,
      ...filtresProximite,
    })
      .then((data) => setPharmacies(data.pharmacies || []))
      .catch(() =>
        setErreurChargement("Impossible de charger les pharmacies pour le moment.")
      )
      .finally(() => setChargement(false));
  }

  useEffect(() => {
    chargerPharmacies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paysId, villeId, recherche, autourDeMoi, positionActuelle, rayonKm]);

  // Pharmacies de garde à l'instant présent (pour le badge + le filtre)
  useEffect(() => {
    listerGardesPharmacie({ ville_id: villeId || undefined, date: new Date().toISOString() })
      .then((data) => {
        const ids = new Set((data.gardes || []).map((g) => g.pharmacie_id));
        setGardePharmacieIds(ids);
      })
      .catch(() => setGardePharmacieIds(new Set()));
  }, [villeId, pharmacies]);

  const listeAffichee = useMemo(() => {
    return gardeOnly
      ? pharmacies.filter((p) => gardePharmacieIds.has(p.pharmacie_id))
      : pharmacies;
  }, [pharmacies, gardeOnly, gardePharmacieIds]);

  function soumettreFiltres(e) {
    e.preventDefault();
    setRecherche(rechercheSaisie.trim());
  }

  return (
    <>
      {/* ============================ EN-TÊTE PAGE ============================ */}
      <section style={{ padding: "2.5rem 0 0" }}>
        <div className="container-aps">
          <span className="eyebrow">Annuaire</span>
          <h1 style={{ fontSize: "1.9rem", marginTop: ".5rem" }}>
            Trouver une pharmacie
          </h1>
          <p className="mt-2" style={{ maxWidth: 620 }}>
            Pharmacies vérifiées et pharmacies de garde près de chez vous,
            avec appel direct et itinéraire.
          </p>
        </div>
      </section>

      {/* ============================ FILTRES + RESULTATS + PUBLICITE ============================ */}
      <section style={{ paddingTop: "1.5rem" }}>
        <div className="container-aps">
          <div className="row g-4">
            {/* Colonne filtres */}
            <div className="col-md-3">
              <div className="filter-bar filter-sidebar">
                <h3 style={{ marginBottom: "1rem" }}>
                  <i className="fa-solid fa-sliders" /> Filtrer
                </h3>
                <form onSubmit={soumettreFiltres}>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-recherche">
                      Nom
                    </label>
                    <input
                      id="f-recherche"
                      className="form-control"
                      value={rechercheSaisie}
                      onChange={(e) => setRechercheSaisie(e.target.value)}
                      placeholder="Rechercher une pharmacie"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-pays">
                      Pays
                    </label>
                    <select
                      className="form-select"
                      id="f-pays"
                      value={paysId}
                      onChange={(e) => setPaysId(e.target.value)}
                    >
                      <option value="">Tous les pays</option>
                      {paysListe.map((p) => (
                        <option key={p.pays_id} value={p.pays_id}>
                          {p.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-ville">
                      Ville / Quartier
                    </label>
                    <select
                      className="form-select"
                      id="f-ville"
                      value={villeId}
                      onChange={(e) => setVilleId(e.target.value)}
                      disabled={!paysId}
                    >
                      <option value="">Toutes les villes</option>
                      {villesListe.map((v) => (
                        <option key={v.ville_id} value={v.ville_id}>
                          {v.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="d-flex flex-column gap-2 mb-3">
                    <label className="chip chip-verifie" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={gardeOnly}
                        onChange={(e) => setGardeOnly(e.target.checked)}
                        style={{ marginRight: ".35rem" }}
                      />
                      <i className="fa-solid fa-circle" /> Pharmacies de garde
                      uniquement
                    </label>
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
            <div className="col-md-6">
              <button
                type="button"
                className="btn btn-primary btn-block-aps mb-3"
                onClick={() => navigate("/pharmacie/creation")}
              >
                <i className="fa-solid fa-plus" /> Déclarer une pharmacie
              </button>

              <div className="results-toolbar" style={{ marginTop: 0 }}>
                <span className="text-muted-soft" style={{ fontSize: ".9rem" }}>
                  <strong style={{ color: "var(--ink)" }}>{listeAffichee.length}</strong>{" "}
                  pharmacies trouvées
                </span>
              </div>

              {chargement && <p className="text-muted-soft">Chargement des pharmacies…</p>}

              {!chargement && erreurChargement && (
                <p className="text-muted-soft">{erreurChargement}</p>
              )}

              {!chargement && !erreurChargement && listeAffichee.length === 0 && (
                <p className="text-muted-soft">Aucune pharmacie ne correspond à ces critères.</p>
              )}

              {!chargement &&
                !erreurChargement &&
                listeAffichee.map((p) => (
                  <PharmacyCard
                    key={p.pharmacie_id}
                    pharmacy={p}
                    enGarde={gardePharmacieIds.has(p.pharmacie_id)}
                    positionActuelle={positionActuelle}
                    demanderPosition={demanderPosition}
                  />
                ))}
            </div>

            {/* Colonne publicité */}
            <div className="col-md-3">
              <div className="ad-col">
                <div className="ad-card">
                  <div className="ad-label">
                    <span>Publicité</span>
                    <i className="fa-solid fa-circle-info" title="Emplacement commercial APS" />
                  </div>
                  <a href="#" aria-label="Nourishka Greenlife — Collagène">
                    <img src={pub5} alt="Nourishka Greenlife — Collagène" />
                  </a>
                  <div className="ad-card-body">
                    <h4>Nourishka Greenlife</h4>
                    <p>
                      Collagène : peau, cheveux, os, articulations. Disponible
                      chez Nourishka Greenlife, Akwa Carrefour Paris Dancing.
                    </p>
                    <a
                      href="https://wa.me/237699007730"
                      className="btn btn-outline-primary btn-sm-aps btn-block-aps"
                    >
                      <i className="fa-brands fa-whatsapp" /> Contacter
                    </a>
                  </div>
                </div>

                <div className="ad-slot-empty">
                  <i className="fa-solid fa-bullhorn" />
                  <p>
                    Cet emplacement est disponible pour les annonceurs
                    partenaires d'APS.
                  </p>
                  <a href="#" className="btn btn-primary btn-sm-aps btn-block-aps">
                    Réserver cet espace
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}