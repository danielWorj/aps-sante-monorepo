import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ApsSelect from "../components/ui/ApsSelect";
import structure1 from "../assets/img/structure1.jpg";
import SliderPublicite from '../components/publicite/SliderPublicite';
import { PAGES_PUBLICITE } from '../services/publiciteService';
import "./../assets/styles/StructureSante.css";
import "./../assets/styles/annuaire-2026.css";
// Services réels — voir src/services/structureSanteService.js (annuaire
// "structure_sante" : cliniques, hôpitaux, centres médicaux,
// dispensaires, laboratoires) et src/services/geoService.js
// (référentiels Pays / Ville, partagés par tous les modules annuaire).
import {
  TYPES_STRUCTURE,
  STATUTS_VERIFICATION_STRUCTURE,
  listerCentresSante,
} from "../services/structureSanteService";
import { listerPays, listerVilles } from "../services/geoService";
import { useGeolocation } from "../hooks/useGeolocation";

// Page "Structures de santé" — annuaire des hôpitaux, cliniques et
// centres de santé, avec leurs services et l'itinéraire.
// Grille de cartes photo : 2 ou 3 colonnes selon la largeur.
const RESULTATS_PAR_PAGE = 6;

// Rayons proposés pour le filtre "Autour de moi" (voir
// server/src/lib/geo.js : rayon par défaut 10 km si non précisé).
const RAYONS_KM = [5, 10, 25, 50];

// Photo par défaut si le centre n'a pas (encore) d'image_url exploitable.
const PHOTO_PAR_DEFAUT = structure1;

// Habillage visuel (icône + couleur du badge) par type_structure — ces
// infos ne viennent pas du serveur (TYPES_STRUCTURE ne fournit que
// valeur/libelle), on les mappe donc localement.
const TYPE_META = {
  clinique: { cls: "is-clinique", icon: "fa-hospital" },
  hopital: { cls: "is-general", icon: "fa-hospital" },
  centre_medical: { cls: "is-centre", icon: "fa-house-medical" },
  dispensaire: { cls: "is-district", icon: "fa-briefcase-medical" },
  laboratoire: { cls: "is-chu", icon: "fa-flask" },
};

// Libellé lisible pour une valeur de TYPES_STRUCTURE (fallback : la
// valeur brute, au cas où le serveur renverrait un type inconnu du front).
function libelleType(valeur) {
  return TYPES_STRUCTURE.find((t) => t.valeur === valeur)?.libelle || valeur;
}

/* =====================================================================
   Carte résultat de l'annuaire
===================================================================== */
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

