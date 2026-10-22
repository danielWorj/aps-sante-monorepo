// laboratoire.portail-navbar.jsx — barre du portail laboratoire : bouton
// Menu + panneau vertical (voir portail-topbar.jsx). La cloche mène au
// tableau de bord (avis reçus, activité de la fiche).
import PortailTopbar from "./portail-topbar";
import { useAnnoncesNonLues } from "../../annonces/annoncesVues";
import { LIENS_PORTAIL_LABORATOIRE } from "./laboratoire.liens";

const LaboratoirePortailNavbar = () => (
  <PortailTopbar
    espace="Espace laboratoire"
    accueil="/portail/laboratoire"
    liens={LIENS_PORTAIL_LABORATOIRE}
    badges={{ annonces: useAnnoncesNonLues() }}
    cheminNotifications="/portail/laboratoire"
  />
);

export default LaboratoirePortailNavbar;
