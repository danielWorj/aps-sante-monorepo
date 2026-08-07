import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/* ==========================================================================
   Sidebar.jsx
   Portage React du menu latéral APS (ex sidebar.js).

   - Le surlignage du lien actif est géré par <NavLink> (react-router-dom),
     donc plus besoin de data-page / data-key : la route courante suffit.
   - Adaptez les champs `to` ci-dessous si vos routes diffèrent des noms
     de fichiers .html d'origine.
   - Fermeture du menu mobile : on retire la classe "is-mobile-open" posée
     sur #apsApp par Navbar.jsx (voir handleLinkClick).
   - Le nom/rôle du pied de menu proviennent de la session réelle
     (useAuth().user) plutôt que de props statiques.
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
    items: [
      { key: "professionnels", label: "Professionnels de santé", icon: "fa-solid fa-user-doctor", to: "/professionnels" },
      { key: "structures", label: "Structures & hôpitaux", icon: "fa-solid fa-hospital", to: "/structures" },
      { key: "pharmacies", label: "Pharmacies", icon: "fa-solid fa-mortar-pestle", to: "/pharmacies" },
      { key: "assureurs", label: "Assureurs & courtiers", icon: "fa-solid fa-shield-heart", to: "/assureurs" },
      { key: "services-connexes", label: "Services connexes", icon: "fa-solid fa-truck-medical", to: "/services-connexes" },
      { key: "utilisateurs", label: "Utilisateurs", icon: "fa-solid fa-users", to: "/utilisateurs" }
    ]
  },
  {
    group: "Validation & Conformité",
    items: [
      { key: "validation", label: "Validation des inscriptions", icon: "fa-solid fa-file-signature", to: "/validation", badge: "8" },
      { key: "moderation", label: "Modération des fiches", icon: "fa-solid fa-flag", to: "/moderation" },
      { key: "signalements", label: "Signalements de fraude", icon: "fa-solid fa-triangle-exclamation", to: "/signalements", badge: "3" }
    ]
  },
  {
    group: "Opérations",
    items: [
      { key: "gardes", label: "Plannings de garde", icon: "fa-solid fa-calendar-days", to: "/gardes" },
      { key: "paiements", label: "Paiements & escrow", icon: "fa-solid fa-money-check-dollar", to: "/paiements" },
      { key: "abonnements", label: "Abonnements & boost", icon: "fa-solid fa-star", to: "/abonnements" }
    ]
  },
  {
    group: "Pilotage",
    items: [
      { key: "reporting", label: "Reporting & KPI", icon: "fa-solid fa-chart-line", to: "/reporting" },
      { key: "securite", label: "Sécurité & audit", icon: "fa-solid fa-shield-halved", to: "/securite" }
    ]
  },
  {
    group: "Configuration",
    items: [
      { key: "referentiel-pays", label: "Référentiel pays", icon: "fa-solid fa-earth-africa", to: "/referentiel" },
      { key: "parametrage-local", label: "Paramétrage local", icon: "fa-solid fa-sliders", to: "/parametrage-local" },
      { key: "equipe-admin", label: "Équipe & rôles admin", icon: "fa-solid fa-user-shield", to: "/equipe-admin" }
    ]
  }
];

function closeMobileMenu() {
  var appRoot = document.getElementById("apsApp");
  if (appRoot) appRoot.classList.remove("is-mobile-open");
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

function NavSection({ section }) {
  return (
    <div className="aps-nav-group">
      {section.group ? <div className="aps-nav-label">{section.group}</div> : null}
      <ul className="aps-nav__list">
        {section.items.map((item) => (
          <NavItem key={item.key} item={item} />
        ))}
      </ul>
    </div>
  );
}

export default function Sidebar() {
  const { user } = useAuth();
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
            <NavSection key={section.group || "root-" + idx} section={section} />
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