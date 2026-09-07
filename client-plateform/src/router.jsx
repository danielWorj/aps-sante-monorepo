import { createBrowserRouter } from 'react-router-dom';
import App from './App';
import Home from './pages/Home';
import Medecin from './pages/Medecin';
import CreerPatient from './components/patient/creerPatient.jsx'
import CreationMedecin from './components/medecin/creationMedecin';
import InscriptionPortail from './pages/inscriptionportail.jsx';

import Pharmacie from './pages/Pharmacie';
import FichePharmacie from './pages/FichePharmacie.jsx';
import CreationPharmacie from './components/pharmacie/creationPharmacie.jsx';

import StructureSante from './pages/StructureSante';
import FicheStructureSante from './pages/FicheStructureSante.jsx';
import CreationCentreSante from './components/centre-sante/creationCentreSante.jsx';


import ProfilMedecin from './pages/ProfilMedecin';
import RendezVous from './pages/RendezVous';
import Urgences from './pages/Urgence';
import Login from './pages/Login';
import ModifPassword from './pages/ModifPassword';

import Assurance from './pages/Assurance';
import Abonnement from './pages/Abonnement';
import FicheAssurance from './pages/FicheAssurance';
import CreationAssurance from './components/assurances/creationAssurance.jsx';


//PORTAIL 

import PortailLayout from './Layouts/PortailLayout';
import PortailParentLayout from './Layouts/PortailPatientLayout.jsx';


import MedecinAgenda from './components/portails/components/medecin-agenda';
import RequireAuth from './routes/RequireAuth';
import MedecinProfil from './components/portails/components/medecin-profil.jsx';
import MedecinRdv from './components/portails/components/medecin-rdv';
import Teleconsultation from './pages/Teleconsultation';

//PORTAIL PATIENT
import PatientRdv from './components/portails/components/patient-rdv';
import PatientProfil from './components/portails/components/patient-profil';
//PUBLICITE 

//ANNONCES 
import FicheAnnonce from './pages/FicheAnnonce.jsx';

export const router = createBrowserRouter([
  {
    element: <App />, // Layout commun : Navbar + <Outlet /> + Footer
    children: [
      { path: '/', element: <Home /> },
      { path: '/home', element: <Home /> },
      { path: '/inscription', element: <InscriptionPortail /> },
      { path: '/medecin', element: <Medecin /> },
      { path: '/devenir-medecin', element: <CreationMedecin /> },
      { path: '/creer-patient', element: <CreerPatient /> },

      { path: '/pharmacie', element: <Pharmacie /> },
      { path: '/pharmacie/:id', element: <FichePharmacie /> },
      { path: '/pharmacie/creation', element: <CreationPharmacie /> },
      //CENTRE DE SANTE
      { path: '/structure-sante', element: <StructureSante /> },
      { path: '/structure-sante/:id', element: <FicheStructureSante /> },
      { path: '/structure-sante/creation', element: <CreationCentreSante />},
      

      { path: '/profil/:id', element: <ProfilMedecin /> },
      { path: '/rendez-vous/:id', element: <RendezVous /> },
      { path: '/urgences', element: <Urgences /> },
      { path: '/pricing', element: <Abonnement /> },
      { path: '/login', element: <Login /> },
      { path: '/modifier-mot-de-passe', element: <ModifPassword /> },
      // ASSURANCE
      { path: '/assurance', element: <Assurance /> },
      { path: "/assurances/:id", element: <FicheAssurance /> }, 
      { path: '/assurances/creation', element: <CreationAssurance /> }, 

      //ANNONCE 
      {path: '/annonces/:id', element: <FicheAnnonce />},
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
      },
      // Hors PortailLayout volontairement : page plein écran (pas de
      // navbar/sidebar/footer) pour l'appel vidéo, tout en restant
      // protégée par RequireAuth ci-dessus.
      { path: '/portail/consultation/:id', element: <Teleconsultation /> },
    ],

  },
  ,
  {
    element:<RequireAuth />,
    children:[
      {
        element:<PortailParentLayout />,
        children:[
          { path: '/portail/patient-rdv', element: <PatientRdv /> },
          { path: '/portail/patient-profil', element: <PatientProfil /> },
          //{ path: '/portail/patient-profil', element: <PatientProfil /> },
        ]
      },
      // Hors PortailLayout volontairement : page plein écran (pas de
      // navbar/sidebar/footer) pour l'appel vidéo, tout en restant
      // protégée par RequireAuth ci-dessus.
      { path: '/portail/consultation/:id', element: <Teleconsultation /> },
    ],

  }
]);