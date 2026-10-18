import { createBrowserRouter } from 'react-router-dom';
import App from './App';
import Home from './pages/Home';
import Medecin from './pages/Medecin';
import CreerPatient from './components/patient/creerPatient.jsx'
import CreationMedecin from './components/medecin/creationMedecin';
import InscriptionPortail from './pages/inscriptionportail.jsx';
import PaiementSucces from './pages/PaiementSucces.jsx';
import PaiementAnnule from './pages/PaiementAnnule.jsx';

// ONBOARDING (croquis : Écran 1 → 1.1 → 1.1.1/1.1.2 → 1.1.3)
import OnboardingAccueil from './pages/onboarding/OnboardingAccueil.jsx';
import OnboardingServices from './pages/onboarding/OnboardingServices.jsx';
import OnboardingMedecinVille from './pages/onboarding/OnboardingMedecinVille.jsx';
import OnboardingMedecinSpecialite from './pages/onboarding/OnboardingMedecinSpecialite.jsx';
import OnboardingAssuranceVille from './pages/onboarding/OnboardingAssuranceVille.jsx';
import OnboardingAssuranceType from './pages/onboarding/OnboardingAssuranceType.jsx';

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
import GestionAssurance from './pages/GestionAssurance.jsx';
import MonEspaceAssurance from './pages/MonEspaceAssurance.jsx';
import PaiementAbonnementSucces from './pages/PaiementAbonnementSucces.jsx';
import PaiementAbonnementAnnule from './pages/PaiementAbonnementAnnule.jsx';
// Abonnements de présence : pharmacies, centres de santé, médecins
import GestionPresence from './pages/GestionPresence.jsx';
import MonEspacePresence from './pages/MonEspacePresence.jsx';
import PaiementAbonnementPresenceSucces from './pages/PaiementAbonnementPresenceSucces.jsx';
import PaiementAbonnementPresenceAnnule from './pages/PaiementAbonnementPresenceAnnule.jsx';


//PORTAIL 

import PortailLayout from './Layouts/PortailLayout';
import PortailParentLayout from './Layouts/PortailPatientLayout.jsx';
import OnboardingLayout from './Layouts/OnboardingLayout.jsx';


import MedecinAgenda from './components/portails/components/medecin-agenda';
import RequireAuth from './routes/RequireAuth';
import MedecinProfil from './components/portails/components/medecin-profil.jsx';
import MedecinRdv from './components/portails/components/medecin-rdv';
import MedecinAbonnement from './components/portails/components/medecin-abonnement.jsx';
// RDV aléatoire (RDV sur offre)
import MedecinDemandes from './components/portails/components/medecin-demandes.jsx';
import PatientDemandes from './components/portails/components/patient-demandes.jsx';
import Teleconsultation from './pages/Teleconsultation';

//PORTAIL PATIENT
import PatientRdv from './components/portails/components/patient-rdv';
import PatientProfil from './components/portails/components/patient-profil';
//PUBLICITE 

//ANNONCES 
import FicheAnnonce from './pages/FicheAnnonce.jsx';

export const router = createBrowserRouter([
  {
    // ONBOARDING : sans Navbar ni Footer
    element: <OnboardingLayout />,
    children: [
      { path: '/', element: <OnboardingAccueil /> },
      { path: '/onboarding', element: <OnboardingAccueil /> },
      { path: '/onboarding/services', element: <OnboardingServices /> },
      { path: '/onboarding/medecins/ville', element: <OnboardingMedecinVille /> },
      { path: '/onboarding/medecins/specialite', element: <OnboardingMedecinSpecialite /> },
      { path: '/onboarding/assurances/ville', element: <OnboardingAssuranceVille /> },
      { path: '/onboarding/assurances/type', element: <OnboardingAssuranceType /> },
    ],
  },
  {
    element: <App />, // Layout commun : Navbar + <Outlet /> + Footer
    children: [
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
      //PAIEMENTS
      { path: '/paiement/succes', element: <PaiementSucces /> },
      { path: '/paiement/annule', element: <PaiementAnnule /> },
      // Abonnements assurance (guide abonnements v3, §2.2.4)
      { path: '/paiement/abonnement/succes', element: <PaiementAbonnementSucces /> },
      { path: '/paiement/abonnement/annule', element: <PaiementAbonnementAnnule /> },
      // Abonnements de présence (pharmacies, centres de santé, médecins)
      { path: '/paiement/abonnement-presence/succes', element: <PaiementAbonnementPresenceSucces /> },
      { path: '/paiement/abonnement-presence/annule', element: <PaiementAbonnementPresenceAnnule /> },
      // Espace gestionnaire assurance : connexion requise (le serveur vérifie
      // en plus que l'utilisateur est l'agent de la fiche ou un admin).
      {
        element: <RequireAuth />,
        children: [
          { path: '/mon-espace-assurance', element: <MonEspaceAssurance /> },
          { path: '/assurances/:id/gestion', element: <GestionAssurance /> },
          // Espaces gestionnaire pharmacie / centre de santé (abonnement de présence)
          { path: '/mon-espace-pharmacie', element: <MonEspacePresence key="pharmacie" type="pharmacie" /> },
          { path: '/mon-espace-structure', element: <MonEspacePresence key="structure" type="structure" /> },
          { path: '/pharmacie/:id/gestion', element: <GestionPresence key="pharmacie" type="pharmacie" /> },
          { path: '/structure-sante/:id/gestion', element: <GestionPresence key="structure" type="structure" /> },
        ],
      },
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
          { path: '/portail/medecin-abonnement', element: <MedecinAbonnement /> },
          { path: '/portail/medecin-demandes', element: <MedecinDemandes /> },
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
          { path: '/portail/patient-demandes', element: <PatientDemandes /> },
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