import { useState, useRef, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import logoApsa from '../assets/img/logoapsa.jpeg';
import { useAuth } from '../context/AuthContext';
import { aUnRole, ROLES_ESPACE } from '../utils/roles';
import { useAnnoncesNonLues } from './annonces/annoncesVues';

function navLinkClass({ isActive }) {
  return isActive ? 'active' : undefined;
}

export default function Navbar() {
  const [open, setOpen] = useState(false); // menu mobile
  const [servicesOpen, setServicesOpen] = useState(false); // dropdown Services
  const servicesRef = useRef(null);
  const { user } = useAuth();
  const annoncesNonLues = useAnnoncesNonLues();

  // Ferme le dropdown Services si on clique en dehors
  useEffect(() => {
    function handleClickOutside(e) {
      if (servicesRef.current && !servicesRef.current.contains(e.target)) {
        setServicesOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function closeAll() {
    setOpen(false);
    setServicesOpen(false);
  }

  return (
    <header className="aps-navbar">
      <div className="container-aps navbar-inner">
        <Link to="/" className="aps-logo" onClick={closeAll}>
          <img src={logoApsa} alt="ApSa" className="aps-logo-img" />
        </Link>

        <nav className={open ? 'is-open' : ''}>
          <ul className={`aps-nav-links ${open ? 'is-open' : ''}`}>
            <li>
              <NavLink to="/home" className={navLinkClass} onClick={closeAll}>
                <i className="fa-solid fa-home" /> Accueil
              </NavLink>
            </li>

            <li>
              <NavLink to="/medecin" className={navLinkClass} onClick={closeAll}>
                <i className="fa-solid fa-user-md" /> Médecins
              </NavLink>
            </li>

            <li>
              <NavLink to="/assurance" className={navLinkClass} onClick={closeAll}>
                <i className="fa-solid fa-shield-heart" /> Assurances
              </NavLink>
            </li>

            {/* Rubrique Services avec sous-menu (dropdown Bootstrap piloté par React) */}
            <li
              className={`nav-item dropdown ${servicesOpen ? 'show' : ''}`}
              ref={servicesRef}
              style={{ position: 'relative' }}
            >
              <a
                href="#"
                className="nav-link dropdown-toggle"
                role="button"
                id="servicesDropdown"
                aria-expanded={servicesOpen}
                onClick={(e) => {
                  e.preventDefault();
                  setServicesOpen((prev) => !prev);
                }}
              >
                <i className="fa-solid fa-briefcase-medical" /> Services
              </a>

              <ul
                className={`dropdown-menu ${servicesOpen ? 'show' : ''}`}
                aria-labelledby="servicesDropdown"
                style={{
                  display: servicesOpen ? 'block' : 'none',
                  position: 'absolute',
                  zIndex: 1000,
                }}
              >
                <li>
                  <NavLink to="/pharmacie" className="dropdown-item" onClick={closeAll}>
                    <i className="fa-solid fa-prescription-bottle" /> Pharmacie
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/structure-sante" className="dropdown-item" onClick={closeAll}>
                    <i className="fa-solid fa-hospital" /> Services Santé
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/urgences" className="dropdown-item" onClick={closeAll}>
                    <i className="fa-solid fa-truck-medical" /> Urgences
                  </NavLink>
                </li>
              </ul>
            </li>

            <li>
              <NavLink to="/pricing" className={navLinkClass} onClick={closeAll}>
                <i className="fa-solid fa-coins" /> Abonnement
              </NavLink>
            </li>
            {(user?.role === 'agent_pharmacie' || user?.role === 'agent_structure_sante') && (
              <li>
                <NavLink
                  to={user.role === 'agent_pharmacie' ? '/mon-espace-pharmacie' : '/mon-espace-structure'}
                  className={navLinkClass}
                  onClick={closeAll}
                >
                  <i className="fa-solid fa-store" /> Mon espace
                </NavLink>
              </li>
            )}
            {aUnRole(user, ROLES_ESPACE.annonces) && (
              <li>
                <NavLink to="/mes-annonces" className={navLinkClass} onClick={closeAll}>
                  <i className="fa-solid fa-bell" /> Annonces
                  {annoncesNonLues > 0 && <span className="nav-badge ms-1">{annoncesNonLues}</span>}
                </NavLink>
              </li>
            )}
            {user?.role === 'agent_assurance' && (
              <li>
                <NavLink to="/portail/assurance" className={navLinkClass} onClick={closeAll}>
                  <i className="fa-solid fa-building-shield" /> Mon portail
                </NavLink>
              </li>
            )}
            {aUnRole(user, ROLES_ESPACE.publicite) && (
              <li>
                <NavLink to="/portail/annonceur" className={navLinkClass} onClick={closeAll}>
                  <i className="fa-solid fa-bullhorn" /> Mes publicités
                </NavLink>
              </li>
            )}
            <li>
              <NavLink to="/login" className={navLinkClass} onClick={closeAll}>
                <i className="fa-solid fa-sign-in-alt" /> Login
              </NavLink>
            </li>
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