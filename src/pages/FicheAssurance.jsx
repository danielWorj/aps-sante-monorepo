import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getInsurerById } from "../data/insurers";

// Fiche assurance — page de détail d'une compagnie d'assurance ou d'un
// courtier, avec ses agences et son formulaire de mise en relation.
// Sans abonnement actif, seule une présence minimale est affichée.

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
        <table className="hours-table">
          <tbody>
            <tr>
              <td>Dénomination</td>
              <td>{insurer.name}</td>
            </tr>
            <tr>
              <td>Type d'acteur</td>
              <td>{insurer.type}</td>
            </tr>
            <tr>
              <td>Agrément</td>
              <td>{insurer.agrementCima}</td>
            </tr>
            <tr>
              <td>Adresse du siège</td>
              <td>{insurer.siege.adresse}</td>
            </tr>
            <tr>
              <td>Coordonnées GPS</td>
              <td>
                {insurer.siege.gps.lat.toFixed(4)}, {insurer.siege.gps.lng.toFixed(4)}
              </td>
            </tr>
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

      <div className="info-card">
        <h3>
          <i className="fa-solid fa-circle-info" /> Présentation institutionnelle
        </h3>
        <p style={{ fontSize: ".9rem" }}>{insurer.presentation}</p>
      </div>
    </div>
  );
}

/* ============================ VOLET 2 — ACTIVITÉS ============================ */
function ActivitesPanel({ insurer }) {
  return (
    <div className="tab-panel active">
      <div className="info-card">
        <h3>
          <i className="fa-solid fa-layer-group" /> Branches &amp; domaines d'intervention
        </h3>
        <div className="d-flex gap-2 flex-wrap">
          {insurer.branches.map((branche) => (
            <span key={branche} className="chip chip-complet">
              {branche}
            </span>
          ))}
        </div>
      </div>

      <div className="info-card">
        <h3>
          <i className="fa-solid fa-file-shield" /> Produits proposés
        </h3>
        {insurer.produits.map((produit) => (
          <div key={produit.nom} className="mb-3">
            <strong style={{ fontSize: ".92rem" }}>{produit.nom}</strong>
            <div className="practitioner-meta mt-1 mb-2">
              <span>Public cible : {produit.publicCible}</span>
            </div>
            <div className="d-flex gap-2 flex-wrap">
              {produit.garanties.map((garantie) => (
                <span key={garantie} className="chip chip-complet">
                  {garantie}
                </span>
              ))}
            </div>
          </div>
        ))}
        <p className="minimal-note mb-0">
          <i className="fa-solid fa-circle-info" /> Garanties présentées à titre
          informatif uniquement. Aucune comparaison de produits, aucune
          souscription en ligne sur APS.
        </p>
      </div>
    </div>
  );
}

