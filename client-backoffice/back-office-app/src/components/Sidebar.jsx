import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/* ==========================================================================
   Sidebar.jsx
   Portage React du menu latéral APS (ex sidebar.js).

   - Le surlignage du lien actif est géré par <NavLink> (react-router-dom),
     donc plus besoin de data-page / data-key : la route courante suffit.
   - Le nom/rôle du pied de menu proviennent de la session réelle
     (useAuth().user) plutôt que de props statiques.
   - Fermeture du menu mobile : on retire la classe "is-mobile-open" posée
     sur #apsApp par Navbar.jsx (voir handleLinkClick).

   - Structure des groupes :
     Chaque section (`group`) peut contenir :
       - `entities` : des sous-groupes par entité (fiche + éventuels enfants
         Publicité / Avis), quand une rubrique de l'annuaire a besoin de ces
         vues.
       - `items`    : des liens simples, sans sous-regroupement.

   - IMPORTANT : ce menu est calqué sur les routes RÉELLEMENT déclarées dans
     router.jsx (espace privé, RequireAuth > PrivateLayout). Les rubriques
     pour lesquelles aucune route n'existe encore côté router.jsx sont
     laissées en commentaire ci-dessous, avec la même logique que les
     routes commentées dans router.jsx : à décommenter le jour où la page
     et la route correspondantes seront créées.
   ========================================================================== */

