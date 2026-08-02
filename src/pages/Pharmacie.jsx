import { useState } from "react";

import pharma1 from "../assets/img/pharma1.jpg";
import pharma2 from "../assets/img/pharma2.jpg";
import pharma3 from "../assets/img/pharma3.jpg";
import pharma4 from "../assets/img/pharma4.jpg";
import pub5 from "../assets/img/ads/pub5.jpg";

// Page "Pharmacies" — annuaire des pharmacies ouvertes, de garde ou 24h/24.

const PHARMACIES = [
  {
    id: "fleuron",
    name: "Pharmacie Le Fleuron",
    photo: pharma1,
    city: "Douala — Bonapriso",
    status: "garde",
    statusLabel: "De garde cette nuit",
    hours: "Garde jusqu'à 7h00",
    phone: "+237600000001",
    rating: "4.5 (32 avis)",
  },
  {
    id: "gabriel",
    name: "Pharmacie Gabriel",
    photo: pharma2,
    city: "Douala — Akwa",
    status: "open",
    statusLabel: "Ouverte maintenant",
    hours: "Ouvert jusqu'à 21h00",
    phone: "+237233415232",
    rating: "4.3 (58 avis)",
  },
  {
    id: "centre",
    name: "Pharmacie du Centre",
    photo: pharma3,
    city: "Douala — Akwa Centre",
    status: "open",
    statusLabel: "Ouverte maintenant",
    hours: "Ouvert jusqu'à 20h00",
    phone: "+237600000012",
    rating: "4.1 (19 avis)",
  },
  {
    id: "akwa-nord",
    name: "Pharmacie d'Akwa Nord",
    photo: pharma4,
    city: "Douala — Akwa Nord",
    status: "closed",
    statusLabel: "Fermée — réouvre à 8h00",
    hours: "Fermé le dimanche",
    phone: "+237600000018",
    rating: "4.6 (44 avis)",
  },
  {
    id: "wouri",
    name: "Pharmacie du Wouri",
    photo: pharma1,
    city: "Douala — Bonapriso",
    status: "garde",
    statusLabel: "De garde cette nuit",
    hours: "Garde jusqu'à 7h00",
    phone: "+237600000002",
    rating: "4.7 (71 avis)",
  },
  {
    id: "bonanjo",
    name: "Pharmacie Bonanjo Nuit & Jour",
    photo: pharma2,
    city: "Douala — Bonanjo",
    status: "open",
    statusLabel: "Ouverte 24h/24",
    hours: "Service continu",
    phone: "+237600000004",
    rating: "4.4 (26 avis)",
  },
];

function statusIcon(status) {
  if (status === "garde") return "fa-solid fa-moon";
  if (status === "open") return "fa-solid fa-circle-check";
  return "fa-solid fa-circle-minus";
}

function PharmacyCard({ pharmacy }) {
  return (
    <div className="pharmacy-card">
      <div className="pharmacy-photo">
        <img src={pharmacy.photo} alt={pharmacy.name} />
      </div>
      <div>
        <span className={`pharmacy-status is-${pharmacy.status}`}>
          <i className={statusIcon(pharmacy.status)} /> {pharmacy.statusLabel}
        </span>
        <h3>{pharmacy.name}</h3>
        <div className="practitioner-meta">
          <span>
            <i className="fa-solid fa-location-dot" /> {pharmacy.city}
          </span>
          <span>&middot;</span>
          <span>
            <i className="fa-solid fa-clock" /> {pharmacy.hours}
          </span>
          <span>&middot;</span>
          <span className="rating">
            <i className="fa-solid fa-star" /> {pharmacy.rating}
          </span>
        </div>
      </div>
      <div className="practitioner-actions" style={{ marginLeft: "auto" }}>
        <a href={`tel:${pharmacy.phone}`} className="btn btn-urgence btn-sm-aps">
          <i className="fa-solid fa-phone" /> Appeler
        </a>
        <a href="#" className="btn btn-outline-primary btn-sm-aps">
          <i className="fa-solid fa-diamond-turn-right" /> Itinéraire
        </a>
      </div>
    </div>
  );
}

export default function Pharmacie() {
  const [gardeOnly, setGardeOnly] = useState(false);

  const list = gardeOnly
    ? PHARMACIES.filter((p) => p.status === "garde")
    : PHARMACIES;

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
            Pharmacies ouvertes, de garde ou 24h/24 près de chez vous, avec
            appel direct et itinéraire.
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
                <form onSubmit={(e) => e.preventDefault()}>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-pays">
                      Pays
                    </label>
                    <select className="form-select" id="f-pays">
                      <option>Cameroun</option>
                      <option>Sénégal</option>
                      <option>Côte d&apos;Ivoire</option>
                      <option>Gabon</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-ville">
                      Ville / Quartier
                    </label>
                    <select className="form-select" id="f-ville">
                      <option>Toutes les villes</option>
                      <option>Douala — Akwa</option>
                      <option>Douala — Akwa Nord</option>
                      <option>Douala — Bonanjo</option>
                      <option>Douala — Bonapriso</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-statut">
                      Statut
                    </label>
                    <select className="form-select" id="f-statut">
                      <option>Toutes</option>
                      <option>Ouvertes maintenant</option>
                      <option>De garde cette nuit</option>
                      <option>Ouvertes 24h/24</option>
                    </select>
                  </div>
                  <div className="d-flex flex-column gap-2 mb-3">
                    <label
                      className="chip chip-verifie"
                      style={{ cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={gardeOnly}
                        onChange={(e) => setGardeOnly(e.target.checked)}
                        style={{ marginRight: ".35rem" }}
                      />
                      <i className="fa-solid fa-circle" /> Pharmacies de garde
                      uniquement
                    </label>
                  </div>
                  <button type="submit" className="btn btn-primary btn-block-aps">
                    <i className="fa-solid fa-magnifying-glass" /> Rechercher
                  </button>
                </form>
              </div>
            </div>

            {/* Colonne résultats */}
            <div className="col-md-6">
              <div className="results-toolbar" style={{ marginTop: 0 }}>
                <span className="text-muted-soft" style={{ fontSize: ".9rem" }}>
                  <strong style={{ color: "var(--ink)" }}>{list.length}</strong>{" "}
                  pharmacies trouvées
                </span>
              </div>

              {list.map((p) => (
                <PharmacyCard key={p.id} pharmacy={p} />
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