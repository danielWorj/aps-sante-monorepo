// patient.portail-navbar.jsx — barre du portail patient : bouton Menu +
// panneau vertical (voir portail-topbar.jsx). Les rubriques sont partagées
// avec la sidebar (patient.portail-sidebar.jsx) via patient.liens.js.
import PortailTopbar from "./portail-topbar";
import { LIENS_PORTAIL_PATIENT } from "./patient.liens";
import { useAnnoncesNonLues } from "../../annonces/annoncesVues";

// eslint-disable-next-line no-unused-vars
const PatientPortailNavbar = ({ activePage }) => (
  <PortailTopbar
    espace="Espace patient"
    accueil="/portail/patient-rdv"
    liens={LIENS_PORTAIL_PATIENT}
    badges={{ annonces: useAnnoncesNonLues() }}
    cheminNotifications="/portail/patient-rdv"
  />
);

export default PatientPortailNavbar;
