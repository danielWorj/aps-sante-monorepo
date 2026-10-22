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
// LABORATOIRES D'ANALYSES
import Laboratoires from './pages/Laboratoires';
import AvisLaboratoire from './pages/AvisLaboratoire';
// PUBLICTE 
import Publicite from './pages/Publicite';
import EmplacementForfaire from './pages/EmplacementForfaire';
import ForfaitPublicitaire from './pages/ForfaitPublicitaire';
// ANNONCES
import Annonces from './pages/Annonces';
// ASSURANCES 
import Assurances from './pages/Assurances';
import AbonnementsAssurance from './pages/AbonnementsAssurance';
import NiveauxAbonnementAssurance from './pages/NiveauxAbonnementAssurance';
import TarifsAbonnementAssurance from './pages/TarifsAbonnementAssurance';
import PaiementsAbonnementAssurance from './pages/PaiementsAbonnementAssurance';
// Abonnements de présence : pharmacies, centres de santé, médecins
import AbonnementsPresence from './pages/AbonnementsPresence';
import NiveauxAbonnementPresence from './pages/NiveauxAbonnementPresence';
import TarifsAbonnementPresence from './pages/TarifsAbonnementPresence';
import PaiementsAbonnementPresence from './pages/PaiementsAbonnementPresence';
import PagePresence from './components/PagePresence';
//URGENCES
import Urgences from './pages/urgences';
//MEDECIN 
import Medecin from './pages/Medecin';
import AvisMedecin from './pages/avisMedecin';
import AbonnementMedecin from './pages/AbonnementMedecin';
import Ordonnance from './pages/Ordonnance';
import Retraits from './pages/Retraits';

// RENDEZ VOUS
import RendezVous from './pages/RendezVous';

import AvisPharmacie from './pages/avisPharmacie';
import Utilisateurs from './pages/Utilisateurs';
import StructureSante from './pages/StructureSante';

//APK 

import GestionApk from './pages/GestionApk';
// WHATSAPP
import WhatsApp from './pages/WhatsApp';
// SMS (Twilio)
import Sms from './pages/Sms';
import MessagesContact from './pages/MessagesContact';
import DocumentsLegaux from './pages/DocumentsLegaux';
// import Medecin from './pages/Medecin';
// import StructureSante from './pages/StructureSante';
// import Pharmacie from './pages/Pharmacie';
// import Assurance from './pages/Assurances';

// FONDS
import FraisAgregateur from './pages/FraisAgregateur';
import LignesTarifaires from './pages/LignesTarifaires';
import ParametreAmende from './pages/ParametreAmende';
import ParametreDelaiLiberation from './pages/ParametreDelaiLiberation';
import ParametreDelaiConfirmation from './pages/ParametreDelaiConfirmation';
import OffresRdv from './pages/OffresRdv';
import RemboursementsCampay from './pages/RemboursementsCampay';

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
          { path: '/laboratoires', element: <Laboratoires /> },
          { path: '/avis-laboratoire', element: <AvisLaboratoire /> },
          { path: '/utilisateurs', element: <Utilisateurs /> },
          { path: '/structure-sante', element: <StructureSante /> },
          // //   PUBLICITE,
          { path: '/publicite', element: <Publicite /> },
          { path: '/emplacement-publicitaire', element: <EmplacementForfaire /> },
          { path: '/forfait-publicitaire', element: <ForfaitPublicitaire /> },
          // ANNONCES 
          { path: '/annonces', element: <Annonces /> },
          // ASSURANCES 
          { path: '/assurances', element: <Assurances /> },
          // Abonnements des assurances (guide abonnements v3, §3)
          { path: '/abonnements-assurance', element: <AbonnementsAssurance /> },
          { path: '/niveaux-abonnement-assurance', element: <NiveauxAbonnementAssurance /> },
          { path: '/tarifs-abonnement-assurance', element: <TarifsAbonnementAssurance /> },
          { path: '/paiements-abonnement-assurance', element: <PaiementsAbonnementAssurance /> },
          // Abonnements de présence (pharmacies, centres de santé, médecins)
          { path: '/abonnements-presence/:type', element: <PagePresence page={AbonnementsPresence} /> },
          { path: '/niveaux-abonnement-presence/:type', element: <PagePresence page={NiveauxAbonnementPresence} /> },
          { path: '/tarifs-abonnement-presence/:type', element: <PagePresence page={TarifsAbonnementPresence} /> },
          { path: '/paiements-abonnement-presence/:type', element: <PagePresence page={PaiementsAbonnementPresence} /> },

          // URGENCES
          { path: '/urgences', element: <Urgences /> },
          //MEDECIN
          { path: '/medecin', element: <Medecin /> },
          { path: '/avis-medecin', element: <AvisMedecin /> },
          { path: '/abonnement-medecin', element: <AbonnementMedecin /> },
          { path: '/ordonnance', element: <Ordonnance /> },
          { path: '/retraits', element: <Retraits /> },
          { path: '/frais-agregateur', element: <FraisAgregateur /> },
          { path: '/lignes-tarifaires', element: <LignesTarifaires /> },
          { path: '/parametre-amende', element: <ParametreAmende /> },
          { path: '/parametre-delai-liberation', element: <ParametreDelaiLiberation /> },
          { path: '/parametre-delai-confirmation', element: <ParametreDelaiConfirmation /> },
          { path: '/remboursements-campay', element: <RemboursementsCampay /> },

          // RENDEZ VOUS 
          { path: '/rendez-vous', element: <RendezVous /> },
          { path: '/offres-rdv', element: <OffresRdv /> },
          // APK
          { path: '/apk', element: <GestionApk /> },
          // WHATSAPP : numéro expéditeur, test, journal des envois
          { path: '/whatsapp', element: <WhatsApp /> },
          // SMS (Twilio) : configuration, test, journal des envois
          { path: '/sms', element: <Sms /> },
          { path: '/messages-contact', element: <MessagesContact /> },
          { path: '/documents-legaux', element: <DocumentsLegaux /> },
          
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