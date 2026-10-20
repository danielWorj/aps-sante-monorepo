// patient.portail-navbar.jsx — barre du portail patient : bouton Menu +
// panneau vertical (voir portail-topbar.jsx).
import PortailTopbar from "./portail-topbar";
import { useAnnoncesNonLues } from "../../annonces/annoncesVues";

const LIENS = [
  { label: "Mes rendez-vous", to: "/portail/patient-rdv", icon: "fa-calendar-check" },
  { label: "Demandes express", to: "/portail/patient-demandes", icon: "fa-bullhorn" },
  { label: "Annonces", to: "/portail/patient-annonces", icon: "fa-bell", badge: "annonces" },
  { label: "Profil", to: "/portail/patient-profil", icon: "fa-user" },
];

// eslint-disable-next-line no-unused-vars
const PatientPortailNavbar = ({ activePage }) => (
  <PortailTopbar
    espace="Espace patient"
    accueil="/portail/patient-rdv"
    liens={LIENS}
    badges={{ annonces: useAnnoncesNonLues() }}
    cheminNotifications="/portail/patient-rdv"
  />
);

export default PatientPortailNavbar;
