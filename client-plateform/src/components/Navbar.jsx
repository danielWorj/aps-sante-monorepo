import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import logoApsa from '../assets/img/logoapsa.jpeg';
import { useAuth } from '../context/AuthContext';
import { accueilParRole, aUnRole, ROLES_ESPACE } from '../utils/roles';
import { useAnnoncesNonLues } from './annonces/annoncesVues';

// Navigation publique — refonte UI web 2026 (mobile/new-web-ui.html) :
// marque à gauche, rubriques au centre, lien Urgence toujours visible,
// puis Se connecter / Créer un compte, ou le menu du compte connecté.
// En responsive (< 992 px), le bouton Menu (à gauche du logo) ouvre un
// tiroir vertical qui glisse de gauche à droite, comme celui des portails
// (classes portail-tiroir-*, voir portail-topbar.jsx).

// « Services » regroupe les annuaires des établissements : menu déroulant
// sur ordinateur, sous-liste dépliable dans le menu mobile.
const SERVICES = [
  { to: '/structure-sante', label: 'Centres de santé', icone: 'fa-hospital' },
  { to: '/pharmacie', label: 'Pharmacies', icone: 'fa-prescription-bottle-medical' },
  { to: '/laboratoires', label: 'Laboratoires', icone: 'fa-flask-vial' },
];

const ICONES_TIROIR = {
  '/home': 'fa-house',
  '/medecin': 'fa-user-doctor',
  '/assurance': 'fa-shield-heart',
  '/a-propos': 'fa-circle-info',
  '/contact': 'fa-envelope',
};