const APS_MENU = [
  {
    group: null,
    items: [
      { key: "dashboard", label: "Tableau de bord", icon: "fa-solid fa-gauge-high", to: "/" }
    ]
  },
 
  {
    group: "Annuaire & Utilisateurs",
    entities: [
      {
        key: "structure-sante",
        label: "Structures & hôpitaux",
        icon: "fa-solid fa-hospital",
        to: "/structure-sante",
        // Abonnements de présence des centres de santé (cliniques, hôpitaux, laboratoires)
        children: [
          { key: "abonnements-presence-structure", label: "Abonnements", icon: "fa-solid fa-id-card-clip", to: "/abonnements-presence/structure" },
          { key: "niveaux-abonnement-presence-structure", label: "Niveaux", icon: "fa-solid fa-layer-group", to: "/niveaux-abonnement-presence/structure" },
          { key: "tarifs-abonnement-presence-structure", label: "Tarifs & paramètres", icon: "fa-solid fa-tags", to: "/tarifs-abonnement-presence/structure" },
          { key: "paiements-abonnement-presence-structure", label: "Paiements", icon: "fa-solid fa-receipt", to: "/paiements-abonnement-presence/structure" }
        ]
      },
      {
        key: "pharmacies",
        label: "Pharmacies",
        icon: "fa-solid fa-mortar-pestle",
        to: "/pharmacie",
        children: [
          { key: "avis-pharmacie", label: "Avis", icon: "fa-solid fa-star-half-stroke", to: "/avis-pharmacie" },
          // Abonnements de présence des pharmacies
          { key: "abonnements-presence-pharmacie", label: "Abonnements", icon: "fa-solid fa-id-card-clip", to: "/abonnements-presence/pharmacie" },
          { key: "niveaux-abonnement-presence-pharmacie", label: "Niveaux", icon: "fa-solid fa-layer-group", to: "/niveaux-abonnement-presence/pharmacie" },
          { key: "tarifs-abonnement-presence-pharmacie", label: "Tarifs & paramètres", icon: "fa-solid fa-tags", to: "/tarifs-abonnement-presence/pharmacie" },
          { key: "paiements-abonnement-presence-pharmacie", label: "Paiements", icon: "fa-solid fa-receipt", to: "/paiements-abonnement-presence/pharmacie" }
          // Pas de /publicite-pharmacie dédiée : la publicité pharmacie
          // passe par la rubrique "Publicité" générique plus bas.
        ]
      },
      {
        // Nouveau : /medecin, /avis-medecin, /abonnement-medecin et
        // /ordonnance sont bien déclarées dans router.jsx -> l'entité
        // remplace l'ancien placeholder "professionnels" (jamais routé).
        key: "medecin",
        label: "Médecins",
        icon: "fa-solid fa-user-doctor",
        to: "/medecin",
        children: [
          { key: "avis-medecin", label: "Avis", icon: "fa-solid fa-star-half-stroke", to: "/avis-medecin" },
          // Abonnements de présence des médecins ; l'obligation de souscrire
          // s'active ou se désactive par pays dans « Tarifs & paramètres ».
          // (L'ancien écran /abonnement-medecin reste routé, hors menu.)
          { key: "abonnements-presence-medecin", label: "Abonnements", icon: "fa-solid fa-id-card-clip", to: "/abonnements-presence/medecin" },
          { key: "niveaux-abonnement-presence-medecin", label: "Niveaux", icon: "fa-solid fa-layer-group", to: "/niveaux-abonnement-presence/medecin" },
          { key: "tarifs-abonnement-presence-medecin", label: "Tarifs & activation", icon: "fa-solid fa-toggle-on", to: "/tarifs-abonnement-presence/medecin" },
          { key: "paiements-abonnement-presence-medecin", label: "Paiements", icon: "fa-solid fa-receipt", to: "/paiements-abonnement-presence/medecin" },
          { key: "ordonnance", label: "Ordonnances", icon: "fa-solid fa-file-prescription", to: "/ordonnance" },
          { key: "retraits", label: "Retraits", icon: "fa-solid fa-money-bill-transfer", to: "/retraits" }
        ]
      }

      // Entités prévues côté maquette mais sans route dans router.jsx :
      // {
      //   key: "assureurs",
      //   label: "Assureurs & courtiers",
      //   icon: "fa-solid fa-shield-heart",
      //   to: "/assureurs",
      //   children: [
      //     { key: "publicite-assureurs", label: "Publicité", icon: "fa-solid fa-bullhorn", to: "/publicite-assureurs" },
      //     { key: "avis-assureurs", label: "Avis", icon: "fa-solid fa-star-half-stroke", to: "/avis-assureurs" }
      //   ]
      // },
      // {
      //   key: "services-connexes",
      //   label: "Services connexes",
      //   icon: "fa-solid fa-truck-medical",
      //   to: "/services-connexes",
      //   children: [
      //     { key: "publicite-services-connexes", label: "Publicité", icon: "fa-solid fa-bullhorn", to: "/publicite-services-connexes" },
      //     { key: "avis-services-connexes", label: "Avis", icon: "fa-solid fa-star-half-stroke", to: "/avis-services-connexes" }
      //   ]
      // }
    ],
    items: [
      { key: "utilisateurs", label: "Utilisateurs", icon: "fa-solid fa-users", to: "/utilisateurs" },
      { key: "messages-contact", label: "Messages de contact", icon: "fa-solid fa-envelope-open-text", to: "/messages-contact" }
    ]
  },
   {
    group: "Mise en Relation",
    entities: [
      {
        key: "rendez-vous",
        label: "Rendez-vous",
        icon: "fa-solid fa-calendar-check",
        to: "/rendez-vous"
      },
      {
        key: "offres-rdv",
        label: "Demandes de RDV",
        icon: "fa-solid fa-bullhorn",
        to: "/offres-rdv"
      },
      {
        key: "parametre-delai-confirmation",
        label: "Délai de confirmation",
        icon: "fa-solid fa-hourglass-start",
        to: "/parametre-delai-confirmation"
      }
    ]
  },
  {
    group: "Finance",
    items: [
      { key: "remboursements-campay", label: "Remboursements CamPay", icon: "fa-solid fa-rotate-left", to: "/remboursements-campay" },
      { key: "frais-agregateur", label: "Frais d'agrégateur", icon: "fa-solid fa-percent", to: "/frais-agregateur" },
      { key: "lignes-tarifaires", label: "Commissions APS (CM / CP)", icon: "fa-solid fa-scale-balanced", to: "/lignes-tarifaires" },
      { key: "parametre-amende", label: "Amendes médecins", icon: "fa-solid fa-gavel", to: "/parametre-amende" },
      { key: "parametre-delai-liberation", label: "Délai de libération (T)", icon: "fa-solid fa-hourglass-half", to: "/parametre-delai-liberation" }
    ]
  },

   {
    group: "Assurances & Services",
    entities: [
      {
        key: "assurances",
        label: "Assurances",
        icon: "fa-solid fa-shield-alt",
        to: "/assurances",
        // Abonnements des assurances (guide abonnements v3, §3)
        children: [
          { key: "abonnements-assurance", label: "Abonnements", icon: "fa-solid fa-id-card-clip", to: "/abonnements-assurance" },
          { key: "niveaux-abonnement-assurance", label: "Niveaux", icon: "fa-solid fa-layer-group", to: "/niveaux-abonnement-assurance" },
          { key: "tarifs-abonnement-assurance", label: "Tarifs & paramètres", icon: "fa-solid fa-tags", to: "/tarifs-abonnement-assurance" },
          { key: "paiements-abonnement-assurance", label: "Paiements", icon: "fa-solid fa-receipt", to: "/paiements-abonnement-assurance" }
        ]
      }
    ]
  },
  {
    // Correspond aux 3 routes /publicite, /emplacement-publicitaire et
    // /forfait-publicitaire déclarées dans router.jsx (bloc "PUBLICITE").
    group: "Publicité",
    items: [
      { key: "publicite", label: "Réservations publicitaires", icon: "fa-solid fa-bullhorn", to: "/publicite" },
      { key: "emplacement-publicitaire", label: "Emplacements publicitaires", icon: "fa-solid fa-map-location-dot", to: "/emplacement-publicitaire" },
      { key: "forfait-publicitaire", label: "Forfaits publicitaires", icon: "fa-solid fa-tags", to: "/forfait-publicitaire" }
    ]
  },
   {
    // Correspond aux 3 routes /publicite, /emplacement-publicitaire et
    // /forfait-publicitaire déclarées dans router.jsx (bloc "PUBLICITE").
    group: "Annonces",
    items: [
      { key: "annonces", label: "Annonces", icon: "fa-solid fa-bullhorn", to: "/annonces" }
      ]
  },
  {
    group: "Urgences",
    entities: [
      {
        key: "urgences",
        label: "Urgences",
        icon: "fa-solid fa-ambulance",
        to: "/urgences"
      }
    ]
  },
  {
    group: "Configuration",
    items: [
      { key: "referentiel-pays", label: "Référentiel pays", icon: "fa-solid fa-earth-africa", to: "/referentiel" }, 
      { key: "moyen-paiement", label: "Moyens de paiement", icon: "fa-solid fa-credit-card", to: "/moyen-paiement" },
      { key: "apk", label: "Gestion APK", icon: "fa-solid fa-mobile-alt", to: "/apk" },
      { key: "whatsapp", label: "WhatsApp", icon: "fa-brands fa-whatsapp", to: "/whatsapp" },
      { key: "sms", label: "SMS", icon: "fa-solid fa-comment-sms", to: "/sms" }
      // { key: "parametrage-local", label: "Paramétrage local", icon: "fa-solid fa-sliders", to: "/parametrage-local" },
      // { key: "equipe-admin", label: "Équipe & rôles admin", icon: "fa-solid fa-user-shield", to: "/equipe-admin" }
    ]
  }

  // Groupes prévus mais dont AUCUNE route n'existe encore dans router.jsx :
  // "Validation & Conformité"  -> /validation, /moderation, /signalements
  // "Opérations"               -> /gardes, /paiements, /abonnements
  // "Pilotage"                 -> /reporting, /securite
  // À réintroduire dès que les pages + routes seront ajoutées dans router.jsx.
];

