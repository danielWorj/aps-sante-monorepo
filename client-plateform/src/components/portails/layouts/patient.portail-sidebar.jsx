// patient.portail-sidebar.jsx
//
// Sidebar de l'espace patient. Source de données :
//
//  IDENTITÉ (nom, prénom) : vient de useAuth() → AuthContext, comme
//  pour la sidebar médecin (voir portail-sidebar.jsx). Le contexte
//  expose `user` (et `status`) — pas de préfixe "Dr" ici puisque
//  l'utilisateur est un patient.
//
//  DONNÉES MÉTIER PATIENT (badges rdv / messages / annonces non lus,
//  solde du portefeuille APS) : à brancher progressivement, soit via
//  une extension du contrôleur `/auth/me` (ex. include: { patient: true }),
//  soit via un endpoint dédié consommé par la page qui monte
//  <PatientPortailSidebar/>. En attendant, ce composant retombe sur les
//  props explicites passées par le parent.
import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { deconnecter as deconnecterApi } from "../../../services/authService";

const LIENS = [
  { to: "/portail/patient-rdv", icone: "fa-calendar-check", label: "Rendez-vous", badgeKey: "rdvBadge" },
  { to: "/portail/patient-messages", icone: "fa-comment-medical", label: "Messages", badgeKey: "messagesBadge" },
  { to: "/portail/patient-annonces", icone: "fa-bullhorn", label: "Annonces", badgeKey: "annoncesBadge" },
  { to: "/portail/patient-profil", icone: "fa-user", label: "Profil" },
];

/** "Jean" + "Dupont" → "JD". Retombe sur "?" si aucun nom exploitable. */
function calculerInitiales(prenom, nom) {
  const a = prenom?.trim()?.[0] ?? "";
  const b = nom?.trim()?.[0] ?? "";
  const initiales = `${a}${b}`.toUpperCase();
  return initiales || "?";
}

const PatientPortailSidebar = ({
  // Ces props restent surchargeables (tests, storybook, ou tant que le
  // backend n'expose pas encore les données patient dédiées).
  rdvBadge = 0,
  messagesBadge = 0,
  annoncesBadge = 0,
  solde,
}) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, status: authStatus } = useAuth();

  // Distinguer "session en cours de restauration" (authStatus === 'loading',
  // cf. RequireAuth.jsx) d'un simple délai de rendu : sinon "Chargement…"
  // peut rester affiché indéfiniment si `user` reste vide pour une autre
  // raison (mauvaise clé de contexte, session expirée sans redirection...).
  const chargementSession = authStatus === "loading" || (!user && authStatus !== "unauthenticated");

  const nomComplet = user
    ? `${user.prenom ?? ""} ${user.nom ?? ""}`.trim()
    : chargementSession
    ? "Chargement…"
    : "—";
  const initiales = user ? calculerInitiales(user.prenom, user.nom) : "…";

  const badges = { rdvBadge, messagesBadge, annoncesBadge };

  const handleDeconnexion = async (e) => {
    e.preventDefault();
    try {
      await deconnecterApi();
    } finally {
      // On navigue même si l'appel serveur échoue (session déjà
      // invalide côté serveur, réseau coupé...) : l'objectif est de
      // toujours ramener l'utilisateur sur /login.
      navigate("/login", { replace: true });
    }
  };

  return (
    <aside className="portail-sidebar" aria-label="Menu du patient">
      <div className="sidebar-card">
        <div className="sidebar-doctor">
          <div className="sidebar-avatar">{initiales}</div>
          <div className="sidebar-name">{nomComplet}</div>
        </div>

        <nav className="sidebar-nav" aria-label="Rubriques">
          {LIENS.map((lien) => {
            const badge = lien.badgeKey ? badges[lien.badgeKey] : null;
            return (
              <Link key={lien.to} to={lien.to} className={pathname === lien.to ? "active" : undefined}>
                <i className={`fa-solid ${lien.icone}`}></i> {lien.label}
                {badge ? <span className="nav-badge">{badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        <nav className="sidebar-nav sidebar-foot">
          <Link to="/">
            <i className="fa-solid fa-magnifying-glass"></i> Trouver un médecin
          </Link>
          <Link to="#">
            <i className="fa-solid fa-circle-question"></i> Aide &amp; support
          </Link>
          <Link to="/login" onClick={handleDeconnexion}>
            <i className="fa-solid fa-arrow-right-from-bracket"></i> Déconnexion
          </Link>
        </nav>
      </div>

      {solde && (
        <div className="sidebar-card sidebar-dispo">
          <div className="dispo-row">
            <div>
              <strong>Portefeuille APS</strong>
              <span className="wallet-mini">{solde}</span>
            </div>
            <Link
              to="/portail/patient-profil#portefeuille"
              className="btn btn-ghost btn-sm-aps btn-icon"
              aria-label="Voir le portefeuille"
            >
              <i className="fa-solid fa-chevron-right"></i>
            </Link>
          </div>
        </div>
      )}
    </aside>
  );
};

export default PatientPortailSidebar;