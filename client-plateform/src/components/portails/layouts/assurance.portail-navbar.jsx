// assurance.portail-navbar.jsx — barre du portail assurance (même structure
// que portail-navbar.jsx du médecin). La cloche mène aux demandes reçues.
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import NotificationsBell from "../components/notifications-bell";
import { useAnnoncesNonLues } from "../../annonces/annoncesVues";
import { LIENS_PORTAIL_ASSURANCE } from "./assurance.liens";

const AssurancePortailNavbar = ({ nouvellesDemandes = 0 }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { deconnecter } = useAuth();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const badges = { demandes: nouvellesDemandes, annonces: useAnnoncesNonLues() };

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

          <nav aria-label="Navigation du portail assurance">
            <ul className={`aps-nav-links ${menuOuvert ? "is-open" : ""}`}>
              {LIENS_PORTAIL_ASSURANCE.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className={pathname === link.to ? "text-primary" : ""}
                    aria-current={pathname === link.to ? "page" : undefined}
                    onClick={() => setMenuOuvert(false)}
                  >
                    <i className={`fa-solid ${link.icon}`}></i> {link.label}
                    {badges[link.badge] > 0 && (
                      <span className="nav-badge ms-1" aria-label={`${badges[link.badge]} nouvelle(s)`}>{badges[link.badge]}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="aps-nav-actions">
            <NotificationsBell cheminRdv="/portail/assurance-demandes" />
            <button type="button" onClick={handleLogout} className="btn btn-outline-primary btn-sm-aps">
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

export default AssurancePortailNavbar;
