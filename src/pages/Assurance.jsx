// Page "Assurances" — annuaire des compagnies d'assurance et courtiers santé.
// Dynamisée : les fiches proviennent de GET /api/services-assurance.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import pub3 from "../assets/img/ads/pub3.jpg";
import { listerServicesAssurance } from "../services/assuranceService";
import DeclarerCompagnieModal from "./../components/assurances/DeclarerCompagnieModal";

const LABEL_TYPE_ACTEUR = {
  compagnie: "Compagnie d'assurance",
  courtier: "Courtier",
};

function InsurerCard({ insurer }) {
  const ficheUrl = `/assurances/${insurer.service_assurance_id}`;
  const estVerifie = insurer.statut_verification === "publie";

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
  const [services, setServices] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [modalOuvert, setModalOuvert] = useState(false);

  const [typeActeur, setTypeActeur] = useState("");
  const [paysId, setPaysId] = useState("");
  const [villeId, setVilleId] = useState("");
  const [recherche, setRecherche] = useState("");

  const charger = async () => {
    setChargement(true);
    setErreur("");
    try {
      const data = await listerServicesAssurance({
        statut_verification: "publie",
        type_acteur: typeActeur || undefined,
        pays_id: paysId || undefined,
        ville_id: villeId || undefined,
        recherche: recherche || undefined,
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
                  onClick={() => setModalOuvert(true)}
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
                <InsurerCard key={insurer.service_assurance_id} insurer={insurer} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <DeclarerCompagnieModal
        open={modalOuvert}
        onClose={() => setModalOuvert(false)}
        onCreated={() => charger()}
      />
    </>
  );
}