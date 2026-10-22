import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ApsSelect from "../components/ui/ApsSelect";

import pharmaPlaceholder from "../assets/img/pharma1.jpg";
import SliderPublicite from '../components/publicite/SliderPublicite';
import { PAGES_PUBLICITE } from '../services/publiciteService';
import "../assets/styles/annuaire-2026.css";

import { listerPharmacies, listerGardesPharmacie } from "../services/pharmacieService";
import { listerPays, listerVilles } from "../services/geoService";
import { usePaysFiltre } from "../context/PaysContext";
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
    <article className="aps-dc is-wide">
      <img src={pharmacy.image_url || pharmaPlaceholder} alt="" loading="lazy" />
      {/* Zone cliquable : ouvre la fiche détaillée de la pharmacie. */}
      <Link
        to={`/pharmacie/${pharmacy.pharmacie_id}`}
        className="aps-dc-lien"
        aria-label={`Voir la fiche de ${pharmacy.nom}`}
      />
      <div className="aps-dc-top">
        <span className={`aps-pill ${enGarde ? "is-violet" : "is-white"}`}>
          {enGarde ? <i className="fa-solid fa-moon" /> : <span className="d" />}
          {enGarde ? "De garde en ce moment" : "Fiche vérifiée"}
        </span>
        {hrefItineraire && (
          <a
            href={hrefItineraire}
            target="_blank"
            rel="noreferrer"
            className="aps-dc-fav"
            title="Itinéraire"
            aria-label="Itinéraire"
            onClick={() => {
              // Si on n'a pas encore la position de l'utilisateur, on la
              // demande pour les prochains clics (celui-ci s'ouvre sans
              // origin — Google Maps la demandera lui-même).
              if (!positionActuelle) demanderPosition();
            }}
          >
            <i className="fa-solid fa-diamond-turn-right" />
          </a>
        )}
      </div>
      <div className="aps-dc-info">
        <div className="d-flex align-items-center gap-2">
          <div className="flex-grow-1" style={{ minWidth: 0 }}>
            <div className="aps-dc-nm text-truncate">{pharmacy.nom}</div>
            <div className="aps-dc-sp text-truncate">
              {[localisation, typeof pharmacy.distance_km === "number" ? `${pharmacy.distance_km.toFixed(1)} km` : null]
                .filter(Boolean)
                .join(" · ") || `N° ordre ${pharmacy.numero_ordre_titulaire}`}
            </div>
          </div>
          {/* Bouton d'appel : seulement si le serveur expose le contact (abonnement de présence). */}
          {pharmacy.telephone ? (
            <a href={`tel:${pharmacy.telephone}`} className="aps-dc-go" title="Appeler" aria-label={`Appeler ${pharmacy.nom}`}>
              <i className="fa-solid fa-phone" />
            </a>
          ) : (
            <span className="aps-dc-go"><i className="fa-solid fa-arrow-right" /></span>
          )}
        </div>
      </div>
    </article>
  );
}



