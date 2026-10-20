// assurance.portail-sidebar.jsx — barre latérale du portail assurance :
// identité de la fiche (logo, nom, type, statut de vérification), menu
// avec le compteur de demandes nouvelles, accès à la fiche publique.
// Lit la fiche dans le contexte d'Outlet du PortailAssuranceLayout.
import { Link, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { LIENS_PORTAIL_ASSURANCE } from "./assurance.liens";
import { useAnnoncesNonLues } from "../../annonces/annoncesVues";

const TYPE_ACTEUR = { compagnie: "Compagnie d'assurance", courtier: "Courtier en assurance" };
const STATUT_FICHE = {
  publie: { label: "Fiche publiée", chip: "chip-verifie", icone: "fa-circle-check" },
  en_cours: { label: "En vérification", chip: "chip-st-attente", icone: "fa-hourglass-half" },
  non_publie: { label: "Non publiée", chip: "chip-st-annule", icone: "fa-eye-slash" },
};

function initiales(nom) {
  return (nom ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0])
    .join("")
    .toUpperCase() || "?";
}

export default function AssurancePortailSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { deconnecter } = useAuth();
  const { fiche, nouvellesDemandes } = useOutletContext();
  const badges = { demandes: nouvellesDemandes, annonces: useAnnoncesNonLues() };
  const statut = STATUT_FICHE[fiche.statut_verification] ?? STATUT_FICHE.non_publie;

  const handleDeconnexion = async (e) => {
    e.preventDefault();
    try {
      await deconnecter();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <aside className="portail-sidebar" aria-label="Menu de l'assurance">
      <div className="sidebar-card">
        <div className="sidebar-doctor">
          <div className="sidebar-avatar assurance-logo">
            {fiche.image_url ? <img src={fiche.image_url} alt="" /> : initiales(fiche.nom)}
          </div>
          <div className="sidebar-name">{fiche.nom}</div>
          <div className="sidebar-spec">{TYPE_ACTEUR[fiche.type_acteur] ?? "Assurance"}</div>
          <span className={`chip ${statut.chip}`}>
            <i className={`fa-solid ${statut.icone}`}></i> {statut.label}
          </span>
        </div>

        <nav className="sidebar-nav" aria-label="Rubriques">
          {LIENS_PORTAIL_ASSURANCE.map((lien) => (
            <Link key={lien.to} to={lien.to} className={pathname === lien.to ? "active" : undefined}
              aria-current={pathname === lien.to ? "page" : undefined}>
              <i className={`fa-solid ${lien.icon}`}></i> {lien.label}
              {badges[lien.badge] > 0 ? <span className="nav-badge">{badges[lien.badge]}</span> : null}
            </Link>
          ))}
        </nav>

        <nav className="sidebar-nav sidebar-foot">
          {fiche.statut_verification === "publie" && (
            <Link to={`/assurances/${fiche.service_assurance_id}`} target="_blank" rel="noreferrer">
              <i className="fa-solid fa-id-card"></i> Voir ma fiche publique
            </Link>
          )}
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

/**
 * Gabarit d'une page du portail : en-tête + contenu à gauche, barre
 * latérale à droite (même grille que les portails médecin et patient).
 */
export function AssurancePortailPage({ titre, description, actions, children }) {
  return (
    <div className="container-aps">
      <div className="portail-shell">
        <main className="portail-main">
          <header className="portail-head">
            <div>
              <span className="eyebrow">Espace assurance</span>
              <h1>{titre}</h1>
              {description && <p>{description}</p>}
            </div>
            {actions && <div className="d-flex gap-2 flex-wrap">{actions}</div>}
          </header>
          {children}
        </main>
        <AssurancePortailSidebar />
      </div>
    </div>
  );
}
