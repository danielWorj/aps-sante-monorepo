// src/components/Assureurs.jsx
//
// Reprend la structure et le design system APS (Bootstrap 5) de
// Pharmacie.jsx / StructureSante.jsx — même logique, mêmes conventions —
// adapté au composant "annuaire — assureurs & courtiers" (table assureur)
// et branché sur assureurService.js.
//
// Hypothèses reprises de admin.css / assureurs.html (fournie comme
// référence statique) :
//   - Bootstrap 5 (CSS + JS bundle) et Font Awesome sont déjà chargés
//     globalement par le layout parent.
//   - admin.css définit les classes aps-* utilisées telles quelles
//     (aps-card, aps-kpi, aps-badge, aps-status-*, variables --aps-*…).
//   - "chart.js" est une dépendance du projet ; on importe
//     "chart.js/auto" depuis npm, comme dans Pharmacie.jsx.
//
// Écarts assumés avec Pharmacie.jsx, pour rester fidèle à assureurs.html
// et aux deux captures d'écran fournies (fiche "Gérer l'assureur") :
//   - Un assureur a un `type_acteur` (compagnie | courtier), pas de
//     `numero_ordre_titulaire` : à la place `numero_agrement` (ARCA/CIMA)
//     et `numero_rccm`.
//   - 4 statuts de vérification (contre 3 pour la pharmacie) :
//     non_publie / en_cours / publie / rejete — voir la légende du
//     graphique polarArea "Statut de vérification" dans assureurs.html.
//   - Nouveauté demandée : un bouton "fa-cog" sur chaque card (et dans le
//     footer de la fiche détail) ouvre une modale de GESTION dédiée à
//     l'assureur, à 3 onglets, fidèle aux captures fournies :
//       1) Siège       — coordonnées du siège social (adresse, GPS, tél.)
//       2) Activités   — branches & domaines d'intervention + produits
//                        proposés (avec garanties, public cible)
//       3) Filiales & agences — recherche (région/ville/géoloc.) + liste
//          de cards d'agences, chacune pouvant être marquée comme
//          "agence choisie" (agence mise en avant / par défaut).
//     Ces trois onglets ne sont PAS les mêmes informations que la fiche
//     détail "Voir" (qui reste centrée sur le dossier d'inscription :
//     documents, représentant légal, formule d'abonnement).
//   - Les documents justificatifs restent gérés comme dans Pharmacie.jsx
//     (accordéon + aperçu <object>), mais les libellés suivent
//     assureurs.html : RCCM, Agrément ARCA/CIMA, CNI du représentant
//     légal, Statuts de la société.
//   - Pas de compte "agent" créé à la volée à la création d'un assureur
//     (contrairement à Pharmacie.jsx) : assureurs.html ne prévoit pas ce
//     flux ; un représentant légal est simplement déclaré comme champ
//     texte du dossier.
//   - L'API est supposée ne pas paginer côté serveur : la pagination est
//     appliquée côté client sur le résultat déjà filtré, comme pour les
//     pharmacies.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Chart from "chart.js/auto";
import { useAuth } from "../context/AuthContext";
import {
  listerAssureurs,
  creerAssureur,
  modifierAssureur,
  supprimerAssureur,
  listerPays,
  listerVilles,
  obtenirGestionAssureur,
  modifierSiegeAssureur,
  modifierActivitesAssureur,
  creerAgenceAssureur,
  modifierAgenceAssureur,
  supprimerAgenceAssureur,
  choisirAgencePrincipale,
  STATUTS_VERIFICATION_ASSUREUR,
  TYPES_ACTEUR_ASSUREUR,
  FORMULES_ABONNEMENT,
} from "../services/assureurService.js";

const STATUT_META = {
  publie: { libelle: "Publié", badge: "is-success", detailIcone: "fa-circle-check" },
  en_cours: { libelle: "En cours", badge: "is-warning", detailIcone: "fa-hourglass-half" },
  non_publie: { libelle: "Non publié", badge: "is-info", detailIcone: "fa-circle-xmark" },
  rejete: { libelle: "Rejeté", badge: "is-danger", detailIcone: "fa-ban" },
};

const TYPE_META = {
  compagnie: { libelle: "Compagnie d'assurance", icone: "fa-building-shield" },
  courtier: { libelle: "Courtier", icone: "fa-people-arrows" },
};

const COULEURS_GRAPHIQUE = {
  primary: "#1C8FE0", teal: "#17B6C4", success: "#1B8A4B",
  warning: "#B7791F", danger: "#E5484D", violet: "#8B5CF6",
  text500: "#6B7280", border: "#E7EAF0",
};

const FORMULAIRE_VIDE = {
  raison_sociale: "", type_acteur: "compagnie", pays_id: "", ville_id: "",
  email: "", telephone: "", numero_agrement: "", numero_rccm: "",
  representant_legal: "", statut_verification: "non_publie",
  formule_abonnement: "starter", notes_internes: "",
  // Fichiers : obligatoires à la création, optionnels en édition (on
  // n'envoie que ceux à remplacer) — même logique que Pharmacie.jsx.
  document_rccm: null, document_agrement: null,
  piece_identite_representant: null, document_statuts: null,
};

// Formulaire vide de l'onglet "Siège" (modale de gestion).
const SIEGE_VIDE = {
  adresse: "", region: "", ville_id: "", telephone: "",
  latitude: "", longitude: "",
};

// Formulaire vide pour créer/éditer une agence (modale de gestion,
// onglet "Filiales & agences").
const AGENCE_VIDE = {
  nom: "", adresse: "", region: "", ville_id: "", telephone: "",
  latitude: "", longitude: "",
};

const TAILLES_PAGE = [8, 16, 32];

/**
 * Styles scoping la fiche détail + la modale de gestion. Injectés en
 * ligne (pas de fichier .css dédié fourni) et préfixés "aps-fiche-" /
 * "aps-accordion-" / "aps-gestion-" pour ne pas entrer en collision avec
 * admin.css. Repris de Pharmacie.jsx et complétés pour la gestion.
 */
const STYLE_ASSUREURS = `
  .aps-fiche-header { align-items: flex-start; }
  .aps-fiche-souscritre { font-size: 13px; }

  .aps-fiche-avatar {
    width: 64px; height: 64px; border-radius: var(--aps-radius, 12px);
    background: var(--aps-primary-100, #EAF4FD); color: var(--aps-primary, #1C8FE0);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 20px; flex-shrink: 0; overflow: hidden;
  }
  .aps-fiche-avatar img { width: 100%; height: 100%; object-fit: cover; }

  .aps-fiche-info-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px;
    margin-bottom: 18px;
  }
  .aps-fiche-info-item { display: flex; align-items: flex-start; gap: 10px; }
  .aps-fiche-info-item > i {
    width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--aps-primary-100, #EAF4FD); color: var(--aps-primary, #1C8FE0);
    font-size: 13px; margin-top: 1px;
  }
  .aps-fiche-info-label { font-size: 11.5px; color: var(--aps-text-500, #6B7280); text-transform: uppercase; letter-spacing: .02em; }
  .aps-fiche-info-valeur { font-size: 14px; font-weight: 500; }

  .aps-fiche-section-titre {
    font-size: 13px; font-weight: 600; color: var(--aps-text-500, #6B7280);
    margin-bottom: 8px;
  }

  .aps-accordion { display: flex; flex-direction: column; gap: 8px; }
  .aps-accordion-item {
    border: 1px solid var(--aps-border, #E7EAF0); border-radius: 10px; overflow: hidden;
    transition: border-color .15s ease;
  }
  .aps-accordion-item.is-open { border-color: var(--aps-primary, #1C8FE0); }
  .aps-accordion-trigger {
    width: 100%; display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; background: #fff; border: 0; cursor: pointer;
    text-align: left; font-size: 13.5px;
  }
  .aps-accordion-item.is-open .aps-accordion-trigger { background: var(--aps-primary-100, #EAF4FD); }
  .aps-accordion-icone {
    width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--aps-primary-100, #EAF4FD); color: var(--aps-primary, #1C8FE0);
    font-size: 12px;
  }
  .aps-accordion-libelle { flex: 1; font-weight: 500; }
  .aps-accordion-lien-externe { color: var(--aps-text-500, #6B7280); font-size: 12px; padding: 4px; }
  .aps-accordion-lien-externe:hover { color: var(--aps-primary, #1C8FE0); }
  .aps-accordion-chevron { font-size: 12px; color: var(--aps-text-500, #6B7280); transition: transform .15s ease; }
  .aps-accordion-item.is-open .aps-accordion-chevron { transform: rotate(180deg); color: var(--aps-primary, #1C8FE0); }

  .aps-accordion-panel { padding: 12px; border-top: 1px solid var(--aps-border, #E7EAF0); background: #FAFBFC; }
  .aps-accordion-apercu-objet { display: block; width: 100%; height: 380px; border: 0; border-radius: 8px; background: #fff; }
  .aps-accordion-apercu-repli { font-size: 13px; padding: 4px 2px; }

  /* ── Modale de gestion (onglets Siège / Activités / Filiales) ── */
  .aps-gestion-tabs {
    display: flex; gap: 22px; border-bottom: 1px solid var(--aps-border, #E7EAF0);
    padding: 0 4px; margin-bottom: 18px;
  }
  .aps-gestion-tab {
    background: none; border: 0; padding: 10px 2px 12px; cursor: pointer;
    font-size: 14px; font-weight: 600; color: var(--aps-text-500, #6B7280);
    border-bottom: 2px solid transparent; margin-bottom: -1px;
  }
  .aps-gestion-tab.is-active { color: var(--aps-primary, #1C8FE0); border-bottom-color: var(--aps-primary, #1C8FE0); }
  .aps-gestion-tab .count { color: inherit; }

  .aps-gestion-section {
    border: 1px solid var(--aps-border, #E7EAF0); border-radius: var(--aps-radius-lg, 14px);
    padding: 16px; margin-bottom: 16px; background: #fff;
  }
  .aps-gestion-section__titre {
    display: flex; align-items: center; gap: 8px; font-weight: 700;
    font-size: 14.5px; color: var(--aps-text-900, #111827); margin-bottom: 14px;
  }

  .aps-chip-group { display: flex; flex-wrap: wrap; gap: 8px; }
  .aps-chip {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 12.5px; padding: 6px 12px; border-radius: 999px;
    background: var(--aps-bg, #F3F5F8); color: var(--aps-text-700, #374151);
  }
  .aps-chip button { background: none; border: 0; color: inherit; opacity: .6; padding: 0; line-height: 1; }
  .aps-chip button:hover { opacity: 1; color: var(--aps-danger, #E5484D); }

  .aps-produit-card {
    border: 1px solid var(--aps-border, #E7EAF0); border-radius: var(--aps-radius, 12px);
    padding: 14px; margin-bottom: 12px;
  }
  .aps-produit-card:last-child { margin-bottom: 0; }
  .aps-produit-card__titre { font-weight: 700; font-size: 14px; color: var(--aps-text-900, #111827); }
  .aps-produit-card__cible { font-size: 12.5px; color: var(--aps-text-500, #6B7280); margin-bottom: 8px; }

  .aps-agence-search {
    border: 1px solid var(--aps-border, #E7EAF0); border-radius: var(--aps-radius-lg, 14px);
    padding: 16px; margin-bottom: 16px;
  }

  .aps-agence-card {
    border: 1px solid var(--aps-border, #E7EAF0); border-radius: var(--aps-radius-lg, 14px);
    padding: 16px; margin-bottom: 12px; transition: border-color .15s ease, box-shadow .15s ease;
    display: flex; gap: 14px; align-items: flex-start;
  }
  .aps-agence-card.is-choisie { border-color: var(--aps-warning, #B7791F); box-shadow: 0 0 0 1px var(--aps-warning, #B7791F); }
  .aps-agence-card__icone {
    width: 44px; height: 44px; border-radius: var(--aps-radius, 12px); flex-shrink: 0;
    background: var(--aps-success-100, #E8F6EE); color: var(--aps-success, #1B8A4B);
    display: flex; align-items: center; justify-content: center; font-size: 17px;
  }
  .aps-agence-card__body { flex: 1; min-width: 0; }
  .aps-agence-card__titre { font-weight: 700; font-size: 14.5px; color: var(--aps-text-900, #111827); }
  .aps-agence-card__adresse { font-size: 12.5px; color: var(--aps-text-500, #6B7280); margin: 2px 0 6px; }
  .aps-agence-card__gps { font-size: 11.5px; color: var(--aps-text-400, #9CA3AF); margin-bottom: 10px; }
  .aps-agence-card__actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
`;

