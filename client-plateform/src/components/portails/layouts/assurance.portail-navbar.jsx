// assurance.portail-navbar.jsx — barre du portail assurance : bouton Menu +
// panneau vertical (voir portail-topbar.jsx). La cloche mène aux demandes.
import PortailTopbar from "./portail-topbar";
import { useAnnoncesNonLues } from "../../annonces/annoncesVues";
import { LIENS_PORTAIL_ASSURANCE } from "./assurance.liens";

const AssurancePortailNavbar = ({ nouvellesDemandes = 0 }) => (
  <PortailTopbar
    espace="Espace assurance"
    accueil="/portail/assurance"
    liens={LIENS_PORTAIL_ASSURANCE}
    badges={{ demandes: nouvellesDemandes, annonces: useAnnoncesNonLues() }}
    cheminNotifications="/portail/assurance-demandes"
  />
);

export default AssurancePortailNavbar;
