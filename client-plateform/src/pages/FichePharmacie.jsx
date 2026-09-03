import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import pharmaPlaceholder from "../assets/img/pharma1.jpg";
import "./../assets/styles/FicheStructureSante.css";
// Services réels — voir src/services/pharmacieService.js. Ce fichier
// exporte déjà listerPharmacies / obtenirPharmacie / creerPharmacie
// (page Pharmacie.jsx) ainsi que listerGardesPharmacie (pour savoir si
// la pharmacie est de garde à l'instant présent). Pour cette fiche
// détaillée, il expose en plus, sur le même modèle que
// structureSanteService.js :
//   - listerImagesPharmacie(id)   -> GET  /pharmacies/:id/images
//   - listerAnnoncesPharmacie(id) -> GET  /pharmacies/:id/annonces
//   - envoyerMessagePharmacie(id, donnees) -> POST /pharmacies/:id/messages
import {
  obtenirPharmacie,
  listerImagesPharmacie,
  listerAnnoncesPharmacie,
  listerGardesPharmacie,
  envoyerMessagePharmacie,
} from "../services/pharmacieService";

// Fiche pharmacie — page de détail d'une pharmacie, avec ses
// coordonnées, sa localisation sur une carte, ses photos, ses
// annonces (promotions, réassorts, informations ponctuelles...) et un
// formulaire de contact direct par email. Contenu entièrement
// dynamisé depuis l'API.
//
// NB route : cette fiche est supposée montée sur /pharmacie/:id (même
// convention que /structure-sante/:id pour FicheStructureSante) — à
// ajuster dans le routeur si le chemin réel diffère.

