// portail-navbar.jsx — barre du portail médecin : bouton Menu + panneau
// vertical (voir portail-topbar.jsx). Les rubriques sont partagées avec la
// colonne de gauche (portail-sidebar.jsx) via medecin.liens.js.
import PortailTopbar from "./portail-topbar";
import { LIENS_PORTAIL_MEDECIN } from "./medecin.liens";
import { useAnnoncesNonLues } from "../../annonces/annoncesVues";

// `activePage` (ancienne API) n'est plus nécessaire : la rubrique active
// est déduite de l'URL.
// eslint-disable-next-line no-unused-vars
const PortailNavbar = ({ activePage }) => (
  <PortailTopbar
    espace="Espace médecin"
    accueil="/portail/medecin-tableau-de-bord"
    liens={LIENS_PORTAIL_MEDECIN}
    badges={{ annonces: useAnnoncesNonLues() }}
    cheminNotifications="/portail/medecin-rdv"
  />
);

export default PortailNavbar;
