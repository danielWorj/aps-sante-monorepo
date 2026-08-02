import { useState } from "react";

import structure1 from "../assets/img/structure1.jpg";
import structure2 from "../assets/img/structure2.jpg";
import structure3 from "../assets/img/structure3.jpg";
import structure4 from "../assets/img/structure4.jpg";
import pub6 from "../assets/img/ads/pub6.jpg";

// Page "Structures de santé" — annuaire des hôpitaux, cliniques et
// centres de santé, avec leurs services et l'itinéraire.

const TYPES = {
  chu: { label: "Hôpital universitaire", cls: "is-chu" },
  general: { label: "Hôpital général", cls: "is-general" },
  regional: { label: "Hôpital régional", cls: "is-regional" },
  district: { label: "Hôpital de district", cls: "is-district" },
  clinique: { label: "Clinique privée", cls: "is-clinique" },
  centre: { label: "Centre de santé", cls: "is-centre" },
};

const STRUCTURES = [
  {
    id: "chuy",
    name: "Centre Hospitalier et Universitaire de Yaoundé (CHUY)",
    photo: structure1,
    type: "chu",
    city: "Yaoundé — Melen",
    services: ["Urgences 24/7", "Bloc opératoire", "Imagerie médicale", "Maternité"],
    rating: "4.4 (212 avis)",
    phone: "+237222234321",
    conventionne: true,
  },
  {
    id: "hgy",
    name: "Hôpital Général de Yaoundé",
    photo: structure2,
    type: "general",
    city: "Yaoundé — Tsinga",
    services: ["Urgences 24/7", "Cardiologie", "Bloc opératoire", "Laboratoire"],
    rating: "4.2 (168 avis)",
    phone: "+237222314556",
    conventionne: true,
  },
  {
    id: "hr-service-urgences",
    name: "Hôpital Régional de Ngaoundéré",
    photo: structure3,
    type: "regional",
    city: "Ngaoundéré — Centre-ville",
    services: ["Urgences 24/7", "Maternité", "Pédiatrie"],
    rating: "4.0 (54 avis)",
    phone: "+237222251200",
    conventionne: false,
  },
  {
    id: "hd-biyem-assi",
    name: "Hôpital de District de Biyem-Assi",
    photo: structure4,
    type: "district",
    city: "Yaoundé — Biyem-Assi",
    services: ["Consultations générales", "Maternité", "Vaccination"],
    rating: "4.1 (77 avis)",
    phone: "+237222310098",
    conventionne: true,
  },
  {
    id: "chuy-annexe",
    name: "CHUY — Site annexe Melen",
    photo: structure1,
    type: "clinique",
    city: "Yaoundé — Melen",
    services: ["Chirurgie", "Laboratoire", "Consultations spécialisées"],
    rating: "4.3 (39 avis)",
    phone: "+237222234322",
    conventionne: false,
  },
  {
    id: "hr-bafoussam",
    name: "Hôpital Régional de Bafoussam",
    photo: structure3,
    type: "centre",
    city: "Bafoussam — Centre-ville",
    services: ["Urgences 24/7", "Radiologie", "Maternité"],
    rating: "3.9 (28 avis)",
    phone: "+237233444567",
    conventionne: true,
  },
];

function StructureCard({ structure }) {
  const type = TYPES[structure.type];
  return (
    <div className="structure-card">
      <div className="structure-photo">
        <img src={structure.photo} alt={structure.name} />
      </div>
      <div>
        <div className="structure-card-top">
          <span className={`structure-type ${type.cls}`}>
            <i className="fa-solid fa-hospital" /> {type.label}
          </span>
          {structure.conventionne && (
            <span className="chip chip-verifie">
              <i className="fa-solid fa-circle" /> Conventionné assurance
            </span>
          )}
        </div>
        <h3>{structure.name}</h3>
        <div className="practitioner-meta">
          <span>
            <i className="fa-solid fa-location-dot" /> {structure.city}
          </span>
          <span>&middot;</span>
          <span className="rating">
            <i className="fa-solid fa-star" /> {structure.rating}
          </span>
        </div>
        <div className="structure-services">
          {structure.services.map((s) => (
            <span className="chip" key={s}>
              <i className="fa-solid fa-circle" /> {s}
            </span>
          ))}
        </div>
      </div>
      <div className="practitioner-actions" style={{ marginLeft: "auto" }}>
        <a href={`tel:${structure.phone}`} className="btn btn-urgence btn-sm-aps">
          <i className="fa-solid fa-phone" /> Appeler
        </a>
        <a href="#" className="btn btn-outline-primary btn-sm-aps">
          <i className="fa-solid fa-diamond-turn-right" /> Itinéraire
        </a>
      </div>
    </div>
  );
}

export default function StructureSante() {
  const [urgence24Only, setUrgence24Only] = useState(false);

  const list = urgence24Only
    ? STRUCTURES.filter((s) => s.services.includes("Urgences 24/7"))
    : STRUCTURES;

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
            leurs services, l'appel direct et l'itinéraire.
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
                    <label className="form-label-aps" htmlFor="f-type">
                      Type de structure
                    </label>
                    <select className="form-select" id="f-type">
                      <option>Tous les types</option>
                      <option>Hôpital universitaire</option>
                      <option>Hôpital général</option>
                      <option>Hôpital régional</option>
                      <option>Hôpital de district</option>
                      <option>Clinique privée</option>
                      <option>Centre de santé</option>
                    </select>
                  </div>
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
                      <option>Yaoundé — Melen</option>
                      <option>Yaoundé — Tsinga</option>
                      <option>Yaoundé — Biyem-Assi</option>
                      <option>Ngaoundéré</option>
                      <option>Bafoussam</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps">Services disponibles</label>
                    <div className="d-flex flex-column gap-2">
                      <label className="chip" style={{ cursor: "pointer" }}>
                        <input type="checkbox" style={{ marginRight: ".35rem" }} />
                        <i className="fa-solid fa-circle" /> Maternité
                      </label>
                      <label className="chip" style={{ cursor: "pointer" }}>
                        <input type="checkbox" style={{ marginRight: ".35rem" }} />
                        <i className="fa-solid fa-circle" /> Bloc opératoire
                      </label>
                      <label className="chip" style={{ cursor: "pointer" }}>
                        <input type="checkbox" style={{ marginRight: ".35rem" }} />
                        <i className="fa-solid fa-circle" /> Laboratoire
                      </label>
                      <label className="chip" style={{ cursor: "pointer" }}>
                        <input type="checkbox" style={{ marginRight: ".35rem" }} />
                        <i className="fa-solid fa-circle" /> Imagerie médicale
                      </label>
                    </div>
                  </div>
                  <div className="d-flex flex-column gap-2 mb-3">
                    <label className="chip chip-verifie" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={urgence24Only}
                        onChange={(e) => setUrgence24Only(e.target.checked)}
                        style={{ marginRight: ".35rem" }}
                      />
                      <i className="fa-solid fa-circle" /> Urgences 24/7 uniquement
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
                  structures trouvées
                </span>
              </div>

              {list.map((s) => (
                <StructureCard key={s.id} structure={s} />
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
                    <a
                      href="#"
                      className="btn btn-outline-primary btn-sm-aps btn-block-aps"
                    >
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