function StructureCard({ structure, positionActuelle, demanderPosition }) {
  const meta = TYPE_META[structure.type_structure] || { cls: "is-centre", icon: "fa-hospital" };
  const ville = structure.ville?.nom;
  const pays = structure.pays?.nom;
  const structureId = structure.structure_id;

  // Coordonnées renvoyées par le backend sous structure.geolocalisation
  // (voir centreSante.controller.js — avecGeolocalisation), pas à plat.
  const destLat = structure.geolocalisation?.latitude;
  const destLng = structure.geolocalisation?.longitude;
  const hrefItineraire = lienItineraire(destLat, destLng, positionActuelle);
  const lieu = [
    [ville, pays].filter(Boolean).join(", "),
    typeof structure.distance_km === "number" ? `${structure.distance_km.toFixed(1)} km` : null,
  ].filter(Boolean).join(" · ");

  return (
    <article className="aps-dc is-wide">
      <img src={structure.image_url || PHOTO_PAR_DEFAUT} alt="" loading="lazy" />
      {/* Zone cliquable : ouvre la fiche détaillée (route /structure-sante/:id). */}
      {structureId != null && (
        <Link to={`/structure-sante/${structureId}`} className="aps-dc-lien" aria-label={`Voir la fiche de ${structure.nom}`} />
      )}
      <div className="aps-dc-top">
        <span className="aps-pill is-white">
          <i className={`fa-solid ${meta.icon}`} style={{ color: "var(--primary)" }} /> {libelleType(structure.type_structure)}
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
            <div className="aps-dc-nm text-truncate">
              {structure.nom}
              {structure.statut_verification === "publie" && (
                <i className="fa-solid fa-circle-check verif" title="Structure vérifiée" />
              )}
            </div>
            <div className="aps-dc-sp text-truncate">{lieu || "Localisation non renseignée"}</div>
          </div>
          {structure.telephone ? (
            <a href={`tel:${structure.telephone}`} className="aps-dc-go" title="Appeler" aria-label={`Appeler ${structure.nom}`}>
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

/* =====================================================================
   Page principale
===================================================================== */
export default function StructureSante() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [structures, setStructures] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [pays, setPays] = useState([]);
  const [villesFiltre, setVillesFiltre] = useState([]);
  const [filtres, setFiltres] = useState({
    pays_id: "",
    ville_id: "",
    type_structure: "",
    recherche: "",
  });

  // Filtre "Autour de moi" — API navigateur native (voir
  // src/hooks/useGeolocation.js), aucune librairie carto. Refus de
  // permission / navigateur non compatible : on retombe silencieusement
  // sur les filtres pays/ville/type existants (aucun lat/lng envoyé),
  // avec un message discret affiché sous le sélecteur de rayon.
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

  /* Référentiels (pays) au montage — route publique. */
  useEffect(() => {
    listerPays()
      .then((donnees) => setPays(donnees.pays || []))
      .catch(() => setPays([]));
  }, []);

  /* Villes du filtre — dépendantes du pays sélectionné. */
  useEffect(() => {
    if (!filtres.pays_id) {
      setVillesFiltre([]);
      return;
    }
    listerVilles(filtres.pays_id)
      .then((donnees) => setVillesFiltre(donnees.villes || []))
      .catch(() => setVillesFiltre([]));
  }, [filtres.pays_id]);

  /* Chargement des structures — relancé à chaque changement de filtre,
     y compris "Autour de moi" et sa position (une fois obtenue) /
     son rayon. Le tri par distance renvoyé par le serveur n'est
     jamais recalculé côté front. */
  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    const filtresProximite =
      autourDeMoi && positionActuelle
        ? { lat: positionActuelle.latitude, lng: positionActuelle.longitude, rayon_km: rayonKm }
        : {};
    listerCentresSante({ ...filtres, ...filtresProximite })
      .then((donnees) => {
        if (!annule) {
          setStructures(donnees || []);
          setPage(1);
        }
      })
      .catch((err) => {
        if (!annule) setErreur(err.message || "Impossible de charger l'annuaire des structures de santé.");
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, [filtres, autourDeMoi, positionActuelle, rayonKm]);

  function soumettreFiltres(e) {
    e.preventDefault();
    // La recherche se relance automatiquement via le useEffect ci-dessus.
  }

  const totalPages = Math.max(1, Math.ceil(structures.length / RESULTATS_PAR_PAGE));
  const structuresPage = useMemo(
    () => structures.slice((page - 1) * RESULTATS_PAR_PAGE, page * RESULTATS_PAR_PAGE),
    [structures, page]
  );

  const nomType = TYPES_STRUCTURE.find((t) => t.valeur === filtres.type_structure)?.libelle;
  const nomVille = villesFiltre.find((v) => String(v.ville_id) === String(filtres.ville_id))?.nom;
  const nbFiltresActifs = [filtres.pays_id, filtres.type_structure, filtres.recherche, autourDeMoi].filter(Boolean).length;

  function reinitialiserFiltres() {
    setFiltres({ pays_id: "", ville_id: "", type_structure: "", recherche: "" });
    setAutourDeMoi(false);
  }

  return (
    <>
      {/* ============================ EN-TÊTE + RECHERCHE ============================ */}
      <div className="annuaire26-tete">
        <div className="container-aps">
          <div className="aps-t-xs">
            <Link to="/home" className="annuaire26-fil">Accueil</Link> / Structures de santé
          </div>
          <div className="annuaire26-titre">
            <h1 className="aps-h3">{nomType || "Structures de santé"}{nomVille ? ` à ${nomVille}` : ""}</h1>
            {!chargement && !erreur && (
              <span className="aps-t-s">
                <b style={{ color: "var(--primary-hover)" }}>{structures.length}</b>{" "}
                {structures.length > 1 ? "structures trouvées" : "structure trouvée"}
              </span>
            )}
          </div>
          <form className="aps-sbar annuaire26-sbar" onSubmit={soumettreFiltres}>
            <div className="aps-sbar-f">
              <i className="fa-solid fa-hospital" />
              <div>
                <label htmlFor="f-type">Type de structure</label>
                <ApsSelect variante="nu"
                  id="f-type"
                  value={filtres.type_structure}
                  onChange={(e) => setFiltres((f) => ({ ...f, type_structure: e.target.value }))}
                >
                  <option value="">Tous les types</option>
                  {TYPES_STRUCTURE.map((t) => (
                    <option key={t.valeur} value={t.valeur}>{t.libelle}</option>
                  ))}
                </ApsSelect>
              </div>
            </div>
            <div className="aps-sbar-f">
              <i className="fa-solid fa-magnifying-glass" />
              <div>
                <label htmlFor="f-recherche">Nom de la structure</label>
                <input
                  type="text"
                  id="f-recherche"
                  placeholder="Ex. Hôpital Général"
                  value={filtres.recherche}
                  onChange={(e) => setFiltres((f) => ({ ...f, recherche: e.target.value }))}
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
                <ApsSelect
                  id="f-pays"
                  value={filtres.pays_id}
                  onChange={(e) => setFiltres((f) => ({ ...f, pays_id: e.target.value, ville_id: "" }))}
                >
                  <option value="">Tous les pays</option>
                  {pays.map((p) => (
                    <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>
                  ))}
                </ApsSelect>
              </div>
              <div className="annuaire26-filtre">
                <label className="form-label-aps" htmlFor="f-ville">Ville</label>
                <ApsSelect
                  id="f-ville"
                  value={filtres.ville_id}
                  onChange={(e) => setFiltres((f) => ({ ...f, ville_id: e.target.value }))}
                  disabled={!filtres.pays_id}
                >
                  <option value="">Toutes les villes</option>
                  {villesFiltre.map((v) => (
                    <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>
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
            </div>

          <div className="annuaire26-grille">
          <div className="annuaire26-resultats">
            <div className="annuaire26-barre">
              <div className="d-flex flex-wrap gap-2">
                {nomType && (
                  <button type="button" className="aps-chip is-sm is-active-filter"
                    onClick={() => setFiltres((f) => ({ ...f, type_structure: "" }))}>
                    {nomType} <i className="fa-solid fa-xmark" />
                  </button>
                )}
                {nomVille && (
                  <button type="button" className="aps-chip is-sm is-active-filter"
                    onClick={() => setFiltres((f) => ({ ...f, ville_id: "" }))}>
                    {nomVille} <i className="fa-solid fa-xmark" />
                  </button>
                )}
                {filtres.recherche && (
                  <button type="button" className="aps-chip is-sm is-active-filter"
                    onClick={() => setFiltres((f) => ({ ...f, recherche: "" }))}>
                    « {filtres.recherche} » <i className="fa-solid fa-xmark" />
                  </button>
                )}
                {autourDeMoi && (
                  <button type="button" className="aps-chip is-sm is-active-filter" onClick={() => setAutourDeMoi(false)}>
                    ≤ {rayonKm} km <i className="fa-solid fa-xmark" />
                  </button>
                )}
              </div>
              <div className="ms-auto">
                <button type="button" className="btn btn-primary btn-sm-aps" onClick={() => navigate("/structure-sante/creation")}>
                  <i className="fa-solid fa-plus" /> Ajouter une structure
                </button>
              </div>
            </div>

            {chargement && <div className="info-card annuaire26-etat">Chargement de l&apos;annuaire…</div>}
            {!chargement && erreur && (
              <div className="info-card annuaire26-etat" style={{ color: "var(--danger)" }}>{erreur}</div>
            )}
            {!chargement && !erreur && structures.length === 0 && (
              <div className="info-card annuaire26-etat">Aucune structure ne correspond à ces critères.</div>
            )}
            {!chargement && !erreur && structures.length > 0 && (
              <>
                <div className="annuaire26-cartes is-larges">
                  {structuresPage.map((s) => (
                    <StructureCard
                      key={s.structure_id}
                      structure={s}
                      positionActuelle={positionActuelle}
                      demanderPosition={demanderPosition}
                    />
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="annuaire26-pagination">
                    <span className="aps-t-xs">
                      Affichage de {(page - 1) * RESULTATS_PAR_PAGE + 1} à {Math.min(page * RESULTATS_PAR_PAGE, structures.length)} sur {structures.length}
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
            <div className="ad-col">
              <SliderPublicite code={PAGES_PUBLICITE.structure} />
            </div>
          </aside>
          </div>
        </div>
      </section>
    </>
  );
}
