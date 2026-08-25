import { createBrowserRouter } from 'react-router-dom';
import App from './App';
import Home from './pages/Home';
import Medecin from './pages/Medecin';
import CreationMedecin from './components/medecin/creationMedecin';


import Pharmacie from './pages/Pharmacie';
import StructureSante from './pages/StructureSante';
import ProfilMedecin from './pages/ProfilMedecin';
import RendezVous from './pages/RendezVous';
import Urgences from './pages/Urgence';
import Login from './pages/Login';
import ModifPassword from './pages/ModifPassword';
import Assurance from './pages/Assurance';
import Abonnement from './pages/Abonnement';
import FicheAssurance from './pages/FicheAssurance';

//PORTAIL 

import PortailLayout from './Layouts/PortailLayout';
import MedecinAgenda from './components/portails/components/medecin-agenda';
import RequireAuth from './routes/RequireAuth';
import MedecinProfil from './components/portails/components/medecin-profil.jsx';
import MedecinRdv from './components/portails/components/medecin-rdv';

export const router = createBrowserRouter([
  {
    element: <App />, // Layout commun : Navbar + <Outlet /> + Footer
    children: [
      { path: '/', element: <Home /> },
      { path: '/home', element: <Home /> },
      { path: '/medecin', element: <Medecin /> },
      { path: '/create-medecin', element: <CreationMedecin /> },


      { path: '/pharmacie', element: <Pharmacie /> },
      { path: '/structure-sante', element: <StructureSante /> },
      { path: '/profil/:id', element: <ProfilMedecin /> },
      { path: '/rendez-vous/:id', element: <RendezVous /> },
      { path: '/urgences', element: <Urgences /> },
      { path: '/pricing', element: <Abonnement /> },
      { path: '/login', element: <Login /> },
      { path: '/modifier-mot-de-passe', element: <ModifPassword /> },
      { path: '/assurance', element: <Assurance /> },
      { path: "/assurances/:id", element: <FicheAssurance /> }
    ],
  },
  {
    element:<RequireAuth />,
    children:[
      {
        element:<PortailLayout />,
        children:[
          { path: '/portail/medecin-agenda', element: <MedecinAgenda /> },
          { path: '/portail/medecin-rdv', element: <MedecinRdv /> },
          { path: '/portail/medecin-profil', element: <MedecinProfil /> },
          // { path: '/portail/medecin-rdv', element: <MedecinAgenda /> },
          // { path: '/portail/medecin-agenda', element: <MedecinAgenda /> },
          // { path: '/portail/medecin-agenda', element: <MedecinAgenda /> },
        ]
      }
    ],

  }
]);