function closeMobileMenu() {
  var appRoot = document.getElementById("apsApp");
  if (appRoot) appRoot.classList.remove("is-mobile-open");
}

/* Trouve la clé de l'entité (Structures, Pharmacies, ...) dont la fiche
   ou l'un des sous-liens (Avis, ...) correspond à la route courante,
   pour l'ouvrir automatiquement au chargement / à la navigation. */
function findActiveEntityKey(pathname) {
  for (const section of APS_MENU) {
    if (!section.entities) continue;
    for (const entity of section.entities) {
      if (entity.to === pathname) return entity.key;
      if (entity.children && entity.children.some((c) => c.to === pathname)) {
        return entity.key;
      }
    }
  }
  return null;
}

function NavItem({ item }) {
  return (
    <li>
      <NavLink
        to={item.to}
        end={item.to === "/"}
        className={({ isActive }) =>
          "aps-nav__link" + (isActive ? " is-active" : "")
        }
        onClick={closeMobileMenu}
      >
        <i className={item.icon} />
        <span>{item.label}</span>
        {item.badge ? <span className="aps-nav__badge">{item.badge}</span> : null}
      </NavLink>
    </li>
  );
}

/* Entité de l'annuaire : la fiche principale est le lien de tête, repliée
   par défaut ; les enfants (Avis, etc.) apparaissent en sous-liste au clic
   sur le chevron (ou automatiquement si l'un d'eux est la page active).
   Si l'entité n'a pas de children, aucun chevron n'est affiché. */
