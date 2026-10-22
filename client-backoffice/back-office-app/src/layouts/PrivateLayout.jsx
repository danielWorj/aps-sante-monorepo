// src/layouts/PrivateLayout.jsx
//
// Layout de l'espace d'administration : Sidebar + Navbar encadrant le
// contenu de chaque page (ex-contenu de App.jsx).
//
// ⚠️ Ce layout n'est jamais monté directement par une route publique :
// dans router.jsx il est placé sous <RequireAuth/>, qui garantit
// qu'aucune page ici ne s'affiche sans session valide.
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { estRouteSuperadmin, estSuperadmin } from '../utils/roles';

export default function PrivateLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  // Écran commun à tous les pays ouvert par un admin (lien direct) : le
  // serveur refuserait de toute façon, on l'explique plutôt qu'une erreur.
  const reserve = estRouteSuperadmin(pathname) && !estSuperadmin(user);

  return (
    <div className="aps-app" id="apsApp">
      <Sidebar />
      <div className="aps-main">
        <Navbar />
        {reserve ? (
          <main className="aps-content">
            <div className="aps-empty-state">
              <i className="fa-solid fa-user-shield" />
              <div>Cet écran règle des paramètres communs à tous les pays : il est réservé au superadmin.</div>
            </div>
          </main>
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  );
}