// Page "Abonnements" — grille tarifaire par type d'acteur (médecins,
// cliniques, pharmacies, assurances) et espace annonceurs.

//
// Assurances (guide abonnements v3, §2.2.2) : visiteur -> vitrine lue depuis
// la console admin (<CatalogueAbonnements />, prix indicatifs du pays) ; agent connecté d'une fiche
// -> offres CALCULÉES PAR LE SERVEUR (<SouscriptionAssurance />), seule
// source de vérité pour le montant débité. Un admin peut viser une fiche
// précise via ?type=assurance&service=<service_assurance_id>.
//
// Pharmacies, cliniques et médecins (abonnements de présence) : même
// principe — le gestionnaire connecté de la fiche voit les offres calculées
// par le serveur (<SouscriptionPresence />) ; le visiteur voit le catalogue.
// data/subscriptionPlans.js ne fournit plus que les textes (accroche, palier
// gratuit, notes) et la grille des annonceurs, sans module serveur.

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { clientTypes, getClientType } from "../data/subscriptionPlans";
import { useAuth } from "../context/AuthContext";
import { obtenirMonServiceAssurance } from "../services/abonnementAssuranceService";
import SouscriptionAssurance from "../components/assurances/SouscriptionAssurance";
import { obtenirMonActeur } from "../services/abonnementPresenceService";
import SouscriptionPresence from "../components/abonnements/SouscriptionPresence";
import CatalogueAbonnements from "../components/abonnements/CatalogueAbonnements";
import ConnexionModale from "../components/auth/ConnexionModale";

const TYPE_ASSURANCE = "assurance";
// Type de la vitrine -> type d'acteur des abonnements de présence.
const TYPE_PRESENCE = { pharmacie: "pharmacie", clinique: "structure", medecin: "medecin" };
const CREATION_PRESENCE = { pharmacie: "/pharmacie/creation", structure: "/structure-sante/creation", medecin: "/devenir-medecin" };

function PlanCard({ tier, isBase, onChoisir }) {
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
        onClick={isBase ? undefined : onChoisir}
      >
        {isBase ? "Inclus automatiquement" : "Choisir cette formule"}
      </button>
    </div>
  );
}

