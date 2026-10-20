// portail-navbar.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import NotificationsBell from "../components/notifications-bell";
import { useAnnoncesNonLues } from "../../annonces/annoncesVues";

const PortailNavbar = ({ activePage = "" }) => {
  const navigate = useNavigate();
  const { deconnecter } = useAuth();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const annoncesNonLues = useAnnoncesNonLues();

  const navLinks = [
    { label: "Tableau de bord", to: "/portail/medecin-tableau-de-bord", key: "tableau", icon: "fa-chart-line" },
    { label: "Rendez-vous", to: "/portail/medecin-rdv", key: "rdv", icon: "fa-calendar-check" },
    { label: "Demandes", to: "/portail/medecin-demandes", key: "demandes", icon: "fa-bullhorn" },
    { label: "Avis", to: "/portail/medecin-avis", key: "avis", icon: "fa-star" },
    { label: "Annonces", to: "/portail/medecin-annonces", key: "annonces", icon: "fa-bell" },
    { label: "Profil", to: "/portail/medecin-profil", key: "profil", icon: "fa-user-doctor" },
    { label: "Agenda", to: "/portail/medecin-agenda", key: "agenda", icon: "fa-calendar-days" },
    { label: "Site public", to: "/", key: "site", icon: "fa-house" },
  ];

  const handleLogout = async () => {
    await deconnecter();
    navigate("/login", { replace: true });
  };

  return (
    <header className="aps-navbar">
      <div className="container-aps">
        <div className="navbar-inner">
          <Link className="aps-logo" to="/">
            <span className="mark">
              <i className="fa-solid fa-heart-pulse"></i>
            </span>
            ApSa
          </Link>

          <nav aria-label="Navigation du portail">
            <ul className={`aps-nav-links ${menuOuvert ? "is-open" : ""}`}>
              {navLinks.map((link) => (
                <li key={link.key}>
                  <Link
                    to={link.to}
                    className={activePage === link.key ? "text-primary" : ""}
                    onClick={() => setMenuOuvert(false)}
                  >
                    <i className={`fa-solid ${link.icon}`}></i> {link.label}
                    {link.key === "annonces" && annoncesNonLues > 0 && (
                      <span className="nav-badge ms-1">{annoncesNonLues}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="aps-nav-actions">
            {/* Cloche in-app (politique de fonds v2, B5.2) : un clic mène à la page des rendez-vous */}
            <NotificationsBell cheminRdv="/portail/medecin-rdv" />
            <button
              type="button"
              onClick={handleLogout}
              className="btn btn-outline-primary btn-sm-aps"
            >
              <i className="fa-solid fa-arrow-right-from-bracket"></i> Déconnexion
            </button>
            <button
              type="button"
              className="navbar-toggler-aps"
              aria-expanded={menuOuvert}
              aria-label="Ouvrir le menu"
              onClick={() => setMenuOuvert((v) => !v)}
            >
              <i className="fa-solid fa-bars"></i>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default PortailNavbar;