const LIENS = [
  { to: '/home', label: 'Accueil' },
  { to: '/medecin', label: 'Médecins' },
  { to: '/assurance', label: 'Assurances' },
  { label: 'Services', sousMenu: SERVICES },
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
  const [servicesOpen, setServicesOpen] = useState(false); // menu « Services »
  const compteRef = useRef(null);
  const servicesRef = useRef(null);
  const { pathname } = useLocation();
  const serviceActif = SERVICES.some((s) => pathname === s.to || pathname.startsWith(`${s.to}/`));
  const navigate = useNavigate();
  const { user, espaces, deconnecter } = useAuth();
  const annoncesNonLues = useAnnoncesNonLues();

  // Ferme le menu du compte si on clique en dehors
  useEffect(() => {
    function handleClickOutside(e) {
      if (compteRef.current && !compteRef.current.contains(e.target)) {
        setCompteOpen(false);
      }
      if (servicesRef.current && !servicesRef.current.contains(e.target)) {
        setServicesOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function closeAll() {
    setOpen(false);
    setCompteOpen(false);
    setServicesOpen(false);
  }

  // Échap ferme le menu « Services ».
  useEffect(() => {
    if (!servicesOpen) return undefined;
    const auClavier = (e) => { if (e.key === 'Escape') setServicesOpen(false); };
    document.addEventListener('keydown', auClavier);
    return () => document.removeEventListener('keydown', auClavier);
  }, [servicesOpen]);

  // Tiroir ouvert : Échap le ferme, le défilement de la page est bloqué.
  useEffect(() => {
    if (!open) return undefined;
    const auClavier = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', auClavier);
    const ancien = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', auClavier);
      document.body.style.overflow = ancien;
    };
  }, [open]);

  // Sur grand écran le tiroir n'a pas de sens : refermé si la fenêtre s'élargit.
  useEffect(() => {
    if (!open) return undefined;
    const requete = window.matchMedia('(min-width: 992px)');
    const surChangement = (e) => { if (e.matches) setOpen(false); };
    requete.addEventListener('change', surChangement);
    return () => requete.removeEventListener('change', surChangement);
  }, [open]);

  const estActif = (to) => pathname === to || pathname.startsWith(`${to}/`);
  const lienTiroir = (to, label, icone) => (
    <Link key={to} to={to} className={estActif(to) ? 'is-on' : ''} aria-current={estActif(to) ? 'page' : undefined}>
      <i className={`fa-solid ${icone}`} /> {label}
    </Link>
  );

  async function seDeconnecter() {
    closeAll();
    await deconnecter();
    navigate('/login', { replace: true });
  }

  const monEspace = user ? accueilParRole(user.role) : null;

  return (
    <>
    <header className="aps-navbar">
      <div className="container-aps navbar-inner">
        <button
          type="button"
          className="navbar-toggler-aps aps-nav-burger"
          aria-expanded={open}
          aria-controls="aps-nav-tiroir"
          aria-label="Ouvrir le menu"
          onClick={() => setOpen(true)}
        >
          <i className="fa-solid fa-bars" />
        </button>

        <Link to="/home" className="aps-logo" onClick={closeAll} aria-label="ApSa — accueil">
          <img src={logoApsa} alt="ApSa — AZA Santé Assurances" className="aps-logo-img" />
        </Link>

        <nav className="aps-nav-main" aria-label="Navigation principale">
          <ul className="aps-nav-links">
            {LIENS.map((l) => (l.sousMenu ? (
              <li key={l.label} className={`aps-nav-sous ${servicesOpen ? 'is-open' : ''}`} ref={servicesRef}>
                <button
                  type="button"
                  className={`aps-nav-sous-btn ${serviceActif ? 'active' : ''}`}
                  aria-haspopup="true"
                  aria-expanded={servicesOpen}
                  onClick={() => setServicesOpen((v) => !v)}
                >
                  {l.label} <i className="fa-solid fa-chevron-down aps-nav-sous-chevron" />
                </button>
                <ul className="aps-nav-sous-menu">
                  {l.sousMenu.map((s) => (
                    <li key={s.to}>
                      <NavLink to={s.to} className={navLinkClass} onClick={closeAll}>
                        <i className={`fa-solid ${s.icone}`} /> {s.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </li>
            ) : (
              <li key={l.to}>
                <NavLink to={l.to} className={navLinkClass} onClick={closeAll}>{l.label}</NavLink>
              </li>
            )))}
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

        </div>
      </div>
    </header>

      {/* Tiroir responsive (même gabarit que les portails). */}
      {open && <div className="portail-tiroir-fond aps-nav-tiroir" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside
        id="aps-nav-tiroir"
        className={`portail-tiroir aps-nav-tiroir ${open ? 'is-open' : ''}`}
        aria-label="Navigation principale"
        aria-hidden={!open}
        inert={!open ? '' : undefined}
      >
        <div className="portail-tiroir-tete">
          <img src={logoApsa} alt="ApSa" className="portail-tiroir-logo" />
          <button type="button" className="portail-tiroir-fermer" onClick={() => setOpen(false)} aria-label="Fermer le menu">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {user && (
          <div className="portail-tiroir-user">
            <span className="aps-av">{initiales(user)}</span>
            <div style={{ minWidth: 0 }}>
              <b className="text-truncate d-block">{`${user.prenom ?? ''} ${user.nom ?? ''}`.trim()}</b>
              {user.telephone && <span className="aps-t-xs">{user.telephone}</span>}
            </div>
          </div>
        )}

        {/* Un clic sur un lien ferme le tiroir. */}
        <nav className="portail-tiroir-nav" onClick={(e) => { if (e.target.closest('a')) closeAll(); }}>
          <div className="portail-tiroir-grp">Navigation</div>
          {lienTiroir('/home', 'Accueil', ICONES_TIROIR['/home'])}
          {lienTiroir('/medecin', 'Médecins', ICONES_TIROIR['/medecin'])}
          {lienTiroir('/assurance', 'Assurances', ICONES_TIROIR['/assurance'])}

          <div className="portail-tiroir-grp">Services</div>
          {SERVICES.map((sv) => lienTiroir(sv.to, sv.label, sv.icone))}

          <div className="portail-tiroir-grp">ApSa</div>
          {lienTiroir('/a-propos', 'À propos', ICONES_TIROIR['/a-propos'])}
          {lienTiroir('/contact', 'Contactez-nous', ICONES_TIROIR['/contact'])}
          <Link to="/urgences" className="aps-nav-tiroir-urgence">
            <i className="fa-solid fa-truck-medical" /> Urgence
          </Link>

          {user && (
            <>
              <div className="portail-tiroir-grp">Compte</div>
              {monEspace && monEspace !== '/home' && (
                <Link to={monEspace}><i className="fa-solid fa-table-columns" /> Mon espace</Link>
              )}
              {espaces.length > 1 && (
                <Link to="/choisir-espace"><i className="fa-solid fa-repeat" /> Changer d&apos;espace</Link>
              )}
              {aUnRole(user, ROLES_ESPACE.annonces) && (
                <Link to="/mes-annonces">
                  <i className="fa-solid fa-bell" /> Annonces
                  {annoncesNonLues > 0 && <em>{annoncesNonLues}</em>}
                </Link>
              )}
              {aUnRole(user, ROLES_ESPACE.publicite) && (
                <Link to="/portail/annonceur"><i className="fa-solid fa-bullhorn" /> Mes publicités</Link>
              )}
              <Link to="/pricing"><i className="fa-solid fa-coins" /> Abonnements</Link>
              {aUnRole(user, ROLES_ESPACE.compte) && (
                <Link to="/creer-mon-pin"><i className="fa-solid fa-key" /> {user.pin_defini ? 'Code PIN' : 'Créer mon code PIN'}</Link>
              )}
            </>
          )}
        </nav>

        {user ? (
          <button type="button" className="portail-tiroir-sortie" onClick={seDeconnecter}>
            <i className="fa-solid fa-arrow-right-from-bracket" /> Déconnexion
          </button>
        ) : (
          <div className="aps-nav-tiroir-actions">
            <Link to="/login" className="btn btn-outline-primary" onClick={closeAll}>Se connecter</Link>
            <Link to="/inscription" className="btn btn-primary" onClick={closeAll}>Créer un compte</Link>
          </div>
        )}
      </aside>
    </>
  );
}
