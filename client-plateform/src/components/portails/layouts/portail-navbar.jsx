// portail-navbar.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";

const PortailNavbar = ({ activePage = "" }) => {
  const navigate = useNavigate();
  const { deconnecter } = useAuth();

  const navLinks = [
    { label: "Rendez-vous", to: "/portail/medecin-rdv", key: "rdv" },
    { label: "Profil", to: "/portail/medecin-profil", key: "profil" },
    { label: "Agenda", to: "/portail/medecin-agenda", key: "agenda" },
  ];

  const handleLogout = async () => {
    await deconnecter();
    navigate("/login", { replace: true });
  };

  return (
    <header className="portail-navbar">
      <div className="portail-navbar__brand">
        <Link to="/" className="portail-navbar__logo">
          APS
        </Link>
      </div>

      <nav className="portail-navbar__nav">
        {navLinks.map((link) => (
          <Link
            key={link.key}
            to={link.to}
            className={`portail-navbar__link ${
              activePage === link.key ? "portail-navbar__link--active" : ""
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="portail-navbar__actions">
        <Link to="/" className="portail-navbar__link">
          Site public
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="portail-navbar__link portail-navbar__link--logout"
        >
          Déconnexion
        </button>
      </div>
    </header>
  );
};

export default PortailNavbar;
