// Rubriques du portail patient (navbar + sidebar) : une seule liste pour
// que les deux menus ne divergent plus.
export const LIENS_PORTAIL_PATIENT = [
  { label: "Mes rendez-vous", to: "/portail/patient-rdv", icon: "fa-calendar-check", badge: "rdv" },
  { label: "Demandes express", to: "/portail/patient-demandes", icon: "fa-bullhorn" },
  { label: "Annonces", to: "/portail/patient-annonces", icon: "fa-bell", badge: "annonces" },
  { label: "Profil", to: "/portail/patient-profil", icon: "fa-user" },
];