/* ============================ VOLET 3 — FILIALES & AGENCES ============================ */
function AgencesPanel({ insurer, selectedAgencyId, onSelectAgency }) {
  const [region, setRegion] = useState("Toutes les régions");
  const [ville, setVille] = useState("Toutes les villes");
  const [userPos, setUserPos] = useState(null);
  const [geoStatus, setGeoStatus] = useState("idle"); // idle | loading | error

  const regions = useMemo(
    () => ["Toutes les régions", ...new Set(insurer.agences.map((a) => a.region))],
    [insurer.agences]
  );
  const villes = useMemo(
    () => [
      "Toutes les villes",
      ...new Set(
        insurer.agences
          .filter((a) => region === "Toutes les régions" || a.region === region)
          .map((a) => a.ville)
      ),
    ],
    [insurer.agences, region]
  );

  const agences = useMemo(() => {
    let list = insurer.agences.filter(
      (a) =>
        (region === "Toutes les régions" || a.region === region) &&
        (ville === "Toutes les villes" || a.ville === ville)
    );
    if (userPos) {
      list = list
        .map((a) => ({ ...a, distance: distanceKm(userPos, a.gps) }))
        .sort((a, b) => a.distance - b.distance);
    }
    return list;
  }, [insurer.agences, region, ville, userPos]);

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

  return (
    <div className="tab-panel active">
      <div className="info-card">
        <h3>
          <i className="fa-solid fa-sliders" /> Rechercher une agence
        </h3>
        <div className="row g-2">
          <div className="col-6">
            <label className="form-label-aps" htmlFor="ag-region">
              Région
            </label>
            <select
              id="ag-region"
              className="form-select"
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                setVille("Toutes les villes");
              }}
            >
              {regions.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label-aps" htmlFor="ag-ville">
              Ville
            </label>
            <select
              id="ag-ville"
              className="form-select"
              value={ville}
              onChange={(e) => setVille(e.target.value)}
            >
              {villes.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline-primary btn-sm-aps mt-3"
          onClick={localiser}
        >
          <i className="fa-solid fa-location-crosshairs" />{" "}
          {geoStatus === "loading"
            ? "Localisation en cours…"
            : "Agences les plus proches de moi"}
        </button>
        {geoStatus === "error" && (
          <p className="minimal-note mt-2 mb-0">
            <i className="fa-solid fa-triangle-exclamation" /> Localisation
            indisponible ou refusée. Utilisez les filtres région / ville.
          </p>
        )}
      </div>

      {agences.map((agence) => (
        <div
          key={agence.id}
          className={`insurer-card${selectedAgencyId === agence.id ? " is-premium" : ""}`}
        >
          <div className="insurer-head">
            <div className="d-flex gap-3">
              <div className="insurer-logo">
                <i className="fa-solid fa-shop" />
              </div>
              <div>
                <h3 style={{ marginBottom: ".3rem" }}>{agence.nom}</h3>
                <div className="practitioner-meta">
                  <span>
                    <i className="fa-solid fa-location-dot" /> {agence.adresse}
                  </span>
                  {"distance" in agence && (
                    <>
                      <span>&middot;</span>
                      <span>{agence.distance.toFixed(1)} km</span>
                    </>
                  )}
                </div>
                <div className="practitioner-meta mt-1">
                  <span>
                    GPS {agence.gps.lat.toFixed(4)}, {agence.gps.lng.toFixed(4)}
                  </span>
                </div>
              </div>
            </div>
            <div className="practitioner-actions" style={{ marginLeft: 0 }}>
              <a href={`tel:${agence.telephone}`} className="btn btn-outline-primary btn-sm-aps">
                <i className="fa-solid fa-phone" />
              </a>
              <button
                type="button"
                className="btn btn-primary btn-sm-aps"
                onClick={() => onSelectAgency(agence.id)}
              >
                {selectedAgencyId === agence.id ? "Agence choisie" : "Choisir cette agence"}
              </button>
            </div>
          </div>
        </div>
      ))}

      {agences.length === 0 && (
        <p className="minimal-note">Aucune agence pour ces critères.</p>
      )}
    </div>
  );
}

/* ============================ FORMULAIRE DE MISE EN RELATION ============================ */
function ContactSidebar({ insurer, agences, selectedAgencyId, onSelectAgency }) {
  const [form, setForm] = useState({ nom: "", contact: "", message: "" });
  const [demande, setDemande] = useState(null);

  const agenceDestinataire = agences.find((a) => a.id === selectedAgencyId);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!agenceDestinataire || !form.nom || !form.contact) return;
    setDemande({
      horodatage: new Date().toLocaleString("fr-FR"),
      agence: agenceDestinataire.nom,
      copieAuSiege: true,
      statut: "Envoyée — en attente de traitement",
    });
  };

  if (demande) {
    return (
      <div className="info-card">
        <h3>
          <i className="fa-solid fa-circle-check" /> Demande envoyée
        </h3>
        <table className="hours-table">
          <tbody>
            <tr>
              <td>Horodatage</td>
              <td>{demande.horodatage}</td>
            </tr>
            <tr>
              <td>Agence destinataire</td>
              <td>{demande.agence}</td>
            </tr>
            <tr>
              <td>Copie</td>
              <td>Siège — {insurer.name}</td>
            </tr>
            <tr>
              <td>Statut</td>
              <td>{demande.statut}</td>
            </tr>
          </tbody>
        </table>
        <p className="minimal-note mt-2 mb-0">
          <i className="fa-solid fa-circle-info" /> Vous recevrez une réponse
          directement de l'agence ou du siège. APS n'intervient pas dans le
          traitement de la demande.
        </p>
      </div>
    );
  }

  return (
    <div className="info-card">
      <h3>
        <i className="fa-solid fa-envelope" /> Mise en relation
      </h3>
      <form onSubmit={handleSubmit}>
        <div className="mb-2">
          <label className="form-label-aps" htmlFor="ct-agence">
            Agence destinataire
          </label>
          <select
            id="ct-agence"
            className="form-select"
            value={selectedAgencyId || ""}
            onChange={(e) => onSelectAgency(e.target.value)}
            required
          >
            <option value="" disabled>
              Choisir une agence
            </option>
            {agences.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-2">
          <label className="form-label-aps" htmlFor="ct-nom">
            Nom complet
          </label>
          <input
            id="ct-nom"
            className="form-control"
            value={form.nom}
            onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
            required
          />
        </div>
        <div className="mb-2">
          <label className="form-label-aps" htmlFor="ct-contact">
            Téléphone ou courriel
          </label>
          <input
            id="ct-contact"
            className="form-control"
            value={form.contact}
            onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
            required
          />
        </div>
        <div className="mb-2">
          <label className="form-label-aps" htmlFor="ct-message">
            Message (facultatif)
          </label>
          <textarea
            id="ct-message"
            className="form-control"
            rows={3}
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          />
        </div>
        <button type="submit" className="btn btn-primary btn-block-aps">
          <i className="fa-solid fa-paper-plane" /> Envoyer la demande
        </button>
      </form>
      <p className="minimal-note mt-2 mb-0">
        <i className="fa-solid fa-circle-info" /> La demande est adressée
        directement à l'agence sélectionnée, avec copie systématique au
        siège. Aucune souscription n'est effectuée sur APS.
      </p>
    </div>
  );
}

