// src/components/Navbar.jsx
//
// Branché sur useAuth() (AuthContext) :
//   - status === 'loading'        -> zone compte non affichée (évite un
//     flash "Login" puis "nom" au chargement/rechargement de page).
//   - status === 'unauthenticated' -> lien "Login" (comportement d'origine).
//   - status === 'authenticated'   -> nom de l'utilisateur + menu déroulant
//     (Mes rendez-vous / Déconnexion). deconnecter() vient d'AuthContext,
//     qui nettoie déjà la session même si l'appel réseau à /auth/logout
//     échoue — on redirige simplement vers l'accueil après.

import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function navLinkClass({ isActive }) {
  return isActive ? 'active' : undefined;
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [menuCompteOuvert, setMenuCompteOuvert] = useState(false);
  const { user, status, isAuthenticated, deconnecter } = useAuth();
  const navigate = useNavigate();

  const prenomAffiche = user?.prenom || user?.nom || user?.email || 'Mon compte';

  const handleDeconnexion = async () => {
    setMenuCompteOuvert(false);
    setOpen(false);
    try {
      await deconnecter();
    } finally {
      navigate('/');
    }
  };

  return (
    <header className="aps-navbar">
      <div className="container-aps navbar-inner">
        <Link to="/" className="aps-logo">
          <span className="mark"><i className="fa-solid fa-staff-snake" /></span> APS
        </Link>
        <nav className={open ? 'is-open' : ''}>
          <ul className={`aps-nav-links ${open ? 'is-open' : ''}`}>
            <li><NavLink to="/home" className={navLinkClass} onClick={() => setOpen(false)}> <i className="fa-solid fa-home" /> Accueil</NavLink></li>
            <li><NavLink to="/medecin" className={navLinkClass} onClick={() => setOpen(false)}> <i className="fa-solid fa-user-md" /> Médecins</NavLink></li>
            <li><NavLink to="/structure-sante" className={navLinkClass} onClick={() => setOpen(false)}> <i className="fa-solid fa-hospital" /> Structures de Santé</NavLink></li>
            <li><NavLink to="/pharmacie" className={navLinkClass} onClick={() => setOpen(false)}> <i className="fa-solid fa-prescription-bottle" /> Pharmacies</NavLink></li>
            <li><NavLink to="/urgences" className={navLinkClass} onClick={() => setOpen(false)}> <i className="fa-solid fa-truck-medical" /> Urgences</NavLink></li>
            <li><NavLink to="/assurance" className={navLinkClass} onClick={() => setOpen(false)}> <i className="fa-solid fa-shield-heart" /> Assurance</NavLink></li>
            <li><NavLink to="/pricing" className={navLinkClass} onClick={() => setOpen(false)}> <i className="fa-solid fa-coins" /> Abonnement</NavLink></li>

            {/* Zone compte : rien pendant la restauration de session, pour
                éviter un flash "Login" -> "nom" au chargement de la page. */}
            {status !== 'loading' && !isAuthenticated && (
              <li>
                <NavLink to="/login" className={navLinkClass} onClick={() => setOpen(false)}>
                  <i className="fa-solid fa-sign-in-alt" /> Login
                </NavLink>
              </li>
            )}

            {isAuthenticated && (
              <li className={`aps-nav-account ${menuCompteOuvert ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="aps-nav-account-toggle"
                  onClick={() => setMenuCompteOuvert((v) => !v)}
                  aria-expanded={menuCompteOuvert}
                >
                  <i className="fa-solid fa-circle-user" /> {prenomAffiche}
                  <i className="fa-solid fa-chevron-down" style={{ fontSize: '.7rem', marginLeft: '.35rem' }} />
                </button>
                {menuCompteOuvert && (
                  <ul className="aps-nav-account-menu">
                    <li>
                      <NavLink
                        to="/rendez-vous"
                        className={navLinkClass}
                        onClick={() => { setMenuCompteOuvert(false); setOpen(false); }}
                      >
                        <i className="fa-solid fa-calendar-check" /> Mes rendez-vous
                      </NavLink>
                    </li>
                    <li>
                      <button type="button" className="aps-nav-account-logout" onClick={handleDeconnexion}>
                        <i className="fa-solid fa-right-from-bracket" /> Déconnexion
                      </button>
                    </li>
                  </ul>
                )}
              </li>
            )}
          </ul>
        </nav>

       
        <button
          className="navbar-toggler-aps"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <i className="fa-solid fa-bars" />
        </button>
      </div>
    </header>
  );
}