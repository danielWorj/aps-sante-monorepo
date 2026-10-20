// portail-navbar.jsx — barre du portail médecin : bouton Menu + panneau
// vertical (voir portail-topbar.jsx). Les rubriques sont celles de la
// colonne de gauche (portail-sidebar.jsx).
import PortailTopbar from "./portail-topbar";
import { useAnnoncesNonLues } from "../../annonces/annoncesVues";

const LIENS = [
  { label: "Tableau de bord", to: "/portail/medecin-tableau-de-bord", icon: "fa-chart-line" },
  { label: "Rendez-vous", to: "/portail/medecin-rdv", icon: "fa-calendar-check" },
  { label: "Agenda", to: "/portail/medecin-agenda", icon: "fa-calendar-days" },
  { label: "Demandes patients", to: "/portail/medecin-demandes", icon: "fa-bullhorn" },
  { label: "Avis & notes", to: "/portail/medecin-avis", icon: "fa-star" },
  { label: "Annonces", to: "/portail/medecin-annonces", icon: "fa-bell", badge: "annonces" },
  { label: "Profil", to: "/portail/medecin-profil", icon: "fa-user-doctor" },
  { label: "Abonnement", to: "/portail/medecin-abonnement", icon: "fa-id-card-clip" },
];

// `activePage` (ancienne API) n'est plus nécessaire : la rubrique active
// est déduite de l'URL.
// eslint-disable-next-line no-unused-vars
const PortailNavbar = ({ activePage }) => (
  <PortailTopbar
    espace="Espace médecin"
    accueil="/portail/medecin-tableau-de-bord"
    liens={LIENS}
    badges={{ annonces: useAnnoncesNonLues() }}
    cheminNotifications="/portail/medecin-rdv"
  />
);

export default PortailNavbar;
