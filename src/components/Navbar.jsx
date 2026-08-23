import { useState, useRef, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';

function navLinkClass({ isActive }) {
  return isActive ? 'active' : undefined;
}

export default function Navbar() {
  const [open, setOpen] = useState(false); // menu mobile
  const [servicesOpen, setServicesOpen] = useState(false); // dropdown Services
  const servicesRef = useRef(null);

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
          <span className="mark"><i className="fa-solid fa-staff-snake" /></span> APS
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