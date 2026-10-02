import { Outlet } from 'react-router-dom';

/**
 * Layout des pages d'onboarding : volontairement sans Navbar, Annonce
 * ni Footer (contrairement à App.jsx), pour un parcours plein écran
 * centré sur le choix de l'utilisateur.
 */
export default function OnboardingLayout() {
  return <Outlet />;
}