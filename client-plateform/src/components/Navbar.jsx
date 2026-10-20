import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import logoApsa from '../assets/img/logoapsa.jpeg';
import { useAuth } from '../context/AuthContext';
import { accueilParRole, aUnRole, ROLES_ESPACE } from '../utils/roles';
import { useAnnoncesNonLues } from './annonces/annoncesVues';

// Navigation publique — refonte UI web 2026 (mobile/new-web-ui.html) :
// marque à gauche, rubriques au centre, lien Urgence toujours visible,
// puis Se connecter / Créer un compte, ou le menu du compte connecté.

const LIENS = [
  { to: '/home', label: 'Accueil' },
  { to: '/medecin', label: 'Médecins' },
  { to: '/pharmacie', label: 'Pharmacies' },
  { to: '/structure-sante', label: 'Structures' },
  { to: '/assurance', label: 'Assurances' },
  { to: '/a-propos', label: 'À propos' },
  { to: '/contact', label: 'Contactez-nous' },
];

function navLinkClass({ isActive }) {
  return isActive ? 'active' : undefined;
}

function initiales(user) {
  const i = `${user?.prenom?.[0] ?? ''}${user?.nom?.[0] ?? ''}`.toUpperCase();
  return i || <i className="fa-solid fa-user" />;
}

export default function Navbar() {
  const [open, setOpen] = useState(false); // menu mobile
  const [compteOpen, setCompteOpen] = useState(false); // menu du compte
  const compteRef = useRef(null);
  const navigate = useNavigate();
  const { user, espaces, deconnecter } = useAuth();
  const annoncesNonLues = useAnnoncesNonLues();

  // Ferme le menu du compte si on clique en dehors
  useEffect(() => {
    function handleClickOutside(e) {
      if (compteRef.current && !compteRef.current.contains(e.target)) {
        setCompteOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function closeAll() {
    setOpen(false);
    setCompteOpen(false);
  }

  async function seDeconnecter() {
    closeAll();
    await deconnecter();
    navigate('/login', { replace: true });
  }

  const monEspace = user ? accueilParRole(user.role) : null;

  return (
    <header className="aps-navbar">
      <div className="container-aps navbar-inner">
        <Link to="/home" className="aps-logo" onClick={closeAll} aria-label="ApSa — accueil">
          <img src={logoApsa} alt="ApSa — AZA Santé Assurances" className="aps-logo-img" />
        </Link>

        <nav className={`aps-nav-main ${open ? 'is-open' : ''}`} aria-label="Navigation principale">
          <ul className="aps-nav-links">
            {LIENS.map((l) => (
              <li key={l.to}>
                <NavLink to={l.to} className={navLinkClass} onClick={closeAll}>{l.label}</NavLink>
              </li>
            ))}
            {/* Visiteur : les boutons de compte passent dans le menu mobile. */}
            {!user && (
              <li className="aps-nav-mobile-only">
                <div className="aps-nav-mobile-actions">
                  <Link to="/login" className="btn btn-outline-primary btn-sm-aps" onClick={closeAll}>Se connecter</Link>
                  <Link to="/inscription" className="btn btn-primary btn-sm-aps" onClick={closeAll}>Créer un compte</Link>
                </div>
              </li>
            )}
          </ul>
        </nav>

        <div className="aps-nav-actions">
          <Link to="/urgences" className="aps-nav-urgence" onClick={closeAll}>
            <i className="fa-solid fa-truck-medical" /> <span>Urgence</span>
          </Link>

          {!user && (
            <>
              <Link to="/login" className="btn btn-outline-primary btn-sm-aps aps-nav-desktop-only" onClick={closeAll}>
                Se connecter
              </Link>
              <Link to="/inscription" className="btn btn-primary btn-sm-aps aps-nav-desktop-only" onClick={closeAll}>
                Créer un compte
              </Link>
            </>
          )}

          {user && aUnRole(user, ROLES_ESPACE.annonces) && (
            <Link to="/mes-annonces" className="aps-nav-ib" aria-label="Annonces" title="Annonces" onClick={closeAll}>
              <i className="fa-regular fa-bell" />
              {annoncesNonLues > 0 && <span className="aps-nav-ib-dot" />}
            </Link>
          )}

          {user && (
            <div className={`dropdown aps-nav-compte ${compteOpen ? 'show' : ''}`} ref={compteRef}>
              <button
                type="button"
                className="aps-nav-avatar"
                aria-haspopup="menu"
                aria-expanded={compteOpen}
                aria-label="Mon compte"
                onClick={() => setCompteOpen((v) => !v)}
              >
                <span className="aps-av is-sm">{initiales(user)}</span>
                <i className="fa-solid fa-chevron-down" />
              </button>
              <ul className={`dropdown-menu dropdown-menu-end ${compteOpen ? 'show' : ''}`} role="menu">
                {(user.prenom || user.nom) && (
                  <li className="aps-nav-compte-nom">
                    <b>{`${user.prenom ?? ''} ${user.nom ?? ''}`.trim()}</b>
                    {user.telephone && <span>{user.telephone}</span>}
                  </li>
                )}
                {monEspace && monEspace !== '/home' && (
                  <li><Link to={monEspace} className="dropdown-item" onClick={closeAll}><i className="fa-solid fa-table-columns" /> Mon espace</Link></li>
                )}
                {espaces.length > 1 && (
                  <li><Link to="/choisir-espace" className="dropdown-item" onClick={closeAll}><i className="fa-solid fa-repeat" /> Changer d’espace</Link></li>
                )}
                {aUnRole(user, ROLES_ESPACE.annonces) && (
                  <li>
                    <Link to="/mes-annonces" className="dropdown-item" onClick={closeAll}>
                      <i className="fa-solid fa-bell" /> Annonces
                      {annoncesNonLues > 0 && <span className="nav-badge ms-auto">{annoncesNonLues}</span>}
                    </Link>
                  </li>
                )}
                {aUnRole(user, ROLES_ESPACE.publicite) && (
                  <li><Link to="/portail/annonceur" className="dropdown-item" onClick={closeAll}><i className="fa-solid fa-bullhorn" /> Mes publicités</Link></li>
                )}
                <li><Link to="/pricing" className="dropdown-item" onClick={closeAll}><i className="fa-solid fa-coins" /> Abonnements</Link></li>
                {aUnRole(user, ROLES_ESPACE.compte) && (
                  <li>
                    <Link to="/creer-mon-pin" className="dropdown-item" onClick={closeAll}>
                      <i className="fa-solid fa-key" /> {user.pin_defini ? 'Code PIN' : 'Créer mon code PIN'}
                    </Link>
                  </li>
                )}
                <li><hr className="dropdown-divider" /></li>
                <li>
                  <button type="button" className="dropdown-item aps-nav-deconnexion" onClick={seDeconnecter}>
                    <i className="fa-solid fa-arrow-right-from-bracket" /> Déconnexion
                  </button>
                </li>
              </ul>
            </div>
          )}

          <button
            type="button"
            className="navbar-toggler-aps"
            aria-expanded={open}
            aria-label="Ouvrir le menu"
            onClick={() => setOpen(!open)}
          >
            <i className={`fa-solid ${open ? 'fa-xmark' : 'fa-bars'}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
