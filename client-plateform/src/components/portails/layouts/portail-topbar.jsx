// portail-topbar.jsx
//
// Barre supérieure commune aux portails (médecin, patient, assurance) —
// refonte UI web 2026. Les rubriques du portail sont déjà dans la colonne
// de gauche : la barre reste légère (bouton Menu, logo ApSa, cloche,
// compte) et le bouton Menu ouvre un panneau vertical en surimpression
// qui donne accès à toutes les rubriques et aux actions du compte.
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logoApsa from "../../../assets/img/logoapsa.jpeg";
import { useAuth } from "../../../context/AuthContext";
import NotificationsBell from "../components/notifications-bell";

function initiales(user) {
  const i = `${user?.prenom?.[0] ?? ""}${user?.nom?.[0] ?? ""}`.toUpperCase();
  return i || "?";
}

/**
 * @param {{
 *   espace: string,                       // « Espace médecin »…
 *   accueil: string,                      // tableau de bord du portail (clic sur le logo)
 *   liens: { label: string, to: string, icon: string, badge?: string }[],
 *   badges?: Record<string, number>,      // compteurs par clé de badge
 *   cheminNotifications: string,          // page ouverte depuis la cloche
 * }} props
 */
export default function PortailTopbar({ espace, accueil, liens, badges = {}, cheminNotifications }) {
  const [ouvert, setOuvert] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, espaces, deconnecter } = useAuth();

  // Échap ferme le panneau ; le défilement de la page est bloqué pendant l'ouverture.
  useEffect(() => {
    if (!ouvert) return undefined;
    const auClavier = (e) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("keydown", auClavier);
    const ancien = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", auClavier);
      document.body.style.overflow = ancien;
    };
  }, [ouvert]);

  async function seDeconnecter() {
    setOuvert(false);
    await deconnecter();
    navigate("/login", { replace: true });
  }

  const nom = user ? `${user.role === "medecin" ? "Dr " : ""}${user.prenom ?? ""} ${user.nom ?? ""}`.trim() : "";
  const totalBadges = liens.reduce((n, l) => n + (l.badge ? badges[l.badge] || 0 : 0), 0);

  return (
    <>
      <header className="aps-navbar portail-topbar">
        <div className="container-aps navbar-inner">
          <button
            type="button"
            className="portail-topbar-menu"
            aria-expanded={ouvert}
            aria-controls="portail-tiroir"
            onClick={() => setOuvert(true)}
          >
            <i className="fa-solid fa-bars" />
            <span>Menu</span>
            {totalBadges > 0 && <span className="portail-topbar-pastille" aria-label={`${totalBadges} nouveauté(s)`} />}
          </button>

          <Link to={accueil} className="aps-logo" aria-label={`ApSa — ${espace}`}>
            <img src={logoApsa} alt="ApSa — AZA Santé Assurances" className="aps-logo-img" />
          </Link>
          <span className="portail-topbar-espace">{espace}</span>

          <div className="aps-nav-actions">
            <NotificationsBell cheminRdv={cheminNotifications} />
            <button type="button" className="portail-topbar-compte" onClick={() => setOuvert(true)} aria-label="Mon compte">
              <span className="aps-av is-sm">{initiales(user)}</span>
            </button>
          </div>
        </div>
      </header>

      {ouvert && (
        <div className="portail-tiroir-fond" onClick={() => setOuvert(false)} aria-hidden="true" />
      )}
      <aside
        id="portail-tiroir"
        className={`portail-tiroir ${ouvert ? "is-open" : ""}`}
        aria-label={`Navigation — ${espace}`}
        aria-hidden={!ouvert}
        inert={!ouvert ? "" : undefined}
      >
        <div className="portail-tiroir-tete">
          <img src={logoApsa} alt="ApSa" className="portail-tiroir-logo" />
          <button type="button" className="portail-tiroir-fermer" onClick={() => setOuvert(false)} aria-label="Fermer le menu">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {user && (
          <div className="portail-tiroir-user">
            <span className="aps-av">{initiales(user)}</span>
            <div style={{ minWidth: 0 }}>
              <b className="text-truncate d-block">{nom}</b>
              <span className="aps-t-xs">{espace}</span>
            </div>
          </div>
        )}

        {/* Un clic sur une rubrique ferme le panneau. */}
        <nav className="portail-tiroir-nav" onClick={(e) => { if (e.target.closest("a")) setOuvert(false); }}>
          <div className="portail-tiroir-grp">Rubriques</div>
          {liens.map((l) => {
            const actif = pathname === l.to;
            const n = l.badge ? badges[l.badge] || 0 : 0;
            return (
              <Link key={l.to} to={l.to} className={actif ? "is-on" : ""} aria-current={actif ? "page" : undefined}>
                <i className={`fa-solid ${l.icon}`} /> {l.label}
                {n > 0 && <em>{n}</em>}
              </Link>
            );
          })}

          <div className="portail-tiroir-grp">Compte</div>
          {espaces.length > 1 && (
            <Link to="/choisir-espace"><i className="fa-solid fa-repeat" /> Changer d&apos;espace</Link>
          )}
          <Link to="/creer-mon-pin"><i className="fa-solid fa-key" /> {user?.pin_defini ? "Code PIN" : "Créer mon code PIN"}</Link>
          <Link to="/home"><i className="fa-solid fa-house" /> Site public</Link>
        </nav>

        <button type="button" className="portail-tiroir-sortie" onClick={seDeconnecter}>
          <i className="fa-solid fa-arrow-right-from-bracket" /> Déconnexion
        </button>
      </aside>
    </>
  );
}
