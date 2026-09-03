import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import structure1 from "../assets/img/structure1.jpg";
import "./../assets/styles/FicheStructureSante.css";
// Services réels — voir src/services/structureSanteService.js. Ce fichier
// exporte déjà TYPES_STRUCTURE, listerCentresSante et creerCentreSante
// (page StructureSante.jsx). Pour cette fiche détaillée, il doit en plus
// exposer, sur le même modèle que assuranceService.js :
//   - obtenirCentreSante(id)              -> GET  /centres-sante/:id
//   - listerImagesCentre(id)              -> GET  /centres-sante/:id/images
//   - listerExamensCentre(id)             -> GET  /centres-sante/:id/examens
//   - envoyerMessageCentre(id, donnees)   -> POST /centres-sante/:id/messages
import {
  TYPES_STRUCTURE,
  obtenirCentreSante,
  listerImagesCentre,
  listerExamensCentre,
  envoyerMessageCentre,
} from "../services/structureSanteService.js";

// Fiche structure de santé — page de détail d'un hôpital, d'une clinique,
// d'un centre médical, d'un dispensaire ou d'un laboratoire, avec ses
// coordonnées, sa localisation sur une carte, ses photos, la liste des
// examens qui y sont réalisés, et un formulaire de contact direct par
// email. Contenu entièrement dynamisé depuis l'API.

// Photo par défaut si la structure n'a pas (encore) d'image_url exploitable.
const PHOTO_PAR_DEFAUT = structure1;

// Habillage visuel (icône + couleur du badge) par type_structure — même
// mapping local que sur la page annuaire StructureSante.jsx (ces infos
// ne viennent pas du serveur).
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

