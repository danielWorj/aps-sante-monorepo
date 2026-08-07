// src/router.jsx
//
// Deux branches totalement séparées :
//
//  1) Espace PUBLIC (PublicLayout) : aucune Navbar/Sidebar. Aujourd'hui
//     uniquement /login, mais toute future page publique (mot de passe
//     oublié, etc.) se rattache ici.
//
//  2) Espace PRIVÉ (RequireAuth > PrivateLayout) : protégé par
//     RequireAuth, qui redirige vers /login si aucune session valide
//     n'est trouvée (voir routes/RequireAuth.jsx). PrivateLayout
//     n'est donc jamais rendu pour un visiteur non authentifié.
import { createBrowserRouter } from 'react-router-dom';

import PublicLayout from './layouts/PublicLayout';
import PrivateLayout from './layouts/PrivateLayout';
import RequireAuth from './routes/RequireAuth';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Referentiel from './pages/Referentiel';
import Utilisateurs from './pages/Utilisateurs';
// import Medecin from './pages/Medecin';
// import StructureSante from './pages/StructureSante';
// import Pharmacie from './pages/Pharmacie';
// import Assurance from './pages/Assurances';

export const router = createBrowserRouter([
  // ─── Espace public : pas de Navbar/Sidebar ───────────────────
  {
    element: <PublicLayout />,
    children: [
      { path: '/login', element: <Login /> },
      // { path: '/mot-de-passe-oublie', element: <MotDePasseOublie /> },
    ],
  },

  // ─── Espace admin : protégé, encadré par Navbar/Sidebar ──────
  {
    element: <RequireAuth />,
    children: [
      {
        element: <PrivateLayout />,
        children: [
          { path: '/', element: <Dashboard /> },
          { path: '/dashboard', element: <Dashboard /> },
          { path: '/referentiel', element: <Referentiel /> },
          { path: '/utilisateurs', element: <Utilisateurs /> },
          //   { path: '/medecin', element: <Medecin /> },
          //   { path: '/pharmacie', element: <Pharmacie /> },
          //   { path: '/structure-sante', element: <StructureSante /> },
          //   { path: '/profil/:id', element: <ProfilMedecin /> },
          //   { path: '/rendez-vous/:id', element: <RendezVous /> },
          //   { path: '/urgences', element: <Urgences /> },
          //   { path: '/pricing', element: <Abonnement /> },
          //   { path: '/assurance', element: <Assurance /> },
          //   { path: "/assurances/:id", element: <FicheAssurance /> }
        ],
      },
    ],
  },
]);