/**
 * Extrait un nom de rôle (en minuscules) depuis un objet utilisateur,
 * quelle que soit la forme exacte sous laquelle il a été stocké après
 * connexion. Identique à Pharmacie.jsx.
 */
function extraireNomRole(objetUtilisateur) {
  if (!objetUtilisateur || typeof objetUtilisateur !== "object") return null;
  const candidats = [
    objetUtilisateur.role, objetUtilisateur.role?.nom, objetUtilisateur.role?.libelle,
    objetUtilisateur.role_nom, objetUtilisateur.type_compte,
    objetUtilisateur.utilisateur?.role, objetUtilisateur.roles?.[0], objetUtilisateur.roles?.[0]?.nom,
  ];
  for (const candidat of candidats) {
    if (typeof candidat === "string" && candidat.trim()) return candidat.trim().toLowerCase();
  }
  return null;
}

function useRoleUtilisateur() {
  const { user, isAuthenticated } = useAuth();
  return { role: extraireNomRole(user), estConnecte: isAuthenticated };
}

/** Initiales (2 lettres) utilisées comme avatar de repli quand un
 * assureur n'a pas de logo — même idée que les avatars d'inscription
 * dans assureurs.html ("AC", "SN", "PV"…). */
function initiales(nom) {
  if (!nom) return "—";
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

/**
 * Aperçu embarqué d'une pièce justificative (image OU PDF), identique à
 * Pharmacie.jsx : on laisse le navigateur détecter le type réel via
 * Content-Type plutôt que de se fier à l'extension de l'URL.
 */
function ApercuPieceJustificative({ url, label }) {
  const [enErreur, setEnErreur] = useState(false);
  if (!url) return null;
  if (enErreur) {
    return (
      <div className="aps-text-muted aps-accordion-apercu-repli">
        Aperçu indisponible pour ce fichier.{" "}
        <a href={url} target="_blank" rel="noreferrer">Ouvrir le fichier dans un nouvel onglet</a>
      </div>
    );
  }
  return (
    <object data={url} aria-label={label} className="aps-accordion-apercu-objet" onError={() => setEnErreur(true)}>
      <div className="aps-text-muted aps-accordion-apercu-repli">
        Aperçu indisponible pour ce fichier.{" "}
        <a href={url} target="_blank" rel="noreferrer">Ouvrir le fichier dans un nouvel onglet</a>
      </div>
    </object>
  );
}

export default function Assureurs() {
  const { role, estConnecte } = useRoleUtilisateur();
  // Création/modification : réservées au back-office (contrairement à
  // Pharmacie.jsx, ouvert aux professionnels eux-mêmes) — un assureur
  // n'est pas censé s'auto-créer depuis cette console admin.
  const peutCreer = role === "admin" || role === "superadmin";
  const peutModifier = role === "admin" || role === "superadmin";
  const peutGerer = role === "admin" || role === "superadmin";
  const peutSupprimer = role === "superadmin";

  const [assureurs, setAssureurs] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const [statistiques, setStatistiques] = useState([]);

  const [filtres, setFiltres] = useState({
    recherche: "", statut_verification: "", type_acteur: "", pays_id: "", ville_id: "",
  });
  const [filtresAppliques, setFiltresAppliques] = useState(filtres);

  const [pays, setPays] = useState([]);
  const [villesFiltre, setVillesFiltre] = useState([]);
  const [villesFormulaire, setVillesFormulaire] = useState([]);

  const [tri, setTri] = useState("nom");
  const [page, setPage] = useState(1);
  const [parPage, setParPage] = useState(8);

  const [assureurSelectionne, setAssureurSelectionne] = useState(null);
  const [piecesOuvertes, setPiecesOuvertes] = useState({});

  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [modeEdition, setModeEdition] = useState(false);
  const [formulaire, setFormulaire] = useState(FORMULAIRE_VIDE);
  const [fichiersExistants, setFichiersExistants] = useState(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreurFormulaire, setErreurFormulaire] = useState(null);

  const [cibleSuppression, setCibleSuppression] = useState(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  /* ─── Modale de GESTION (bouton fa-cog) ────────────────────── */
  const [assureurEnGestion, setAssureurEnGestion] = useState(null);
  const [ongletGestion, setOngletGestion] = useState("siege");
  const [chargementGestion, setChargementGestion] = useState(false);
  const [erreurGestion, setErreurGestion] = useState(null);

  const [siege, setSiege] = useState(SIEGE_VIDE);
  const [villesSiege, setVillesSiege] = useState([]);
  const [enregistrementSiege, setEnregistrementSiege] = useState(false);

  const [activites, setActivites] = useState({ branches: [], produits: [] });
  const [nouvelleBranche, setNouvelleBranche] = useState("");
  const [enregistrementActivites, setEnregistrementActivites] = useState(false);

  const [agences, setAgences] = useState([]);
  const [filtreAgenceRegion, setFiltreAgenceRegion] = useState("");
  const [filtreAgenceVille, setFiltreAgenceVille] = useState("");
  const [formulaireAgenceOuvert, setFormulaireAgenceOuvert] = useState(false);
  const [agenceEnEdition, setAgenceEnEdition] = useState(null); // null = création
  const [formulaireAgence, setFormulaireAgence] = useState(AGENCE_VIDE);
  const [villesAgence, setVillesAgence] = useState([]);
  const [enregistrementAgence, setEnregistrementAgence] = useState(false);
  const [cibleSuppressionAgence, setCibleSuppressionAgence] = useState(null);

  const chargerAssureurs = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const resultat = await listerAssureurs(filtresAppliques);
      setAssureurs(resultat);
      setPage(1);
    } catch (err) {
      setErreur(err.message || "Impossible de charger les assureurs & courtiers.");
    } finally {
      setChargement(false);
    }
  }, [filtresAppliques]);

  useEffect(() => { chargerAssureurs(); }, [chargerAssureurs]);

  useEffect(() => { setPiecesOuvertes({}); }, [assureurSelectionne?.assureur_id]);

  useEffect(() => {
    listerAssureurs({}).then(setStatistiques).catch(() => setStatistiques([]));
  }, [assureurs]);

  useEffect(() => {
    listerPays().then(setPays).catch(() => setPays([]));
  }, []);

  useEffect(() => {
    if (!filtres.pays_id) { setVillesFiltre([]); return; }
    listerVilles(filtres.pays_id).then(setVillesFiltre).catch(() => setVillesFiltre([]));
  }, [filtres.pays_id]);

  useEffect(() => {
    if (!formulaire.pays_id) { setVillesFormulaire([]); return; }
    listerVilles(formulaire.pays_id).then(setVillesFormulaire).catch(() => setVillesFormulaire([]));
  }, [formulaire.pays_id]);

  function modifierFiltre(champ, valeur) {
    setFiltres((p) => ({ ...p, [champ]: valeur, ...(champ === "pays_id" ? { ville_id: "" } : {}) }));
  }
  function appliquerFiltres() { setFiltresAppliques(filtres); }
  function reinitialiserFiltres() {
    const vide = { recherche: "", statut_verification: "", type_acteur: "", pays_id: "", ville_id: "" };
    setFiltres(vide);
    setFiltresAppliques(vide);
  }

  /* ─── Tri + pagination côté client ─────────────────────────── */

  const assureursTries = useMemo(() => {
    const copie = [...assureurs];
    if (tri === "statut") {
      const ordre = { publie: 0, en_cours: 1, non_publie: 2, rejete: 3 };
      copie.sort((a, b) => (ordre[a.statut_verification] ?? 9) - (ordre[b.statut_verification] ?? 9));
    } else {
      copie.sort((a, b) => a.raison_sociale.localeCompare(b.raison_sociale));
    }
    return copie;
  }, [assureurs, tri]);

  const nbPages = Math.max(1, Math.ceil(assureursTries.length / parPage));
  const pageCourante = Math.min(page, nbPages);
  const assureursPage = assureursTries.slice((pageCourante - 1) * parPage, pageCourante * parPage);
  const debutAffichage = assureursTries.length === 0 ? 0 : (pageCourante - 1) * parPage + 1;
  const finAffichage = Math.min(pageCourante * parPage, assureursTries.length);

  /* ─── KPI + graphiques (jeu complet non filtré) ────────────── */

  const kpi = useMemo(() => {
    const total = statistiques.length;
    const publie = statistiques.filter((a) => a.statut_verification === "publie").length;
    const enCours = statistiques.filter((a) => a.statut_verification === "en_cours").length;
    const nonPublie = statistiques.filter((a) => a.statut_verification === "non_publie").length;
    const rejete = statistiques.filter((a) => a.statut_verification === "rejete").length;
    const compagnies = statistiques.filter((a) => a.type_acteur === "compagnie").length;
    const courtiers = statistiques.filter((a) => a.type_acteur === "courtier").length;
    return { total, publie, enCours, nonPublie, rejete, compagnies, courtiers };
  }, [statistiques]);

  const refGraphStatut = useRef(null);
  const refGraphType = useRef(null);
  const refGraphPays = useRef(null);
  const instancesGraph = useRef({});

  useEffect(() => {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = COULEURS_GRAPHIQUE.text500;
  }, []);

  useEffect(() => {
    if (!refGraphStatut.current) return;
    instancesGraph.current.statut?.destroy();
    instancesGraph.current.statut = new Chart(refGraphStatut.current, {
      type: "polarArea",
      data: {
        labels: ["Publié", "En cours", "Non publié", "Rejeté"],
        datasets: [{
          data: [kpi.publie, kpi.enCours, kpi.nonPublie, kpi.rejete],
          backgroundColor: ["rgba(27,138,75,0.75)", "rgba(183,121,31,0.75)", "rgba(28,143,224,0.55)", "rgba(229,72,77,0.75)"],
          borderColor: "#fff", borderWidth: 2,
        }],
      },
      options: {
        plugins: { legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", padding: 16 } } },
        scales: { r: { grid: { color: COULEURS_GRAPHIQUE.border }, ticks: { display: false } } },
      },
    });
  }, [kpi]);

  useEffect(() => {
    if (!refGraphType.current) return;
    instancesGraph.current.type?.destroy();
    instancesGraph.current.type = new Chart(refGraphType.current, {
      type: "doughnut",
      data: {
        labels: ["Compagnies", "Courtiers"],
        datasets: [{ data: [kpi.compagnies, kpi.courtiers], backgroundColor: [COULEURS_GRAPHIQUE.primary, COULEURS_GRAPHIQUE.teal], borderWidth: 0 }],
      },
      options: {
        cutout: "65%",
        plugins: { legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", padding: 16 } } },
      },
    });
  }, [kpi]);

  useEffect(() => {
    if (!refGraphPays.current) return;
    const parPays = {};
    statistiques.forEach((a) => {
      const nom = a.pays?.nom || "—";
      parPays[nom] = (parPays[nom] || 0) + 1;
    });
    const entrees = Object.entries(parPays).sort((a, b) => b[1] - a[1]).slice(0, 6);

    instancesGraph.current.pays?.destroy();
    instancesGraph.current.pays = new Chart(refGraphPays.current, {
      type: "bar",
      data: {
        labels: entrees.map(([nom]) => nom),
        datasets: [{ label: "Assureurs", data: entrees.map(([, n]) => n), backgroundColor: COULEURS_GRAPHIQUE.primary, borderRadius: 6, borderSkipped: false }],
      },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: COULEURS_GRAPHIQUE.border }, border: { color: "transparent" }, ticks: { precision: 0 } },
          y: { grid: { display: false }, border: { color: COULEURS_GRAPHIQUE.border } },
        },
      },
    });
  }, [statistiques]);

  useEffect(() => () => { Object.values(instancesGraph.current).forEach((g) => g?.destroy()); }, []);

  /* ─── Formulaire création / édition (dossier assureur) ─────── */

  function ouvrirCreation() {
    setModeEdition(false);
    setFormulaire(FORMULAIRE_VIDE);
    setFichiersExistants(null);
    setErreurFormulaire(null);
    setModaleOuverte(true);
  }

  function ouvrirEdition(assureur) {
    setModeEdition(true);
    setFormulaire({
      raison_sociale: assureur.raison_sociale ?? "", type_acteur: assureur.type_acteur ?? "compagnie",
      pays_id: assureur.pays_id ?? "", ville_id: assureur.ville_id ?? "",
      email: assureur.email ?? "", telephone: assureur.telephone ?? "",
      numero_agrement: assureur.numero_agrement ?? "", numero_rccm: assureur.numero_rccm ?? "",
      representant_legal: assureur.representant_legal ?? "",
      statut_verification: assureur.statut_verification ?? "non_publie",
      formule_abonnement: assureur.formule_abonnement ?? "starter",
      notes_internes: assureur.notes_internes ?? "",
      document_rccm: null, document_agrement: null, piece_identite_representant: null, document_statuts: null,
      assureur_id: assureur.assureur_id,
    });
    setFichiersExistants({
      document_rccm_url: assureur.document_rccm_url ?? null,
      document_agrement_url: assureur.document_agrement_url ?? null,
      piece_identite_representant_url: assureur.piece_identite_representant_url ?? null,
      document_statuts_url: assureur.document_statuts_url ?? null,
    });
    setErreurFormulaire(null);
    setModaleOuverte(true);
    setAssureurSelectionne(null);
  }

  function fermerModale() { setModaleOuverte(false); setErreurFormulaire(null); }

  function modifierChampFormulaire(champ, valeur) {
    setFormulaire((p) => ({ ...p, [champ]: valeur, ...(champ === "pays_id" ? { ville_id: "" } : {}) }));
  }
  function modifierFichierFormulaire(champ, fichier) {
    setFormulaire((p) => ({ ...p, [champ]: fichier ?? null }));
  }

  async function soumettreFormulaire(evenement) {
    evenement.preventDefault();
    setErreurFormulaire(null);

    if (!modeEdition) {
      const manquants = [];
      if (!formulaire.numero_agrement?.trim()) manquants.push("numéro d'agrément (ARCA/CIMA)");
      if (!formulaire.numero_rccm?.trim()) manquants.push("numéro RCCM");
      if (!formulaire.representant_legal?.trim()) manquants.push("représentant légal");
      if (!formulaire.document_rccm) manquants.push("copie du RCCM");
      if (!formulaire.document_agrement) manquants.push("agrément officiel");
      if (!formulaire.piece_identite_representant) manquants.push("pièce d'identité du représentant légal");
      if (!formulaire.document_statuts) manquants.push("statuts de la société");
      if (manquants.length) {
        setErreurFormulaire(`Champ(s)/fichier(s) manquant(s) : ${manquants.join(", ")}.`);
        return;
      }
      if (formulaire.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formulaire.email.trim())) {
        setErreurFormulaire("Email de contact invalide.");
        return;
      }
    }

    setEnvoiEnCours(true);
    const { assureur_id, ...donnees } = formulaire;
    try {
      if (modeEdition) {
        await modifierAssureur(assureur_id, donnees);
      } else {
        await creerAssureur(donnees);
      }
      setModaleOuverte(false);
      await chargerAssureurs();
    } catch (err) {
      setErreurFormulaire(err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  async function confirmerSuppression() {
    if (!cibleSuppression) return;
    setSuppressionEnCours(true);
    try {
      await supprimerAssureur(cibleSuppression.assureur_id);
      setCibleSuppression(null);
      if (assureurSelectionne?.assureur_id === cibleSuppression.assureur_id) setAssureurSelectionne(null);
      await chargerAssureurs();
    } catch (err) {
      setErreur(err.message || "Impossible de supprimer cet assureur.");
      setCibleSuppression(null);
    } finally {
      setSuppressionEnCours(false);
    }
  }

  function exporterCsv() {
    const entetes = ["Raison sociale", "Type", "Statut", "Téléphone", "N° Agrément", "N° RCCM", "Ville", "Pays"];
    const lignes = assureursTries.map((a) => [
      a.raison_sociale, TYPE_META[a.type_acteur]?.libelle || a.type_acteur,
      STATUT_META[a.statut_verification]?.libelle || a.statut_verification,
      a.telephone, a.numero_agrement, a.numero_rccm, a.ville?.nom || "", a.pays?.nom || "",
    ]);
    const csv = [entetes, ...lignes]
      .map((ligne) => ligne.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(blob);
    lien.download = "assureurs.csv";
    lien.click();
    URL.revokeObjectURL(lien.href);
  }

  /* ─────────────────────────────────────────────────────────────
       GESTION D'UN ASSUREUR (bouton fa-cog) — Siège / Activités /
       Filiales & agences, fidèle aux deux captures d'écran fournies.
     ───────────────────────────────────────────────────────────── */

  async function ouvrirGestion(assureur) {
    setAssureurEnGestion(assureur);
    setOngletGestion("siege");
    setErreurGestion(null);
    setFormulaireAgenceOuvert(false);
    setAgenceEnEdition(null);
    setFiltreAgenceRegion(""); setFiltreAgenceVille("");
    setChargementGestion(true);
    try {
      // On suppose que l'API renvoie en un seul appel les 3 blocs
      // (siège, activités, agences) pour éviter 3 aller-retours —
      // à ajuster si le backend expose 3 endpoints séparés.
      const donnees = await obtenirGestionAssureur(assureur.assureur_id);
      setSiege({
        adresse: donnees.siege?.adresse ?? "", region: donnees.siege?.region ?? "",
        ville_id: donnees.siege?.ville_id ?? "", telephone: donnees.siege?.telephone ?? "",
        latitude: donnees.siege?.latitude ?? "", longitude: donnees.siege?.longitude ?? "",
      });
      setActivites({
        branches: donnees.activites?.branches ?? [],
        produits: donnees.activites?.produits ?? [],
      });
      setAgences(donnees.agences ?? []);
    } catch (err) {
      setErreurGestion(err.message || "Impossible de charger les informations de gestion.");
    } finally {
      setChargementGestion(false);
    }
  }

  function fermerGestion() {
    setAssureurEnGestion(null);
    setErreurGestion(null);
  }

  useEffect(() => {
    if (!siege.pays_id_calcule && !assureurEnGestion) return;
  }, [assureurEnGestion, siege.pays_id_calcule]);

  // Villes du formulaire "Siège" : dépend du pays de l'assureur (déjà
  // fixé à la création du dossier), pas d'un champ pays dédié ici.
  useEffect(() => {
    if (!assureurEnGestion?.pays_id) { setVillesSiege([]); return; }
    listerVilles(assureurEnGestion.pays_id).then(setVillesSiege).catch(() => setVillesSiege([]));
  }, [assureurEnGestion?.pays_id]);

  function modifierChampSiege(champ, valeur) {
    setSiege((p) => ({ ...p, [champ]: valeur }));
  }

  async function enregistrerSiege(evenement) {
    evenement.preventDefault();
    if (!assureurEnGestion) return;
    setEnregistrementSiege(true);
    setErreurGestion(null);
    try {
      const { latitude, longitude, ...reste } = siege;
      await modifierSiegeAssureur(assureurEnGestion.assureur_id, {
        ...reste,
        ...(latitude !== "" && longitude !== "" ? { latitude: Number(latitude), longitude: Number(longitude) } : {}),
      });
      await chargerAssureurs();
    } catch (err) {
      setErreurGestion(err.message || "Impossible d'enregistrer le siège.");
    } finally {
      setEnregistrementSiege(false);
    }
  }

  function ajouterBranche() {
    const valeur = nouvelleBranche.trim();
    if (!valeur || activites.branches.includes(valeur)) { setNouvelleBranche(""); return; }
    setActivites((p) => ({ ...p, branches: [...p.branches, valeur] }));
    setNouvelleBranche("");
  }
  function retirerBranche(branche) {
    setActivites((p) => ({ ...p, branches: p.branches.filter((b) => b !== branche) }));
  }

  function ajouterProduit() {
    setActivites((p) => ({
      ...p,
      produits: [...p.produits, { nom: "", public_cible: "", garanties: [] }],
    }));
  }
  function modifierProduit(index, champ, valeur) {
    setActivites((p) => {
      const produits = [...p.produits];
      produits[index] = { ...produits[index], [champ]: valeur };
      return { ...p, produits };
    });
  }
  function modifierGarantiesProduit(index, texte) {
    const garanties = texte.split(",").map((g) => g.trim()).filter(Boolean);
    modifierProduit(index, "garanties", garanties);
  }
  function retirerProduit(index) {
    setActivites((p) => ({ ...p, produits: p.produits.filter((_, i) => i !== index) }));
  }

  async function enregistrerActivites() {
    if (!assureurEnGestion) return;
    setEnregistrementActivites(true);
    setErreurGestion(null);
    try {
      await modifierActivitesAssureur(assureurEnGestion.assureur_id, activites);
    } catch (err) {
      setErreurGestion(err.message || "Impossible d'enregistrer les activités.");
    } finally {
      setEnregistrementActivites(false);
    }
  }

  const agencesFiltrees = useMemo(() => {
    return agences.filter((a) => {
      if (filtreAgenceRegion && a.region !== filtreAgenceRegion) return false;
      if (filtreAgenceVille && a.ville?.nom !== filtreAgenceVille) return false;
      return true;
    });
  }, [agences, filtreAgenceRegion, filtreAgenceVille]);

  const regionsDisponibles = useMemo(
    () => [...new Set(agences.map((a) => a.region).filter(Boolean))],
    [agences]
  );
  const villesDisponibles = useMemo(
    () => [...new Set(agences.map((a) => a.ville?.nom).filter(Boolean))],
    [agences]
  );

  function localiserAgencesProches() {
    if (!navigator.geolocation) {
      setErreurGestion("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => { /* Tri par proximité laissé au backend une fois les coordonnées transmises. */ },
      () => setErreurGestion("Impossible d'obtenir votre position.")
    );
  }

  function ouvrirCreationAgence() {
    setAgenceEnEdition(null);
    setFormulaireAgence(AGENCE_VIDE);
    setFormulaireAgenceOuvert(true);
  }
  function ouvrirEditionAgence(agence) {
    setAgenceEnEdition(agence);
    setFormulaireAgence({
      nom: agence.nom ?? "", adresse: agence.adresse ?? "", region: agence.region ?? "",
      ville_id: agence.ville_id ?? "", telephone: agence.telephone ?? "",
      latitude: agence.latitude ?? "", longitude: agence.longitude ?? "",
    });
    setFormulaireAgenceOuvert(true);
  }
  function fermerFormulaireAgence() {
    setFormulaireAgenceOuvert(false);
    setAgenceEnEdition(null);
  }
  function modifierChampAgence(champ, valeur) {
    setFormulaireAgence((p) => ({ ...p, [champ]: valeur }));
  }

  useEffect(() => {
    if (!formulaireAgence.pays_id && !assureurEnGestion?.pays_id) { setVillesAgence([]); return; }
    const paysId = assureurEnGestion?.pays_id;
    if (!paysId) { setVillesAgence([]); return; }
    listerVilles(paysId).then(setVillesAgence).catch(() => setVillesAgence([]));
  }, [assureurEnGestion?.pays_id, formulaireAgenceOuvert]);

  async function soumettreAgence(evenement) {
    evenement.preventDefault();
    if (!assureurEnGestion) return;
    setEnregistrementAgence(true);
    setErreurGestion(null);
    try {
      const { latitude, longitude, ...reste } = formulaireAgence;
      const donnees = {
        ...reste,
        ...(latitude !== "" && longitude !== "" ? { latitude: Number(latitude), longitude: Number(longitude) } : {}),
      };
      if (agenceEnEdition) {
        await modifierAgenceAssureur(assureurEnGestion.assureur_id, agenceEnEdition.agence_id, donnees);
      } else {
        await creerAgenceAssureur(assureurEnGestion.assureur_id, donnees);
      }
      const donneesFraiches = await obtenirGestionAssureur(assureurEnGestion.assureur_id);
      setAgences(donneesFraiches.agences ?? []);
      fermerFormulaireAgence();
    } catch (err) {
      setErreurGestion(err.message || "Impossible d'enregistrer cette agence.");
    } finally {
      setEnregistrementAgence(false);
    }
  }

  async function confirmerSuppressionAgence() {
    if (!cibleSuppressionAgence || !assureurEnGestion) return;
    try {
      await supprimerAgenceAssureur(assureurEnGestion.assureur_id, cibleSuppressionAgence.agence_id);
      setAgences((p) => p.filter((a) => a.agence_id !== cibleSuppressionAgence.agence_id));
      setCibleSuppressionAgence(null);
    } catch (err) {
      setErreurGestion(err.message || "Impossible de supprimer cette agence.");
      setCibleSuppressionAgence(null);
    }
  }

  async function definirAgencePrincipale(agence) {
    if (!assureurEnGestion) return;
    try {
      await choisirAgencePrincipale(assureurEnGestion.assureur_id, agence.agence_id);
      setAgences((p) => p.map((a) => ({ ...a, est_choisie: a.agence_id === agence.agence_id })));
    } catch (err) {
      setErreurGestion(err.message || "Impossible de définir cette agence par défaut.");
    }
  }

  return (
    <>
      <style>{STYLE_ASSUREURS}</style>
      <main className="aps-content">
        {/* ===================== EN-TÊTE DE PAGE ===================== */}
        <div className="aps-page-header">
          <div>
            <nav className="aps-breadcrumb">
              <a href="dashboard.html">Tableau de bord</a>
              <span className="sep">/</span>
              <span>Annuaire &amp; Utilisateurs</span>
              <span className="sep">/</span>
              <span>Assureurs &amp; courtiers</span>
            </nav>
            <h1>Assureurs &amp; courtiers</h1>
            <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
              Gestion des compagnies d'assurance et courtiers partenaires de la plateforme.
            </p>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-light" type="button" onClick={exporterCsv}>
              <i className="fa-solid fa-file-export me-1"></i> Exporter
            </button>
            {peutCreer && (
              <button className="btn btn-primary" type="button" onClick={ouvrirCreation}>
                <i className="fa-solid fa-plus me-1"></i> Nouvel assureur
              </button>
            )}
          </div>
        </div>

        {/* ===================== KPI PRINCIPAUX ===================== */}
        <div className="row g-3 mb-4">
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-primary"><i className="fa-solid fa-shield-heart"></i></div>
                <span className="aps-badge is-info"><i className="fa-solid fa-circle"></i> Total</span>
              </div>
              <div className="aps-kpi__label">Assureurs &amp; courtiers</div>
              <div className="aps-kpi__value">{kpi.total.toLocaleString("fr-FR")}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-success"><i className="fa-solid fa-circle-check"></i></div>
                <span className="aps-badge is-success"><i className="fa-solid fa-circle"></i> Actif</span>
              </div>
              <div className="aps-kpi__label">Fiches publiées</div>
              <div className="aps-kpi__value">{kpi.publie.toLocaleString("fr-FR")}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-warning"><i className="fa-solid fa-hourglass-half"></i></div>
                <span className="aps-badge is-warning"><i className="fa-solid fa-circle"></i> À traiter</span>
              </div>
              <div className="aps-kpi__label">Inscriptions en attente</div>
              <div className="aps-kpi__value">{kpi.enCours.toLocaleString("fr-FR")}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-danger"><i className="fa-solid fa-triangle-exclamation"></i></div>
                <span className="aps-badge is-danger"><i className="fa-solid fa-circle"></i> Rejeté</span>
              </div>
              <div className="aps-kpi__label">Dossiers rejetés</div>
              <div className="aps-kpi__value">{kpi.rejete.toLocaleString("fr-FR")}</div>
            </div>
          </div>
        </div>

        {/* ===================== GRAPHIQUES ===================== */}
        <div className="row g-3 mb-4">
          <div className="col-lg-4">
            <div className="aps-card h-100">
              <div className="aps-card__header"><h3>Statut de vérification</h3></div>
              <div className="aps-card__body">
                <div style={{ position: "relative", height: 240 }}><canvas ref={refGraphStatut}></canvas></div>
              </div>
            </div>
          </div>
          <div className="col-lg-4">
            <div className="aps-card h-100">
              <div className="aps-card__header"><h3>Répartition par type d'acteur</h3></div>
              <div className="aps-card__body">
                <div style={{ position: "relative", height: 240 }}><canvas ref={refGraphType}></canvas></div>
              </div>
            </div>
          </div>
          <div className="col-lg-4">
            <div className="aps-card h-100">
              <div className="aps-card__header"><h3>Assureurs par pays</h3></div>
              <div className="aps-card__body">
                <div style={{ position: "relative", height: 240 }}><canvas ref={refGraphPays}></canvas></div>
              </div>
            </div>
          </div>
        </div>

        {kpi.enCours > 0 && (
          <div className="aps-notice is-warning mb-4">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <div>
              <strong>{kpi.enCours} dossier{kpi.enCours > 1 ? "s" : ""} d'inscription</strong> nécessitent une revue
              documentaire (registre de commerce, agrément ARCA/CIMA, RCCM, pièce d'identité du représentant légal).
            </div>
          </div>
        )}

        {/* ===================== FILTRES ===================== */}
        <div className="aps-card mb-3">
          <div className="aps-card__body">
            <div className="row g-3 align-items-end">
              <div className="col-md-3">
                <label className="form-label">Rechercher</label>
                <div className="position-relative">
                  <i className="fa-solid fa-magnifying-glass position-absolute"
                     style={{ left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--aps-text-400)", fontSize: 13 }}></i>
                  <input
                    type="search" className="form-control" style={{ paddingLeft: 36 }}
                    placeholder="Raison sociale…" value={filtres.recherche}
                    onChange={(e) => modifierFiltre("recherche", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && appliquerFiltres()}
                  />
                </div>
              </div>
              <div className="col-md-2">
                <label className="form-label">Type</label>
                <select className="form-select" value={filtres.type_acteur} onChange={(e) => modifierFiltre("type_acteur", e.target.value)}>
                  <option value="">Tous</option>
                  {TYPES_ACTEUR_ASSUREUR.map((t) => <option key={t.valeur} value={t.valeur}>{t.libelle}</option>)}
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label">Statut</label>
                <select className="form-select" value={filtres.statut_verification} onChange={(e) => modifierFiltre("statut_verification", e.target.value)}>
                  <option value="">Tous</option>
                  {STATUTS_VERIFICATION_ASSUREUR.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label">Pays</label>
                <select className="form-select" value={filtres.pays_id} onChange={(e) => modifierFiltre("pays_id", e.target.value)}>
                  <option value="">Tous les pays</option>
                  {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
                </select>
              </div>
              <div className="col-md-1">
                <label className="form-label">Ville</label>
                <select className="form-select" value={filtres.ville_id} onChange={(e) => modifierFiltre("ville_id", e.target.value)} disabled={!filtres.pays_id}>
                  <option value="">Toutes</option>
                  {villesFiltre.map((v) => <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>)}
                </select>
              </div>
              <div className="col-md-2 d-flex gap-2">
                <button className="btn btn-outline-primary flex-grow-1" type="button" onClick={appliquerFiltres}>Filtrer</button>
                <button className="btn btn-light" type="button" title="Réinitialiser" onClick={reinitialiserFiltres}>
                  <i className="fa-solid fa-rotate-left"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        {erreur && (
          <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreur}</div></div>
        )}

        {/* ===================== LISTE — AFFICHAGE EN CARDS ===================== */}
        <div className="d-flex align-items-center justify-content-between mb-3">
          <div className="aps-text-muted" style={{ fontSize: 13 }}>
            {chargement ? "Chargement…" : (
              <>Affichage de <strong className="aps-text-strong">{debutAffichage}–{finAffichage}</strong> sur{" "}
                <strong className="aps-text-strong">{assureursTries.length}</strong> assureurs &amp; courtiers</>
            )}
          </div>
          <div className="d-flex gap-2 align-items-center">
            <label className="aps-text-muted" style={{ fontSize: 13 }}>Trier par :</label>
            <select className="form-select form-select-sm" style={{ width: "auto" }} value={tri} onChange={(e) => setTri(e.target.value)}>
              <option value="nom">Raison sociale (A-Z)</option>
              <option value="statut">Statut</option>
            </select>
          </div>
        </div>

        <div className="row g-3">
          {!chargement && assureursPage.length === 0 && (
            <div className="col-12">
              <div className="aps-card">
                <div className="aps-card__body text-center aps-text-muted py-5">
                  Aucun assureur ne correspond à ces critères.
                </div>
              </div>
            </div>
          )}

          {assureursPage.map((assureur) => {
            const statut = STATUT_META[assureur.statut_verification] || {};
            const type = TYPE_META[assureur.type_acteur] || {};
            return (
              <div className="col-md-6 col-xl-4" key={assureur.assureur_id}>
                {/* Card Bootstrap "image en haut" — même gabarit que
                    Pharmacie.jsx : <div class="card"><img class="card-img-top">
                    ...<div class="card-body">…</div></div>. Repli en
                    avatar "initiales" quand l'assureur n'a pas de logo. */}
                <div className="card h-100 shadow-sm">
                  {assureur.logo_url ? (
                    <img
                      src={assureur.logo_url}
                      className="card-img-top"
                      alt={assureur.raison_sociale}
                      style={{ height: 160, objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      className="card-img-top d-flex align-items-center justify-content-center"
                      style={{ height: 160, background: "var(--aps-primary-100, #EAF4FD)", color: "var(--aps-primary, #1C8FE0)", fontSize: 34, fontWeight: 700 }}
                    >
                      {initiales(assureur.raison_sociale)}
                    </div>
                  )}
                  <div className="card-body d-flex flex-column">
                    <div className="d-flex align-items-start justify-content-between mb-1">
                      <h5 className="card-title mb-0" style={{ fontSize: 16 }}>{assureur.raison_sociale}</h5>
                      <span className={`aps-badge ${statut.badge || "is-info"} ms-2`}>
                        <i className="fa-solid fa-circle"></i> {statut.libelle}
                      </span>
                    </div>
                    <p className="card-text aps-text-muted mb-2" style={{ fontSize: 13 }}>
                      <i className={`fa-solid ${type.icone || "fa-building"} me-1`}></i>
                      {type.libelle} · {assureur.ville?.nom}{assureur.ville?.nom && assureur.pays?.nom ? " · " : ""}{assureur.pays?.nom}
                    </p>
                    <p className="card-text mb-3" style={{ fontSize: 13 }}>
                      <i className="fa-solid fa-file-contract me-1"></i>
                      Agr. {assureur.numero_agrement || "—"}
                      <span className="mx-2">·</span>
                      <i className="fa-solid fa-phone me-1"></i>
                      {assureur.telephone}
                    </p>

                    <div className="d-flex gap-2 mt-auto pt-2" style={{ borderTop: "1px solid var(--aps-border)" }}>
                      {assureur.statut_verification === "en_cours" && peutModifier ? (
                        <button className="btn btn-sm btn-primary flex-grow-1" onClick={() => ouvrirEdition(assureur)}>
                          <i className="fa-solid fa-file-signature me-1"></i> Examiner
                        </button>
                      ) : (
                        <button className="btn btn-sm btn-outline-primary flex-grow-1" onClick={() => setAssureurSelectionne(assureur)}>
                          <i className="fa-solid fa-eye me-1"></i> Voir
                        </button>
                      )}
                      {peutModifier && (
                        <button className="btn btn-sm btn-light" title="Modifier le dossier" onClick={() => ouvrirEdition(assureur)}>
                          <i className="fa-solid fa-pen"></i>
                        </button>
                      )}
                      {peutGerer && (
                        <button
                          className="btn btn-sm btn-light"
                          title="Gérer l'assureur (siège, activités, agences)"
                          onClick={() => ouvrirGestion(assureur)}
                        >
                          <i className="fa-solid fa-cog"></i>
                        </button>
                      )}
                      {peutSupprimer && (
                        <button className="btn btn-sm btn-light" title="Supprimer" onClick={() => setCibleSuppression(assureur)}>
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ===================== PAGINATION ===================== */}
        <div className="aps-card mt-3">
          <div className="aps-pagination">
            <div>Page <strong>{pageCourante}</strong> sur <strong>{nbPages}</strong></div>
            <div className="pages">
              <button type="button" disabled={pageCourante <= 1} onClick={() => setPage(pageCourante - 1)}>
                <i className="fa-solid fa-chevron-left"></i>
              </button>
              {Array.from({ length: nbPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === nbPages || Math.abs(n - pageCourante) <= 1)
                .reduce((acc, n) => {
                  if (acc.length && n - acc[acc.length - 1] > 1) acc.push("…");
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) => n === "…" ? (
                  <button type="button" key={`ellipse-${i}`} disabled>…</button>
                ) : (
                  <button type="button" key={n} className={n === pageCourante ? "is-active" : ""} onClick={() => setPage(n)}>{n}</button>
                ))}
              <button type="button" disabled={pageCourante >= nbPages} onClick={() => setPage(pageCourante + 1)}>
                <i className="fa-solid fa-chevron-right"></i>
              </button>
            </div>
            <div className="d-flex gap-2 align-items-center">
              <span>Par page :</span>
              <select className="form-select form-select-sm" style={{ width: "auto" }} value={parPage}
                      onChange={(e) => { setParPage(Number(e.target.value)); setPage(1); }}>
                {TAILLES_PAGE.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </div>
      </main>

      {/* =========================================================
           MODALE — FICHE DÉTAIL (dossier d'inscription)
           ========================================================= */}
      {assureurSelectionne && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={() => setAssureurSelectionne(null)}>
            <div className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content aps-fiche-detail">
                <div className="modal-header aps-fiche-header">
                  <div className="d-flex align-items-center gap-3">
                    <div className="aps-fiche-avatar">
                      {assureurSelectionne.logo_url
                        ? <img src={assureurSelectionne.logo_url} alt={assureurSelectionne.raison_sociale} />
                        : initiales(assureurSelectionne.raison_sociale)}
                    </div>
                    <div>
                      <h5 className="modal-title mb-1">{assureurSelectionne.raison_sociale}</h5>
                      <div className="aps-text-muted aps-fiche-souscritre">
                        {TYPE_META[assureurSelectionne.type_acteur]?.libelle} ·{" "}
                        {assureurSelectionne.ville?.nom || "Ville non renseignée"}
                        {assureurSelectionne.pays?.nom ? `, ${assureurSelectionne.pays.nom}` : ""}
                      </div>
                      <span className={`aps-badge mt-1 ${STATUT_META[assureurSelectionne.statut_verification]?.badge || "is-info"}`}>
                        <i className={`fa-solid ${STATUT_META[assureurSelectionne.statut_verification]?.detailIcone || "fa-circle"}`}></i>
                        {STATUT_META[assureurSelectionne.statut_verification]?.libelle}
                      </span>
                    </div>
                  </div>
                  <button type="button" className="btn-close" onClick={() => setAssureurSelectionne(null)}></button>
                </div>
                <div className="modal-body pt-3">
                  <div className="row g-4">
                    <div className="col-lg-5">
                      <div className="aps-fiche-info-grid">
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-envelope"></i>
                          <div>
                            <div className="aps-fiche-info-label">Email</div>
                            <div className="aps-fiche-info-valeur">{assureurSelectionne.email || "—"}</div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-phone"></i>
                          <div>
                            <div className="aps-fiche-info-label">Téléphone</div>
                            <div className="aps-fiche-info-valeur">{assureurSelectionne.telephone || "—"}</div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-file-contract"></i>
                          <div>
                            <div className="aps-fiche-info-label">N° Agrément</div>
                            <div className="aps-fiche-info-valeur">{assureurSelectionne.numero_agrement || "—"}</div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-building"></i>
                          <div>
                            <div className="aps-fiche-info-label">N° RCCM</div>
                            <div className="aps-fiche-info-valeur">{assureurSelectionne.numero_rccm || "—"}</div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-user-tie"></i>
                          <div>
                            <div className="aps-fiche-info-label">Représentant légal</div>
                            <div className="aps-fiche-info-valeur">{assureurSelectionne.representant_legal || "—"}</div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-star"></i>
                          <div>
                            <div className="aps-fiche-info-label">Formule d'abonnement</div>
                            <div className="aps-fiche-info-valeur">
                              {FORMULES_ABONNEMENT.find((f) => f.valeur === assureurSelectionne.formule_abonnement)?.libelle || "—"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="col-lg-7">
                      <div className="aps-fiche-section-titre">
                        <i className="fa-solid fa-folder-open me-1"></i> Documents soumis
                      </div>
                      <div className="aps-accordion">
                        {[
                          { id: "rccm", label: "Copie du RCCM", icone: "fa-file-pdf", url: assureurSelectionne.document_rccm_url },
                          { id: "agrement", label: "Agrément officiel (ARCA / CIMA)", icone: "fa-file-shield", url: assureurSelectionne.document_agrement_url },
                          { id: "identite", label: "Pièce d'identité du représentant légal", icone: "fa-id-card", url: assureurSelectionne.piece_identite_representant_url },
                          { id: "statuts", label: "Statuts de la société", icone: "fa-file-invoice", url: assureurSelectionne.document_statuts_url },
                        ].filter((piece) => piece.url).map((piece) => {
                          const ouvert = !!piecesOuvertes[piece.id];
                          return (
                            <div className={`aps-accordion-item ${ouvert ? "is-open" : ""}`} key={piece.id}>
                              <button
                                type="button"
                                className="aps-accordion-trigger"
                                onClick={() => setPiecesOuvertes((p) => ({ ...p, [piece.id]: !p[piece.id] }))}
                                aria-expanded={ouvert}
                              >
                                <span className="aps-accordion-icone"><i className={`fa-solid ${piece.icone}`}></i></span>
                                <span className="aps-accordion-libelle">{piece.label}</span>
                                <a
                                  href={piece.url} target="_blank" rel="noreferrer" className="aps-accordion-lien-externe"
                                  onClick={(e) => e.stopPropagation()} title="Ouvrir dans un nouvel onglet"
                                >
                                  <i className="fa-solid fa-up-right-from-square"></i>
                                </a>
                                <i className="fa-solid fa-chevron-down aps-accordion-chevron"></i>
                              </button>
                              {ouvert && (
                                <div className="aps-accordion-panel">
                                  <ApercuPieceJustificative url={piece.url} label={piece.label} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {!assureurSelectionne.document_rccm_url && !assureurSelectionne.document_agrement_url
                          && !assureurSelectionne.piece_identite_representant_url && !assureurSelectionne.document_statuts_url && (
                          <div className="aps-text-muted" style={{ fontSize: 13 }}>Aucun document soumis.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  {peutGerer && (
                    <button type="button" className="btn btn-light" onClick={() => { setAssureurSelectionne(null); ouvrirGestion(assureurSelectionne); }}>
                      <i className="fa-solid fa-cog me-1"></i> Gérer
                    </button>
                  )}
                  {peutModifier && (
                    <button type="button" className="btn btn-primary" onClick={() => ouvrirEdition(assureurSelectionne)}>
                      <i className="fa-solid fa-pen me-1"></i> Modifier
                    </button>
                  )}
                  <button type="button" className="btn btn-light" onClick={() => setAssureurSelectionne(null)}>Fermer</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — CRÉATION / ÉDITION DU DOSSIER
           ========================================================= */}
      {modaleOuverte && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={fermerModale}>
            <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
              <form className="modal-content" onSubmit={soumettreFormulaire}>
                <div className="modal-header">
                  <h5 className="modal-title">{modeEdition ? "Modifier l'assureur" : "Nouvel assureur / courtier"}</h5>
                  <button type="button" className="btn-close" onClick={fermerModale}></button>
                </div>
                <div className="modal-body">
                  {erreurFormulaire && (
                    <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreurFormulaire}</div></div>
                  )}
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label">Raison sociale</label>
                      <input type="text" className="form-control" required value={formulaire.raison_sociale}
                             onChange={(e) => modifierChampFormulaire("raison_sociale", e.target.value)} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Type d'acteur</label>
                      <select className="form-select" required value={formulaire.type_acteur}
                              onChange={(e) => modifierChampFormulaire("type_acteur", e.target.value)}>
                        {TYPES_ACTEUR_ASSUREUR.map((t) => <option key={t.valeur} value={t.valeur}>{t.libelle}</option>)}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Statut de vérification</label>
                      <select className="form-select" required value={formulaire.statut_verification}
                              onChange={(e) => modifierChampFormulaire("statut_verification", e.target.value)}>
                        {STATUTS_VERIFICATION_ASSUREUR.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
                      </select>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Pays d'implantation</label>
                      <select className="form-select" required value={formulaire.pays_id}
                              onChange={(e) => modifierChampFormulaire("pays_id", e.target.value)}>
                        <option value="" disabled>Choisir…</option>
                        {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Ville</label>
                      <select className="form-select" required value={formulaire.ville_id}
                              onChange={(e) => modifierChampFormulaire("ville_id", e.target.value)} disabled={!formulaire.pays_id}>
                        <option value="" disabled>Choisir…</option>
                        {villesFormulaire.map((v) => <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>)}
                      </select>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Email de contact</label>
                      <input type="email" className="form-control" required value={formulaire.email}
                             onChange={(e) => modifierChampFormulaire("email", e.target.value)} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Téléphone</label>
                      <input type="tel" className="form-control" required value={formulaire.telephone}
                             onChange={(e) => modifierChampFormulaire("telephone", e.target.value)} />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Numéro d'agrément (ARCA / CIMA)</label>
                      <input type="text" className="form-control" required value={formulaire.numero_agrement}
                             onChange={(e) => modifierChampFormulaire("numero_agrement", e.target.value)} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Numéro RCCM</label>
                      <input type="text" className="form-control" required value={formulaire.numero_rccm}
                             onChange={(e) => modifierChampFormulaire("numero_rccm", e.target.value)} />
                    </div>

                    <div className="col-md-8">
                      <label className="form-label">Nom du représentant légal</label>
                      <input type="text" className="form-control" required value={formulaire.representant_legal}
                             onChange={(e) => modifierChampFormulaire("representant_legal", e.target.value)} />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Formule d'abonnement</label>
                      <select className="form-select" value={formulaire.formule_abonnement}
                              onChange={(e) => modifierChampFormulaire("formule_abonnement", e.target.value)}>
                        {FORMULES_ABONNEMENT.map((f) => <option key={f.valeur} value={f.valeur}>{f.libelle}</option>)}
                      </select>
                    </div>

                    <div className="col-12">
                      <label className="form-label">Notes internes (admin)</label>
                      <textarea className="form-control" rows={2} placeholder="Observations éventuelles…"
                                value={formulaire.notes_internes}
                                onChange={(e) => modifierChampFormulaire("notes_internes", e.target.value)} />
                    </div>

                    {/* ── Documents justificatifs ─────────────────
                         Obligatoires à la création ; optionnels en
                         édition (un champ laissé vide conserve le
                         fichier déjà enregistré) — même logique que
                         Pharmacie.jsx. */}
                    <div className="col-12">
                      <hr />
                      <div className="aps-text-muted mb-2" style={{ fontSize: 13 }}>
                        Documents justificatifs {modeEdition ? "(laisser vide pour conserver le fichier actuel)" : "(obligatoires — PDF, JPG, PNG, 5 Mo max)"}
                      </div>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Copie du RCCM {!modeEdition && <span className="text-danger">*</span>}</label>
                      <input type="file" className="form-control" accept=".pdf,.jpg,.jpeg,.png"
                             onChange={(e) => modifierFichierFormulaire("document_rccm", e.target.files?.[0])} />
                      {fichiersExistants?.document_rccm_url && (
                        <a href={fichiersExistants.document_rccm_url} target="_blank" rel="noreferrer" className="d-block mt-1" style={{ fontSize: 12 }}>
                          Voir le fichier actuel
                        </a>
                      )}
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Agrément officiel (ARCA / CIMA) {!modeEdition && <span className="text-danger">*</span>}</label>
                      <input type="file" className="form-control" accept=".pdf,.jpg,.jpeg,.png"
                             onChange={(e) => modifierFichierFormulaire("document_agrement", e.target.files?.[0])} />
                      {fichiersExistants?.document_agrement_url && (
                        <a href={fichiersExistants.document_agrement_url} target="_blank" rel="noreferrer" className="d-block mt-1" style={{ fontSize: 12 }}>
                          Voir le fichier actuel
                        </a>
                      )}
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">CNI du représentant légal {!modeEdition && <span className="text-danger">*</span>}</label>
                      <input type="file" className="form-control" accept=".pdf,.jpg,.jpeg,.png"
                             onChange={(e) => modifierFichierFormulaire("piece_identite_representant", e.target.files?.[0])} />
                      {fichiersExistants?.piece_identite_representant_url && (
                        <a href={fichiersExistants.piece_identite_representant_url} target="_blank" rel="noreferrer" className="d-block mt-1" style={{ fontSize: 12 }}>
                          Voir le fichier actuel
                        </a>
                      )}
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Statuts de la société {!modeEdition && <span className="text-danger">*</span>}</label>
                      <input type="file" className="form-control" accept=".pdf,.jpg,.jpeg,.png"
                             onChange={(e) => modifierFichierFormulaire("document_statuts", e.target.files?.[0])} />
                      {fichiersExistants?.document_statuts_url && (
                        <a href={fichiersExistants.document_statuts_url} target="_blank" rel="noreferrer" className="d-block mt-1" style={{ fontSize: 12 }}>
                          Voir le fichier actuel
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={fermerModale}>Annuler</button>
                  <button type="submit" className="btn btn-primary" disabled={envoiEnCours}>
                    {envoiEnCours ? "Enregistrement…" : modeEdition ? "Enregistrer" : "Créer le compte"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — CONFIRMATION DE SUPPRESSION (superadmin)
           ========================================================= */}
      {cibleSuppression && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={() => setCibleSuppression(null)}>
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Supprimer cet assureur ?</h5>
                  <button type="button" className="btn-close" onClick={() => setCibleSuppression(null)}></button>
                </div>
                <div className="modal-body">
                  <p className="mb-0">
                    « {cibleSuppression.raison_sociale} » sera définitivement supprimé de l'annuaire, avec ses agences
                    et ses fiches produits. Cette action est irréversible.
                  </p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={() => setCibleSuppression(null)}>Annuler</button>
                  <button type="button" className="btn btn-danger" onClick={confirmerSuppression} disabled={suppressionEnCours}>
                    {suppressionEnCours ? "Suppression…" : "Supprimer définitivement"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — GESTION DE L'ASSUREUR (bouton fa-cog)
           3 onglets fidèles aux captures fournies : Siège / Activités /
           Filiales & agences.
           ========================================================= */}
      {assureurEnGestion && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={fermerGestion}>
            <div className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <div className="d-flex align-items-center gap-3">
                    <div className="aps-fiche-avatar" style={{ width: 44, height: 44, fontSize: 15 }}>
                      {assureurEnGestion.logo_url
                        ? <img src={assureurEnGestion.logo_url} alt={assureurEnGestion.raison_sociale} />
                        : initiales(assureurEnGestion.raison_sociale)}
                    </div>
                    <div>
                      <h5 className="modal-title mb-0">
                        <i className="fa-solid fa-cog me-2 text-primary"></i>
                        Gérer « {assureurEnGestion.raison_sociale} »
                      </h5>
                      <div className="aps-text-muted" style={{ fontSize: 12.5 }}>Siège, activités et réseau d'agences</div>
                    </div>
                  </div>
                  <button type="button" className="btn-close" onClick={fermerGestion}></button>
                </div>
                <div className="modal-body">
                  {erreurGestion && (
                    <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreurGestion}</div></div>
                  )}

                  <div className="aps-gestion-tabs">
                    <button type="button" className={`aps-gestion-tab ${ongletGestion === "siege" ? "is-active" : ""}`} onClick={() => setOngletGestion("siege")}>
                      <i className="fa-solid fa-building me-1"></i> Siège
                    </button>
                    <button type="button" className={`aps-gestion-tab ${ongletGestion === "activites" ? "is-active" : ""}`} onClick={() => setOngletGestion("activites")}>
                      <i className="fa-solid fa-layer-group me-1"></i> Activités
                    </button>
                    <button type="button" className={`aps-gestion-tab ${ongletGestion === "agences" ? "is-active" : ""}`} onClick={() => setOngletGestion("agences")}>
                      <i className="fa-solid fa-code-branch me-1"></i> Filiales &amp; agences
                      <span className="count"> ({agences.length})</span>
                    </button>
                  </div>

                  {chargementGestion ? (
                    <div className="text-center aps-text-muted py-5">Chargement des informations…</div>
                  ) : (
                    <>
                      {/* ── Onglet SIÈGE ─────────────────────────── */}
                      {ongletGestion === "siege" && (
                        <form onSubmit={enregistrerSiege}>
                          <div className="aps-gestion-section">
                            <div className="aps-gestion-section__titre">
                              <i className="fa-solid fa-location-dot text-primary"></i> Coordonnées du siège social
                            </div>
                            <div className="row g-3">
                              <div className="col-12">
                                <label className="form-label">Adresse</label>
                                <input type="text" className="form-control" value={siege.adresse}
                                       placeholder="Ex. Avenue de Gaulle, Akwa, Douala"
                                       onChange={(e) => modifierChampSiege("adresse", e.target.value)} />
                              </div>
                              <div className="col-md-4">
                                <label className="form-label">Région</label>
                                <input type="text" className="form-control" value={siege.region}
                                       onChange={(e) => modifierChampSiege("region", e.target.value)} />
                              </div>
                              <div className="col-md-4">
                                <label className="form-label">Ville</label>
                                <select className="form-select" value={siege.ville_id}
                                        onChange={(e) => modifierChampSiege("ville_id", e.target.value)}>
                                  <option value="">Choisir…</option>
                                  {villesSiege.map((v) => <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>)}
                                </select>
                              </div>
                              <div className="col-md-4">
                                <label className="form-label">Téléphone</label>
                                <input type="tel" className="form-control" value={siege.telephone}
                                       onChange={(e) => modifierChampSiege("telephone", e.target.value)} />
                              </div>
                              <div className="col-md-6">
                                <label className="form-label">Latitude <span className="aps-text-muted">(optionnel)</span></label>
                                <input type="number" step="any" className="form-control" value={siege.latitude}
                                       onChange={(e) => modifierChampSiege("latitude", e.target.value)} />
                              </div>
                              <div className="col-md-6">
                                <label className="form-label">Longitude <span className="aps-text-muted">(optionnel)</span></label>
                                <input type="number" step="any" className="form-control" value={siege.longitude}
                                       onChange={(e) => modifierChampSiege("longitude", e.target.value)} />
                              </div>
                            </div>
                          </div>
                          <div className="d-flex justify-content-end">
                            <button type="submit" className="btn btn-primary" disabled={enregistrementSiege}>
                              {enregistrementSiege ? "Enregistrement…" : <><i className="fa-solid fa-save me-1"></i> Enregistrer le siège</>}
                            </button>
                          </div>
                        </form>
                      )}

                      {/* ── Onglet ACTIVITÉS ─────────────────────── */}
                      {ongletGestion === "activites" && (
                        <>
                          <div className="aps-gestion-section">
                            <div className="aps-gestion-section__titre">
                              <i className="fa-solid fa-layer-group text-primary"></i> Branches &amp; domaines d'intervention
                            </div>
                            <div className="aps-chip-group mb-3">
                              {activites.branches.length === 0 && (
                                <span className="aps-text-muted" style={{ fontSize: 13 }}>Aucune branche renseignée pour l'instant.</span>
                              )}
                              {activites.branches.map((branche) => (
                                <span className="aps-chip" key={branche}>
                                  {branche}
                                  <button type="button" onClick={() => retirerBranche(branche)} title="Retirer">
                                    <i className="fa-solid fa-xmark"></i>
                                  </button>
                                </span>
                              ))}
                            </div>
                            <div className="d-flex gap-2">
                              <input
                                type="text" className="form-control form-control-sm" style={{ maxWidth: 280 }}
                                placeholder="Ex. Assurance santé individuelle"
                                value={nouvelleBranche}
                                onChange={(e) => setNouvelleBranche(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), ajouterBranche())}
                              />
                              <button type="button" className="btn btn-sm btn-outline-primary" onClick={ajouterBranche}>
                                <i className="fa-solid fa-plus me-1"></i> Ajouter
                              </button>
                            </div>
                          </div>

                          <div className="aps-gestion-section">
                            <div className="aps-gestion-section__titre">
                              <i className="fa-solid fa-file-shield text-primary"></i> Produits proposés
                            </div>
                            {activites.produits.length === 0 && (
                              <div className="aps-text-muted mb-3" style={{ fontSize: 13 }}>Aucun produit renseigné pour l'instant.</div>
                            )}
                            {activites.produits.map((produit, index) => (
                              <div className="aps-produit-card" key={index}>
                                <div className="d-flex justify-content-between align-items-start gap-2">
                                  <div className="flex-grow-1">
                                    <div className="row g-2 mb-2">
                                      <div className="col-md-6">
                                        <label className="form-label small mb-1">Nom du produit</label>
                                        <input type="text" className="form-control form-control-sm" value={produit.nom}
                                               placeholder="Ex. Activa Santé Individuelle"
                                               onChange={(e) => modifierProduit(index, "nom", e.target.value)} />
                                      </div>
                                      <div className="col-md-6">
                                        <label className="form-label small mb-1">Public cible</label>
                                        <input type="text" className="form-control form-control-sm" value={produit.public_cible}
                                               placeholder="Ex. Particuliers et familles"
                                               onChange={(e) => modifierProduit(index, "public_cible", e.target.value)} />
                                      </div>
                                    </div>
                                    <label className="form-label small mb-1">Garanties (séparées par des virgules)</label>
                                    <input
                                      type="text" className="form-control form-control-sm"
                                      placeholder="Ex. Hospitalisation, Consultations & pharmacie, Maternité"
                                      value={produit.garanties.join(", ")}
                                      onChange={(e) => modifierGarantiesProduit(index, e.target.value)}
                                    />
                                    {produit.garanties.length > 0 && (
                                      <div className="aps-chip-group mt-2">
                                        {produit.garanties.map((g) => <span className="aps-chip" key={g}>{g}</span>)}
                                      </div>
                                    )}
                                  </div>
                                  <button type="button" className="btn btn-sm btn-light" title="Retirer ce produit" onClick={() => retirerProduit(index)}>
                                    <i className="fa-solid fa-trash"></i>
                                  </button>
                                </div>
                              </div>
                            ))}
                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={ajouterProduit}>
                              <i className="fa-solid fa-plus me-1"></i> Ajouter un produit
                            </button>
                          </div>

                          <div className="aps-notice is-info mb-3">
                            <i className="fa-solid fa-circle-info"></i>
                            <div>Garanties présentées à titre informatif uniquement. Aucune comparaison de produits, aucune souscription en ligne sur APS.</div>
                          </div>

                          <div className="d-flex justify-content-end">
                            <button type="button" className="btn btn-primary" onClick={enregistrerActivites} disabled={enregistrementActivites}>
                              {enregistrementActivites ? "Enregistrement…" : <><i className="fa-solid fa-save me-1"></i> Enregistrer les activités</>}
                            </button>
                          </div>
                        </>
                      )}

                      {/* ── Onglet FILIALES & AGENCES ────────────── */}
                      {ongletGestion === "agences" && (
                        <>
                          <div className="aps-agence-search">
                            <div className="aps-gestion-section__titre" style={{ marginBottom: 12 }}>
                              <i className="fa-solid fa-sliders text-primary"></i> Rechercher une agence
                            </div>
                            <div className="row g-3">
                              <div className="col-md-5">
                                <label className="form-label">Région</label>
                                <select className="form-select" value={filtreAgenceRegion} onChange={(e) => setFiltreAgenceRegion(e.target.value)}>
                                  <option value="">Toutes les régions</option>
                                  {regionsDisponibles.map((r) => <option key={r} value={r}>{r}</option>)}
                                </select>
                              </div>
                              <div className="col-md-5">
                                <label className="form-label">Ville</label>
                                <select className="form-select" value={filtreAgenceVille} onChange={(e) => setFiltreAgenceVille(e.target.value)}>
                                  <option value="">Toutes les villes</option>
                                  {villesDisponibles.map((v) => <option key={v} value={v}>{v}</option>)}
                                </select>
                              </div>
                            </div>
                            <button type="button" className="btn btn-outline-secondary btn-sm mt-3" onClick={localiserAgencesProches}>
                              <i className="fa-solid fa-location-crosshairs me-1"></i> Agences les plus proches de moi
                            </button>
                          </div>

                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <div className="aps-text-muted" style={{ fontSize: 13 }}>
                              {agencesFiltrees.length} agence{agencesFiltrees.length > 1 ? "s" : ""} affichée{agencesFiltrees.length > 1 ? "s" : ""} sur {agences.length}
                            </div>
                            {peutGerer && (
                              <button type="button" className="btn btn-sm btn-primary" onClick={ouvrirCreationAgence}>
                                <i className="fa-solid fa-plus me-1"></i> Nouvelle agence
                              </button>
                            )}
                          </div>

                          {agencesFiltrees.length === 0 && (
                            <div className="aps-text-muted text-center py-4" style={{ fontSize: 13 }}>Aucune agence ne correspond à ces critères.</div>
                          )}

                          {agencesFiltrees.map((agence) => (
                            <div className={`aps-agence-card ${agence.est_choisie ? "is-choisie" : ""}`} key={agence.agence_id}>
                              <div className="aps-agence-card__icone"><i className="fa-solid fa-shop"></i></div>
                              <div className="aps-agence-card__body">
                                <div className="aps-agence-card__titre">
                                  {agence.nom}{agence.est_siege ? " (Siège)" : ""}
                                </div>
                                <div className="aps-agence-card__adresse">
                                  <i className="fa-solid fa-location-dot me-1"></i>{agence.adresse}
                                  {agence.ville?.nom ? `, ${agence.ville.nom}` : ""}
                                </div>
                                {(agence.latitude || agence.longitude) && (
                                  <div className="aps-agence-card__gps">GPS {agence.latitude}, {agence.longitude}</div>
                                )}
                                <div className="aps-agence-card__actions">
                                  {agence.telephone && (
                                    <a href={`tel:${agence.telephone}`} className="btn btn-sm btn-light" title={agence.telephone}>
                                      <i className="fa-solid fa-phone"></i>
                                    </a>
                                  )}
                                  {agence.est_choisie ? (
                                    <button type="button" className="btn btn-sm btn-warning" disabled>
                                      <i className="fa-solid fa-star me-1"></i> Agence choisie
                                    </button>
                                  ) : (
                                    <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => definirAgencePrincipale(agence)}>
                                      <i className="fa-regular fa-star me-1"></i> Définir par défaut
                                    </button>
                                  )}
                                  {peutGerer && (
                                    <>
                                      <button type="button" className="btn btn-sm btn-light" title="Modifier" onClick={() => ouvrirEditionAgence(agence)}>
                                        <i className="fa-solid fa-pen"></i>
                                      </button>
                                      <button type="button" className="btn btn-sm btn-light" title="Supprimer" onClick={() => setCibleSuppressionAgence(agence)}>
                                        <i className="fa-solid fa-trash"></i>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}

                          {/* ── Sous-formulaire création/édition d'agence ── */}
                          {formulaireAgenceOuvert && (
                            <div className="aps-gestion-section mt-3">
                              <div className="aps-gestion-section__titre">
                                <i className={`fa-solid ${agenceEnEdition ? "fa-pen" : "fa-plus"} text-primary`}></i>
                                {agenceEnEdition ? "Modifier l'agence" : "Nouvelle agence"}
                              </div>
                              <form onSubmit={soumettreAgence}>
                                <div className="row g-3">
                                  <div className="col-md-6">
                                    <label className="form-label">Nom de l'agence</label>
                                    <input type="text" className="form-control" required value={formulaireAgence.nom}
                                           placeholder="Ex. Agence Douala — Bonapriso"
                                           onChange={(e) => modifierChampAgence("nom", e.target.value)} />
                                  </div>
                                  <div className="col-md-6">
                                    <label className="form-label">Téléphone</label>
                                    <input type="tel" className="form-control" value={formulaireAgence.telephone}
                                           onChange={(e) => modifierChampAgence("telephone", e.target.value)} />
                                  </div>
                                  <div className="col-12">
                                    <label className="form-label">Adresse</label>
                                    <input type="text" className="form-control" required value={formulaireAgence.adresse}
                                           onChange={(e) => modifierChampAgence("adresse", e.target.value)} />
                                  </div>
                                  <div className="col-md-4">
                                    <label className="form-label">Région</label>
                                    <input type="text" className="form-control" value={formulaireAgence.region}
                                           onChange={(e) => modifierChampAgence("region", e.target.value)} />
                                  </div>
                                  <div className="col-md-4">
                                    <label className="form-label">Ville</label>
                                    <select className="form-select" value={formulaireAgence.ville_id}
                                            onChange={(e) => modifierChampAgence("ville_id", e.target.value)}>
                                      <option value="">Choisir…</option>
                                      {villesAgence.map((v) => <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>)}
                                    </select>
                                  </div>
                                  <div className="col-md-2">
                                    <label className="form-label">Latitude</label>
                                    <input type="number" step="any" className="form-control" value={formulaireAgence.latitude}
                                           onChange={(e) => modifierChampAgence("latitude", e.target.value)} />
                                  </div>
                                  <div className="col-md-2">
                                    <label className="form-label">Longitude</label>
                                    <input type="number" step="any" className="form-control" value={formulaireAgence.longitude}
                                           onChange={(e) => modifierChampAgence("longitude", e.target.value)} />
                                  </div>
                                </div>
                                <div className="d-flex justify-content-end gap-2 mt-3">
                                  <button type="button" className="btn btn-light" onClick={fermerFormulaireAgence}>Annuler</button>
                                  <button type="submit" className="btn btn-primary" disabled={enregistrementAgence}>
                                    {enregistrementAgence ? "Enregistrement…" : "Enregistrer l'agence"}
                                  </button>
                                </div>
                              </form>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={fermerGestion}>Fermer</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — CONFIRMATION SUPPRESSION D'UNE AGENCE
           ========================================================= */}
      {cibleSuppressionAgence && (
        <>
          <div className="modal-backdrop fade show" style={{ zIndex: 1060 }}></div>
          <div className="modal fade show" style={{ display: "block", zIndex: 1061 }} tabIndex={-1} onClick={() => setCibleSuppressionAgence(null)}>
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Supprimer cette agence ?</h5>
                  <button type="button" className="btn-close" onClick={() => setCibleSuppressionAgence(null)}></button>
                </div>
                <div className="modal-body">
                  <p className="mb-0">« {cibleSuppressionAgence.nom} » sera définitivement retirée du réseau d'agences de cet assureur.</p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={() => setCibleSuppressionAgence(null)}>Annuler</button>
                  <button type="button" className="btn btn-danger" onClick={confirmerSuppressionAgence}>Supprimer</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}