/* ============================ PRÉSENCE MINIMALE ============================ */
function FicheMinimale({ insurer }) {
  return (
    <section style={{ padding: "2.5rem 0" }}>
      <div className="container-aps" style={{ maxWidth: "640px" }}>
        <div className="insurer-card">
          <div className="insurer-head">
            <div className="d-flex gap-3">
              <div className="insurer-logo">
                <i className="fa-solid fa-building-shield" />
              </div>
              <div>
                <h3 style={{ marginBottom: ".3rem" }}>{insurer.name}</h3>
                <div className="practitioner-meta">
                  <span>{insurer.type}</span>
                  <span>&middot;</span>
                  <span>
                    <i className="fa-solid fa-location-dot" /> Siège —{" "}
                    {insurer.siege.adresse}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <p className="minimal-note mt-2 mb-0">
            <i className="fa-solid fa-circle-info" /> Présence minimale (sans
            abonnement actif) : dénomination, activité principale et
            localisation du siège uniquement. Réseau d'agences, produits et
            mise en relation ne sont disponibles qu'avec un abonnement actif.
          </p>
        </div>
      </div>
    </section>
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
export default function FicheAssurance({ insurer: insurerProp }) {
  const { id } = useParams();
  const insurer = insurerProp ?? getInsurerById(id);

  const [activeTab, setActiveTab] = useState("siege");
  const [selectedAgencyId, setSelectedAgencyId] = useState(
    insurer?.agences?.[0]?.id ?? null
  );

  if (!insurer) {
    return <FicheIntrouvable />;
  }

  // Sans abonnement actif, seule la présence minimale est affichée.
  if (!insurer.abonnementActif) {
    return <FicheMinimale insurer={insurer} />;
  }

  const tabs = [
    { id: "siege", label: "Siège" },
    { id: "activites", label: "Activités" },
    { id: "agences", label: `Filiales & agences (${insurer.agences.length})` },
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
        <span className="text-faint">{insurer.name}</span>
      </div>

      {/* ============================ EN-TÊTE FICHE ============================ */}
      <section className="profile-header" style={{ paddingTop: "1.5rem" }}>
        <div className="container-aps">
          <div className="profile-header-inner">
            <div
              className="profile-avatar"
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <i className="fa-solid fa-building-shield" style={{ fontSize: "1.8rem" }} />
            </div>
            <div>
              <h1>{insurer.name}</h1>
              <div className="practitioner-meta mb-2">
                <span>{insurer.type}</span>
                <span>&middot;</span>
                <span>
                  <i className="fa-solid fa-location-dot" /> Siège — {insurer.siege.adresse}
                </span>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                {insurer.premium && (
                  <span className="chip chip-premium">
                    <i className="fa-solid fa-star" /> Vitrine premium
                  </span>
                )}
                <span className="chip chip-verifie">
                  <i className="fa-solid fa-circle" /> {insurer.agrementCima}
                </span>
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
              {activeTab === "activites" && <ActivitesPanel insurer={insurer} />}
              {activeTab === "agences" && (
                <AgencesPanel
                  insurer={insurer}
                  selectedAgencyId={selectedAgencyId}
                  onSelectAgency={setSelectedAgencyId}
                />
              )}
            </div>

            {/* Colonne latérale — mise en relation */}
            <div className="col-lg-4" id="mise-en-relation">
              <ContactSidebar
                insurer={insurer}
                agences={insurer.agences}
                selectedAgencyId={selectedAgencyId}
                onSelectAgency={setSelectedAgencyId}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}