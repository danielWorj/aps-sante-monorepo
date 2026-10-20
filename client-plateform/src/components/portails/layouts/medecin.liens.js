// Rubriques du portail médecin (navbar + sidebar) : une seule liste pour
// que les deux menus ne divergent plus.
export const LIENS_PORTAIL_MEDECIN = [
  { label: "Tableau de bord", to: "/portail/medecin-tableau-de-bord", icon: "fa-chart-line" },
  { label: "Rendez-vous", to: "/portail/medecin-rdv", icon: "fa-calendar-check", badge: "rdv" },
  { label: "Agenda", to: "/portail/medecin-agenda", icon: "fa-calendar-days" },
  { label: "Demandes patients", to: "/portail/medecin-demandes", icon: "fa-bullhorn" },
  { label: "Avis & notes", to: "/portail/medecin-avis", icon: "fa-star" },
  { label: "Annonces", to: "/portail/medecin-annonces", icon: "fa-bell", badge: "annonces" },
  { label: "Profil", to: "/portail/medecin-profil", icon: "fa-user-doctor" },
  { label: "Moyens de paiement", to: "/portail/medecin-paiements", icon: "fa-wallet" },
  { label: "Abonnement", to: "/portail/medecin-abonnement", icon: "fa-id-card-clip" },
];
