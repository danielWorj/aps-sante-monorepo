/**
 * Données des compagnies d'assurance & courtiers — source unique
 * partagée entre l'annuaire (pages/Assurance.jsx) et la fiche détail
 * (pages/FicheAssurance.jsx).
 *
 * À remplacer par l'appel API réel (ex. GET /assureurs, GET /assureurs/:id).
 * Le champ `abonnementActif` pilote l'affichage enrichi vs minimal
 * conformément à EF-ASS-06 du cahier des charges.
 */

export const insurers = [
  {
    id: "activa",
    premium: true,
    abonnementActif: true,
    icon: "fa-building-shield",
    name: "Activa Assurances",
    type: "Compagnie d'assurance",
    agrementCima: "CIMA — Agrément n° 2019-CM-00456",
    telephone: "+237 233 42 10 10",
    email: "contact@activa-assurances.cm",
    description:
      "Assurance santé individuelle et entreprise, garanties hospitalisation et pharmacie. 12 agences réparties sur 4 villes.",
    siege: {
      adresse: "Avenue de Gaulle, Akwa, Douala, Cameroun",
      gps: { lat: 4.0483, lng: 9.6987 },
    },
    presentation:
      "Activa Assurances est une compagnie d'assurance agréée CIMA, présente au Cameroun depuis plus de 20 ans. Elle propose des solutions d'assurance santé individuelle et entreprise, avec un réseau d'agences réparti sur les principales villes du pays. APS présente cette fiche à titre informatif uniquement ; toute souscription se fait directement auprès de l'assureur.",
    branches: [
      "Assurance santé individuelle",
      "Assurance santé entreprise",
      "Assurance vie",
    ],
    produits: [
      {
        nom: "Activa Santé Individuelle",
        publicCible: "Particuliers et familles",
        garanties: ["Hospitalisation", "Consultations & pharmacie", "Maternité"],
      },
      {
        nom: "Activa Santé Entreprise",
        publicCible: "Entreprises et collectivités",
        garanties: [
          "Couverture collective des salariés",
          "Hospitalisation & soins ambulatoires",
          "Options famille",
        ],
      },
    ],
    agences: [
      {
        id: "akwa",
        nom: "Agence Douala — Akwa (Siège)",
        region: "Littoral",
        ville: "Douala",
        adresse: "Avenue de Gaulle, Akwa, Douala",
        gps: { lat: 4.0483, lng: 9.6987 },
        telephone: "+237 233 42 10 10",
      },
      {
        id: "bonapriso",
        nom: "Agence Douala — Bonapriso",
        region: "Littoral",
        ville: "Douala",
        adresse: "Rue Njo-Njo, Bonapriso, Douala",
        gps: { lat: 4.0247, lng: 9.7192 },
        telephone: "+237 233 42 10 22",
      },
      {
        id: "bastos",
        nom: "Agence Yaoundé — Bastos",
        region: "Centre",
        ville: "Yaoundé",
        adresse: "Rue 1750, Bastos, Yaoundé",
        gps: { lat: 3.8895, lng: 11.5171 },
        telephone: "+237 222 20 33 44",
      },
      {
        id: "bafoussam",
        nom: "Agence Bafoussam — Centre-ville",
        region: "Ouest",
        ville: "Bafoussam",
        adresse: "Avenue du Marché A, Bafoussam",
        gps: { lat: 5.4737, lng: 10.4179 },
        telephone: "+237 233 44 12 12",
      },
    ],
  },
  {
    id: "saham",
    premium: true,
    abonnementActif: true,
    icon: "fa-building-shield",
    name: "Saham Assurance Cameroun",
    type: "Compagnie d'assurance",
    agrementCima: "CIMA — Agrément n° 2015-CM-00219",
    telephone: "+237 233 43 20 20",
    email: "contact@saham-assurance.cm",
    description:
      "Produits santé collectifs pour entreprises, réseau d'agences partenaires étendu.",
    siege: {
      adresse: "Boulevard de la Liberté, Bonanjo, Douala, Cameroun",
      gps: { lat: 4.0469, lng: 9.6934 },
    },
    presentation:
      "Saham Assurance Cameroun est une compagnie d'assurance agréée CIMA, spécialisée dans les produits santé collectifs destinés aux entreprises. APS présente cette fiche à titre informatif uniquement ; toute souscription se fait directement auprès de l'assureur.",
    branches: ["Assurance santé entreprise", "Assurance vie"],
    produits: [
      {
        nom: "Saham Santé Collective",
        publicCible: "Entreprises et collectivités",
        garanties: [
          "Hospitalisation",
          "Soins ambulatoires",
          "Pharmacie",
        ],
      },
    ],
    agences: [
      {
        id: "bonanjo",
        nom: "Agence Douala — Bonanjo (Siège)",
        region: "Littoral",
        ville: "Douala",
        adresse: "Boulevard de la Liberté, Bonanjo, Douala",
        gps: { lat: 4.0469, lng: 9.6934 },
        telephone: "+237 233 43 20 20",
      },
      {
        id: "deido",
        nom: "Agence Douala — Deido",
        region: "Littoral",
        ville: "Douala",
        adresse: "Rue de Deido, Douala",
        gps: { lat: 4.0587, lng: 9.7139 },
        telephone: "+237 233 43 20 25",
      },
    ],
  },
  {
    id: "fotso",
    premium: false,
    abonnementActif: false,
    icon: "fa-user-tie",
    name: "Cabinet Fotso & Associés — Courtage",
    type: "Courtier",
    siege: {
      adresse: "Yaoundé, Bastos",
      gps: { lat: 3.8895, lng: 11.5171 },
    },
  },
  {
    id: "nsia",
    premium: false,
    abonnementActif: false,
    icon: "fa-building-shield",
    name: "NSIA Assurances",
    type: "Compagnie d'assurance",
    siege: {
      adresse: "Siège — Douala, Bonapriso",
      gps: { lat: 4.0247, lng: 9.7192 },
    },
  },
];

export function getInsurerById(id) {
  return insurers.find((insurer) => insurer.id === id);
}