function NavEntity({ entity, isOpen, onToggle }) {
  const hasChildren = entity.children && entity.children.length > 0;

  return (
    <li className="aps-nav-entity">
      <div className="aps-nav-entity__row">
        <NavLink
          to={entity.to}
          className={({ isActive }) =>
            "aps-nav__link aps-nav-entity__link" + (isActive ? " is-active" : "")
          }
          onClick={closeMobileMenu}
        >
          <i className={entity.icon} />
          <span>{entity.label}</span>
        </NavLink>

        {hasChildren ? (
          <button
            type="button"
            className={"aps-nav-entity__toggle" + (isOpen ? " is-open" : "")}
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label={(isOpen ? "Réduire " : "Développer ") + entity.label}
          >
            <i className="fa-solid fa-chevron-down" />
          </button>
        ) : null}
      </div>

      {hasChildren ? (
        <div className={"aps-nav-entity__children" + (isOpen ? " is-open" : "")}>
          <div className="aps-nav-entity__children-inner">
            <ul className="aps-nav__list aps-nav__list--sub">
              {entity.children.map((child) => (
                <NavItem key={child.key} item={child} />
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function NavSection({ section, openEntity, onToggleEntity }) {
  return (
    <div className="aps-nav-group">
      {section.group ? <div className="aps-nav-label">{section.group}</div> : null}

      {section.entities ? (
        <ul className="aps-nav__list aps-nav-entities">
          {section.entities.map((entity) => (
            <NavEntity
              key={entity.key}
              entity={entity}
              isOpen={openEntity === entity.key}
              onToggle={() => onToggleEntity(entity.key)}
            />
          ))}
        </ul>
      ) : null}

      {section.items && section.items.length ? (
        <ul className="aps-nav__list">
          {section.items.map((item) => (
            <NavItem key={item.key} item={item} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();

  // Une seule entité ouverte à la fois ; celle contenant la route active
  // s'ouvre automatiquement.
  const [openEntity, setOpenEntity] = useState(() =>
    findActiveEntityKey(location.pathname)
  );

  useEffect(() => {
    const active = findActiveEntityKey(location.pathname);
    if (active) setOpenEntity(active);
  }, [location.pathname]);

  const toggleEntity = (key) => {
    setOpenEntity((prev) => (prev === key ? null : key));
  };

  const userName = user ? `${user.prenom} ${user.nom}`.trim() : "…";
  const userRole = user?.role ?? "";

  const initials = userName
    .split(" ")
    .filter(Boolean)
    .map(function (part) { return part.charAt(0); })
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <aside className="aps-sidebar" id="apsSidebar">
        <div className="aps-sidebar__brand">
          <div className="aps-sidebar__brand-mark">
            <i className="fa-solid fa-heart-pulse" />
          </div>
          <div className="aps-sidebar__brand-text">
            APS
            <small>Back-office admin</small>
          </div>
        </div>

        <nav className="aps-sidebar__scroll">
          {APS_MENU.map((section, idx) => (
            <NavSection
              key={section.group || "root-" + idx}
              section={section}
              openEntity={openEntity}
              onToggleEntity={toggleEntity}
            />
          ))}
        </nav>

        <div className="aps-sidebar__foot">
          <div className="aps-sidebar__foot-avatar">{initials}</div>
          <div className="aps-sidebar__foot-text">
            <div className="name">{userName}</div>
            <div className="role">{userRole}</div>
          </div>
        </div>
      </aside>

      <div
        className="aps-sidebar-overlay"
        id="apsSidebarOverlay"
        onClick={closeMobileMenu}
      />
    </>
  );
}

export { APS_MENU };