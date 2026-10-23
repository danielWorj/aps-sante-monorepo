import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { estRouteSuperadmin, estSuperadmin } from "../utils/roles";

/* ==========================================================================
   Sidebar.jsx
   Portage React du menu latéral APS (ex sidebar.js).

   - Le surlignage du lien actif est géré par <NavLink> (react-router-dom) :
     la route courante suffit.
   - Le nom/rôle du pied de menu proviennent de la session (useAuth().user).
   - Fermeture du menu mobile : on retire la classe "is-mobile-open" posée
     sur #apsApp par Navbar.jsx (voir closeMobileMenu).

   - Structure des groupes : chaque section (`group`) contient
       - `entities` : liens de tête repliables, avec des enfants (Avis,
         Niveaux, Tarifs, Paiements…) affichés au clic sur le chevron ;
       - `items`    : des liens simples.

   - Ordre des sections, du quotidien vers le paramétrage :
       1. Tableau de bord
       2. Activité                  → ce qui se passe sur la plateforme
       3. Annuaire de santé         → les acteurs référencés et leurs avis
       4. Utilisateurs & support
       5. Abonnements               → un bloc par type d'acteur abonné
       6. Finance                   → flux d'argent et commissions
       7. Publicité & communication
       8. Règles métier             → délais et sanctions appliqués aux RDV
       9. Configuration             → pays, documents légaux, canaux, appli
     Les écrans réservés au superadmin sont masqués aux admins pays par
     menuPour() (voir ROUTES_SUPERADMIN).

   - IMPORTANT : ce menu est calqué sur les routes déclarées dans
     router.jsx. L'ancien écran /abonnement-medecin reste routé, hors menu.
   ========================================================================== */

