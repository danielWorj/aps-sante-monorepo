// src/layouts/PrivateLayout.jsx
//
// Layout de l'espace d'administration : Sidebar + Navbar encadrant le
// contenu de chaque page (ex-contenu de App.jsx).
//
// ⚠️ Ce layout n'est jamais monté directement par une route publique :
// dans router.jsx il est placé sous <RequireAuth/>, qui garantit
// qu'aucune page ici ne s'affiche sans session valide.
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';

export default function PrivateLayout() {
  return (
    <div className="aps-app" id="apsApp">
      <Sidebar />
      <div className="aps-main">
        <Navbar />
        <Outlet />
      </div>
    </div>
  );
}