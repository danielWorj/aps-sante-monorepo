/**
 * Page "Abonnements" — Présente la grille des abonnements forfaitaires de
 * présence par type d'acteur (§7.11, Dispositif A du cahier des charges),
 * ainsi que le module publicité annonceurs tiers (Dispositif B).
 *
 * La navbar et le footer sont fournis par le layout partagé de l'app.
 *
 * Prérequis globaux (déjà chargés au niveau de l'app) :
 *  - Bootstrap 5.3 CSS
 *  - Font Awesome 6.5 (icônes fa-solid)
 *  - Polices Manrope / Inter / IBM Plex Mono
 *  - ../assets/styles/style.css (feuille de style maison APS)
 */

import { useState } from "react";
import { clientTypes, getClientType } from "../data/subscriptionPlans";

function PlanCard({ tier, isBase }) {
  return (
    <div className={`plan-card${tier.popular ? " is-popular" : ""}${isBase ? " is-base" : ""}`}>
      {tier.popular && <span className="plan-ribbon">Recommandé</span>}
      {tier.badge && !tier.popular && <span className="plan-badge-top">{tier.badge}</span>}

      <div className="plan-card-head">
        <h3>{tier.name}</h3>
        {tier.duration && <span className="plan-duration">{tier.duration}</span>}
      </div>

      <div className="plan-price">
        <span className="plan-price-amount">{tier.priceLabel}</span>
        {tier.unit && <span className="plan-price-unit">{tier.unit}</span>}
      </div>
      {tier.priceSub && <p className="plan-price-sub">{tier.priceSub}</p>}
      {tier.priceNote && <p className="plan-price-sub">{tier.priceNote}</p>}

      <ul className="plan-features">
        {tier.features.map((f, i) => (
          <li key={i}>
            <i className="fa-solid fa-check" /> {f}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={`btn btn-block-aps ${tier.popular || isBase === false ? "btn-primary" : "btn-outline-primary"}`}
      >
        {isBase ? "Inclus automatiquement" : "Choisir cette formule"}
      </button>
    </div>
  );
}

export default function Abonnement() {
  const [selected, setSelected] = useState(clientTypes[0].id);
  const client = getClientType(selected);

  return (
    <>
      {/* ============================ EN-TÊTE PAGE ============================ */}
      <section style={{ padding: "2.5rem 0 0" }}>
        <div className="container-aps">
          <span className="eyebrow">Tarification &amp; abonnements</span>
          <h1 style={{ fontSize: "1.9rem", marginTop: ".5rem" }}>
            Les abonnements de la plateforme APS
          </h1>
          <p className="mt-2" style={{ maxWidth: "680px" }}>
            APS repose sur un annuaire gratuit et exhaustif, complété par des
            abonnements forfaitaires de présence qui enrichissent la fiche de
            chaque acteur (photos, contact direct, fiche détaillée). Le
            palier de base reste gratuit en permanence, quel que soit le
            type d'acteur.
          </p>
        </div>
      </section>

      {/* ============================ SELECTEUR CLIENT ============================ */}
      <section style={{ paddingTop: "1.5rem", paddingBottom: 0 }}>
        <div className="container-aps">
          <div className="banner-institutionnel">
            <i className="fa-solid fa-circle-info" />
            <span>
              Tarifs indicatifs. La grille réelle est pilotée dynamiquement
              depuis la console d'administration, pays par pays. Pendant la
              phase d'amorçage, tous les abonnements des professionnels de
              santé (médecins, cliniques, hôpitaux, laboratoires,
              pharmacies) sont offerts.
            </span>
          </div>

          <div className="plan-selector">
            <label className="form-label-aps" htmlFor="client-type">
              <i className="fa-solid fa-user-group" /> Je consulte les abonnements pour :
            </label>
            <select
              id="client-type"
              className="form-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {clientTypes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Chips de raccourci, en complément du select */}
          <div className="plan-type-chips">
            {clientTypes.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`plan-type-chip${selected === c.id ? " active" : ""}`}
                onClick={() => setSelected(c.id)}
              >
                <i className={`fa-solid ${c.icon}`} /> {c.shortLabel}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ GRILLE DES ABONNEMENTS ============================ */}
      <section style={{ paddingTop: "1.5rem" }}>
        <div className="container-aps">
          <div className="section-head" style={{ marginBottom: "1.5rem" }}>
            <span className="eyebrow">
              <i className={`fa-solid ${client.icon}`} /> {client.label}
            </span>
            <h2 style={{ fontSize: "1.4rem" }}>{client.tagline}</h2>
          </div>

          <div className="plan-grid">
            {client.baseTier && (
              <PlanCard tier={client.baseTier} isBase />
            )}
            {client.tiers.map((tier) => (
              <PlanCard key={tier.id} tier={tier} isBase={false} />
            ))}
          </div>

          {client.notes && client.notes.length > 0 && (
            <ul className="plan-notes">
              {client.notes.map((n, i) => (
                <li key={i}>
                  <i className="fa-solid fa-circle-info" /> {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ============================ DISPOSITIFS COMPLEMENTAIRES ============================ */}
      <section className="section-alt" style={{ marginTop: "2.5rem" }}>
        <div className="container-aps">
          <div className="section-head">
            <span className="eyebrow">Pour aller plus loin</span>
            <h2 style={{ fontSize: "1.4rem" }}>
              Trois dispositifs de visibilité, trois logiques distinctes
            </h2>
            <p>
              Le module Présence &amp; publicité distingue strictement
              l'enrichissement informationnel du contenu commercial.
            </p>
          </div>

          <div className="row g-4">
            <div className="col-md-4">
              <div className="step-card">
                <div className="step-num">A</div>
                <h3>Abonnement forfaitaire de présence</h3>
                <p>
                  Ouvert à tous les acteurs, y compris ceux soumis à la
                  déontologie de non-publicité. Enrichit la fiche sans
                  jamais influencer le classement.
                </p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="step-card">
                <div className="step-num">B</div>
                <h3>Publicité d'annonceurs tiers</h3>
                <p>
                  Réservée aux entreprises hors professions de santé
                  réglementées. Affichage de logos dans un cadre dédié,
                  ciblage contextuel obligatoire.
                </p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="step-card">
                <div className="step-num">C</div>
                <h3>Boost commercial promotionnel</h3>
                <p>
                  Mise en avant payante réservée aux acteurs autorisés à la
                  publicité (assureurs, courtiers, ambulances...). Badge «
                  Sponsorisé » visible et modération a priori obligatoire.
                </p>
              </div>
            </div>
          </div>

          <div className="banner-institutionnel" style={{ marginTop: "1.5rem" }}>
            <i className="fa-solid fa-shield-halved" />
            <span>
              Aucun dispositif ne peut masquer, retarder ou reléguer une
              information de garde, d'urgence ou de santé publique. Le
              module Urgences et la vue des pharmacies de garde restent
              intégralement exempts de tout affichage commercial.
            </span>
          </div>
        </div>
      </section>
    </>
  );
}