const APS_MENU = [
  {
    group: null,
    items: [
      { key: "dashboard", label: "Tableau de bord", icon: "fa-solid fa-gauge-high", to: "/" }
    ]
  },
  {
    group: "Activité",
    items: [
      { key: "rendez-vous", label: "Rendez-vous", icon: "fa-solid fa-calendar-check", to: "/rendez-vous" },
      { key: "offres-rdv", label: "Demandes de RDV", icon: "fa-solid fa-hand-holding-medical", to: "/offres-rdv" },
      { key: "ordonnance", label: "Ordonnances", icon: "fa-solid fa-file-prescription", to: "/ordonnance" },
      { key: "urgences", label: "Urgences", icon: "fa-solid fa-truck-medical", to: "/urgences" }
    ]
  },
  {
    group: "Annuaire de santé",
    entities: [
      {
        key: "medecin",
        label: "Médecins",
        icon: "fa-solid fa-user-doctor",
        to: "/medecin",
        children: [
          { key: "avis-medecin", label: "Avis", icon: "fa-solid fa-star-half-stroke", to: "/avis-medecin" }
        ]
      },
      {
        key: "structure-sante",
        label: "Structures & hôpitaux",
        icon: "fa-solid fa-hospital",
        to: "/structure-sante"
      },
      {
        key: "pharmacies",
        label: "Pharmacies",
        icon: "fa-solid fa-mortar-pestle",
        to: "/pharmacie",
        children: [
          { key: "avis-pharmacie", label: "Avis", icon: "fa-solid fa-star-half-stroke", to: "/avis-pharmacie" }
        ]
      },
      {
        key: "laboratoires",
        label: "Laboratoires",
        icon: "fa-solid fa-flask-vial",
        to: "/laboratoires",
        children: [
          { key: "avis-laboratoire", label: "Avis", icon: "fa-solid fa-star-half-stroke", to: "/avis-laboratoire" }
        ]
      },
      {
        key: "assurances",
        label: "Assurances",
        icon: "fa-solid fa-shield-heart",
        to: "/assurances"
      }
    ]
  },
  {
    group: "Utilisateurs & support",
    items: [
      { key: "utilisateurs", label: "Utilisateurs", icon: "fa-solid fa-users", to: "/utilisateurs" },
      { key: "messages-contact", label: "Messages de contact", icon: "fa-solid fa-envelope-open-text", to: "/messages-contact" }
    ]
  },
  {
    // Le lien de tête ouvre la liste des souscriptions ; le chevron donne
    // accès aux niveaux, tarifs et paiements du même type d'acteur.
    group: "Abonnements",
    entities: [
      {
        key: "abonnements-medecin",
        label: "Médecins",
        icon: "fa-solid fa-user-doctor",
        to: "/abonnements-presence/medecin",
        children: [
          { key: "niveaux-abonnement-presence-medecin", label: "Niveaux", icon: "fa-solid fa-layer-group", to: "/niveaux-abonnement-presence/medecin" },
          // L'obligation de souscrire s'active ou se désactive par pays ici.
          { key: "tarifs-abonnement-presence-medecin", label: "Tarifs & activation", icon: "fa-solid fa-toggle-on", to: "/tarifs-abonnement-presence/medecin" },
          { key: "paiements-abonnement-presence-medecin", label: "Paiements", icon: "fa-solid fa-receipt", to: "/paiements-abonnement-presence/medecin" }
        ]
      },
      {
        // Centres de santé (cliniques, hôpitaux, laboratoires)
        key: "abonnements-structure",
        label: "Structures de santé",
        icon: "fa-solid fa-hospital",
        to: "/abonnements-presence/structure",
        children: [
          { key: "niveaux-abonnement-presence-structure", label: "Niveaux", icon: "fa-solid fa-layer-group", to: "/niveaux-abonnement-presence/structure" },
          { key: "tarifs-abonnement-presence-structure", label: "Tarifs & paramètres", icon: "fa-solid fa-tags", to: "/tarifs-abonnement-presence/structure" },
          { key: "paiements-abonnement-presence-structure", label: "Paiements", icon: "fa-solid fa-receipt", to: "/paiements-abonnement-presence/structure" }
        ]
      },
      {
        key: "abonnements-pharmacie",
        label: "Pharmacies",
        icon: "fa-solid fa-mortar-pestle",
        to: "/abonnements-presence/pharmacie",
        children: [
          { key: "niveaux-abonnement-presence-pharmacie", label: "Niveaux", icon: "fa-solid fa-layer-group", to: "/niveaux-abonnement-presence/pharmacie" },
          { key: "tarifs-abonnement-presence-pharmacie", label: "Tarifs & paramètres", icon: "fa-solid fa-tags", to: "/tarifs-abonnement-presence/pharmacie" },
          { key: "paiements-abonnement-presence-pharmacie", label: "Paiements", icon: "fa-solid fa-receipt", to: "/paiements-abonnement-presence/pharmacie" }
        ]
      },
      {
        // Abonnements des assurances (guide abonnements v3, §3)
        key: "abonnements-assurance",
        label: "Assurances",
        icon: "fa-solid fa-shield-heart",
        to: "/abonnements-assurance",
        children: [
          { key: "niveaux-abonnement-assurance", label: "Niveaux", icon: "fa-solid fa-layer-group", to: "/niveaux-abonnement-assurance" },
          { key: "tarifs-abonnement-assurance", label: "Tarifs & paramètres", icon: "fa-solid fa-tags", to: "/tarifs-abonnement-assurance" },
          { key: "paiements-abonnement-assurance", label: "Paiements", icon: "fa-solid fa-receipt", to: "/paiements-abonnement-assurance" }
        ]
      }
    ]
  },
  {
    group: "Finance",
    items: [
      { key: "retraits", label: "Retraits médecins", icon: "fa-solid fa-money-bill-transfer", to: "/retraits" },
      { key: "remboursements-campay", label: "Remboursements CamPay", icon: "fa-solid fa-rotate-left", to: "/remboursements-campay" },
      { key: "lignes-tarifaires", label: "Commissions APS (CM / CP)", icon: "fa-solid fa-scale-balanced", to: "/lignes-tarifaires" },
      { key: "frais-agregateur", label: "Frais d'agrégateur", icon: "fa-solid fa-percent", to: "/frais-agregateur" },
      { key: "moyen-paiement", label: "Moyens de paiement", icon: "fa-solid fa-credit-card", to: "/moyen-paiement" }
    ]
  },
  {
    group: "Publicité & communication",
    items: [
      { key: "publicite", label: "Réservations publicitaires", icon: "fa-solid fa-bullhorn", to: "/publicite" },
      { key: "emplacement-publicitaire", label: "Emplacements publicitaires", icon: "fa-solid fa-map-location-dot", to: "/emplacement-publicitaire" },
      { key: "forfait-publicitaire", label: "Forfaits publicitaires", icon: "fa-solid fa-tags", to: "/forfait-publicitaire" },
      { key: "annonces", label: "Annonces", icon: "fa-solid fa-newspaper", to: "/annonces" }
    ]
  },
  {
    group: "Règles métier",
    items: [
      { key: "parametre-delai-confirmation", label: "Délai de confirmation", icon: "fa-solid fa-hourglass-start", to: "/parametre-delai-confirmation" },
      { key: "parametre-delai-liberation", label: "Délai de libération (T)", icon: "fa-solid fa-hourglass-half", to: "/parametre-delai-liberation" },
      { key: "parametre-amende", label: "Amendes médecins", icon: "fa-solid fa-gavel", to: "/parametre-amende" }
    ]
  },
  {
    group: "Configuration",
    items: [
      { key: "referentiel-pays", label: "Référentiel pays", icon: "fa-solid fa-earth-africa", to: "/referentiel" },
      { key: "documents-legaux", label: "Documents légaux", icon: "fa-solid fa-file-contract", to: "/documents-legaux" },
      { key: "whatsapp", label: "WhatsApp", icon: "fa-brands fa-whatsapp", to: "/whatsapp" },
      { key: "sms", label: "SMS", icon: "fa-solid fa-comment-sms", to: "/sms" },
      { key: "apk", label: "Gestion APK", icon: "fa-solid fa-mobile-screen", to: "/apk" }
    ]
  }
];

/* Menu vu par l'utilisateur connecté : un admin (périmètre pays) ne voit
   pas les écrans communs à tous les pays (voir ROUTES_SUPERADMIN). */
function menuPour(user) {
  if (estSuperadmin(user)) return APS_MENU;
  const visible = (lien) => !estRouteSuperadmin(lien.to);
  return APS_MENU.map((section) => ({
    ...section,
    entities: section.entities
      ?.filter(visible)
      .map((e) => ({ ...e, children: e.children?.filter(visible) })),
    items: section.items?.filter(visible),
  })).filter((section) => section.entities?.length || section.items?.length);
}

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
          {menuPour(user).map((section, idx) => (
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
            <div className="role">
              {userRole}
              {user?.role === "admin" && user?.pays?.nom ? ` · ${user.pays.nom}` : ""}
            </div>
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