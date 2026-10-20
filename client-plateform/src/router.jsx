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
import DemandeRapide from './pages/DemandeRapide';
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
import { ROLES_ESPACE } from './utils/roles';
import MedecinProfil from './components/portails/components/medecin-profil.jsx';
import MedecinRdv from './components/portails/components/medecin-rdv';
import MedecinAbonnement from './components/portails/components/medecin-abonnement.jsx';
// RDV aléatoire (RDV sur offre)
import MedecinDemandes from './components/portails/components/medecin-demandes.jsx';
// Réputation : tableau de bord (métriques) et avis & notes
import MedecinTableauDeBord from './components/portails/components/medecin-tableau-de-bord.jsx';
import MedecinAvis from './components/portails/components/medecin-avis.jsx';
import PatientDemandes from './components/portails/components/patient-demandes.jsx';
import Teleconsultation from './pages/Teleconsultation';

//PORTAIL ASSURANCE (agent d'une compagnie / d'un courtier)
import PortailAssuranceLayout from './Layouts/PortailAssuranceLayout.jsx';
import AssuranceDashboard from './components/portails/assurance/assurance-dashboard.jsx';
import AssuranceProfil from './components/portails/assurance/assurance-profil.jsx';
import AssuranceMedias from './components/portails/assurance/assurance-medias.jsx';
import AssuranceDemandes from './components/portails/assurance/assurance-demandes.jsx';
import AssuranceAbonnement from './components/portails/assurance/assurance-abonnement.jsx';

//PORTAIL PATIENT
import PatientRdv from './components/portails/components/patient-rdv';
import PatientProfil from './components/portails/components/patient-profil';
//PUBLICITE (réservation d'espace, paiement, portail annonceur)
import ReserverPublicite from './pages/ReserverPublicite.jsx';
import PaiementPublicite from './pages/PaiementPublicite.jsx';
import PaiementPubliciteSucces from './pages/PaiementPubliciteSucces.jsx';
import PaiementPubliciteAnnule from './pages/PaiementPubliciteAnnule.jsx';
import PortailAnnonceur from './pages/PortailAnnonceur.jsx';