export default function Pharmacie() {
  const navigate = useNavigate();

  const [pharmacies, setPharmacies] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState("");

  const [paysListe, setPaysListe] = useState([]);
  const [villesListe, setVillesListe] = useState([]);

  // Pays : par défaut celui de l'utilisateur (détecté ou choisi, PaysContext).
  const [paysId, setPaysId] = usePaysFiltre();
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

  const nomVille = villesListe.find((v) => String(v.ville_id) === String(villeId))?.nom;
  const nbFiltresActifs = [paysId, recherche, gardeOnly, autourDeMoi].filter(Boolean).length;

  function reinitialiserFiltres() {
    setPaysId("");
    setVilleId("");
    setRecherche("");
    setRechercheSaisie("");
    setGardeOnly(false);
    setAutourDeMoi(false);
  }

  return (
    <>
      {/* ============================ EN-TÊTE + RECHERCHE ============================ */}
      <div className="annuaire26-tete">
        <div className="container-aps">
          <div className="aps-t-xs">
            <Link to="/home" className="annuaire26-fil">Accueil</Link> / Pharmacies
          </div>
          <div className="annuaire26-titre">
            <h1 className="aps-h3">
              {gardeOnly ? "Pharmacies de garde" : "Pharmacies"}{nomVille ? ` à ${nomVille}` : ""}
            </h1>
            {!chargement && !erreurChargement && (
              <span className="aps-t-s">
                <b style={{ color: "var(--primary-hover)" }}>{listeAffichee.length}</b>{" "}
                {listeAffichee.length > 1 ? "pharmacies trouvées" : "pharmacie trouvée"}
                {gardePharmacieIds.size > 0 && (
                  <> · <b style={{ color: "var(--primary-hover)" }}>{gardePharmacieIds.size} de garde</b></>
                )}
              </span>
            )}
          </div>
          <form className="aps-sbar annuaire26-sbar" onSubmit={soumettreFiltres}>
            <div className="aps-sbar-f">
              <i className="fa-solid fa-prescription-bottle-medical" />
              <div>
                <label htmlFor="f-recherche">Pharmacie</label>
                <input
                  id="f-recherche"
                  value={rechercheSaisie}
                  onChange={(e) => setRechercheSaisie(e.target.value)}
                  placeholder="Nom de la pharmacie"
                />
              </div>
            </div>
            <div className="aps-sbar-f">
              <i className="fa-solid fa-location-dot" />
              <div>
                <label htmlFor="f-ville-tete">Ville</label>
                <ApsSelect variante="nu"
                  id="f-ville-tete"
                  value={villeId}
                  onChange={(e) => setVilleId(e.target.value)}
                  disabled={!paysId}
                  title={!paysId ? "Choisissez d'abord un pays dans les filtres" : undefined}
                >
                  <option value="">{paysId ? "Toutes les villes" : "Choisissez un pays"}</option>
                  {villesListe.map((v) => (
                    <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>
                  ))}
                </ApsSelect>
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-lg-aps">
              <i className="fa-solid fa-magnifying-glass" /> Rechercher
            </button>
          </form>
        </div>
      </div>

      {/* ============================ FILTRES + RÉSULTATS ============================ */}
      <section className="annuaire26-corps">
        <div className="container-aps">
            <div className="aps-card annuaire26-filtres is-horizontal">
              <div className="d-flex justify-content-between align-items-center">
                <h2 className="aps-h4" style={{ fontSize: "1.07rem" }}>Filtres</h2>
                {nbFiltresActifs > 0 && (
                  <button type="button" className="aps-reset" onClick={reinitialiserFiltres}>
                    <i className="fa-solid fa-rotate-left" /> Réinitialiser
                  </button>
                )}
              </div>
              <div className="annuaire26-filtre">
                <label className="form-label-aps" htmlFor="f-pays">Pays</label>
                <ApsSelect id="f-pays" value={paysId} onChange={(e) => { setPaysId(e.target.value); setVilleId(""); }}>
                  <option value="">Tous les pays</option>
                  {paysListe.map((p) => (
                    <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>
                  ))}
                </ApsSelect>
              </div>

              <div className="annuaire26-sep" />
              <div className="d-flex justify-content-between align-items-center gap-2">
                <label htmlFor="f-garde" className="annuaire26-switch-lib">
                  <b>De garde uniquement</b>
                  <span className="aps-t-xs">Ouvertes en ce moment</span>
                </label>
                <div className="form-check form-switch m-0">
                  <input className="form-check-input" type="checkbox" role="switch" id="f-garde"
                    checked={gardeOnly} onChange={(e) => setGardeOnly(e.target.checked)} />
                </div>
              </div>
              <div className="d-flex justify-content-between align-items-center gap-2 mt-3">
                <label htmlFor="f-autour" className="annuaire26-switch-lib">
                  <b>Autour de moi</b>
                  <span className="aps-t-xs">Selon votre position</span>
                </label>
                <div className="form-check form-switch m-0">
                  <input className="form-check-input" type="checkbox" role="switch" id="f-autour"
                    checked={autourDeMoi} onChange={(e) => handleToggleAutourDeMoi(e.target.checked)} />
                </div>
              </div>
              {autourDeMoi && (
                <div className="annuaire26-filtre">
                  <span className="form-label-aps">Rayon de recherche</span>
                  <div className="d-flex flex-wrap gap-2">
                    {RAYONS_KM.map((km) => (
                      <button type="button" key={km}
                        className={`aps-chip is-sm ${rayonKm === km ? "is-on" : ""}`}
                        onClick={() => setRayonKm(km)}>
                        {km} km
                      </button>
                    ))}
                  </div>
                  {geoEnCours && <p className="minimal-note mt-2">Localisation en cours…</p>}
                  {geoErreur && (
                    <p className="minimal-note mt-2">
                      <i className="fa-solid fa-triangle-exclamation" /> {geoErreur}
                    </p>
                  )}
                </div>
              )}
            </div>

          <div className="annuaire26-grille">
          <div className="annuaire26-resultats">
            <div className="annuaire26-barre">
              <div className="d-flex flex-wrap gap-2">
                {gardeOnly && (
                  <button type="button" className="aps-chip is-sm is-active-filter" onClick={() => setGardeOnly(false)}>
                    De garde <i className="fa-solid fa-xmark" />
                  </button>
                )}
                {nomVille && (
                  <button type="button" className="aps-chip is-sm is-active-filter" onClick={() => setVilleId("")}>
                    {nomVille} <i className="fa-solid fa-xmark" />
                  </button>
                )}
                {recherche && (
                  <button type="button" className="aps-chip is-sm is-active-filter"
                    onClick={() => { setRecherche(""); setRechercheSaisie(""); }}>
                    « {recherche} » <i className="fa-solid fa-xmark" />
                  </button>
                )}
                {autourDeMoi && (
                  <button type="button" className="aps-chip is-sm is-active-filter" onClick={() => setAutourDeMoi(false)}>
                    ≤ {rayonKm} km <i className="fa-solid fa-xmark" />
                  </button>
                )}
              </div>
              <div className="ms-auto">
                <button type="button" className="btn btn-primary btn-sm-aps" onClick={() => navigate("/pharmacie/creation")}>
                  <i className="fa-solid fa-plus" /> Déclarer une pharmacie
                </button>
              </div>
            </div>

            {chargement && <div className="info-card annuaire26-etat">Chargement des pharmacies…</div>}

            {!chargement && erreurChargement && (
              <div className="info-card annuaire26-etat" style={{ color: "var(--danger)" }}>{erreurChargement}</div>
            )}

            {!chargement && !erreurChargement && listeAffichee.length === 0 && (
              <div className="info-card annuaire26-etat">Aucune pharmacie ne correspond à ces critères.</div>
            )}

            {!chargement && !erreurChargement && listeAffichee.length > 0 && (
              <div className="annuaire26-cartes is-larges">
                {listeAffichee.map((p) => (
                  <PharmacyCard
                    key={p.pharmacie_id}
                    pharmacy={p}
                    enGarde={gardePharmacieIds.has(p.pharmacie_id)}
                    positionActuelle={positionActuelle}
                    demanderPosition={demanderPosition}
                  />
                ))}
              </div>
            )}
          </div>
          <aside className="annuaire26-pubs" aria-label="Publicités">
            <div className="ad-col">
              <SliderPublicite code={PAGES_PUBLICITE.pharmacie} />
            </div>
          </aside>
          </div>
        </div>
      </section>
    </>
  );
}
