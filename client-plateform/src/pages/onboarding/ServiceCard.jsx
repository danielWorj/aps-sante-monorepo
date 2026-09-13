import { Link } from 'react-router-dom';

/**
 * Carte d'un service de l'annuaire APS Santé (Écran 1.1).
 *
 * Réutilise les classes déjà stylées `.cat-card / .cat-icon /
 * .cat-title / .cat-sub` (voir Home.jsx et style.css) plutôt que d'en
 * introduire de nouvelles, pour garder le même rendu (icône teintée,
 * chevron) que le bloc "Explorez nos services" de la page d'accueil.
 *
 * `disabled` : service annoncé mais sans annuaire dédié pour le
 * moment (ex. Pompes funèbres). La carte reste visible mais n'est
 * plus un lien.
 */
export default function ServiceCard({ to, icon, title, subtitle, disabled = false }) {
  const content = (
    <>
      <span className="cat-icon"><i className={`fa-solid ${icon}`} /></span>
      <span>
        <span className="cat-title">{title}</span>
        <span className="cat-sub">{subtitle}</span>
      </span>
      {!disabled && <i className="fa-solid fa-chevron-right" />}
    </>
  );

  if (disabled) {
    return (
      <span className="cat-card is-disabled" aria-disabled="true">
        {content}
      </span>
    );
  }

  return (
    <Link to={to} className="cat-card">
      {content}
    </Link>
  );
}