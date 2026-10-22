// Page "Assurances" — annuaire des compagnies d'assurance et courtiers santé.
// Dynamisée : les fiches proviennent de GET /api/services-assurance.

import { useEffect, useMemo, useState } from "react";
import { usePays, usePaysFiltre } from "../context/PaysContext";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import ApsSelect from "../components/ui/ApsSelect";
import SliderPublicite from '../components/publicite/SliderPublicite';
import { PAGES_PUBLICITE } from '../services/publiciteService';
import "../assets/styles/annuaire-2026.css";
import { listerServicesAssurance } from "../services/assuranceService";
import { useGeolocation } from "../hooks/useGeolocation";

// Rayons proposés pour le filtre "Autour de moi" (voir
// server/src/lib/geo.js : rayon par défaut 10 km si non précisé).
const RAYONS_KM = [5, 10, 25, 50];

// Pagination côté client — même valeur que Medecin.jsx / StructureSante.jsx
// pour rester cohérent entre les annuaires de la plateforme.
const RESULTATS_PAR_PAGE = 6;

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
  const lieu = [
    [insurer.ville?.nom, insurer.pays?.nom].filter(Boolean).join(", "),
    typeof insurer.distance_km === "number" ? `${insurer.distance_km.toFixed(1)} km` : null,
  ].filter(Boolean).join(" · ");

  return (
    <article className="aps-dc is-wide">
      {insurer.image_url ? (
        <img src={insurer.image_url} alt="" loading="lazy" />
      ) : (
        <div className="aps-dc-ph"><i className="fa-solid fa-building-shield" /></div>
      )}
      <Link to={ficheUrl} className="aps-dc-lien" aria-label={`Voir la fiche de ${insurer.nom}`} />
      <div className="aps-dc-top">
        <span className="aps-pill is-white">
          <i className="fa-solid fa-shield-heart" style={{ color: "var(--primary)" }} />{" "}
          {LABEL_TYPE_ACTEUR[insurer.type_acteur] || insurer.type_acteur}
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
              // Si on n'a pas encore la position de l'utilisateur, on
              // la demande pour les prochains clics (celui-ci s'ouvre
              // sans origin — Google Maps la demandera lui-même).
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
            <div className="aps-dc-nm text-truncate">
              {insurer.nom}
              {estVerifie && <i className="fa-solid fa-circle-check verif" title="Vérifiée ApSa" />}
            </div>
            <div className="aps-dc-sp text-truncate">
              {lieu || "Localisation non renseignée"}
              {/* Absent en présence minimale (guide abonnements v3, §2.1.4) : on
                  n'affiche que ce que l'API renvoie. */}
              {insurer.droits?.siege_complet && insurer.agrement ? ` · Agrément ${insurer.agrement}` : ""}
            </div>
          </div>
          <span className="aps-dc-go"><i className="fa-solid fa-arrow-right" /></span>
        </div>
      </div>
    </article>
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
  const [page, setPage] = useState(1);

  const [typeActeur, setTypeActeur] = useState(searchParams.get("type_acteur") || "");
  // Pays : celui de l'URL, sinon le pays détecté de l'utilisateur (PaysContext).
  const [paysId, setPaysId] = usePaysFiltre(searchParams.get("pays_id") || "");
  const { listePays } = usePays();
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
      setPage(1);
    } catch (err) {
      setErreur(err.data?.message || err.message || "Impossible de charger l'annuaire.");
    } finally {
      setChargement(false);
    }
  };

  // Au montage puis à chaque changement de pays (détecté ou choisi).
  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paysId]);

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

  // Pays : tout le référentiel (la liste chargée est déjà filtrée sur un
  // pays). Villes : dérivées des résultats déjà chargés.
  const paysOptions = useMemo(
    () => listePays.map((p) => [String(p.pays_id), p.nom]),
    [listePays]
  );

  const villeOptions = useMemo(() => {
    const map = new Map();
    services
      .filter((s) => !paysId || s.pays?.pays_id === paysId)
      .forEach((s) => s.ville && map.set(s.ville.ville_id, s.ville.nom));
    return [...map.entries()];
  }, [services, paysId]);

  const totalPages = Math.max(1, Math.ceil(services.length / RESULTATS_PAR_PAGE));
  const servicesPage = useMemo(
    () => services.slice((page - 1) * RESULTATS_PAR_PAGE, page * RESULTATS_PAR_PAGE),
    [services, page]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    charger();
  };

  function reinitialiserFiltres() {
    setTypeActeur("");
    setPaysId("");
    setVilleId("");
    setRecherche("");
    setAutourDeMoi(false);
  }
  const nbFiltresActifs = [typeActeur, paysId, recherche, autourDeMoi].filter(Boolean).length;

  return (
    <>
      {/* ============================ EN-TÊTE + RECHERCHE ============================ */}
      <div className="annuaire26-tete">
        <div className="container-aps">
          <div className="aps-t-xs">
            <Link to="/home" className="annuaire26-fil">Accueil</Link> / Assurances
          </div>
          <div className="annuaire26-titre">
            <h1 className="aps-h3">Compagnies d&apos;assurance &amp; courtiers santé</h1>
            {!chargement && !erreur && (
              <span className="aps-t-s">
                <b style={{ color: "var(--primary-hover)" }}>{services.length}</b>{" "}
                {services.length > 1 ? "acteurs référencés" : "acteur référencé"}
              </span>
            )}
          </div>
          <p className="aps-t-s mt-2 mb-0" style={{ maxWidth: 720 }}>
            ApSa ne porte aucun service professionnel d&apos;assurance : ni comparateur, ni souscription
            en ligne, ni gestion de sinistre. La mise en relation se fait directement avec l&apos;assureur.
          </p>
          <form className="aps-sbar annuaire26-sbar" onSubmit={handleSubmit}>
            <div className="aps-sbar-f">
              <i className="fa-solid fa-shield-heart" />
              <div>
                <label htmlFor="f-type">Type d&apos;acteur</label>
                <ApsSelect variante="nu" id="f-type" value={typeActeur} onChange={(e) => setTypeActeur(e.target.value)}>
                  <option value="">Compagnies et courtiers</option>
                  <option value="compagnie">Compagnie d&apos;assurance</option>
                  <option value="courtier">Courtier</option>
                </ApsSelect>
              </div>
            </div>
            <div className="aps-sbar-f">
              <i className="fa-solid fa-magnifying-glass" />
              <div>
                <label htmlFor="f-recherche">Recherche</label>
                <input
                  id="f-recherche"
                  placeholder="Nom de la compagnie…"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
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
            <form className="aps-card annuaire26-filtres is-horizontal" onSubmit={handleSubmit}>
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
                <ApsSelect
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
                </ApsSelect>
              </div>
              <div className="annuaire26-filtre">
                <label className="form-label-aps" htmlFor="f-ville">Ville</label>
                <ApsSelect id="f-ville" value={villeId} onChange={(e) => setVilleId(e.target.value)}>
                  <option value="">Toutes les villes</option>
                  {villeOptions.map(([id, nom]) => (
                    <option key={id} value={id}>{nom}</option>
                  ))}
                </ApsSelect>
              </div>

              <div className="annuaire26-sep" />
              <div className="d-flex justify-content-between align-items-center gap-2">
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
              <button type="submit" className="btn btn-primary btn-sm-aps w-100 mt-3">
                Appliquer les filtres
              </button>
            </form>

          <div className="annuaire26-grille">
          <div className="annuaire26-resultats">
            <div className="annuaire26-barre">
              <div className="ms-auto">
                <button type="button" className="btn btn-primary btn-sm-aps" onClick={() => navigate("/assurances/creation")}>
                  <i className="fa-solid fa-plus" /> Déclarer une compagnie
                </button>
              </div>
            </div>
            {chargement && <div className="info-card annuaire26-etat">Chargement de l&apos;annuaire…</div>}
            {!chargement && erreur && (
              <div className="info-card annuaire26-etat" style={{ color: "var(--danger)" }}>
                <i className="fa-solid fa-triangle-exclamation" /> {erreur}
              </div>
            )}
            {!chargement && !erreur && services.length === 0 && (
              <div className="info-card annuaire26-etat">Aucune compagnie ne correspond à ces critères.</div>
            )}

            {!chargement && !erreur && services.length > 0 && (
              <>
                <div className="annuaire26-cartes is-larges">
                  {servicesPage.map((insurer) => (
                    <InsurerCard
                      key={insurer.service_assurance_id}
                      insurer={insurer}
                      positionActuelle={positionActuelle}
                      demanderPosition={demanderPosition}
                    />
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="annuaire26-pagination">
                    <span className="aps-t-xs">
                      Affichage de {(page - 1) * RESULTATS_PAR_PAGE + 1} à {Math.min(page * RESULTATS_PAR_PAGE, services.length)} sur {services.length}
                    </span>
                    <nav aria-label="Pagination des résultats">
                      <ul className="pagination mb-0">
                        <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
                          <button type="button" className="page-link" aria-label="Page précédente"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}>
                            <i className="fa-solid fa-chevron-left" />
                          </button>
                        </li>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                          <li className={`page-item ${page === n ? "active" : ""}`} key={n}>
                            <button type="button" className="page-link" onClick={() => setPage(n)}>{n}</button>
                          </li>
                        ))}
                        <li className={`page-item ${page === totalPages ? "disabled" : ""}`}>
                          <button type="button" className="page-link" aria-label="Page suivante"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                            <i className="fa-solid fa-chevron-right" />
                          </button>
                        </li>
                      </ul>
                    </nav>
                  </div>
                )}
              </>
            )}
          </div>
          <aside className="annuaire26-pubs" aria-label="Publicités">
            <div className="ad-flyer">
              <SliderPublicite code={PAGES_PUBLICITE.assurances} />
            </div>
          </aside>
          </div>
        </div>
      </section>
    </>
  );
}
