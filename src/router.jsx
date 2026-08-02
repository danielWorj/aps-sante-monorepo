import { createBrowserRouter } from 'react-router-dom';
import App from './App';
import Home from './pages/Home';
import Medecin from './pages/Medecin';
import Pharmacie from './pages/Pharmacie';
import ProfilMedecin from './pages/ProfilMedecin';
import RendezVous from './pages/RendezVous';
import Urgences from './pages/Urgence';
import Assurance from './pages/Assurance';
import Abonnement from './pages/Abonnement';
import FicheAssurance from './pages/FicheAssurance';

export const router = createBrowserRouter([
  {
    element: <App />, // Layout commun : Navbar + <Outlet /> + Footer
    children: [
      { path: '/', element: <Home /> },
      { path: '/home', element: <Home /> },
      { path: '/medecin', element: <Medecin /> },
      { path: '/pharmacie', element: <Pharmacie /> },
      { path: '/profil/:id', element: <ProfilMedecin /> },
      { path: '/rendez-vous/:id', element: <RendezVous /> },
      { path: '/urgences', element: <Urgences /> },
      { path: '/pricing', element: <Abonnement /> },
      { path: '/assurance', element: <Assurance /> },
      { path: "/assurances/:id", element: <FicheAssurance /> }
    ],
  },
]);