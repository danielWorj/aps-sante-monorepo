// portail-footer.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";

const PortailFooter = ({ activePage = "" }) => {
  const navigate = useNavigate();
  const { deconnecter } = useAuth();

  const doctor = {
    initials: "EK",
    name: "Dr Émile Kammogne",
    speciality: "Médecine générale · Douala — Akwa",
    verified: true,
  };

  const handleLogout = async () => {
    await deconnecter();
    navigate("/login", { replace: true });
  };

  const navItems = [
    { label: "Rendez-vous", to: "/portail/medecin-rdv", key: "rdv", badge: 3 },
    { label: "Profil", to: "/portail/medecin-profil", key: "profil", badge: null },
    { label: "Agenda", to: "/portail/medecin-agenda", key: "agenda", badge: null },
    { label: "Voir ma fiche publique", to: "/", key: "fiche", badge: null },
    { label: "Aide & support", to: "#", key: "aide", badge: null },
  ];

  return (
    <footer className="portail-footer">
      {/* Carte médecin */}
      <div className="portail-footer__doctor-card">
        <div className="portail-footer__avatar">{doctor.initials}</div>
        <div className="portail-footer__doctor-info">
          <span className="portail-footer__doctor-name">{doctor.name}</span>
          <span className="portail-footer__doctor-speciality">{doctor.speciality}</span>
          {doctor.verified && (
            <span className="portail-footer__verified">Vérifié à l'Ordre</span>
          )}
        </div>
      </div>

      {/* Navigation pied */}
      <nav className="portail-footer__nav">
        {navItems.map((item) => (
          <Link
            key={item.key}
            to={item.to}
            className={`portail-footer__link ${
              activePage === item.key ? "portail-footer__link--active" : ""
            }`}
          >
            {item.label}
            {item.badge && <span className="portail-footer__badge">{item.badge}</span>}
          </Link>
        ))}
        <button
          type="button"
          onClick={handleLogout}
          className="portail-footer__link"
        >
          Déconnexion
        </button>
      </nav>

      {/* Statut & portefeuille */}
      <div className="portail-footer__status">
        <span className="portail-footer__availability">
          Disponible aujourd'hui
        </span>
        <span className="portail-footer__visibility">
          Visible sur votre fiche publique
        </span>
      </div>

      <div className="portail-footer__wallet">
        <span className="portail-footer__wallet-label">Portefeuille APS</span>
        <span className="portail-footer__wallet-amount">186 500 FCFA</span>
      </div>

      {/* Copyright */}
      <div className="portail-footer__legal">
        <p>© 2026 APS — Espace médecin · Paiement sous séquestre à chaque étape</p>
        <div className="portail-footer__legal-links">
          <a href="#">Support</a>
          <a href="#">CGU</a>
          <a href="#">Confidentialité</a>
        </div>
      </div>
    </footer>
  );
};

export default PortailFooter;
