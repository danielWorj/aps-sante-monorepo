import { useLayoutEffect } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';

/**
 * Racine de toutes les routes : remet la page en haut à chaque changement
 * de page.
 *
 * Sans elle, la nouvelle page héritait de la position de défilement de la
 * précédente : encore courte pendant son chargement, elle se retrouvait
 * calée sur le pied de page, puis `html{scroll-behavior:smooth}` faisait
 * défiler visiblement. On remonte donc AVANT le rendu à l'écran
 * (useLayoutEffect) et sans animation (behavior: 'instant').
 *
 * - Liens avec ancre (/home#application, /contact#faq) : la page gère le
 *   défilement vers l'ancre elle-même, on n'y touche pas.
 * - Retour / avance du navigateur (POP) : on laisse la position telle quelle.
 */
export default function RacineNavigation() {
  const { pathname, hash } = useLocation();
  const typeNavigation = useNavigationType();

  useLayoutEffect(() => {
    if (hash || typeNavigation === 'POP') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Outlet />;
}
