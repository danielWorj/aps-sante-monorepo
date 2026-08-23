// src/layouts/PublicLayout.jsx
//
// Layout des pages publiques (connexion, mot de passe oublié...).
// Volontairement minimal : pas de Navbar ni de Sidebar, chaque page
// gère elle-même toute sa mise en page (voir pages/Login.jsx).
import { Outlet } from 'react-router-dom';

export default function PublicLayout() {
  return <Outlet />;
}