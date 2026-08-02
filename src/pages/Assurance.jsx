// Page "Assurances" — annuaire des compagnies d'assurance et courtiers santé.

import { Link } from "react-router-dom";
import { insurers } from "../data/insurers";
import pub3 from "../assets/img/ads/pub3.jpg";

function InsurerCard({ insurer }) {
  const ficheUrl = `/assurances/${insurer.id}`;

  return (
    <div className={`insurer-card${insurer.premium ? " is-premium" : ""}`}>
      <div className="insurer-head">
        <div className="d-flex gap-3">
          <div className="insurer-logo">
            <i className={`fa-solid ${insurer.icon}`} />
          </div>
          <div>
            <h3 style={{ marginBottom: ".3rem" }}>
              <Link to={ficheUrl} style={{ color: "var(--ink)" }}>
                {insurer.name}
              </Link>
            </h3>
            <div className="practitioner-meta">
              <span>{insurer.type}</span>
              <span>&middot;</span>
              <span>
                <i className="fa-solid fa-location-dot" /> {insurer.siege.adresse}
              </span>
            </div>
            {insurer.premium && (
              <div className="practitioner-tags mt-2">
                <span className="chip chip-premium">
                  <i className="fa-solid fa-star" /> Vitrine premium
                </span>
                <span className="chip chip-verifie">
                  <i className="fa-solid fa-circle" /> Agréée CIMA
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="practitioner-actions" style={{ marginLeft: 0 }}>
          <Link
            to={ficheUrl}
            className={`btn btn-sm-aps ${insurer.premium ? "btn-primary" : "btn-outline-primary"}`}
          >
            Voir la fiche
          </Link>
        </div>
      </div>

      {insurer.premium ? (
        <p className="mt-3 mb-1" style={{ fontSize: ".86rem" }}>
          {insurer.description}
        </p>
      ) : (
        <p className="minimal-note mt-2 mb-0">
          <i className="fa-solid fa-circle-info" /> Présence minimale (sans abonnement
          actif) : dénomination et activité principale uniquement.
        </p>
      )}
    </div>
  );
}

export default function Assurance() {
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

      {/* ============================ PUBLICITÉ — au-dessus de l'annuaire des assurances ============================ */}
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
                <form onSubmit={(e) => e.preventDefault()}>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-type">
                      Type d'acteur
                    </label>
                    <select className="form-select" id="f-type">
                      <option>Tous</option>
                      <option>Compagnie d'assurance</option>
                      <option>Courtier</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-pays">
                      Pays
                    </label>
                    <select className="form-select" id="f-pays">
                      <option>Cameroun</option>
                      <option>Sénégal</option>
                      <option>Côte d'Ivoire</option>
                      <option>Gabon</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-ville">
                      Ville — agence la plus proche
                    </label>
                    <select className="form-select" id="f-ville">
                      <option>Toutes les villes</option>
                      <option>Douala — Akwa</option>
                      <option>Douala — Bonanjo</option>
                      <option>Douala — Bonapriso</option>
                      <option>Douala — Deido</option>
                      <option>Yaoundé — Bastos</option>
                      <option>Yaoundé — Mvog-Mbi</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-branche">
                      Branche
                    </label>
                    <select className="form-select" id="f-branche">
                      <option>Toutes les branches</option>
                      <option>Assurance santé individuelle</option>
                      <option>Assurance santé entreprise</option>
                      <option>Assurance vie</option>
                    </select>
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
                  <strong style={{ color: "var(--ink)" }}>{insurers.length}</strong>{" "}
                  compagnies &amp; courtiers référencés
                </span>
              </div>

              {insurers.map((insurer) => (
                <InsurerCard key={insurer.id} insurer={insurer} />
              ))}

              <nav aria-label="Pagination des résultats" className="mt-4">
                <ul className="pagination justify-content-center">
                  <li className="page-item disabled">
                    <a className="page-link" href="#">
                      Précédent
                    </a>
                  </li>
                  <li className="page-item active">
                    <a className="page-link" href="#">
                      1
                    </a>
                  </li>
                  <li className="page-item">
                    <a className="page-link" href="#">
                      2
                    </a>
                  </li>
                  <li className="page-item">
                    <a className="page-link" href="#">
                      Suivant
                    </a>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </div>
      </section>

    </>
  );
}