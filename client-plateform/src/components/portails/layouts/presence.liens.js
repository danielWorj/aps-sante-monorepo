// Rubriques des portails pharmacie et centre de santé (navbar + sidebar).
// Les chemins suivent ESPACES_PRESENCE[type].portail (services/espacePresenceService.js).

const commun = (p) => ({
  tableau: { label: 'Tableau de bord', to: p, icon: 'fa-gauge-high' },
  fiche: { label: 'Ma fiche', to: `${p}-fiche`, icon: 'fa-id-card' },
  horaires: { label: 'Horaires', to: `${p}-horaires`, icon: 'fa-clock' },
  presentation: { label: 'Présentation', to: `${p}-presentation`, icon: 'fa-align-left' },
  photos: { label: 'Photos', to: `${p}-photos`, icon: 'fa-images' },
  actualites: { label: 'Actualités', to: `${p}-actualites`, icon: 'fa-newspaper' },
  messages: { label: 'Messages', to: `${p}-messages`, icon: 'fa-envelope', badge: 'messages' },
  abonnement: { label: 'Abonnement', to: `${p}-abonnement`, icon: 'fa-crown' },
  annonces: { label: 'Annonces ApSa', to: `${p}-annonces`, icon: 'fa-bell', badge: 'annonces' },
});

const P = commun('/portail/pharmacie');
const S = commun('/portail/structure');

export const LIENS_PORTAIL_PRESENCE = {
  pharmacie: [
    P.tableau, P.fiche, P.horaires,
    { label: 'Gardes', to: '/portail/pharmacie-gardes', icon: 'fa-moon' },
    P.presentation, P.photos, P.actualites, P.messages,
    { label: 'Avis', to: '/portail/pharmacie-avis', icon: 'fa-star-half-stroke' },
    P.abonnement, P.annonces,
  ],
  structure: [
    S.tableau, S.fiche, S.horaires,
    { label: 'Prestations', to: '/portail/structure-prestations', icon: 'fa-file-waveform' },
    S.presentation, S.photos, S.actualites, S.messages,
    S.abonnement, S.annonces,
  ],
};
