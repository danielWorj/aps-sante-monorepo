// components/Navbar.jsx
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

function navLinkClass({ isActive }) {
  return isActive ? 'active' : undefined;
}

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="aps-navbar">
      <div className="container-aps navbar-inner">
        <Link to="/" className="aps-logo">
          <span className="mark"><i className="fa-solid fa-staff-snake" /></span> APS
        </Link>
        <nav className={open ? 'is-open' : ''}>
          <ul className={`aps-nav-links ${open ? 'is-open' : ''}`}>
            <li><NavLink to="/home" className={navLinkClass} onClick={() => setOpen(false)}> <i className="fa-solid fa-home" /> Acceuil</NavLink></li>
            <li><NavLink to="/medecin" className={navLinkClass} onClick={() => setOpen(false)}> <i className="fa-solid fa-user-md" /> Médecins</NavLink></li>
            <li><NavLink to="/pharmacie" className={navLinkClass} onClick={() => setOpen(false)}> <i className="fa-solid fa-prescription-bottle" /> Pharmacies</NavLink></li>
            <li><NavLink to="/urgences" className={navLinkClass} onClick={() => setOpen(false)}> <i className="fa-solid fa-truck-medical" /> Urgences</NavLink></li>
            <li><NavLink to="/assurance" className={navLinkClass} onClick={() => setOpen(false)}> <i className="fa-solid fa-shield-heart" /> Assurance</NavLink></li>
            <li><NavLink to="/pricing" className={navLinkClass} onClick={() => setOpen(false)}> <i className="fa-solid fa-coins" /> Abonnement</NavLink></li>
            {/* ... */}
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