// portail-sidebar.jsx
//
// Sidebar de l'espace médecin. Deux sources de données :
//
//  1. IDENTITÉ (nom, prénom, rôle) : vient de useAuth() → AuthContext.
//     ⚠️ Le contexte expose `user` (et `status`, `rafraichirUtilisateur`)
//     — voir src/pages/medecin-profil.jsx :
//       const { user, rafraichirUtilisateur, status } = useAuth();
//     PAS `utilisateur`. C'est déjà branché correctement ci-dessous,
//     aucune prop requise pour ça.
//
//  2. DONNÉES MÉTIER MÉDECIN (spécialité, statut de vérification à
//     l'Ordre, solde du portefeuille APS, RDV du jour, disponibilité) :
//     `profil()` côté serveur ne fait actuellement QUE
//     `include: { role: true }` sur Utilisateur, donc `user.medecin`
//     n'existe pas dans la réponse de /auth/me (medecin-profil.jsx va
//     chercher ces infos séparément via medecinService.obtenirMonProfil()).
//     Pour les alimenter automatiquement dans la sidebar il faut soit :
//       a) étendre le contrôleur : include: { medecin: { include: { specialite: true } } }
//          puis les exposer sur l'utilisateur du contexte (ex.
//          user.medecin.specialite.nom, user.medecin.statut_verification),
//       b) ou créer un endpoint dédié (ex. GET /medecin/moi) consommé
//          par la page qui monte <PortailSidebar/>.
//     En attendant, ce composant lit `user?.medecin?.*` s'il est
//     présent (compatible avec l'option a), et retombe sinon sur les
//     props explicites passées par le parent — pratique pour brancher
//     ces données progressivement sans casser le composant.
import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { deconnecter as deconnecterApi } from "../../../services/authService";

const LIENS = [
  { to: "/portail/medecin-rdv", icone: "fa-calendar-check", label: "Rendez-vous", badgeKey: "rdvBadge" },
  { to: "/portail/medecin-profil", icone: "fa-user-doctor", label: "Profil" },
  { to: "/portail/medecin-agenda", icone: "fa-calendar-days", label: "Agenda" },
];

/** "Jean" + "Dupont" → "JD". Retombe sur "?" si aucun nom exploitable. */
function calculerInitiales(prenom, nom) {
  const a = prenom?.trim()?.[0] ?? "";
  const b = nom?.trim()?.[0] ?? "";
  const initiales = `${a}${b}`.toUpperCase();
  return initiales || "?";
}

const PortailSidebar = ({
  // Ces props restent surchargeables (tests, storybook, ou tant que le
  // backend n'expose pas encore utilisateur.medecin) mais sont d'abord
  // dérivées de l'utilisateur connecté quand l'info est disponible.
  specialite,
  verifie,
  rdvBadge = 0,
  disponible = true,
  onToggleDisponible,
  solde,
}) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, status: authStatus } = useAuth();

  const medecin = user?.medecin; // présent seulement si le backend l'inclut, cf. note en tête de fichier

  // Distinguer "session en cours de restauration" (authStatus === 'loading',
  // cf. RequireAuth.jsx) d'un simple délai de rendu : sinon "Chargement…"
  // peut rester affiché indéfiniment si `user` reste vide pour une autre
  // raison (mauvaise clé de contexte, session expirée sans redirection...).
  const chargementSession = authStatus === "loading" || (!user && authStatus !== "unauthenticated");

  const nomComplet = user
    ? `${user.role === "medecin" ? "Dr " : ""}${user.prenom ?? ""} ${user.nom ?? ""}`.trim()
    : chargementSession
    ? "Chargement…"
    : "—";
  const initiales = user ? calculerInitiales(user.prenom, user.nom) : "…";
  const specialiteAffichee = specialite ?? medecin?.specialite?.nom ?? "";
  const estVerifie = verifie ?? (medecin ? medecin.statut_verification === "publie" : false);

  const badges = { rdvBadge };

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
    <aside className="portail-sidebar" aria-label="Menu du médecin">
      <div className="sidebar-card">
        <div className="sidebar-doctor">
          <div className="sidebar-avatar">{initiales}</div>
          <div className="sidebar-name">{nomComplet}</div>
          {specialiteAffichee && <div className="sidebar-spec">{specialiteAffichee}</div>}
          {estVerifie && (
            <span className="chip chip-verifie">
              <i className="fa-solid fa-circle-check"></i> Vérifié à l'Ordre
            </span>
          )}
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
            <i className="fa-solid fa-id-card"></i> Voir ma fiche publique
          </Link>
          <Link to="#">
            <i className="fa-solid fa-circle-question"></i> Aide &amp; support
          </Link>
          <Link to="/login" onClick={handleDeconnexion}>
            <i className="fa-solid fa-arrow-right-from-bracket"></i> Déconnexion
          </Link>
        </nav>
      </div>

      <div className="sidebar-card sidebar-dispo">
        <div className="dispo-row">
          <div>
            <strong>Disponible aujourd'hui</strong>
            <span className="hint">Visible sur votre fiche publique</span>
          </div>
          <div className="form-check form-switch m-0">
            <input
              className="form-check-input"
              type="checkbox"
              id="dispo-toggle"
              defaultChecked={disponible}
              onChange={onToggleDisponible}
            />
            <label className="form-check-label visually-hidden" htmlFor="dispo-toggle">
              Disponible aujourd'hui
            </label>
          </div>
        </div>
      </div>

      {solde && (
        <div className="sidebar-card sidebar-dispo">
          <div className="dispo-row">
            <div>
              <strong>Portefeuille APS</strong>
              <span className="wallet-mini">{solde}</span>
            </div>
            <Link
              to="/portail/medecin-profil#portefeuille"
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

export default PortailSidebar;