// Photo par défaut si la pharmacie n'a pas (encore) d'image_url exploitable.
const PHOTO_PAR_DEFAUT = pharmaPlaceholder;

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
function MapCard({ pharmacie }) {
  const lat = pharmacie.latitude;
  const lng = pharmacie.longitude;
  const aUneLocalisation = lat != null && lng != null;

  return (
    <div className="info-card">
      <h3>
        <i className="fa-solid fa-map-location-dot" /> Localisation
      </h3>
      <div className="gmap-frame-wrap">
        {aUneLocalisation ? (
          <iframe
            title={`Localisation de ${pharmacie.nom}`}
            src={`https://www.google.com/maps?q=${lat},${lng}&hl=fr&z=15&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        ) : (
          <div className="gmap-empty">
            <i className="fa-solid fa-map-location-dot" />
            <span>Localisation non renseignée par cette pharmacie.</span>
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
function ContactForm({ pharmacie }) {
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
      await envoyerMessagePharmacie(pharmacie.pharmacie_id, {
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
          {pharmacie.nom}. Une réponse vous sera envoyée directement sur{" "}
          <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="info-card" id="contact">
      <h3>
        <i className="fa-solid fa-envelope" /> Contacter cette pharmacie
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
        à {pharmacie.nom}. APS ne gère ni commande ni délivrance de médicaments.
      </p>
    </div>
  );
}

/* ============================ VOLET 1 — PRÉSENTATION ============================ */
function PresentationPanel({ pharmacie }) {
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
              <td>{pharmacie.nom}</td>
            </tr>
            <tr>
              <td>N° d&apos;ordre du titulaire</td>
              <td>{pharmacie.numero_ordre_titulaire}</td>
            </tr>
            <tr>
              <td>Localisation</td>
              <td>
                {[pharmacie.adresse, pharmacie.ville?.nom, pharmacie.pays?.nom]
                  .filter(Boolean)
                  .join(", ")}
              </td>
            </tr>
            <tr>
              <td>Téléphone</td>
              <td>
                <a href={`tel:${pharmacie.telephone}`}>{pharmacie.telephone}</a>
              </td>
            </tr>
            {pharmacie.email && (
              <tr>
                <td>Courriel</td>
                <td>
                  <a href={`mailto:${pharmacie.email}`}>{pharmacie.email}</a>
                </td>
              </tr>
            )}
            {pharmacie.horaires && (
              <tr>
                <td>Horaires</td>
                <td>{pharmacie.horaires}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pharmacie.description && (
        <div className="info-card">
          <h3>
            <i className="fa-solid fa-prescription-bottle-medical" /> Présentation
          </h3>
          <p style={{ fontSize: ".9rem" }}>{pharmacie.description}</p>
        </div>
      )}

      {/* Localisation (carte) + formulaire de contact */}
      <div className="row g-4">
        <div className="col-md-8">
          <MapCard pharmacie={pharmacie} />
        </div>
        <div className="col-md-4">
          <ContactForm pharmacie={pharmacie} />
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
          <i className="fa-solid fa-images" /> Photos de la pharmacie
        </h3>
        {images.length === 0 ? (
          <p className="minimal-note mb-0">
            Aucune photo disponible pour cette pharmacie pour le moment.
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

/* ============================ VOLET 3 — ANNONCES ============================ */
function formatDate(valeur) {
  if (!valeur) return "";
  try {
    return new Date(valeur).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function AnnoncesPanel({ annonces, chargement }) {
  if (chargement) return <p className="minimal-note">Chargement des annonces…</p>;

  return (
    <div className="tab-panel active">
      <div className="info-card">
        <h3>
          <i className="fa-solid fa-bullhorn" /> Annonces de la pharmacie
        </h3>
        {annonces.length === 0 ? (
          <p className="minimal-note mb-0">
            Cette pharmacie n&apos;a publié aucune annonce pour le moment.
          </p>
        ) : (
          <div className="d-flex flex-column gap-3">
            {annonces.map((annonce, i) => (
              <div
                key={annonce.annonce_id || i}
                className="exam-row"
                style={{ alignItems: "flex-start" }}
              >
                {annonce.image_url && (
                  <img
                    src={annonce.image_url}
                    alt={annonce.titre}
                    loading="lazy"
                    style={{
                      width: "72px",
                      height: "72px",
                      objectFit: "cover",
                      borderRadius: "8px",
                      marginRight: ".75rem",
                      flexShrink: 0,
                    }}
                  />
                )}
                <div className="exam-row-name" style={{ flex: 1 }}>
                  <strong>{annonce.titre}</strong>
                  {annonce.description && (
                    <span className="exam-row-cat">{annonce.description}</span>
                  )}
                  {annonce.date_publication && (
                    <span className="exam-row-cat">
                      <i className="fa-regular fa-calendar" />{" "}
                      {formatDate(annonce.date_publication)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="minimal-note mt-3 mb-0">
          <i className="fa-solid fa-circle-info" /> Annonces publiées et mises à
          jour par la pharmacie elle-même. À confirmer directement auprès d&apos;elle
          avant tout déplacement.
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
          Cette pharmacie n&apos;existe pas ou n&apos;est plus référencée dans
          l&apos;annuaire.
        </p>
        <Link to="/pharmacie" className="btn btn-primary btn-sm-aps mt-2">
          Retour à l&apos;annuaire
        </Link>
      </div>
    </section>
  );
}

/* ============================ COMPOSANT PRINCIPAL ============================ */
export default function FichePharmacie() {
  const { id } = useParams();

  const [pharmacie, setPharmacie] = useState(null);
  const [images, setImages] = useState([]);
  const [annonces, setAnnonces] = useState([]);
  const [enGarde, setEnGarde] = useState(false);
  const [chargementFiche, setChargementFiche] = useState(true);
  const [chargementImages, setChargementImages] = useState(true);
  const [chargementAnnonces, setChargementAnnonces] = useState(true);
  const [introuvable, setIntrouvable] = useState(false);
  const [activeTab, setActiveTab] = useState("presentation");

  useEffect(() => {
    let annule = false;
    setChargementFiche(true);
    setIntrouvable(false);

    obtenirPharmacie(id)
      .then((data) => {
        if (!annule) setPharmacie(data.pharmacie);
      })
      .catch((err) => {
        if (!annule && err.status === 404) setIntrouvable(true);
      })
      .finally(() => {
        if (!annule) setChargementFiche(false);
      });

    setChargementImages(true);
    listerImagesPharmacie(id)
      .then((data) => {
        if (!annule) setImages(data.images || []);
      })
      .finally(() => {
        if (!annule) setChargementImages(false);
      });

    setChargementAnnonces(true);
    listerAnnoncesPharmacie(id)
      .then((data) => {
        if (!annule) setAnnonces(data.annonces || []);
      })
      .finally(() => {
        if (!annule) setChargementAnnonces(false);
      });

    // Pharmacie de garde à l'instant présent (pour le badge d'en-tête).
    listerGardesPharmacie({ pharmacie_id: id, date: new Date().toISOString() })
      .then((data) => {
        if (!annule) setEnGarde((data.gardes || []).length > 0);
      })
      .catch(() => {
        if (!annule) setEnGarde(false);
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

  if (introuvable || !pharmacie) {
    return <FicheIntrouvable />;
  }

  const tabs = [
    { id: "presentation", label: "Présentation" },
    { id: "images", label: `Images (${images.length})` },
    { id: "annonces", label: `Annonces (${annonces.length})` },
  ];

  return (
    <>
      {/* ============================ FIL D'ARIANE ============================ */}
      <div className="container-aps" style={{ paddingTop: "1.1rem", fontSize: ".82rem" }}>
        <Link to="/" className="text-muted-soft">
          Accueil
        </Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: ".6rem" }} />
        <Link to="/pharmacie" className="text-muted-soft">
          Pharmacies
        </Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: ".6rem" }} />
        <span className="text-faint">{pharmacie.nom}</span>
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
                src={pharmacie.image_url || PHOTO_PAR_DEFAUT}
                alt={pharmacie.nom}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            <div>
              <h1>{pharmacie.nom}</h1>
              <div className="practitioner-meta mb-2">
                <span className={`pharmacy-status ${enGarde ? "is-garde" : "is-open"}`}>
                  <i className={enGarde ? "fa-solid fa-moon" : "fa-solid fa-circle-check"} />{" "}
                  {enGarde ? "De garde en ce moment" : "Fiche vérifiée"}
                </span>
                <span>&middot;</span>
                <span>
                  <i className="fa-solid fa-location-dot" />{" "}
                  {[pharmacie.ville?.nom, pharmacie.pays?.nom].filter(Boolean).join(", ")}
                </span>
                {pharmacie.telephone && (
                  <>
                    <span>&middot;</span>
                    <span>
                      <i className="fa-solid fa-phone" /> {pharmacie.telephone}
                    </span>
                  </>
                )}
              </div>
              <div className="d-flex gap-2 flex-wrap">
                {pharmacie.statut_verification === "publie" ? (
                  <span className="chip chip-verifie">
                    <i className="fa-solid fa-circle-check" /> Pharmacie vérifiée
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
              {pharmacie.telephone && (
                <a href={`tel:${pharmacie.telephone}`} className="btn btn-urgence">
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

          {activeTab === "presentation" && <PresentationPanel pharmacie={pharmacie} />}
          {activeTab === "images" && (
            <ImagesPanel images={images} chargement={chargementImages} />
          )}
          {activeTab === "annonces" && (
            <AnnoncesPanel annonces={annonces} chargement={chargementAnnonces} />
          )}
        </div>
      </section>
    </>
  );
}