// Grille des abonnements par type d'acteur (médecins, cliniques,
// pharmacies, assurances) et offre pour les annonceurs partenaires.
// Le palier "Présence de base" reste gratuit en permanence pour tous
// les professionnels de santé.

export const clientTypes = [
  {
    id: "medecin",
    label: "Médecins & professionnels de santé",
    shortLabel: "Médecins",
    icon: "fa-user-doctor",
    tagline:
      "Généralistes, spécialistes, infirmiers, sages-femmes et autres professionnels de santé réglementés.",
    freemium: true,
    dispositif: "A",
    baseTier: {
      id: "base",
      name: "Présence de base",
      priceLabel: "Gratuit",
      priceSub: "Palier permanent",
      features: [
        "Fiche référencée dans l'annuaire",
        "Identité, spécialité(s) et adresse",
        "Localisation approximative",
        "Prise de rendez-vous standard",
      ],
    },
    tiers: [
      {
        id: "1m",
        name: "Présence enrichie",
        duration: "1 mois",
        priceLabel: "15 000",
        unit: "FCFA / mois",
        features: [
          "Photos professionnelles & multimédia",
          "Fiche détaillée et description enrichie",
          "Contact direct exposé (téléphone, bouton d'appel)",
          "Géolocalisation détaillée",
          "Présentation de l'équipe et des spécialités",
        ],
      },
      {
        id: "6m",
        name: "Présence enrichie",
        duration: "6 mois",
        priceLabel: "12 000",
        unit: "FCFA / mois",
        priceNote: "soit 72 000 FCFA facturés",
        popular: true,
        features: [
          "Tous les avantages du forfait 1 mois",
          "Tarif dégressif sur l'engagement",
        ],
      },
      {
        id: "12m",
        name: "Présence enrichie",
        duration: "12 mois",
        priceLabel: "10 000",
        unit: "FCFA / mois",
        priceNote: "soit 120 000 FCFA facturés",
        badge: "Meilleure valeur",
        features: [
          "Tous les avantages du forfait 1 mois",
          "Tarif le plus avantageux à l'année",
        ],
      },
    ],
    notes: [
      "Pas de badge « Sponsorisé » ni de mise en avant payante : votre abonnement enrichit votre fiche, dans le respect des règles de votre profession.",
      "Votre position dans les résultats dépend uniquement de la pertinence, de la distance et de votre note — jamais de votre abonnement.",
    ],
  },
  {
    id: "clinique",
    label: "Cliniques, hôpitaux & laboratoires",
    shortLabel: "Cliniques & hôpitaux",
    icon: "fa-hospital",
    tagline:
      "Établissements de santé, plateaux techniques et laboratoires d'analyses.",
    freemium: true,
    dispositif: "A",
    baseTier: {
      id: "base",
      name: "Présence de base",
      priceLabel: "Gratuit",
      priceSub: "Palier permanent",
      features: [
        "Fiche référencée dans l'annuaire",
        "Dénomination, activité et adresse",
        "Localisation approximative",
      ],
    },
    tiers: [
      {
        id: "1m",
        name: "Présence enrichie",
        duration: "1 mois",
        priceLabel: "35 000",
        unit: "FCFA / mois",
        features: [
          "Photos professionnelles & multimédia",
          "Présentation des services et plateaux techniques",
          "Contact direct exposé",
          "Géolocalisation détaillée",
          "Présentation de l'équipe médicale",
        ],
      },
      {
        id: "6m",
        name: "Présence enrichie",
        duration: "6 mois",
        priceLabel: "28 000",
        unit: "FCFA / mois",
        priceNote: "soit 168 000 FCFA facturés",
        popular: true,
        features: [
          "Tous les avantages du forfait 1 mois",
          "Tarif dégressif sur l'engagement",
        ],
      },
      {
        id: "12m",
        name: "Présence enrichie",
        duration: "12 mois",
        priceLabel: "24 000",
        unit: "FCFA / mois",
        priceNote: "soit 288 000 FCFA facturés",
        badge: "Meilleure valeur",
        features: [
          "Tous les avantages du forfait 1 mois",
          "Tarif le plus avantageux à l'année",
        ],
      },
    ],
    notes: [
      "Votre abonnement enrichit votre fiche, jamais votre classement : la position dans les résultats reste basée sur la pertinence, la distance et les avis.",
      "Une facture est automatiquement générée et vous est transmise à chaque paiement.",
    ],
  },
  {
    id: "pharmacie",
    label: "Pharmacies & officines",
    shortLabel: "Pharmacies",
    icon: "fa-mortar-pestle",
    tagline:
      "Officines de ville, avec ou sans participation au planning de garde officiel.",
    freemium: true,
    dispositif: "A",
    baseTier: {
      id: "base",
      name: "Présence de base",
      priceLabel: "Gratuit",
      priceSub: "Palier permanent",
      features: [
        "Fiche référencée dans l'annuaire",
        "Dénomination et adresse",
        "Statut de garde selon le planning officiel",
      ],
    },
    tiers: [
      {
        id: "1m",
        name: "Présence enrichie",
        duration: "1 mois",
        priceLabel: "12 000",
        unit: "FCFA / mois",
        features: [
          "Numéro de téléphone & bouton d'appel direct",
          "Photos et description enrichie de l'officine",
          "Services particuliers mis en avant",
          "Géolocalisation détaillée",
        ],
      },
      {
        id: "6m",
        name: "Présence enrichie",
        duration: "6 mois",
        priceLabel: "9 500",
        unit: "FCFA / mois",
        priceNote: "soit 57 000 FCFA facturés",
        popular: true,
        features: [
          "Tous les avantages du forfait 1 mois",
          "Tarif dégressif sur l'engagement",
        ],
      },
      {
        id: "12m",
        name: "Présence enrichie",
        duration: "12 mois",
        priceLabel: "8 000",
        unit: "FCFA / mois",
        priceNote: "soit 96 000 FCFA facturés",
        badge: "Meilleure valeur",
        features: [
          "Tous les avantages du forfait 1 mois",
          "Tarif le plus avantageux à l'année",
        ],
      },
    ],
    notes: [
      "Le statut « pharmacie de garde » provient exclusivement du planning officiel : aucun abonnement ne peut faire passer une officine hors garde devant une pharmacie de garde active.",
      "Dans les pays où la publicité officinale est prohibée, seul l'abonnement de présence est proposé — pas de boost commercial.",
    ],
  },
  {
    id: "assurance",
    label: "Compagnies d'assurance & courtiers",
    shortLabel: "Assurances",
    icon: "fa-shield-heart",
    tagline:
      "Compagnies d'assurance santé et courtiers : un annuaire clair pour vous faire connaître. La souscription se fait toujours directement avec l'assureur.",
    freemium: false,
    dispositif: "A",
    baseTier: {
      id: "base",
      name: "Présence minimale",
      priceLabel: "Gratuit",
      priceSub: "Palier permanent",
      features: [
        "Dénomination et activité principale",
        "Localisation du siège",
      ],
    },
    tiers: [
      {
        id: "3m",
        name: "Vitrine premium",
        duration: "3 mois",
        priceLabel: "40 000",
        unit: "FCFA / mois",
        features: [
          "Réseau d'agences détaillé et géolocalisé",
          "Présentation des produits proposés",
          "Contenus multimédia",
          "Formulaire de mise en relation",
        ],
      },
      {
        id: "6m",
        name: "Vitrine premium",
        duration: "6 mois",
        priceLabel: "34 000",
        unit: "FCFA / mois",
        priceNote: "soit 204 000 FCFA facturés",
        popular: true,
        features: [
          "Tous les avantages du forfait 3 mois",
          "Tarif dégressif sur l'engagement",
        ],
      },
      {
        id: "12m",
        name: "Vitrine premium",
        duration: "12 mois",
        priceLabel: "28 000",
        unit: "FCFA / mois",
        priceNote: "soit 336 000 FCFA facturés",
        badge: "Meilleure valeur",
        features: [
          "Tous les avantages du forfait 3 mois",
          "Tarif le plus avantageux à l'année",
        ],
      },
    ],
    notes: [
      "Présentation seulement : ni comparateur, ni souscription en ligne, ni gestion de sinistre sur APS. La mise en relation se fait directement avec l'assureur.",
      "Sans abonnement actif, seules les informations minimales sont exposées et le formulaire de mise en relation n'est pas proposé.",
    ],
  },
  {
    id: "annonceur",
    label: "Annonceurs tiers (hors professions de santé)",
    shortLabel: "Annonceurs",
    icon: "fa-rectangle-ad",
    tagline:
      "Opérateurs télécoms, banques, marques de produits de santé en vente libre : faites connaître votre marque auprès de nos patients et professionnels de santé.",
    freemium: false,
    dispositif: "B",
    baseTier: null,
    tiers: [
      {
        id: "mensuelle",
        name: "Campagne",
        duration: "Mensuelle",
        priceLabel: "150 000",
        unit: "FCFA facturés",
        features: [
          "Affichage du logo dans l'emplacement dédié",
          "Ciblage contextuel selon le type de page",
          "Statistiques d'impressions et de clics",
        ],
      },
      {
        id: "trimestrielle",
        name: "Campagne",
        duration: "Trimestrielle",
        priceLabel: "400 000",
        unit: "FCFA facturés",
        priceNote: "soit ≈ 133 000 FCFA / mois",
        features: ["Tous les avantages de la formule mensuelle", "Tarif dégressif"],
      },
      {
        id: "semestrielle",
        name: "Campagne",
        duration: "Semestrielle",
        priceLabel: "700 000",
        unit: "FCFA facturés",
        priceNote: "soit ≈ 117 000 FCFA / mois",
        popular: true,
        features: ["Tous les avantages de la formule mensuelle", "Tarif dégressif"],
      },
      {
        id: "annuelle",
        name: "Campagne",
        duration: "Annuelle",
        priceLabel: "1 200 000",
        unit: "FCFA facturés",
        priceNote: "soit ≈ 100 000 FCFA / mois",
        badge: "Meilleure valeur",
        features: ["Tous les avantages de la formule mensuelle", "Tarif le plus avantageux"],
      },
    ],
    notes: [
      "Votre logo est mis en avant dans un espace dédié, pensé pour rester lisible et discret.",
      "Votre campagne démarre dès la confirmation du paiement, et une facture vous est transmise.",
      "Les pages Urgences et Pharmacies de garde restent, elles, entièrement sans publicité — pour ne jamais ralentir l'accès aux soins.",
    ],
  },
];

export function getClientType(id) {
  return clientTypes.find((c) => c.id === id) || clientTypes[0];
}