// patient.portail-navbar.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";

const PatientPortailNavbar = ({ activePage = "" }) => {
  const navigate = useNavigate();
  const { deconnecter } = useAuth();
  const [menuOuvert, setMenuOuvert] = useState(false);

  const navLinks = [
    { label: "Rendez-vous", to: "/portail/patient-rdv", key: "rdv", icon: "fa-calendar-check" },
    { label: "Messages", to: "/portail/patient-messages", key: "messages", icon: "fa-comment-medical" },
    { label: "Annonces", to: "/portail/patient-annonces", key: "annonces", icon: "fa-bullhorn" },
    { label: "Profil", to: "/portail/patient-profil", key: "profil", icon: "fa-user" },
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
            APS
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
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="aps-nav-actions">
            <Link to="#" className="btn btn-ghost btn-sm-aps btn-icon" aria-label="Notifications">
              <i className="fa-solid fa-bell"></i>
            </Link>
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

export default PatientPortailNavbar;