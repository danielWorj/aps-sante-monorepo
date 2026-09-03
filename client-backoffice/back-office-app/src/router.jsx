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
import MoyenPaiement from './pages/Moyenpaiement';
import Pharmacie from './pages/Pharmacie';
// PUBLICTE 
import Publicite from './pages/Publicite';
import EmplacementForfaire from './pages/EmplacementForfaire';
import ForfaitPublicitaire from './pages/ForfaitPublicitaire';
// ASSURANCES 
import Assurances from './pages/Assurances';
//URGENCES
import Urgences from './pages/urgences';
//MEDECIN 
import Medecin from './pages/Medecin';
import AvisMedecin from './pages/avisMedecin';
import AbonnementMedecin from './pages/AbonnementMedecin';
import Ordonnance from './pages/Ordonnance';

// RENDEZ VOUS
import RendezVous from './pages/RendezVous';

import AvisPharmacie from './pages/avisPharmacie';
import Utilisateurs from './pages/Utilisateurs';
import StructureSante from './pages/StructureSante';
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
          { path: '/moyen-paiement', element: <MoyenPaiement /> },
          { path: '/pharmacie', element: <Pharmacie /> },
          { path: '/avis-pharmacie', element: <AvisPharmacie /> },
          { path: '/utilisateurs', element: <Utilisateurs /> },
          { path: '/structure-sante', element: <StructureSante /> },
          // //   PUBLICITE,
          { path: '/publicite', element: <Publicite /> },
          { path: '/emplacement-publicitaire', element: <EmplacementForfaire /> },
          { path: '/forfait-publicitaire', element: <ForfaitPublicitaire /> },

          // ASSURANCES 
          { path: '/assurances', element: <Assurances /> },

          // URGENCES
          { path: '/urgences', element: <Urgences /> },
          //MEDECIN
          { path: '/medecin', element: <Medecin /> },
          { path: '/avis-medecin', element: <AvisMedecin /> },
          { path: '/abonnement-medecin', element: <AbonnementMedecin /> },
          { path: '/ordonnance', element: <Ordonnance /> },
          // RENDEZ VOUS 
          { path: '/rendez-vous', element: <RendezVous /> },
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