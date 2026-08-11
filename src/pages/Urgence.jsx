// src/pages/Urgence.jsx
//
// Page "Urgences" — accès à l'aide en un geste : numéros officiels,
// pharmacies de garde, ambulances et structures ouvertes à proximité.
//
// Cette version consomme le backend via urgenceServices :
//   - GET /types-urgence
//   - GET /urgences?type_urgence_id=...
//
// Les données ne sont plus codées en dur : elles proviennent de l'API.

import { useEffect, useMemo, useState } from "react";
import pub2 from "../assets/img/ads/pub2.jpg";
import urgenceServices from "./../services/urgenceService";

/* ===================================================================
   Helpers d'affichage
=================================================================== */

/**
 * Transforme un libellé en slug exploitable pour associer une icône.
 * Exemple : "Garde nocturne" => "garde-nocturne"
 */
function normaliserSlug(valeur) {
  if (valeur === null || valeur === undefined) return "";

  return String(valeur)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Icônes FontAwesome associées aux types d'urgence.
 * Si le type vient du backend avec un libelle proche, on tente de
 * faire correspondre une icône métier. Sinon, icône téléphone par défaut.
 */
const ICONES_TYPES = {
  medicale: "fa-kit-medical",
  ambulance: "fa-truck-medical",
  "garde-nocturne": "fa-moon",
  accouchement: "fa-baby",
  intoxication: "fa-skull-crossbones",
  accident: "fa-car-burst",
  pharmacie: "fa-mortar-pestle",
  "pharmacie-de-garde": "fa-mortar-pestle",
  structure: "fa-hospital",
  "structure-medicale": "fa-hospital",
  hopital: "fa-hospital",
  clinique: "fa-hospital",
  centre: "fa-hospital",
  officiel: "fa-phone-volume",
  samu: "fa-truck-medical",
  pompiers: "fa-fire-extinguisher",
  police: "fa-shield-halved",
};

function obtenirIconeType(typeUrgence) {
  const slug = normaliserSlug(typeUrgence?.libelle || "");

  return ICONES_TYPES[slug] || "fa-phone";
}

/**
 * Détermine si le type correspond à un lieu physique pour lequel
 * on peut proposer un itinéraire (pharmacie, hôpital, clinique, etc.).
 */
function estTypeLieuPhysique(typeUrgence) {
  const slug = normaliserSlug(typeUrgence?.libelle || "");

  const lieuxPossibles = [
    "pharmacie",
    "structure",
    "clinique",
    "hopital",
    "centre",
    "laboratoire",
    "dispensaire",
  ];

  return lieuxPossibles.some((motif) => slug.includes(motif));
}

/**
 * Nettoie le numéro pour le lien tel:.
 * Exemple : "+237 6 00 00 00 00" => "+237600000000"
 */
function formaterTelephonePourLien(telephone) {
  return String(telephone || "").replace(/[^+\d]/g, "");
}

/**
 * Les numéros courts officiels (119, 118, 117...) sont affichés
 * directement dans le bouton plutôt qu'avec le texte "Appeler".
 */
function estNumeroCourt(telephone) {
  const telephoneNettoye = String(telephone || "").replace(/[^+\d]/g, "");

  return !telephoneNettoye.startsWith("+") && telephoneNettoye.length <= 5;
}

/**
 * Construit la ligne descriptive d'une urgence.
 * Si le backend ne renvoie pas de description, on affiche le type
 * et le pays en secours.
 */
function obtenirMetaUrgence(urgence) {
  if (urgence?.description) {
    return urgence.description;
  }

  return [urgence?.type_urgence?.libelle, urgence?.pays?.nom]
    .filter(Boolean)
    .join(" — ");
}

/**
 * Construit une URL Google Maps pour proposer un itinéraire.
 * À terme, si vous ajoutez une adresse ou des coordonnées GPS
 * dans le backend, il faudra utiliser ces champs ici.
 */
function obtenirItineraireUrl(urgence) {
  const requete = [urgence?.libelle, urgence?.pays?.nom]
    .filter(Boolean)
    .join(", ");

  if (!requete) {
    return "#";
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    requete
  )}`;
}

/* ===================================================================
   Composant ligne d'urgence
=================================================================== */

function UrgenceRow({ name, meta, tel, callOnly, itineraryHref }) {
  const telephoneHref = `tel:${formaterTelephonePourLien(tel)}`;

  return (
    <div className="urgence-row">
      <div>
        <div className="name">{name}</div>
        {meta ? <div className="meta">{meta}</div> : null}
      </div>

      {itineraryHref ? (
        <div className="d-flex gap-2">
          <a
            href={telephoneHref}
            className="btn btn-urgence btn-sm-aps"
            aria-label={`Appeler ${name}`}
          >
            <i className="fa-solid fa-phone" />
          </a>

          <a
            href={itineraryHref}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline-primary btn-sm-aps"
          >
            Itinéraire
          </a>
        </div>
      ) : (
        <a
          href={telephoneHref}
          className="btn btn-urgence btn-sm-aps"
          aria-label={`Appeler ${name}`}
        >
          <i className="fa-solid fa-phone" /> {callOnly ? tel : "Appeler"}
        </a>
      )}
    </div>
  );
}

/* ===================================================================
   Page Urgence
=================================================================== */

export default function Urgence() {
  const [typesUrgence, setTypesUrgence] = useState([]);
  const [activeTypeId, setActiveTypeId] = useState("");
  const [urgences, setUrgences] = useState([]);

  const [chargementTypes, setChargementTypes] = useState(true);
  const [chargementUrgences, setChargementUrgences] = useState(false);

  const [erreurTypes, setErreurTypes] = useState("");
  const [erreurUrgences, setErreurUrgences] = useState("");

  const [rechargementTypes, setRechargementTypes] = useState(0);
  const [rechargementUrgences, setRechargementUrgences] = useState(0);

  const activeType = useMemo(() => {
    return typesUrgence.find(
      (type) => type.type_urgence_id === activeTypeId
    );
  }, [typesUrgence, activeTypeId]);

  /* ---------------------------------------------------------------
     Chargement des types d'urgence
  --------------------------------------------------------------- */
  useEffect(() => {
    let actif = true;

    async function chargerTypesUrgence() {
      setChargementTypes(true);
      setErreurTypes("");

      try {
        const reponse = await urgenceServices.listerTypesUrgence();
        const types = reponse?.types || [];

        if (!actif) return;

        setTypesUrgence(types);

        setActiveTypeId((ancienTypeId) => {
          if (ancienTypeId) return ancienTypeId;

          return types[0]?.type_urgence_id || "";
        });
      } catch (erreur) {
        if (!actif) return;

        setTypesUrgence([]);
        setErreurTypes(
          erreur?.data?.message ||
            erreur?.message ||
            "Impossible de charger les types d'urgence."
        );
      } finally {
        if (actif) {
          setChargementTypes(false);
        }
      }
    }

    chargerTypesUrgence();

    return () => {
      actif = false;
    };
  }, [rechargementTypes]);

  /* ---------------------------------------------------------------
     Chargement des urgences du type sélectionné
  --------------------------------------------------------------- */
  useEffect(() => {
    if (!activeTypeId) {
      setUrgences([]);
      return;
    }

    let actif = true;

    async function chargerUrgences() {
      setChargementUrgences(true);
      setErreurUrgences("");

      try {
        const reponse = await urgenceServices.listerUrgences({
          type_urgence_id: activeTypeId,
        });

        if (!actif) return;

        setUrgences(reponse?.urgences || []);
      } catch (erreur) {
        if (!actif) return;

        setUrgences([]);
        setErreurUrgences(
          erreur?.data?.message ||
            erreur?.message ||
            "Impossible de charger les numéros d'urgence."
        );
      } finally {
        if (actif) {
          setChargementUrgences(false);
        }
      }
    }

    chargerUrgences();

    return () => {
      actif = false;
    };
  }, [activeTypeId, rechargementUrgences]);

  /* ---------------------------------------------------------------
     Actions UI
  --------------------------------------------------------------- */
  function allerAuxResultats() {
    document
      .getElementById("resultats-urgences")
      ?.scrollIntoView({ behavior: "smooth" });
  }

  function selectionnerType(typeUrgence) {
    if (!typeUrgence?.type_urgence_id) return;

    setActiveTypeId(typeUrgence.type_urgence_id);
  }

  /* ---------------------------------------------------------------
     Rendu
  --------------------------------------------------------------- */
  return (
    <>
      {/* ============================ HERO SOS ============================ */}
      <section className="urgence-hero">
        <div className="container-aps" style={{ maxWidth: "920px" }}>
          <span
            className="eyebrow"
            style={{ color: "var(--urgence-dark)" }}
          >
            Accès en un geste
          </span>

          <h1 style={{ fontSize: "1.85rem", marginTop: ".4rem" }}>
            Une urgence ? Obtenez de l'aide immédiatement.
          </h1>

          <p>
            Numéros officiels, pharmacies de garde, ambulances joignables et
            structures ouvertes, affichés instantanément par proximité. Aucune
            publicité ici, en toutes circonstances.
          </p>

          <button
            type="button"
            className="big-sos"
            onClick={allerAuxResultats}
          >
            <i className="fa-solid fa-triangle-exclamation" /> J'AI BESOIN
            D'AIDE MAINTENANT
          </button>

          <label
            className="form-label-aps"
            style={{ marginTop: "1.75rem" }}
          >
            Sélectionnez le type d'urgence
          </label>

          <div className="row g-4 align-items-stretch">
            <div className="col-lg-8">
              {chargementTypes ? (
                <div className="type-grid">
                  <div className="text-center w-100 py-4">
                    <i className="fa-solid fa-spinner fa-spin me-2" />
                    Chargement des types d'urgence...
                  </div>
                </div>
              ) : erreurTypes ? (
                <div className="alert alert-danger" role="alert">
                  <p className="mb-2">{erreurTypes}</p>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() =>
                      setRechargementTypes((nombre) => nombre + 1)
                    }
                  >
                    <i className="fa-solid fa-rotate-right me-1" />
                    Réessayer
                  </button>
                </div>
              ) : typesUrgence.length === 0 ? (
                <div className="alert alert-warning" role="alert">
                  Aucun type d'urgence disponible pour le moment.
                </div>
              ) : (
                <div className="type-grid">
                  {typesUrgence.map((type) => {
                    const actif = type.type_urgence_id === activeTypeId;

                    return (
                      <div
                        key={type.type_urgence_id}
                        className={`type-card ${actif ? "active" : ""}`}
                        role="button"
                        tabIndex={0}
                        aria-pressed={actif}
                        onClick={() => selectionnerType(type)}
                        onKeyDown={(evenement) => {
                          if (
                            evenement.key === "Enter" ||
                            evenement.key === " "
                          ) {
                            evenement.preventDefault();
                            selectionnerType(type);
                          }
                        }}
                      >
                        <i
                          className={`fa-solid ${obtenirIconeType(type)}`}
                        />
                        <span>{type.libelle}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="col-lg-4 urgence-ad-col">
              <a href="#" className="ad-slot">
                <span className="ad-tag">Publicité</span>
                <img
                  src={pub2}
                  alt="Publicité — MTN, plus de data, plus d'appels"
                />
              </a>
            </div>
          </div>

          <div className="geoloc-strip">
            <i className="fa-solid fa-location-crosshairs" />
            <span>
              Localisation activée (avec votre consentement) — Douala,
              Cameroun. À l'étranger, ces services basculent automatiquement
              sur le pays où vous vous trouvez.
            </span>
          </div>
        </div>
      </section>

      {/* ============================ RESULTATS ============================ */}
      <section id="resultats-urgences">
        <div className="container-aps">
          <div className="section-head">
            <span className="eyebrow">Résultats instantanés</span>
            <h2>Services disponibles près de vous</h2>
            <p>
              Classés par type d'urgence et mis à jour depuis la base de
              données officielle.
            </p>
          </div>

          <div className="row g-4">
            <div className="col-lg-8">
              {chargementTypes && !erreurTypes ? (
                <div className="result-block">
                  <h3>
                    <i className="fa-solid fa-spinner fa-spin" /> Chargement
                    des services...
                  </h3>
                </div>
              ) : erreurTypes ? (
                <div className="result-block">
                  <h3>
                    <i className="fa-solid fa-circle-exclamation" /> Service
                    momentanément indisponible
                  </h3>
                  <p>{erreurTypes}</p>
                </div>
              ) : !activeType ? (
                <div className="result-block">
                  <h3>
                    <i className="fa-solid fa-phone-volume" /> Services
                    disponibles
                  </h3>
                  <p>
                    Sélectionnez un type d'urgence pour afficher les numéros
                    et services correspondants.
                  </p>
                </div>
              ) : (
                <div className="result-block">
                  <h3>
                    <i
                      className={`fa-solid ${obtenirIconeType(activeType)}`}
                    />{" "}
                    {activeType.libelle} — services disponibles
                  </h3>

                  {activeType.description ? (
                    <p style={{ fontSize: ".9rem" }}>
                      {activeType.description}
                    </p>
                  ) : null}

                  {chargementUrgences ? (
                    <div className="text-center py-4">
                      <i className="fa-solid fa-spinner fa-spin me-2" />
                      Chargement des numéros d'urgence...
                    </div>
                  ) : erreurUrgences ? (
                    <div className="alert alert-danger" role="alert">
                      <p className="mb-2">{erreurUrgences}</p>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        onClick={() =>
                          setRechargementUrgences((nombre) => nombre + 1)
                        }
                      >
                        <i className="fa-solid fa-rotate-right me-1" />
                        Réessayer
                      </button>
                    </div>
                  ) : urgences.length === 0 ? (
                    <div className="alert alert-warning" role="alert">
                      Aucun numéro disponible pour ce type d'urgence pour le
                      moment.
                    </div>
                  ) : (
                    urgences.map((urgence) => {
                      const itineranceDisponible =
                        estTypeLieuPhysique(activeType);

                      return (
                        <UrgenceRow
                          key={urgence.urgence_id}
                          name={urgence.libelle}
                          meta={obtenirMetaUrgence(urgence)}
                          tel={urgence.telephone}
                          callOnly={
                            estNumeroCourt(urgence.telephone) ||
                            normaliserSlug(activeType.libelle).includes(
                              "officiel"
                            )
                          }
                          itineraryHref={
                            itineranceDisponible
                              ? obtenirItineraireUrl(urgence)
                              : null
                          }
                        />
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Colonne latérale : SMS contact, mode hors-ligne, transfrontalier */}
            <div className="col-lg-4">
              <div className="info-card mb-3">
                <h3>
                  <i className="fa-solid fa-comment-sms" /> Alerter un proche
                </h3>

                <p style={{ fontSize: ".85rem" }}>
                  Envoyez votre position par SMS à un contact d'urgence
                  pré-enregistré.
                </p>

                <select className="form-select mb-2">
                  <option>
                    Contact d'urgence — Maman (+237 6XX XX XX XX)
                  </option>
                  <option>+ Ajouter un contact</option>
                </select>

                <button
                  className="btn btn-urgence btn-block-aps btn-sm-aps"
                  type="button"
                >
                  <i className="fa-solid fa-paper-plane" /> Envoyer ma
                  position
                </button>
              </div>

              <div className="offline-note mb-3">
                <i className="fa-solid fa-wifi" />
                <span>
                  <strong>Mode hors connexion.</strong> Les numéros d'urgence
                  officiels du pays restent accessibles depuis l'application
                  même sans connexion internet.
                </span>
              </div>

              <div className="offline-note">
                <i className="fa-solid fa-earth-africa" />
                <span>
                  <strong>À l'étranger ?</strong> Le module bascule
                  automatiquement sur les numéros et services officiels du
                  pays où vous vous trouvez.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}