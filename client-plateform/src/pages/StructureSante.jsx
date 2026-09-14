import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import structure1 from "../assets/img/structure1.jpg";
import pub6 from "../assets/img/ads/pub6.jpg";
import "./../assets/styles/StructureSante.css";
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
const RESULTATS_PAR_PAGE = 10;

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
function StructureCard({ structure }) {
  const navigate = useNavigate();
  const meta = TYPE_META[structure.type_structure] || { cls: "is-centre", icon: "fa-hospital" };
  const ville = structure.ville?.nom;
  const pays = structure.pays?.nom;
  const structureId = structure.structure_id;

  // Ouvre la fiche détaillée de la structure (route /structure-sante/:id).
  function ouvrirFiche() {
    if (structureId != null) navigate(`/structure-sante/${structureId}`);
  }

  return (
    <div
      className="structure-card"
      role="button"
      tabIndex={0}
      style={{ cursor: "pointer" }}
      onClick={ouvrirFiche}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          ouvrirFiche();
        }
      }}
    >
      <div className="structure-photo">
        <img src={structure.image_url || PHOTO_PAR_DEFAUT} alt={structure.nom} />
      </div>
      <div>
        <div className="structure-card-top">
          <span className={`structure-type ${meta.cls}`}>
            <i className={`fa-solid ${meta.icon}`} /> {libelleType(structure.type_structure)}
          </span>
          {structure.statut_verification === "publie" && (
            <span className="chip chip-verifie">
              <i className="fa-solid fa-circle" /> Structure vérifiée
            </span>
          )}
        </div>
        <h3>{structure.nom}</h3>
        <div className="practitioner-meta">
          {(ville || pays) && (
            <span>
              <i className="fa-solid fa-location-dot" /> {[ville, pays].filter(Boolean).join(" — ")}
            </span>
          )}
          {typeof structure.distance_km === "number" && (
            <>
              <span>&middot;</span>
              <span>
                <i className="fa-solid fa-route" /> {structure.distance_km.toFixed(1)} km
              </span>
            </>
          )}
        </div>
      </div>
      {/* stopPropagation : ces boutons ont leur propre action (appel,
          itinéraire externe) et ne doivent pas déclencher l'ouverture
          de la fiche en plus. */}
      <div
        className="practitioner-actions"
        style={{ marginLeft: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {structure.telephone && (
          <a href={`tel:${structure.telephone}`} className="btn btn-urgence btn-sm-aps">
            <i className="fa-solid fa-phone" /> Appeler
          </a>
        )}
        <a
          href={
            structure.latitude && structure.longitude
              ? `https://www.google.com/maps/dir/?api=1&destination=${structure.latitude},${structure.longitude}`
              : "#"
          }
          target="_blank"
          rel="noreferrer"
          className="btn btn-outline-primary btn-sm-aps"
        >
          <i className="fa-solid fa-diamond-turn-right" /> Itinéraire
        </a>
      </div>
    </div>
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

  return (
    <>
      {/* ============================ EN-TÊTE PAGE ============================ */}
      <section style={{ padding: "2.5rem 0 0" }}>
        <div className="container-aps">
          <span className="eyebrow">Annuaire</span>
          <h1 style={{ fontSize: "1.9rem", marginTop: ".5rem" }}>
            Trouver une structure de santé
          </h1>
          <p className="mt-2" style={{ maxWidth: 620 }}>
            Hôpitaux, cliniques et centres de santé près de chez vous, avec
            leurs coordonnées, l'appel direct et l'itinéraire.
          </p>
        </div>
      </section>

      {/* ============================ FILTRES + RÉSULTATS + PUBLICITÉ ============================ */}
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
                    <label className="form-label-aps" htmlFor="f-type">Type de structure</label>
                    <select
                      className="form-select"
                      id="f-type"
                      value={filtres.type_structure}
                      onChange={(e) => setFiltres((f) => ({ ...f, type_structure: e.target.value }))}
                    >
                      <option value="">Tous les types</option>
                      {TYPES_STRUCTURE.map((t) => (
                        <option key={t.valeur} value={t.valeur}>{t.libelle}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-pays">Pays</label>
                    <select
                      className="form-select"
                      id="f-pays"
                      value={filtres.pays_id}
                      onChange={(e) => setFiltres((f) => ({ ...f, pays_id: e.target.value, ville_id: "" }))}
                    >
                      <option value="">Tous les pays</option>
                      {pays.map((p) => (
                        <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-ville">Ville</label>
                    <select
                      className="form-select"
                      id="f-ville"
                      value={filtres.ville_id}
                      onChange={(e) => setFiltres((f) => ({ ...f, ville_id: e.target.value }))}
                      disabled={!filtres.pays_id}
                    >
                      <option value="">Toutes les villes</option>
                      {villesFiltre.map((v) => (
                        <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-recherche">Nom de la structure</label>
                    {/* form-control : input texte SANS chevron */}
                    <input
                      type="text"
                      className="form-control"
                      id="f-recherche"
                      placeholder="Ex. Hôpital Général"
                      value={filtres.recherche}
                      onChange={(e) => setFiltres((f) => ({ ...f, recherche: e.target.value }))}
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
            <div className="col-md-6">
              <div className="d-flex justify-content-end mb-3">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate("/structure-sante/creation")}
                >
                  <i className="fa-solid fa-hospital" /> Ajouter une structure
                </button>
              </div>
              <div className="results-toolbar" style={{ marginTop: 0 }}>
                <span className="text-muted-soft" style={{ fontSize: ".9rem" }}>
                  <strong style={{ color: "var(--ink)" }}>{structures.length}</strong>{" "}
                  structures trouvées
                </span>
              </div>
              {chargement && (
                <div className="info-card" style={{ padding: "2rem", textAlign: "center" }}>
                  Chargement de l&apos;annuaire...
                </div>
              )}
              {!chargement && erreur && (
                <div className="info-card" style={{ padding: "2rem", textAlign: "center", color: "var(--danger, #c0392b)" }}>
                  {erreur}
                </div>
              )}
              {!chargement && !erreur && structures.length === 0 && (
                <div className="info-card" style={{ padding: "2rem", textAlign: "center" }}>
                  Aucune structure ne correspond à ces critères.
                </div>
              )}
              {!chargement && !erreur && structures.length > 0 && (
                <div>
                  {structuresPage.map((s) => (
                    <StructureCard key={s.structure_id} structure={s} />
                  ))}
                  {totalPages > 1 && (
                    <nav aria-label="Pagination des résultats" className="mt-4">
                      <ul className="pagination justify-content-center">
                        <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
                          <button type="button" className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                            Précédent
                          </button>
                        </li>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                          <li className={`page-item ${page === n ? "active" : ""}`} key={n}>
                            <button type="button" className="page-link" onClick={() => setPage(n)}>
                              {n}
                            </button>
                          </li>
                        ))}
                        <li className={`page-item ${page === totalPages ? "disabled" : ""}`}>
                          <button
                            type="button"
                            className="page-link"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          >
                            Suivant
                          </button>
                        </li>
                      </ul>
                    </nav>
                  )}
                </div>
              )}
            </div>

            {/* Colonne publicité */}
            <div className="col-md-3">
              <div className="ad-col">
                <div className="ad-card">
                  <div className="ad-label">
                    <span>Publicité</span>
                    <i className="fa-solid fa-circle-info" title="Emplacement commercial APS" />
                  </div>
                  <a href="#" aria-label="Tourisme Médical — Soignez-vous, voyagez, revivez">
                    <img src={pub6} alt="Tourisme Médical — Soignez-vous, voyagez, revivez" />
                  </a>
                  <div className="ad-card-body">
                    <h4>Tourisme Médical</h4>
                    <p>
                      Accédez à des soins de qualité à l'étranger : voyage,
                      hébergement et suivi post-soins inclus, jusqu'à -50%
                      moins cher qu'en Europe.
                    </p>
                    <a href="#" className="btn btn-outline-primary btn-sm-aps btn-block-aps">
                      <i className="fa-solid fa-plane" /> En savoir plus
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