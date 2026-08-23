import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  obtenirServiceAssurance,
  listerActivites,
  listerAgences,
  creerMiseEnRelation,
} from "../services/assuranceService";
import { getAccessToken } from "../lib/apiClient";

// Fiche assurance — page de détail d'une compagnie d'assurance ou d'un
// courtier, avec ses activités (catalogue produits), ses agences et
// son formulaire de mise en relation. Contenu entièrement dynamisé
// depuis l'API (GET /services-assurance/:id, /activites, /agences).

const LABEL_TYPE_ACTEUR = {
  compagnie: "Compagnie d'assurance",
  courtier: "Courtier",
};

/* Distance à vol d'oiseau (formule de Haversine), en kilomètres. */
function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function Tabs({ active, onChange, tabs }) {
  return (
    <div className="aps-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={active === tab.id ? "active" : ""}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ============================ VOLET 1 — SIÈGE ============================ */
function SiegePanel({ insurer }) {
  return (
    <div className="tab-panel active">
      <div className="info-card">
        <h3>
          <i className="fa-solid fa-building-shield" /> Informations générales
        </h3>
        <table className="hours-table" style={{ width: "100%", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "220px" }} />
            <col />
          </colgroup>
          <tbody>
            <tr>
              <td>Dénomination</td>
              <td>{insurer.nom}</td>
            </tr>
            <tr>
              <td>Type d'acteur</td>
              <td>{LABEL_TYPE_ACTEUR[insurer.type_acteur] || insurer.type_acteur}</td>
            </tr>
            <tr>
              <td>Agrément</td>
              <td>{insurer.agrement}</td>
            </tr>
            <tr>
              <td>Localisation</td>
              <td>{insurer.ville?.nom}, {insurer.pays?.nom}</td>
            </tr>
            {insurer.geolocalisation && (
              <tr>
                <td>Coordonnées GPS</td>
                <td>
                  {insurer.geolocalisation.latitude?.toFixed(4)}, {insurer.geolocalisation.longitude?.toFixed(4)}
                </td>
              </tr>
            )}
            <tr>
              <td>Téléphone</td>
              <td>
                <a href={`tel:${insurer.telephone}`}>{insurer.telephone}</a>
              </td>
            </tr>
            <tr>
              <td>Courriel</td>
              <td>
                <a href={`mailto:${insurer.email}`}>{insurer.email}</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {insurer.description && (
        <div className="info-card">
          <h3>
            <i className="fa-solid fa-circle-info" /> Présentation institutionnelle
          </h3>
          <p style={{ fontSize: ".9rem" }}>{insurer.description}</p>
        </div>
      )}
    </div>
  );
}

/* ============================ VOLET 2 — ACTIVITÉS ============================ */
function ActivitesPanel({ activites, chargement }) {
  if (chargement) return <p className="minimal-note">Chargement des activités…</p>;
  if (!activites.length) {
    return <p className="minimal-note">Aucune activité renseignée pour cette fiche.</p>;
  }

  return (
    <div className="tab-panel active">
      <div className="info-card">
        <h3>
          <i className="fa-solid fa-file-shield" /> Activités &amp; produits
        </h3>
        {activites.map((activite) => (
          <div key={activite.activite_id} className="mb-3">
            <strong style={{ fontSize: ".92rem" }}>{activite.titre}</strong>
            <div className="practitioner-meta mt-1 mb-2">
              <span>Public cible : {activite.public_cible}</span>
            </div>
            {activite.description && (
              <p style={{ fontSize: ".86rem" }}>{activite.description}</p>
            )}
            <div className="d-flex gap-2 flex-wrap">
              {(activite.options || []).map((option) => (
                <span key={option.option_activite_id} className="chip chip-complet">
                  {option.libelle}
                </span>
              ))}
            </div>
          </div>
        ))}
        <p className="minimal-note mb-0">
          <i className="fa-solid fa-circle-info" /> Informations présentées à titre
          informatif uniquement. Aucune comparaison de produits, aucune souscription
          en ligne sur APS.
        </p>
      </div>
    </div>
  );
}

/* ============================ VOLET 3 — AGENCES ============================ */
function AgencesPanel({ agences, chargement }) {
  const [recherche, setRecherche] = useState("");
  const [userPos, setUserPos] = useState(null);
  const [geoStatus, setGeoStatus] = useState("idle"); // idle | loading | error

  const agencesFiltrees = useMemo(() => {
    let list = agences.filter((a) =>
      !recherche || a.localisation?.toLowerCase().includes(recherche.toLowerCase())
    );
    if (userPos) {
      list = list
        .map((a) =>
          a.gps
            ? { ...a, distance: distanceKm(userPos, { lat: a.gps.latitude, lng: a.gps.longitude }) }
            : a
        )
        .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    }
    return list;
  }, [agences, recherche, userPos]);

  const localiser = () => {
    if (!navigator.geolocation) {
      setGeoStatus("error");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus("idle");
      },
      () => setGeoStatus("error")
    );
  };

  if (chargement) return <p className="minimal-note">Chargement des agences…</p>;

  return (
    <div className="tab-panel active">
      <div className="info-card">
        <h3>
          <i className="fa-solid fa-sliders" /> Rechercher une agence
        </h3>
        <label className="form-label-aps" htmlFor="ag-recherche">
          Localisation
        </label>
        <input
          id="ag-recherche"
          className="form-control"
          placeholder="Ville, quartier…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-outline-primary btn-sm-aps mt-3"
          onClick={localiser}
        >
          <i className="fa-solid fa-location-crosshairs" />{" "}
          {geoStatus === "loading" ? "Localisation en cours…" : "Agences les plus proches de moi"}
        </button>
        {geoStatus === "error" && (
          <p className="minimal-note mt-2 mb-0">
            <i className="fa-solid fa-triangle-exclamation" /> Localisation
            indisponible ou refusée.
          </p>
        )}
      </div>

      {agencesFiltrees.map((agence) => (
        <div key={agence.agence_id} className="insurer-card">
          <div className="insurer-head">
            <div className="d-flex gap-3">
              <div className="insurer-logo">
                <i className="fa-solid fa-shop" />
              </div>
              <div>
                <h3 style={{ marginBottom: ".3rem" }}>{agence.libelle}</h3>
                <div className="practitioner-meta">
                  <span>
                    <i className="fa-solid fa-location-dot" /> {agence.localisation}
                  </span>
                  {"distance" in agence && (
                    <>
                      <span>&middot;</span>
                      <span>{agence.distance.toFixed(1)} km</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="practitioner-actions" style={{ marginLeft: 0 }}>
              <a href={`tel:${agence.contact}`} className="btn btn-outline-primary btn-sm-aps">
                <i className="fa-solid fa-phone" />
              </a>
            </div>
          </div>
        </div>
      ))}

      {agencesFiltrees.length === 0 && (
        <p className="minimal-note">Aucune agence pour ces critères.</p>
      )}
    </div>
  );
}

/* ============================ MISE EN RELATION ============================ */
function ContactSidebar({ insurer }) {
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const connecte = !!getAccessToken();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setEnvoi(true);
    setErreur("");
    try {
      await creerMiseEnRelation({
        service_assurance_id: insurer.service_assurance_id,
        message: message.trim(),
      });
      setEnvoye(true);
    } catch (err) {
      setErreur(err.data?.message || err.message || "Échec de l'envoi. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  };

  if (envoye) {
    return (
      <div className="info-card">
        <h3>
          <i className="fa-solid fa-circle-check" /> Demande envoyée
        </h3>
        <p className="minimal-note mt-2 mb-0">
          <i className="fa-solid fa-circle-info" /> Votre message a été transmis au
          siège de {insurer.nom}. Vous recevrez une réponse directement de leur part —
          APS n'intervient pas dans le traitement de la demande.
        </p>
      </div>
    );
  }

  if (!connecte) {
    return (
      <div className="info-card">
        <h3>
          <i className="fa-solid fa-envelope" /> Mise en relation
        </h3>
        <p className="minimal-note mb-0">
          <i className="fa-solid fa-circle-info" /> Connectez-vous pour contacter
          directement {insurer.nom}.
        </p>
      </div>
    );
  }

  return (
    <div className="info-card">
      <h3>
        <i className="fa-solid fa-envelope" /> Mise en relation
      </h3>
      {erreur && (
        <p className="minimal-note mb-2" style={{ color: "var(--danger, #c0392b)" }}>
          <i className="fa-solid fa-triangle-exclamation" /> {erreur}
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <div className="mb-2">
          <label className="form-label-aps" htmlFor="ct-message">
            Votre message
          </label>
          <textarea
            id="ct-message"
            className="form-control"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary btn-block-aps" disabled={envoi}>
          <i className="fa-solid fa-paper-plane" /> {envoi ? "Envoi…" : "Envoyer la demande"}
        </button>
      </form>
      <p className="minimal-note mt-2 mb-0">
        <i className="fa-solid fa-circle-info" /> La demande est adressée directement
        au siège de {insurer.nom}. Aucune souscription n'est effectuée sur APS.
      </p>
    </div>
  );
}

/* ============================ NON TROUVÉ ============================ */
function FicheIntrouvable() {
  return (
    <section style={{ padding: "3rem 0" }}>
      <div className="container-aps" style={{ maxWidth: "560px", textAlign: "center" }}>
        <i className="fa-solid fa-circle-exclamation" style={{ fontSize: "1.8rem", color: "var(--ink-faint)" }} />
        <h1 style={{ fontSize: "1.4rem", marginTop: "1rem" }}>Fiche introuvable</h1>
        <p className="mt-2">
          Cette compagnie d'assurance ou ce courtier n'existe pas ou n'est plus
          référencé dans l'annuaire.
        </p>
        <Link to="/assurances" className="btn btn-primary btn-sm-aps mt-2">
          Retour à l'annuaire
        </Link>
      </div>
    </section>
  );
}

/* ============================ COMPOSANT PRINCIPAL ============================ */
export default function FicheAssurance() {
  const { id } = useParams();

  const [insurer, setInsurer] = useState(null);
  const [activites, setActivites] = useState([]);
  const [agences, setAgences] = useState([]);
  const [chargementFiche, setChargementFiche] = useState(true);
  const [chargementActivites, setChargementActivites] = useState(true);
  const [chargementAgences, setChargementAgences] = useState(true);
  const [introuvable, setIntrouvable] = useState(false);
  const [activeTab, setActiveTab] = useState("siege");

  useEffect(() => {
    let annule = false;
    setChargementFiche(true);
    setIntrouvable(false);

    obtenirServiceAssurance(id)
      .then((data) => {
        if (!annule) setInsurer(data.service_assurance);
      })
      .catch((err) => {
        if (!annule && err.status === 404) setIntrouvable(true);
      })
      .finally(() => {
        if (!annule) setChargementFiche(false);
      });

    setChargementActivites(true);
    listerActivites(id)
      .then((data) => {
        if (!annule) setActivites(data.activites || []);
      })
      .finally(() => {
        if (!annule) setChargementActivites(false);
      });

    setChargementAgences(true);
    listerAgences(id)
      .then((data) => {
        if (!annule) setAgences(data.agences || []);
      })
      .finally(() => {
        if (!annule) setChargementAgences(false);
      });

    return () => {
      annule = true;
    };
  }, [id]);

  if (chargementFiche) {
    return (
      <div className="container-aps" style={{ padding: "3rem 0" }}>
        <p className="minimal-note">Chargement de la fiche…</p>
      </div>
    );
  }

  if (introuvable || !insurer) {
    return <FicheIntrouvable />;
  }

  const tabs = [
    { id: "siege", label: "Siège" },
    { id: "activites", label: `Activités (${activites.length})` },
    { id: "agences", label: `Agences (${agences.length})` },
  ];

  return (
    <>
      {/* ============================ FIL D'ARIANE ============================ */}
      <div className="container-aps" style={{ paddingTop: "1.1rem", fontSize: ".82rem" }}>
        <Link to="/" className="text-muted-soft">
          Accueil
        </Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: ".6rem" }} />
        <Link to="/assurances" className="text-muted-soft">
          Assurances
        </Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: ".6rem" }} />
        <span className="text-faint">{insurer.nom}</span>
      </div>

      {/* ============================ EN-TÊTE FICHE ============================ */}
      <section className="profile-header" style={{ paddingTop: "1.5rem" }}>
        <div className="container-aps">
          <div className="profile-header-inner">
            <div
              className="profile-avatar"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
            >
              {insurer.image_url ? (
                <img src={insurer.image_url} alt={insurer.nom} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <i className="fa-solid fa-building-shield" style={{ fontSize: "1.8rem" }} />
              )}
            </div>
            <div>
              <h1>{insurer.nom}</h1>
              <div className="practitioner-meta mb-2">
                <span>{LABEL_TYPE_ACTEUR[insurer.type_acteur] || insurer.type_acteur}</span>
                <span>&middot;</span>
                <span>
                  <i className="fa-solid fa-location-dot" /> {insurer.ville?.nom}, {insurer.pays?.nom}
                </span>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                {insurer.statut_verification === "publie" ? (
                  <span className="chip chip-verifie">
                    <i className="fa-solid fa-circle-check" /> Vérifiée APS
                  </span>
                ) : (
                  <span className="chip chip-complet">
                    <i className="fa-solid fa-hourglass-half" /> En cours de vérification
                  </span>
                )}
                <span className="chip chip-complet">Agrément {insurer.agrement}</span>
              </div>
            </div>
            <div className="profile-actions">
              <a href="#mise-en-relation" className="btn btn-primary btn-lg-aps">
                <i className="fa-solid fa-envelope" /> Mise en relation
              </a>
              <a href={`tel:${insurer.telephone}`} className="btn btn-ghost">
                <i className="fa-solid fa-phone" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ============================ BANNIÈRE INSTITUTIONNELLE ============================ */}
      <div className="container-aps" style={{ paddingTop: "1.5rem" }}>
        <div className="banner-institutionnel">
          <i className="fa-solid fa-circle-info" />
          <span>
            Présentation seulement : aucune comparaison de produits, aucune
            souscription en ligne, aucune gestion de sinistre ou de
            réclamation sur APS. La mise en relation se fait directement avec
            l'assureur.
          </span>
        </div>
      </div>

      {/* ============================ CORPS ============================ */}
      <section style={{ paddingTop: "1.5rem" }}>
        <div className="container-aps">
          <div className="row g-4">
            {/* Colonne principale — trois volets */}
            <div className="col-lg-8">
              <Tabs active={activeTab} onChange={setActiveTab} tabs={tabs} />

              {activeTab === "siege" && <SiegePanel insurer={insurer} />}
              {activeTab === "activites" && (
                <ActivitesPanel activites={activites} chargement={chargementActivites} />
              )}
              {activeTab === "agences" && (
                <AgencesPanel agences={agences} chargement={chargementAgences} />
              )}
            </div>

            {/* Colonne latérale — mise en relation */}
            <div className="col-lg-4" id="mise-en-relation">
              <ContactSidebar insurer={insurer} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}