/* ============================ CARTE GOOGLE MAPS ============================ */
function MapCard({ structure }) {
  const lat = structure.latitude;
  const lng = structure.longitude;
  const aUneLocalisation = lat != null && lng != null;

  return (
    <div className="info-card">
      <h3>
        <i className="fa-solid fa-map-location-dot" /> Localisation
      </h3>
      <div className="gmap-frame-wrap">
        {aUneLocalisation ? (
          <iframe
            title={`Localisation de ${structure.nom}`}
            src={`https://www.google.com/maps?q=${lat},${lng}&hl=fr&z=15&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        ) : (
          <div className="gmap-empty">
            <i className="fa-solid fa-map-location-dot" />
            <span>Localisation non renseignée par cette structure.</span>
          </div>
        )}
      </div>
      {aUneLocalisation && (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-outline-primary btn-sm-aps btn-block-aps mt-3"
        >
          <i className="fa-solid fa-diamond-turn-right" /> Obtenir l&apos;itinéraire
        </a>
      )}
    </div>
  );
}

/* ============================ FORMULAIRE DE CONTACT ============================ */
function ContactForm({ structure }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [envoye, setEnvoye] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !message.trim()) return;
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setErreur("Veuillez saisir une adresse email valide.");
      return;
    }
    setEnvoi(true);
    setErreur("");
    try {
      await envoyerMessageCentre(structure.structure_id, {
        email: email.trim(),
        message: message.trim(),
      });
      setEnvoye(true);
    } catch (err) {
      setErreur(err.data?.message || err.message || "Échec de l'envoi. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  if (envoye) {
    return (
      <div className="info-card" id="contact">
        <h3>
          <i className="fa-solid fa-circle-check" /> Message envoyé
        </h3>
        <p className="minimal-note mb-0">
          <i className="fa-solid fa-circle-info" /> Votre message a été transmis à{" "}
          {structure.nom}. Une réponse vous sera envoyée directement sur{" "}
          <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="info-card" id="contact">
      <h3>
        <i className="fa-solid fa-envelope" /> Contacter cette structure
      </h3>
      {erreur && (
        <p className="minimal-note mb-2" style={{ color: "var(--danger, #c0392b)" }}>
          <i className="fa-solid fa-triangle-exclamation" /> {erreur}
        </p>
      )}
      <form className="contact-structure-form" onSubmit={handleSubmit}>
        <div className="mb-2">
          <label className="form-label-aps" htmlFor="ct-email">
            Votre email
          </label>
          <input
            id="ct-email"
            type="email"
            className="form-control"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="mb-2">
          <label className="form-label-aps" htmlFor="ct-message">
            Votre message
          </label>
          <textarea
            id="ct-message"
            className="form-control"
            rows={4}
            placeholder="Décrivez votre demande..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary btn-block-aps" disabled={envoi}>
          {envoi ? (
            <><i className="fa-solid fa-circle-notch fa-spin" /> Envoi...</>
          ) : (
            <><i className="fa-solid fa-paper-plane" /> Envoyer le message</>
          )}
        </button>
      </form>
      <p className="minimal-note mt-2 mb-0">
        <i className="fa-solid fa-circle-info" /> Le message est adressé directement
        à {structure.nom}. APS ne gère ni rendez-vous ni dossier médical.
      </p>
    </div>
  );
}

/* ============================ VOLET 1 — PRÉSENTATION ============================ */
function PresentationPanel({ structure }) {
  return (
    <div className="tab-panel active">
      <div className="info-card">
        <h3>
          <i className="fa-solid fa-circle-info" /> Informations générales
        </h3>
        <table className="hours-table" style={{ width: "100%", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "220px" }} />
            <col />
          </colgroup>
          <tbody>
            <tr>
              <td>Dénomination</td>
              <td>{structure.nom}</td>
            </tr>
            <tr>
              <td>Type de structure</td>
              <td>{libelleType(structure.type_structure)}</td>
            </tr>
            <tr>
              <td>Localisation</td>
              <td>
                {[structure.adresse, structure.ville?.nom, structure.pays?.nom]
                  .filter(Boolean)
                  .join(", ")}
              </td>
            </tr>
            <tr>
              <td>Téléphone</td>
              <td>
                <a href={`tel:${structure.telephone}`}>{structure.telephone}</a>
              </td>
            </tr>
            {structure.email && (
              <tr>
                <td>Courriel</td>
                <td>
                  <a href={`mailto:${structure.email}`}>{structure.email}</a>
                </td>
              </tr>
            )}
            {structure.horaires && (
              <tr>
                <td>Horaires</td>
                <td>{structure.horaires}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {structure.description && (
        <div className="info-card">
          <h3>
            <i className="fa-solid fa-hospital" /> Présentation
          </h3>
          <p style={{ fontSize: ".9rem" }}>{structure.description}</p>
        </div>
      )}

      {/* Localisation (carte) + formulaire de contact */}
      <div className="row g-4">
        <div className="col-md-8">
          <MapCard structure={structure} />
        </div>
        <div className="col-md-4">
          <ContactForm structure={structure} />
        </div>
      </div>
    </div>
  );
}

/* ============================ VOLET 2 — IMAGES ============================ */
function ImagesPanel({ images, chargement }) {
  if (chargement) return <p className="minimal-note">Chargement des photos…</p>;

  return (
    <div className="tab-panel active">
      <div className="info-card">
        <h3>
          <i className="fa-solid fa-images" /> Photos de la structure
        </h3>
        {images.length === 0 ? (
          <p className="minimal-note mb-0">
            Aucune photo disponible pour cette structure pour le moment.
          </p>
        ) : (
          <div className="structure-gallery">
            {images.map((img, i) => (
              <div className="structure-gallery-item" key={img.image_id || i}>
                <img src={img.url || img} alt={img.legende || `Photo ${i + 1}`} loading="lazy" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================ VOLET 3 — EXAMENS ============================ */
function ExamensPanel({ examens, chargement }) {
  if (chargement) return <p className="minimal-note">Chargement des examens…</p>;

  // Regroupement par catégorie quand elle est renseignée par le serveur.
  const groupes = examens.reduce((acc, ex) => {
    const cle = ex.categorie || "Autres examens";
    (acc[cle] = acc[cle] || []).push(ex);
    return acc;
  }, {});

  return (
    <div className="tab-panel active">
      <div className="info-card">
        <h3>
          <i className="fa-solid fa-file-waveform" /> Examens réalisés
        </h3>
        {examens.length === 0 ? (
          <p className="minimal-note mb-0">
            Aucun examen n&apos;a encore été renseigné pour cette structure.
          </p>
        ) : (
          Object.entries(groupes).map(([categorie, liste]) => (
            <div key={categorie} className="mb-3">
              <strong style={{ fontSize: ".85rem", color: "var(--muted, #8a9591)" }}>
                {categorie}
              </strong>
              <div className="exam-list">
                {liste.map((ex) => (
                  <div className="exam-row" key={ex.examen_id || ex.nom}>
                    <div className="exam-row-name">
                      <strong>{ex.nom}</strong>
                      {ex.description && <span className="exam-row-cat">{ex.description}</span>}
                    </div>
                    {ex.prix != null && (
                      <span className="exam-row-price">{Number(ex.prix).toLocaleString()} FCFA</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        <p className="minimal-note mb-0">
          <i className="fa-solid fa-circle-info" /> Tarifs indicatifs, communiqués par
          la structure. À confirmer directement auprès d&apos;elle avant tout
          déplacement.
        </p>
      </div>
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
          Cette structure de santé n&apos;existe pas ou n&apos;est plus référencée
          dans l&apos;annuaire.
        </p>
        <Link to="/structure-sante" className="btn btn-primary btn-sm-aps mt-2">
          Retour à l&apos;annuaire
        </Link>
      </div>
    </section>
  );
}

/* ============================ COMPOSANT PRINCIPAL ============================ */
export default function FicheStructureSante() {
  const { id } = useParams();

  const [structure, setStructure] = useState(null);
  const [images, setImages] = useState([]);
  const [examens, setExamens] = useState([]);
  const [chargementFiche, setChargementFiche] = useState(true);
  const [chargementImages, setChargementImages] = useState(true);
  const [chargementExamens, setChargementExamens] = useState(true);
  const [introuvable, setIntrouvable] = useState(false);
  const [activeTab, setActiveTab] = useState("presentation");

  useEffect(() => {
    let annule = false;
    setChargementFiche(true);
    setIntrouvable(false);

    obtenirCentreSante(id)
      .then((data) => {
        if (!annule) setStructure(data);
      })
      .catch((err) => {
        if (!annule && err.status === 404) setIntrouvable(true);
      })
      .finally(() => {
        if (!annule) setChargementFiche(false);
      });

    setChargementImages(true);
    listerImagesCentre(id)
      .then((data) => {
        if (!annule) setImages(data.images || []);
      })
      .finally(() => {
        if (!annule) setChargementImages(false);
      });

    setChargementExamens(true);
    listerExamensCentre(id)
      .then((data) => {
        if (!annule) setExamens(data.examens || []);
      })
      .finally(() => {
        if (!annule) setChargementExamens(false);
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

  if (introuvable || !structure) {
    return <FicheIntrouvable />;
  }

  const meta = TYPE_META[structure.type_structure] || { cls: "is-centre", icon: "fa-hospital" };

  const tabs = [
    { id: "presentation", label: "Présentation" },
    { id: "images", label: `Images (${images.length})` },
    { id: "examens", label: `Examens (${examens.length})` },
  ];

  return (
    <>
      {/* ============================ FIL D'ARIANE ============================ */}
      <div className="container-aps" style={{ paddingTop: "1.1rem", fontSize: ".82rem" }}>
        <Link to="/" className="text-muted-soft">
          Accueil
        </Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: ".6rem" }} />
        <Link to="/structure-sante" className="text-muted-soft">
          Structures de santé
        </Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: ".6rem" }} />
        <span className="text-faint">{structure.nom}</span>
      </div>

      {/* ============================ EN-TÊTE FICHE (photo + coordonnées) ============================ */}
      <section className="profile-header" style={{ paddingTop: "1.5rem" }}>
        <div className="container-aps">
          <div className="profile-header-inner">
            <div
              className="profile-avatar"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
            >
              <img
                src={structure.image_url || PHOTO_PAR_DEFAUT}
                alt={structure.nom}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            <div>
              <h1>{structure.nom}</h1>
              <div className="practitioner-meta mb-2">
                <span className={`structure-type ${meta.cls}`}>
                  <i className={`fa-solid ${meta.icon}`} /> {libelleType(structure.type_structure)}
                </span>
                <span>&middot;</span>
                <span>
                  <i className="fa-solid fa-location-dot" />{" "}
                  {[structure.ville?.nom, structure.pays?.nom].filter(Boolean).join(", ")}
                </span>
                {structure.telephone && (
                  <>
                    <span>&middot;</span>
                    <span>
                      <i className="fa-solid fa-phone" /> {structure.telephone}
                    </span>
                  </>
                )}
              </div>
              <div className="d-flex gap-2 flex-wrap">
                {structure.statut_verification === "publie" ? (
                  <span className="chip chip-verifie">
                    <i className="fa-solid fa-circle-check" /> Structure vérifiée
                  </span>
                ) : (
                  <span className="chip chip-complet">
                    <i className="fa-solid fa-hourglass-half" /> En cours de vérification
                  </span>
                )}
              </div>
            </div>
            <div className="profile-actions">
              <a
                href="#contact"
                className="btn btn-primary btn-lg-aps"
                onClick={() => setActiveTab("presentation")}
              >
                <i className="fa-solid fa-envelope" /> Contacter
              </a>
              {structure.telephone && (
                <a href={`tel:${structure.telephone}`} className="btn btn-ghost">
                  <i className="fa-solid fa-phone" />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============================ CORPS — ONGLETS ============================ */}
      <section style={{ paddingTop: "1.5rem" }}>
        <div className="container-aps">
          <Tabs active={activeTab} onChange={setActiveTab} tabs={tabs} />

          {activeTab === "presentation" && <PresentationPanel structure={structure} />}
          {activeTab === "images" && (
            <ImagesPanel images={images} chargement={chargementImages} />
          )}
          {activeTab === "examens" && (
            <ExamensPanel examens={examens} chargement={chargementExamens} />
          )}
        </div>
      </section>
    </>
  );
}