//ANNONCES 
import FicheAnnonce from './pages/FicheAnnonce.jsx';
// CONNEXION NUMÉRO + PIN, ESPACES
import CreerPin from './pages/CreerPin.jsx';
import ChoisirEspace from './pages/ChoisirEspace.jsx';
import PinOublie from './pages/PinOublie.jsx';
import { AssuranceAnnonces, EspaceAnnonces, MedecinAnnonces, PatientAnnonces } from './components/portails/components/portail-annonces.jsx';

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
      // RDV aléatoire : ouvert aux visiteurs, compte patient créé (ou
      // connexion) avec la demande, comme pour /rendez-vous/:id.
      { path: '/demande-rapide', element: <DemandeRapide /> },
      { path: '/urgences', element: <Urgences /> },
      { path: '/pricing', element: <Abonnement /> },
      { path: '/login', element: <Login /> },
      { path: '/modifier-mot-de-passe', element: <ModifPassword /> },
      // Créer / changer son code PIN (session ouverte), ou remplacer un PIN
      // provisoire (token restreint dans le state) : la page gère les deux.
      { path: '/creer-mon-pin', element: <CreerPin /> },
      { path: '/pin-oublie', element: <PinOublie /> },
      {
        element: <RequireAuth roles={ROLES_ESPACE.compte} />,
        children: [{ path: '/choisir-espace', element: <ChoisirEspace /> }],
      },
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
      // Publicité : retours de paiement (Stripe Checkout / Mobile Money)
      { path: '/paiement/publicite/succes', element: <PaiementPubliciteSucces /> },
      { path: '/paiement/publicite/annule', element: <PaiementPubliciteAnnule /> },
      // Réservation publicitaire : ouverte aux visiteurs, le compte annonceur
      // est créé avec la demande (« Rejoindre mon espace » si déjà inscrit).
      { path: '/publicite/reserver', element: <ReserverPublicite /> },
      // Espaces gestionnaire : chaque garde n'admet que le rôle de l'espace
      // (le serveur vérifie en plus que l'agent gère bien la fiche).
      {
        element: <RequireAuth roles={ROLES_ESPACE.assurance} />,
        children: [
          { path: '/mon-espace-assurance', element: <MonEspaceAssurance /> },
          { path: '/assurances/:id/gestion', element: <GestionAssurance /> },
        ],
      },
      // Espaces gestionnaire pharmacie / centre de santé (abonnement de présence)
      {
        element: <RequireAuth roles={ROLES_ESPACE.pharmacie} />,
        children: [
          { path: '/mon-espace-pharmacie', element: <MonEspacePresence key="pharmacie" type="pharmacie" /> },
          { path: '/pharmacie/:id/gestion', element: <GestionPresence key="pharmacie" type="pharmacie" /> },
        ],
      },
      {
        element: <RequireAuth roles={ROLES_ESPACE.structure} />,
        children: [
          { path: '/mon-espace-structure', element: <MonEspacePresence key="structure" type="structure" /> },
          { path: '/structure-sante/:id/gestion', element: <GestionPresence key="structure" type="structure" /> },
        ],
      },
      // Publicité : compte obligatoire pour payer et suivre ses statistiques
      // (la réservation, elle, est publique : voir plus haut).
      {
        element: <RequireAuth roles={ROLES_ESPACE.publicite} />,
        children: [
          { path: '/publicite/:id/paiement', element: <PaiementPublicite /> },
          { path: '/portail/annonceur', element: <PortailAnnonceur /> },
          { path: '/portail/annonceur/publicites/:id', element: <PortailAnnonceur /> },
        ],
      },
      // Annonces reçues des espaces sans portail dédié (pharmacie, structure,
      // annonceur) ; patient, médecin et assurance les ont dans leur portail.
      {
        element: <RequireAuth roles={ROLES_ESPACE.annonces} />,
        children: [{ path: '/mes-annonces', element: <EspaceAnnonces /> }],
      },
    ],
  },
  {
    element: <RequireAuth roles={ROLES_ESPACE.medecin} />,
    children:[
      {
        element:<PortailLayout />,
        children:[
          { path: '/portail/medecin-agenda', element: <MedecinAgenda /> },
          { path: '/portail/medecin-rdv', element: <MedecinRdv /> },
          { path: '/portail/medecin-profil', element: <MedecinProfil /> },
          { path: '/portail/medecin-abonnement', element: <MedecinAbonnement /> },
          { path: '/portail/medecin-demandes', element: <MedecinDemandes /> },
          { path: '/portail/medecin-tableau-de-bord', element: <MedecinTableauDeBord /> },
          { path: '/portail/medecin-avis', element: <MedecinAvis /> },
          { path: '/portail/medecin-annonces', element: <MedecinAnnonces /> },
        ]
      },
    ],
  },
  {
    element: <RequireAuth roles={ROLES_ESPACE.patient} />,
    children:[
      {
        element:<PortailParentLayout />,
        children:[
          { path: '/portail/patient-rdv', element: <PatientRdv /> },
          { path: '/portail/patient-demandes', element: <PatientDemandes /> },
          { path: '/portail/patient-profil', element: <PatientProfil /> },
          { path: '/portail/patient-annonces', element: <PatientAnnonces /> },
        ]
      },
    ],
  },
  // Hors des layouts de portail volontairement : page plein écran (pas de
  // navbar/sidebar/footer) pour l'appel vidéo, ouverte aux deux parties
  // du rendez-vous (le serveur vérifie l'appartenance au RDV).
  {
    element: <RequireAuth roles={ROLES_ESPACE.consultation} />,
    children: [
      { path: '/portail/consultation/:id', element: <Teleconsultation /> },
    ],
  },
  {
    element: <RequireAuth roles={ROLES_ESPACE.assurance} />,
    children: [
      {
        element: <PortailAssuranceLayout />,
        children: [
          { path: '/portail/assurance', element: <AssuranceDashboard /> },
          { path: '/portail/assurance-demandes', element: <AssuranceDemandes /> },
          { path: '/portail/assurance-profil', element: <AssuranceProfil /> },
          { path: '/portail/assurance-medias', element: <AssuranceMedias /> },
          { path: '/portail/assurance-abonnement', element: <AssuranceAbonnement /> },
          { path: '/portail/assurance-annonces', element: <AssuranceAnnonces /> },
        ],
      },
    ],
  },
]);