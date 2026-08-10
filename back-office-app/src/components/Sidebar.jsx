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
        to: "/structure-sante"
        // Pas de /publicite-structure-sante ni /avis-structure-sante dans
        // router.jsx pour l'instant -> pas de "children" ici.
      },
      {
        key: "pharmacies",
        label: "Pharmacies",
        icon: "fa-solid fa-mortar-pestle",
        to: "/pharmacie",
        children: [
          { key: "avis-pharmacie", label: "Avis", icon: "fa-solid fa-star-half-stroke", to: "/avis-pharmacie" }
          // Pas de /publicite-pharmacie dédiée : la publicité pharmacie
          // passe par la rubrique "Publicité" générique plus bas.
        ]
      }

      // Entités prévues côté maquette mais sans route dans router.jsx :
      // {
      //   key: "professionnels",
      //   label: "Professionnels de santé",
      //   icon: "fa-solid fa-user-doctor",
      //   to: "/professionnels",
      //   children: [
      //     { key: "publicite-professionnels", label: "Publicité", icon: "fa-solid fa-bullhorn", to: "/publicite-professionnels" },
      //     { key: "avis-professionnels", label: "Avis", icon: "fa-solid fa-star-half-stroke", to: "/avis-professionnels" }
      //   ]
      // },
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
      { key: "utilisateurs", label: "Utilisateurs", icon: "fa-solid fa-users", to: "/utilisateurs" }
    ]
  },
   {
    group: "Assurances & Services",
    entities: [
      {
        key: "assurances",
        label: "Assurances",
        icon: "fa-solid fa-shield-alt",
        to: "/assurances"
      }
    ]
  },
  {
    // Correspond aux 3 routes /publicite, /emplacement-publicitaire et
    // /forfait-publicitaire déclarées dans router.jsx (bloc "PUBLICITE").
    group: "Publicité",
    items: [
      { key: "publicite", label: "Campagnes publicitaires", icon: "fa-solid fa-bullhorn", to: "/publicite" },
      { key: "emplacement-publicitaire", label: "Emplacements publicitaires", icon: "fa-solid fa-map-location-dot", to: "/emplacement-publicitaire" },
      { key: "forfait-publicitaire", label: "Forfaits publicitaires", icon: "fa-solid fa-tags", to: "/forfait-publicitaire" }
    ]
  },
  {
    group: "Configuration",
    items: [
      { key: "referentiel-pays", label: "Référentiel pays", icon: "fa-solid fa-earth-africa", to: "/referentiel" }
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