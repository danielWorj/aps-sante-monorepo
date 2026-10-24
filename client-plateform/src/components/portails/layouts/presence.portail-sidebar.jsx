// presence.portail-sidebar.jsx — barre latérale des portails pharmacie et
// centre de santé : identité de la fiche (photo, nom, ville, statut de
// vérification, ouverture), menu, accès à la fiche publique. Lit le contexte
// d'Outlet du PortailPresenceLayout. Même structure que
// laboratoire.portail-sidebar.jsx.
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { ESPACES_PRESENCE, libelleOuverture } from '../../../services/espacePresenceService';
import { LIBELLES_TYPE_STRUCTURE } from '../presence/presenceOutils';
import { LIENS_PORTAIL_PRESENCE } from './presence.liens';

const STATUT_FICHE = {
  publie: { label: 'Fiche publiée', chip: 'chip-verifie', icone: 'fa-circle-check' },
  en_cours: { label: 'En vérification', chip: 'chip-st-attente', icone: 'fa-hourglass-half' },
  non_publie: { label: 'Non publiée', chip: 'chip-st-annule', icone: 'fa-eye-slash' },
};

function initiales(nom) {
  return (nom ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase() || '?';
}

export default function PresencePortailSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { deconnecter } = useAuth();
  const { type, fiche, badges } = useOutletContext();
  const config = ESPACES_PRESENCE[type];
  const statut = STATUT_FICHE[fiche.statut_verification] ?? STATUT_FICHE.non_publie;
  const sousTitre = type === 'pharmacie' ? 'Pharmacie' : LIBELLES_TYPE_STRUCTURE[fiche.type_structure] ?? 'Centre de santé';
  const ouverture = libelleOuverture(fiche.ouverture);

  const handleDeconnexion = async (e) => {
    e.preventDefault();
    try {
      await deconnecter();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <aside className="portail-sidebar" aria-label={`Menu de la ${config.libelle}`}>
      <div className="sidebar-card">
        <div className="sidebar-doctor">
          <div className="sidebar-avatar assurance-logo">
            {fiche.image_url ? <img src={fiche.image_url} alt="" /> : initiales(fiche.nom)}
          </div>
          <div className="sidebar-name">{fiche.nom}</div>
          <div className="sidebar-spec">{sousTitre}{fiche.ville?.nom ? ` · ${fiche.ville.nom}` : ''}</div>
          <span className={`chip ${statut.chip}`}>
            <i className={`fa-solid ${statut.icone}`}></i> {statut.label}
          </span>
          {ouverture && (
            <div className={`small mt-2 ${fiche.ouverture.ouvert ? 'text-success' : 'text-faint'}`}>
              <i className="fa-solid fa-clock" /> {ouverture}
            </div>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Rubriques">
          {LIENS_PORTAIL_PRESENCE[type].map((lien) => (
            <Link key={lien.to} to={lien.to} className={pathname === lien.to ? 'active' : undefined}
              aria-current={pathname === lien.to ? 'page' : undefined}>
              <i className={`fa-solid ${lien.icon}`}></i> {lien.label}
              {badges[lien.badge] > 0 ? <span className="nav-badge">{badges[lien.badge]}</span> : null}
            </Link>
          ))}
        </nav>

        <nav className="sidebar-nav sidebar-foot">
          <Link to={config.fichePublique(fiche.acteur_id)} target="_blank" rel="noreferrer">
            <i className="fa-solid fa-arrow-up-right-from-square"></i> {fiche.statut_verification === 'publie' ? 'Voir ma fiche publique' : 'Aperçu de ma fiche'}
          </Link>
          <Link to="/">
            <i className="fa-solid fa-house"></i> Site public
          </Link>
          <Link to="/login" onClick={handleDeconnexion}>
            <i className="fa-solid fa-arrow-right-from-bracket"></i> Déconnexion
          </Link>
        </nav>
      </div>
    </aside>
  );
}

/** Gabarit d'une page du portail : en-tête + contenu, barre latérale à droite. */
export function PresencePortailPage({ titre, description, actions, children }) {
  const { type } = useOutletContext();
  return (
    <div className="container-aps">
      <div className="portail-shell">
        <main className="portail-main">
          <header className="portail-head">
            <div>
              <span className="eyebrow">{ESPACES_PRESENCE[type].espace}</span>
              <h1>{titre}</h1>
              {description && <p>{description}</p>}
            </div>
            {actions && <div className="d-flex gap-2 flex-wrap">{actions}</div>}
          </header>
          {children}
        </main>
        <PresencePortailSidebar />
      </div>
    </div>
  );
}
