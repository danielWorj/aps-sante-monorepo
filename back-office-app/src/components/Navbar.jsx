import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/* ==========================================================================
   Navbar.jsx
   Portage React de la topbar APS (ex partie topbarTemplate() de sidebar.js).

   - Le burger (mobile) et le bouton de réduction (desktop) togglent des
     classes sur #apsApp, exactement comme le faisait sidebar.js
     (is-mobile-open / is-collapsed) — inutile de dupliquer un state
     React global pour ça, le layout CSS existant réagit déjà à ces
     classes.
   - Le nom/rôle affichés proviennent désormais de la session réelle
     (useAuth().user, hydraté via GET /api/auth/me) et non plus de
     props statiques : la Navbar n'a plus besoin qu'on lui passe
     userName/userRole depuis PrivateLayout.
   - Le menu utilisateur permet de se déconnecter (POST /api/auth/logout
     + nettoyage local), puis redirige vers /login.
   ========================================================================== */

export default function Navbar({ notificationCount = 10, onSearch }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const userName = user ? `${user.prenom} ${user.nom}`.trim() : "…";
  const userRole = user?.role ?? "";
  const initials = userName
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function toggleMobileMenu() {
    const appRoot = document.getElementById("apsApp");
    if (appRoot) appRoot.classList.toggle("is-mobile-open");
  }

  function toggleCollapse() {
    const appRoot = document.getElementById("apsApp");
    if (appRoot) appRoot.classList.toggle("is-collapsed");
  }

  function handleSearchChange(e) {
    if (onSearch) onSearch(e.target.value);
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      // logout() nettoie toujours l'état local (même en cas d'échec
      // réseau, voir AuthContext), donc on peut rediriger sans
      // condition.
      navigate("/login", { replace: true });
    }
  }

  return (
    <header className="aps-topbar">
      <button
        className="aps-topbar__burger"
        id="apsBurgerBtn"
        type="button"
        aria-label="Ouvrir le menu"
        onClick={toggleMobileMenu}
      >
        <i className="fa-solid fa-bars" />
      </button>

      <button
        className="aps-topbar__toggle"
        id="apsCollapseBtn"
        type="button"
        aria-label="Réduire le menu"
        onClick={toggleCollapse}
      >
        <i className="fa-solid fa-bars-staggered" />
      </button>

      <div className="aps-topbar__search">
        <i className="fa-solid fa-magnifying-glass" />
        <input
          type="search"
          placeholder="Rechercher un professionnel, une structure..."
          onChange={handleSearchChange}
        />
      </div>

      <div className="aps-topbar__spacer" />

      <div className="aps-topbar__actions">
        <button className="aps-icon-btn" type="button" aria-label="Langue">
          <i className="fa-solid fa-globe" />
        </button>

        <button className="aps-icon-btn" type="button" aria-label="Notifications">
          <i className="fa-regular fa-bell" />
          {notificationCount ? (
            <span className="aps-icon-btn__badge">{notificationCount}</span>
          ) : null}
        </button>

        <div className="aps-topbar__divider" />

        <div style={{ position: "relative" }}>
          <div
            className="aps-topbar__user"
            role="button"
            tabIndex={0}
            id="apsUserMenuBtn"
            onClick={() => setUserMenuOpen((open) => !open)}
            aria-expanded={userMenuOpen}
          >
            <div className="aps-topbar__user-avatar">{initials}</div>
            <div className="aps-topbar__user-meta">
              <div className="name">{userName}</div>
              <div className="role">{userRole}</div>
            </div>
            <i
              className={
                "fa-solid fa-chevron-down aps-text-muted" +
                (userMenuOpen ? " is-open" : "")
              }
              style={{ fontSize: "11px" }}
            />
          </div>

          {userMenuOpen && (
            <div
              className="aps-topbar__user-dropdown"
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 8px)",
                minWidth: 200,
                background: "var(--aps-surface)",
                border: "1px solid var(--aps-border)",
                borderRadius: "var(--aps-radius)",
                boxShadow: "var(--aps-shadow-md)",
                overflow: "hidden",
                zIndex: 20,
              }}
            >
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  textAlign: "left",
                  fontSize: 13.5,
                  color: "var(--aps-danger)",
                  cursor: loggingOut ? "default" : "pointer",
                }}
              >
                <i className={`fa-solid ${loggingOut ? "fa-spinner fa-spin" : "fa-right-from-bracket"}`} />
                {loggingOut ? "Déconnexion…" : "Se déconnecter"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}