export default function Abonnement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const typeDemande = searchParams.get("type");
  const serviceDemande = searchParams.get("service");
  const [selected, setSelected] = useState(
    clientTypes.some((c) => c.id === typeDemande) ? typeDemande : clientTypes[0].id
  );
  const client = getClientType(selected);
  const { status, user } = useAuth();
  const connecte = status === "authenticated";
  const [connexionOuverte, setConnexionOuverte] = useState(false);

  // Formule choisie sur la vitrine (?niveau=&duree=) : gardée dans l'URL
  // pour survivre à la connexion, puis reprise par le composant de
  // souscription qui ouvre directement son récapitulatif.
  const niveauDemande = searchParams.get("niveau");
  const dureeDemandee = Number(searchParams.get("duree")) || null;
  const intention = typeDemande === selected && niveauDemande && dureeDemandee
    ? { niveau_id: niveauDemande, duree_mois: dureeDemandee, libelle: searchParams.get("libelle") }
    : null;

  const oublierIntention = () => {
    setSearchParams((sp) => {
      const suite = new URLSearchParams(sp);
      ["niveau", "duree", "libelle"].forEach((cle) => suite.delete(cle));
      return suite;
    }, { replace: true });
  };

  // Fiche assurance de l'agent connecté : null = inconnue, "" = aucune.
  const [ficheAgent, setFicheAgent] = useState(null);
  const estAdmin = user?.role === "admin" || user?.role === "superadmin";
  const ficheVisee = estAdmin && serviceDemande ? serviceDemande : null;
  const ficheAssurance = ficheVisee ?? ficheAgent;

  useEffect(() => {
    if (selected !== TYPE_ASSURANCE || !connecte || ficheVisee) return undefined;
    let annule = false;
    obtenirMonServiceAssurance()
      .then((d) => { if (!annule) setFicheAgent(d.service_assurance.service_assurance_id); })
      .catch(() => { if (!annule) setFicheAgent(""); });
    return () => { annule = true; };
  }, [selected, connecte, ficheVisee]);

  const souscriptionAssurance = selected === TYPE_ASSURANCE && connecte && !!ficheAssurance;

  // Abonnements de présence : fiche gérée par l'utilisateur connecté pour le
  // type affiché (null = inconnue, "" = aucune).
  const typePresence = TYPE_PRESENCE[selected] ?? null;
  const [fichePresence, setFichePresence] = useState({ type: null, id: null });

  useEffect(() => {
    if (!typePresence || !connecte) return undefined;
    let annule = false;
    obtenirMonActeur(typePresence)
      .then((d) => { if (!annule) setFichePresence({ type: typePresence, id: d.fiche.acteur_id }); })
      .catch(() => { if (!annule) setFichePresence({ type: typePresence, id: "" }); });
    return () => { annule = true; };
  }, [typePresence, connecte]);

  const acteurPresence = fichePresence.type === typePresence ? fichePresence.id : null;
  const souscriptionPresence = !!typePresence && connecte && !!acteurPresence;

  // Connecté, mais aucune fiche du type affiché : invitation à la référencer.
  const sansFiche = connecte && !!intention && (
    typePresence ? acteurPresence === "" : selected === TYPE_ASSURANCE && !ficheVisee && ficheAgent === ""
  );

  const choisirFormule = (offre, choix) => {
    setSearchParams((sp) => {
      const suite = new URLSearchParams(sp);
      suite.set("type", selected);
      suite.set("niveau", offre.niveau_id);
      suite.set("duree", String(choix.duree_mois));
      suite.set("libelle", offre.libelle);
      return suite;
    }, { replace: true });
    if (!connecte) setConnexionOuverte(true);
  };

  const changerType = (type) => {
    setSelected(type);
    oublierIntention();
  };

  return (
    <>
      {/* ============================ EN-TÊTE PAGE ============================ */}
      <section style={{ padding: "2.5rem 0 0" }}>
        <div className="container-aps">
          <span className="eyebrow">Tarification &amp; abonnements</span>
          <h1 style={{ fontSize: "1.9rem", marginTop: ".5rem" }}>
            Les abonnements de la plateforme ApSa
          </h1>
          <p className="mt-2" style={{ maxWidth: "680px" }}>
            ApSa repose sur un annuaire gratuit et exhaustif, complété par des
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
          

          <div className="plan-selector">
            <label className="form-label-aps" htmlFor="client-type">
              <i className="fa-solid fa-user-group" /> Je consulte les abonnements pour :
            </label>
            <select
              id="client-type"
              className="form-select"
              value={selected}
              onChange={(e) => changerType(e.target.value)}
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
                onClick={() => changerType(c.id)}
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

          {sansFiche && (
            <div className="banner-institutionnel mb-3">
              <i className="fa-solid fa-circle-info" />
              <span>
                Pour souscrire{intention.libelle ? ` la formule « ${intention.libelle} »` : ""}, votre compte doit
                être rattaché à la fiche de votre {selected === TYPE_ASSURANCE ? "compagnie ou cabinet" : "structure"}.{" "}
                <Link to={selected === TYPE_ASSURANCE ? "/assurances/creation" : CREATION_PRESENCE[typePresence]}>
                  Référencez-la
                </Link>{" "}
                : dès sa validation par ApSa, vous pourrez activer votre abonnement depuis cette page.
              </span>
            </div>
          )}

          {souscriptionAssurance ? (
            <SouscriptionAssurance
              serviceAssuranceId={ficheAssurance}
              intention={intention}
              onIntentionTraitee={oublierIntention}
            />
          ) : souscriptionPresence ? (
            <SouscriptionPresence
              key={typePresence}
              type={typePresence}
              acteurId={acteurPresence}
              intention={intention}
              onIntentionTraitee={oublierIntention}
            />
          ) : typePresence || selected === TYPE_ASSURANCE ? (
            <CatalogueAbonnements
              key={selected}
              type={typePresence ?? TYPE_ASSURANCE}
              baseTier={client.baseTier}
              onChoisir={choisirFormule}
            />
          ) : (
            <div className="plan-grid">
              {client.baseTier && (
                <PlanCard tier={client.baseTier} isBase />
              )}
              {client.tiers.map((tier) => (
                <PlanCard key={tier.id} tier={tier} isBase={false} />
              ))}
            </div>
          )}

          {connexionOuverte && (
            <ConnexionModale
              titre="Connectez-vous pour souscrire"
              sousTitre={
                <>
                  Votre choix est conservé : vous reprendrez directement au paiement.
                  {intention && (
                    <div>
                      <span className="connexion-modale-formule">
                        <i className="fa-solid fa-star" /> {intention.libelle ?? "Formule"} · {intention.duree_mois} mois
                      </span>
                    </div>
                  )}
                </>
              }
              onFermer={() => setConnexionOuverte(false)}
              onConnecte={() => setConnexionOuverte(false)}
            />
          )}

        </div>
      </section>

      {/* ============================ POUR ALLER PLUS LOIN ============================ */}
      <section className="section-alt" style={{ marginTop: "2.5rem" }}>
        <div className="container-aps">
          <div className="section-head">
            <span className="eyebrow">Pour aller plus loin</span>
            <h2 style={{ fontSize: "1.4rem" }}>
              Une visibilité claire, jamais au détriment de la confiance
            </h2>
            <p>
              Chez ApSa, mettre en valeur votre fiche ne se fait jamais au
              détriment de l'objectivité de l'annuaire ni de la confiance
              des patients.
            </p>
          </div>

          <div className="row g-4">
            <div className="col-md-4">
              <div className="step-card">
                <div className="step-num">A</div>
                <h3>Une fiche plus riche et plus visible</h3>
                <p>
                  Photos, description détaillée, contact direct : votre
                  abonnement enrichit votre présence sur ApSa, y compris pour
                  les professions soumises à des règles strictes en matière
                  de communication. Il n'influence jamais votre classement
                  dans les résultats.
                </p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="step-card">
                <div className="step-num">B</div>
                <h3>Un espace pour les marques partenaires</h3>
                <p>
                  Réservé aux entreprises et marques hors professions de
                  santé réglementées. Leurs visuels apparaissent dans des
                  espaces dédiés, toujours choisis en fonction du contenu
                  de la page.
                </p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="step-card">
                <div className="step-num">C</div>
                <h3>Une mise en avant assumée</h3>
                <p>
                  Pour les acteurs autorisés à communiquer (assureurs,
                  courtiers, ambulances...), une option de mise en avant
                  existe, toujours identifiée clairement par un badge «
                  Sponsorisé » et vérifiée avant publication.
                </p>
              </div>
            </div>
          </div>

          <div className="banner-institutionnel" style={{ marginTop: "1.5rem" }}>
            <i className="fa-solid fa-shield-halved" />
            <span>
              Une règle que nous ne franchissons jamais : rien ne peut
              masquer, retarder ou faire passer au second plan une
              information d'urgence ou de garde. Les pages Urgences et
              Pharmacies de garde restent, en toutes circonstances, à
              l'abri de toute publicité.
            </span>
          </div>
        </div>
      </section>
    </>
  );
}