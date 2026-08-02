import { useState } from "react";
import pub2 from "../assets/img/ads/pub2.jpg";

/**
 * Page "Urgences" — accès en un geste.
 * Adapté depuis APS-site-corrige/APS/pages/urgences.html
 *
 * La navbar et le footer sont fournis par un layout partagé au niveau de
 * l'app — ce composant ne contient que le contenu propre à la page.
 *
 * Prérequis globaux (déjà chargés au niveau de l'app, comme dans index.html) :
 *  - Bootstrap 5.3 CSS
 *  - Font Awesome 6.5 (icônes fa-solid / fa-brands)
 *  - Polices Google Fonts : Manrope / Inter / IBM Plex Mono
 *  - ../css/style.css (feuille de style maison APS — classes .urgence-hero, .type-card, etc.)
 *
 * Comportement JS d'origine (js/script.js) réimplémenté en state React :
 *  - sélection du type d'urgence (.type-card.active)
 */

const emergencyTypes = [
  { id: "medicale", icon: "fa-kit-medical", label: "Médicale" },
  { id: "ambulance", icon: "fa-truck-medical", label: "Ambulance" },
  { id: "garde-nocturne", icon: "fa-moon", label: "Garde nocturne" },
  { id: "accouchement", icon: "fa-baby", label: "Accouchement" },
  { id: "intoxication", icon: "fa-skull-crossbones", label: "Intoxication" },
  { id: "accident", icon: "fa-car-burst", label: "Accident" },
];

const officialNumbers = [
  { name: "SAMU", meta: "Service d'aide médicale urgente", tel: "119" },
  { name: "Pompiers", meta: "Protection civile", tel: "118" },
  { name: "Police secours", meta: "Sécurité publique", tel: "117" },
];

const pharmacies = [
  {
    name: "Pharmacie du Wouri",
    meta: "Bonapriso, Douala — 0,8 km · garde jusqu'à 7h00",
    tel: "+237600000001",
  },
  {
    name: "Pharmacie Bonanjo Nuit & Jour",
    meta: "Bonanjo, Douala — 1,9 km · garde jusqu'à 7h00",
    tel: "+237600000004",
  },
];

const ambulances = [
  {
    name: "Ambulance Assistance Douala",
    meta: "Joignable 24/7 · véhicule médicalisé",
    tel: "+237600000010",
  },
  {
    name: "SOS Ambulances Littoral",
    meta: "Joignable 24/7 · transport sanitaire simple & réanimation",
    tel: "+237600000011",
  },
];

const facilities = [
  {
    name: "Clinique de la Cité des Palmiers",
    meta: "Urgences ouvertes 24/7 — 2,3 km",
    tel: "+237600000012",
  },
];

function UrgenceRow({ name, meta, tel, callOnly, withItinerary }) {
  return (
    <div className="urgence-row">
      <div>
        <div className="name">{name}</div>
        <div className="meta">{meta}</div>
      </div>
      {withItinerary ? (
        <div className="d-flex gap-2">
          <a href={`tel:${tel}`} className="btn btn-urgence btn-sm-aps">
            <i className="fa-solid fa-phone" />
          </a>
          <a href="#" className="btn btn-outline-primary btn-sm-aps">
            Itinéraire
          </a>
        </div>
      ) : (
        <a href={`tel:${tel}`} className="btn btn-urgence btn-sm-aps">
          <i className="fa-solid fa-phone" /> {callOnly ? tel : "Appeler"}
        </a>
      )}
    </div>
  );
}

export default function Urgence() {
  const [activeType, setActiveType] = useState(emergencyTypes[0].id);

  return (
    <>
      {/* ============================ HERO SOS ============================ */}
      <section className="urgence-hero">
        <div className="container-aps" style={{ maxWidth: "920px" }}>
          <span className="eyebrow" style={{ color: "var(--urgence-dark)" }}>
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

          <button type="button" className="big-sos">
            <i className="fa-solid fa-triangle-exclamation" /> J'AI BESOIN D'AIDE
            MAINTENANT
          </button>
         

          <label className="form-label-aps" style={{ marginTop: "1.75rem" }}>
            Sélectionnez le type d'urgence
          </label>
          <div className="row g-4 align-items-stretch">
            <div className="col-lg-8">
              <div className="type-grid">
                {emergencyTypes.map((type) => (
                  <div
                    key={type.id}
                    className={`type-card${activeType === type.id ? " active" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveType(type.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setActiveType(type.id);
                    }}
                  >
                    <i className={`fa-solid ${type.icon}`} />
                    <span>{type.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="col-lg-4 urgence-ad-col">
              <a href="#" className="ad-slot">
                <span className="ad-tag">Publicité</span>
                <img src={pub2} alt="Publicité — MTN, plus de data, plus d'appels" />
              </a>
            </div>
          </div>

          <div className="geoloc-strip">
            <i className="fa-solid fa-location-crosshairs" />
            <span>
              Localisation activée (avec votre consentement) — Douala, Cameroun. À
              l'étranger, ces services basculent automatiquement sur le pays où vous
              vous trouvez.
            </span>
          </div>
        </div>
      </section>

      {/* ============================ RESULTATS PAR PROXIMITE ============================ */}
      <section>
        <div className="container-aps">
          <div className="section-head">
            <span className="eyebrow">Résultats instantanés</span>
            <h2>Services disponibles près de vous</h2>
            <p>Classés par ordre de proximité et par priorité de santé publique.</p>
          </div>

          <div className="row g-4">
            <div className="col-lg-8">
              <div className="result-block">
                <h3>
                  <i className="fa-solid fa-phone-volume" /> Numéros d'urgence
                  officiels — Cameroun
                </h3>
                {officialNumbers.map((item) => (
                  <UrgenceRow key={item.name} {...item} callOnly />
                ))}
              </div>

              <div className="result-block">
                <h3>
                  <i className="fa-solid fa-mortar-pestle" /> Pharmacies de garde
                  actives
                </h3>
                {pharmacies.map((item) => (
                  <UrgenceRow key={item.name} {...item} withItinerary />
                ))}
              </div>

              <div className="result-block">
                <h3>
                  <i className="fa-solid fa-truck-medical" /> Ambulances joignables
                </h3>
                {ambulances.map((item) => (
                  <UrgenceRow key={item.name} {...item} />
                ))}
              </div>

              <div className="result-block" style={{ marginBottom: 0 }}>
                <h3>
                  <i className="fa-solid fa-hospital" /> Structures médicales ouvertes
                </h3>
                {facilities.map((item) => (
                  <UrgenceRow key={item.name} {...item} />
                ))}
              </div>
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
                  <option>Contact d'urgence — Maman (+237 6XX XX XX XX)</option>
                  <option>+ Ajouter un contact</option>
                </select>
                <button className="btn btn-urgence btn-block-aps btn-sm-aps" type="button">
                  <i className="fa-solid fa-paper-plane" /> Envoyer ma position
                </button>
              </div>

              <div className="offline-note mb-3">
                <i className="fa-solid fa-wifi" />
                <span>
                  <strong>Mode hors connexion.</strong> Les numéros d'urgence
                  officiels du pays restent accessibles depuis l'application même sans
                  connexion internet.
                </span>
              </div>

              <div className="offline-note">
                <i className="fa-solid fa-earth-africa" />
                <span>
                  <strong>À l'étranger ?</strong> Le module bascule automatiquement sur
                  les numéros et services officiels du pays où vous vous trouvez.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

    </>
  );
}