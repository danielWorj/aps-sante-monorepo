// src/components/StructureSante.jsx
//
// Reprend le CONTENU de structures.html (design system APS / Bootstrap 5)
// — sans #apsSidebarMount ni #apsTopbarMount, qui restent gérés par le
// layout parent — et le branche sur StructureSanteService.js.
//
// Hypothèses reprises de admin.css / de la page d'origine (non fournies
// ici, donc à vérifier) :
//   - Bootstrap 5 (CSS + JS bundle) et Font Awesome sont déjà chargés
//     globalement par le layout parent.
//   - admin.css définit les classes aps-* utilisées telles quelles
//     (aps-card, aps-kpi, aps-badge, aps-status-*, variables --aps-*…).
//   - "chart.js" est une dépendance du projet (déjà utilisé en CDN dans
//     structures.html) ; ici on importe "chart.js/auto" depuis npm.
//
// Écarts assumés avec la maquette statique, pour rester fidèle aux
// données réellement renvoyées par l'API :
//   - Le modèle ne connaît que 3 statuts (non_publie / en_cours / publie)
//     — pas de "Rejeté". La 4ᵉ variante de couleur (is-danger /
//     aps-status-rejected) est réaffectée à "Non publié".
//   - Pas de date d'inscription ni de séries temporelles renvoyées par
//     l'API : le graphique "Évolution des inscriptions" et les
//     tendances "vs mois dernier" ont donc été retirés (données non
//     disponibles), au profit de graphiques calculés à partir des
//     centres réellement chargés (répartition par type, par statut,
//     par pays).
//   - L'API ne pagine pas côté serveur : la pagination ci-dessous est
//     appliquée côté client sur le résultat déjà filtré.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Chart from "chart.js/auto";
import { useAuth } from "../context/AuthContext";
import {
  listerCentresSante,
  creerCentreSante,
  modifierCentreSante,
  supprimerCentreSante,
  listerPays,
  listerVilles,
  TYPES_STRUCTURE,
  STATUTS_VERIFICATION,
} from "../services/StructureSanteService.js";

const TYPE_META = {
  hopital: { libelle: "Hôpital", icone: "fa-hospital", bg: "var(--aps-primary-100)", fg: "var(--aps-primary)" },
  clinique: { libelle: "Clinique", icone: "fa-house-medical", bg: "var(--aps-success-100)", fg: "var(--aps-success)" },
  centre_medical: { libelle: "Centre médical", icone: "fa-hospital-user", bg: "var(--aps-danger-100)", fg: "var(--aps-danger)" },
  dispensaire: { libelle: "Dispensaire", icone: "fa-kit-medical", bg: "var(--aps-warning-100)", fg: "var(--aps-warning)" },
  laboratoire: { libelle: "Laboratoire", icone: "fa-microscope", bg: "var(--aps-primary-100)", fg: "var(--aps-primary)" },
};

const STATUT_META = {
  publie: { libelle: "Publié", badge: "is-success", detailClasse: "aps-status-verified", detailIcone: "fa-circle-check" },
  en_cours: { libelle: "En cours", badge: "is-warning", detailClasse: "aps-status-pending", detailIcone: "fa-hourglass-half" },
  non_publie: { libelle: "Non publié", badge: "is-danger", detailClasse: "aps-status-rejected", detailIcone: "fa-circle-xmark" },
};

const COULEURS_GRAPHIQUE = {
  primary: "#1C8FE0", teal: "#17B6C4", success: "#1B8A4B",
  warning: "#B7791F", danger: "#E5484D", violet: "#8B5CF6",
  text500: "#6B7280", border: "#E7EAF0",
};

const FORMULAIRE_VIDE = {
  nom: "", pays_id: "", ville_id: "", telephone: "",
  type_structure: "", statut_verification: "non_publie",
  latitude: "", longitude: "",
  // Le même formulaire crée le centre ET le COMPTE de l'agent qui en a
  // la charge (pas forcément la personne connectée qui remplit ce
  // formulaire — ex. un admin peut créer la fiche pour un professionnel
  // qui n'a pas encore de compte). Requis seulement à la création :
  // l'agent n'est jamais recréé/modifié depuis l'édition (voir
  // soumettreFormulaire). Le pays du compte agent reprend celui du
  // centre (pas de champ dédié).
  fonction: "", agent_nom: "", agent_prenom: "", agent_email: "", agent_telephone: "",
  // Fichiers (voir CHAMPS_FICHIERS côté service) : obligatoires à la
  // création, optionnels en édition (n'envoyer que ceux à remplacer).
  image_structure: null, piece_identite: null, document_agrement: null,
};

const TAILLES_PAGE = [8, 16, 32];

/**
 * Styles scoping la fiche détail (modale "MODALE — FICHE DÉTAIL").
 * Injectés en ligne (pas de fichier .css dédié fourni) et préfixés
 * "aps-fiche-" / "aps-accordion-" pour ne pas entrer en collision avec
 * admin.css. S'appuie sur les variables --aps-* déjà définies
 * globalement pour rester cohérent avec le reste du design system.
 */
const STYLE_FICHE_DETAIL = `
  .aps-fiche-header { align-items: flex-start; }
  .aps-fiche-souscritre { font-size: 13px; }

  .aps-fiche-image-wrap { position: relative; border-radius: 14px; overflow: hidden; }
  .aps-fiche-image { display: block; width: 100%; height: 260px; object-fit: cover; }
  .aps-fiche-image-vide {
    display: flex; align-items: center; justify-content: center;
    background: var(--aps-primary-100, #EAF4FD); color: var(--aps-primary, #1C8FE0);
    font-size: 40px;
  }
  .aps-fiche-statut-flottant {
    position: absolute; top: 10px; left: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,.18);
  }

  .aps-fiche-type-chip {
    display: flex; align-items: center; gap: 10px;
    margin-top: 14px; padding: 10px 12px;
    border: 1px solid var(--aps-border, #E7EAF0); border-radius: 12px;
  }
  .aps-fiche-type-icone {
    width: 36px; height: 36px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; flex-shrink: 0;
  }

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
  .aps-accordion-lien-externe {
    color: var(--aps-text-500, #6B7280); font-size: 12px; padding: 4px;
  }
  .aps-accordion-lien-externe:hover { color: var(--aps-primary, #1C8FE0); }
  .aps-accordion-chevron { font-size: 12px; color: var(--aps-text-500, #6B7280); transition: transform .15s ease; }
  .aps-accordion-item.is-open .aps-accordion-chevron { transform: rotate(180deg); color: var(--aps-primary, #1C8FE0); }

  .aps-accordion-panel { padding: 12px; border-top: 1px solid var(--aps-border, #E7EAF0); background: #FAFBFC; }
  .aps-accordion-apercu-objet {
    display: block; width: 100%; height: 380px;
    border: 0; border-radius: 8px; background: #fff;
  }
  .aps-accordion-apercu-repli { font-size: 13px; padding: 4px 2px; }
`;

/**
 * Extrait un nom de rôle (en minuscules) depuis un objet utilisateur,
 * quelle que soit la forme exacte sous laquelle il a été stocké après
 * connexion (chaîne directe, objet imbriqué, tableau de rôles…).
 * Tolérant par design : mieux vaut essayer plusieurs formes plausibles
 * que de casser silencieusement les droits d'un superadmin réel.
 */
function extraireNomRole(objetUtilisateur) {
  if (!objetUtilisateur || typeof objetUtilisateur !== "object") return null;

  const candidats = [
    objetUtilisateur.role,
    objetUtilisateur.role?.nom,
    objetUtilisateur.role?.libelle,
    objetUtilisateur.role_nom,
    objetUtilisateur.type_compte,
    objetUtilisateur.utilisateur?.role,
    objetUtilisateur.roles?.[0],
    objetUtilisateur.roles?.[0]?.nom,
  ];

  for (const candidat of candidats) {
    if (typeof candidat === "string" && candidat.trim()) {
      return candidat.trim().toLowerCase();
    }
  }
  return null;
}

/**
 * Dérive { role, estConnecte } depuis AuthContext (useAuth()), seule
 * source de vérité de l'authentification côté front (cf. AuthContext.jsx) :
 *  - le refresh token vit dans un cookie httpOnly (jamais lu en JS) ;
 *  - l'access token vit en mémoire (jamais persisté) ;
 *  - `user` est restauré au montage via /auth/refresh + /auth/me, et
 *    tenu à jour par login()/logout().
 * On ne touche plus à localStorage : `isAuthenticated` reflète l'état
 * réel de la session, y compris juste après un rechargement de page
 * (une fois `status` sorti de 'loading').
 */
function useRoleUtilisateur() {
  const { user, isAuthenticated } = useAuth();
  return {
    role: extraireNomRole(user),
    estConnecte: isAuthenticated,
  };
}

/**
 * Aperçu embarqué d'une pièce justificative (image OU PDF) directement
 * dans la fiche détail, sans quitter la modale.
 *
 * On évite volontairement de deviner le type de fichier depuis
 * l'extension de l'URL (souvent absente ou peu fiable côté API :
 * URLs signées, routes de téléchargement sans extension…) et on
 * s'appuie à la place sur <object>, qui laisse le navigateur détecter
 * le type réel via l'en-tête Content-Type renvoyé par le serveur — ça
 * fonctionne aussi bien pour une image que pour un PDF. Le contenu
 * placé entre les balises <object>…</object> ne sert que de repli si
 * le navigateur ne parvient vraiment pas à afficher la ressource.
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
    <object
      data={url}
      aria-label={label}
      className="aps-accordion-apercu-objet"
      onError={() => setEnErreur(true)}
    >
      {/* Repli affiché par le navigateur lui-même si <object> échoue */}
      <div className="aps-text-muted aps-accordion-apercu-repli">
        Aperçu indisponible pour ce fichier.{" "}
        <a href={url} target="_blank" rel="noreferrer">Ouvrir le fichier dans un nouvel onglet</a>
      </div>
    </object>
  );
}

export default function StructureSante() {
  const { role, estConnecte } = useRoleUtilisateur();
  // Création ET modification : ouvertes à tout utilisateur connecté
  // (patient inclus) — voir POST/PUT /centres-sante dans
  // centreSante.routes.js, qui ne demandent plus que d'être
  // authentifié. Le site étant ouvert à la soumission par les
  // professionnels eux-mêmes, n'importe quel profil peut créer une
  // fiche ou la corriger (ex : renvoyer une pièce justificative).
  const peutCreer = estConnecte;
  const peutModifier = estConnecte;
  // Seul le statut_verification est réellement verrouillé côté serveur
  // pour les non admin/superadmin (forcé à "en_cours" quoi qu'ils
  // envoient) — voir centreSante.controller.js.
  // Suppression : règle inchangée côté API (superadmin uniquement).
  const peutSupprimer = role === "superadmin";

  // Liste filtrée (grille de la page)
  const [centres, setCentres] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  // Jeu complet non filtré, pour les KPI et graphiques globaux
  const [statistiques, setStatistiques] = useState([]);

  const [filtres, setFiltres] = useState({
    recherche: "", type_structure: "", statut_verification: "", pays_id: "", ville_id: "",
  });
  const [filtresAppliques, setFiltresAppliques] = useState(filtres);

  const [pays, setPays] = useState([]);
  const [villesFiltre, setVillesFiltre] = useState([]);
  const [villesFormulaire, setVillesFormulaire] = useState([]);

  const [tri, setTri] = useState("nom");
  const [page, setPage] = useState(1);
  const [parPage, setParPage] = useState(8);

  const [centreSelectionne, setCentreSelectionne] = useState(null);
  // Pièces justificatives repliées par défaut dans la fiche détail ;
  // clé = id de la pièce ("image" / "identite" / "agrement"), valeur =
  // dépliée ou non. Réinitialisé à chaque changement de centre affiché.
  const [piecesOuvertes, setPiecesOuvertes] = useState({});
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [modeEdition, setModeEdition] = useState(false);
  const [formulaire, setFormulaire] = useState(FORMULAIRE_VIDE);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreurFormulaire, setErreurFormulaire] = useState(null);

  const [cibleSuppression, setCibleSuppression] = useState(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  // Compte agent (avec mot de passe temporaire) tout juste créé — affiché
  // une seule fois dans une modale de confirmation dédiée, voir plus bas.
  const [compteAgentCree, setCompteAgentCree] = useState(null);

  const chargerCentres = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const resultat = await listerCentresSante(filtresAppliques);
      setCentres(resultat);
      setPage(1);
    } catch (err) {
      setErreur(err.message || "Impossible de charger les structures.");
    } finally {
      setChargement(false);
    }
  }, [filtresAppliques]);

  useEffect(() => { chargerCentres(); }, [chargerCentres]);

  // Referme tous les panneaux "pièce justificative" quand on ouvre la
  // fiche d'un autre centre (évite de retrouver la fiche précédente
  // avec des panneaux dépliés qui ne correspondent plus).
  useEffect(() => { setPiecesOuvertes({}); }, [centreSelectionne?.id]);

  useEffect(() => {
    listerCentresSante({}).then(setStatistiques).catch(() => setStatistiques([]));
  }, [centres]);

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
    const vide = { recherche: "", type_structure: "", statut_verification: "", pays_id: "", ville_id: "" };
    setFiltres(vide);
    setFiltresAppliques(vide);
  }

  /* ─── Tri + pagination côté client ─────────────────────────── */

  const centresTries = useMemo(() => {
    const copie = [...centres];
    if (tri === "statut") {
      const ordre = { publie: 0, en_cours: 1, non_publie: 2 };
      copie.sort((a, b) => (ordre[a.statut_verification] ?? 9) - (ordre[b.statut_verification] ?? 9));
    } else {
      copie.sort((a, b) => a.nom.localeCompare(b.nom));
    }
    return copie;
  }, [centres, tri]);

  const nbPages = Math.max(1, Math.ceil(centresTries.length / parPage));
  const pageCourante = Math.min(page, nbPages);
  const centresPage = centresTries.slice((pageCourante - 1) * parPage, pageCourante * parPage);
  const debutAffichage = centresTries.length === 0 ? 0 : (pageCourante - 1) * parPage + 1;
  const finAffichage = Math.min(pageCourante * parPage, centresTries.length);

  /* ─── KPI + graphiques (jeu complet non filtré) ────────────── */

  const kpi = useMemo(() => {
    const total = statistiques.length;
    const publie = statistiques.filter((c) => c.statut_verification === "publie").length;
    const enCours = statistiques.filter((c) => c.statut_verification === "en_cours").length;
    const nonPublie = statistiques.filter((c) => c.statut_verification === "non_publie").length;
    return { total, publie, enCours, nonPublie };
  }, [statistiques]);

  const refGraphType = useRef(null);
  const refGraphStatut = useRef(null);
  const refGraphPays = useRef(null);
  const instancesGraph = useRef({});

  useEffect(() => {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = COULEURS_GRAPHIQUE.text500;
  }, []);

  useEffect(() => {
    if (!refGraphType.current) return;
    const parType = {};
    statistiques.forEach((c) => { parType[c.type_structure] = (parType[c.type_structure] || 0) + 1; });
    const entrees = Object.entries(parType);

    instancesGraph.current.type?.destroy();
    instancesGraph.current.type = new Chart(refGraphType.current, {
      type: "doughnut",
      data: {
        labels: entrees.map(([t]) => TYPE_META[t]?.libelle || t),
        datasets: [{
          data: entrees.map(([, n]) => n),
          backgroundColor: [
            COULEURS_GRAPHIQUE.primary, COULEURS_GRAPHIQUE.teal, COULEURS_GRAPHIQUE.success,
            COULEURS_GRAPHIQUE.warning, COULEURS_GRAPHIQUE.violet,
          ],
          borderColor: "#fff", borderWidth: 3, hoverOffset: 6,
        }],
      },
      options: {
        cutout: "65%",
        plugins: {
          legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", padding: 16 } },
        },
      },
    });
  }, [statistiques]);

  useEffect(() => {
    if (!refGraphStatut.current) return;
    instancesGraph.current.statut?.destroy();
    instancesGraph.current.statut = new Chart(refGraphStatut.current, {
      type: "polarArea",
      data: {
        labels: ["Publié", "En cours", "Non publié"],
        datasets: [{
          data: [kpi.publie, kpi.enCours, kpi.nonPublie],
          backgroundColor: ["rgba(27,138,75,0.75)", "rgba(183,121,31,0.75)", "rgba(229,72,77,0.75)"],
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
    if (!refGraphPays.current) return;
    const parPays = {};
    statistiques.forEach((c) => {
      const nom = c.pays?.nom || "—";
      parPays[nom] = (parPays[nom] || 0) + 1;
    });
    const entrees = Object.entries(parPays).sort((a, b) => b[1] - a[1]).slice(0, 6);

    instancesGraph.current.pays?.destroy();
    instancesGraph.current.pays = new Chart(refGraphPays.current, {
      type: "bar",
      data: {
        labels: entrees.map(([nom]) => nom),
        datasets: [{
          label: "Structures",
          data: entrees.map(([, n]) => n),
          backgroundColor: COULEURS_GRAPHIQUE.primary,
          borderRadius: 6, borderSkipped: false,
        }],
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

  useEffect(() => () => {
    Object.values(instancesGraph.current).forEach((g) => g?.destroy());
  }, []);

  /* ─── Formulaire création / édition ────────────────────────── */

  function ouvrirCreation() {
    setModeEdition(false);
    setFormulaire(FORMULAIRE_VIDE);
    setFichiersExistants(null);
    setErreurFormulaire(null);
    setModaleOuverte(true);
  }

  // Fichiers déjà en ligne pour la fiche en cours d'édition (URLs
  // Cloudinary renvoyées par le backend) — affichés à titre indicatif
  // pour que l'utilisateur sache ce qu'il remplace (ou pas) s'il ne
  // re-sélectionne pas de nouveau fichier.
  const [fichiersExistants, setFichiersExistants] = useState(null);

  function ouvrirEdition(centre) {
    setModeEdition(true);
    setFormulaire({
      nom: centre.nom ?? "", pays_id: centre.pays_id ?? "", ville_id: centre.ville_id ?? "",
      telephone: centre.telephone ?? "", type_structure: centre.type_structure ?? "",
      statut_verification: centre.statut_verification ?? "non_publie",
      latitude: centre.geolocalisation?.latitude ?? "", longitude: centre.geolocalisation?.longitude ?? "",
      image_structure: null, piece_identite: null, document_agrement: null,
      structure_id: centre.structure_id,
    });
    setFichiersExistants({
      image_url: centre.image_url ?? null,
      piece_identite_url: centre.piece_identite_url ?? null,
      document_agrement_url: centre.document_agrement_url ?? null,
    });
    setErreurFormulaire(null);
    setModaleOuverte(true);
    setCentreSelectionne(null);
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

    // À la création, les 3 pièces justificatives ET les informations du
    // compte agent sont obligatoires (le backend les exige aussi — ce
    // contrôle client évite un aller-retour réseau inutile). Le même
    // formulaire crée en une fois le centre ET le COMPTE de l'agent qui
    // en a la charge (pas forcément la personne connectée) : l'édition,
    // elle, ne recrée/ne modifie jamais ce compte.
    if (!modeEdition) {
      const manquants = [];
      if (!formulaire.fonction || !formulaire.fonction.trim()) manquants.push("fonction de l'agent");
      if (!formulaire.agent_nom || !formulaire.agent_nom.trim()) manquants.push("nom de l'agent");
      if (!formulaire.agent_prenom || !formulaire.agent_prenom.trim()) manquants.push("prénom de l'agent");
      if (!formulaire.agent_email || !formulaire.agent_email.trim()) manquants.push("email de l'agent");
      if (!formulaire.image_structure) manquants.push("photo du centre");
      if (!formulaire.piece_identite) manquants.push("pièce d'identité");
      if (!formulaire.document_agrement) manquants.push("agrément officiel");
      if (manquants.length) {
        setErreurFormulaire(`Champ(s)/fichier(s) manquant(s) : ${manquants.join(", ")}.`);
        return;
      }
      if (formulaire.agent_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formulaire.agent_email.trim())) {
        setErreurFormulaire("Email de l'agent invalide.");
        return;
      }
    }

    setEnvoiEnCours(true);

    const { structure_id, latitude, longitude, ...reste } = formulaire;
    const donnees = {
      ...reste,
      ...(latitude !== "" && longitude !== "" ? { latitude: Number(latitude), longitude: Number(longitude) } : {}),
    };

    try {
      if (modeEdition) {
        await modifierCentreSante(structure_id, donnees);
        setModaleOuverte(false);
      } else {
        // La réponse brute (pas seulement centreSante) contient
        // `agent.mot_de_passe_temporaire`, à afficher une seule fois —
        // voir compteAgentCree / la modale de confirmation dédiée.
        const reponse = await creerCentreSante(donnees);
        setModaleOuverte(false);
        setCompteAgentCree(reponse.agent || null);
      }
      await chargerCentres();
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
      await supprimerCentreSante(cibleSuppression.structure_id);
      setCibleSuppression(null);
      if (centreSelectionne?.structure_id === cibleSuppression.structure_id) setCentreSelectionne(null);
      await chargerCentres();
    } catch (err) {
      setErreur(err.message || "Impossible de supprimer ce centre de santé.");
      setCibleSuppression(null);
    } finally {
      setSuppressionEnCours(false);
    }
  }

  function exporterCsv() {
    const entetes = ["Nom", "Type", "Statut", "Téléphone", "Ville", "Pays"];
    const lignes = centresTries.map((c) => [
      c.nom, TYPE_META[c.type_structure]?.libelle || c.type_structure,
      STATUT_META[c.statut_verification]?.libelle || c.statut_verification,
      c.telephone, c.ville?.nom || "", c.pays?.nom || "",
    ]);
    const csv = [entetes, ...lignes]
      .map((ligne) => ligne.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(blob);
    lien.download = "structures-sante.csv";
    lien.click();
    URL.revokeObjectURL(lien.href);
  }

  return (
    <>
      <main className="aps-content">
      {/* =========================================================
           EN-TÊTE DE PAGE
           ========================================================= */}
      <div className="aps-page-header">
        <div>
          <nav className="aps-breadcrumb">
            <a href="dashboard.html">Tableau de bord</a>
            <span className="sep">/</span>
            <span>Annuaire &amp; Utilisateurs</span>
            <span className="sep">/</span>
            <span>Structures &amp; hôpitaux</span>
          </nav>
          <h1>Structures &amp; hôpitaux</h1>
          <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
            Gestion des cliniques, hôpitaux, centres médicaux, dispensaires et laboratoires enregistrés sur la plateforme.
          </p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-light" type="button" onClick={exporterCsv}>
            <i className="fa-solid fa-file-export me-1"></i> Exporter
          </button>
          {peutCreer && (
            <button className="btn btn-primary" type="button" onClick={ouvrirCreation}>
              <i className="fa-solid fa-plus me-1"></i> Nouvelle structure
            </button>
          )}
        </div>
      </div>

      {/* =========================================================
           KPI PRINCIPAUX
           ========================================================= */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3">
          <div className="aps-kpi">
            <div className="aps-kpi__top">
              <div className="aps-kpi__icon is-primary"><i className="fa-solid fa-hospital"></i></div>
              <span className="aps-badge is-info"><i className="fa-solid fa-circle"></i> Total</span>
            </div>
            <div className="aps-kpi__label">Structures enregistrées</div>
            <div className="aps-kpi__value">{kpi.total.toLocaleString("fr-FR")}</div>
          </div>
        </div>

        <div className="col-6 col-lg-3">
          <div className="aps-kpi">
            <div className="aps-kpi__top">
              <div className="aps-kpi__icon is-success"><i className="fa-solid fa-circle-check"></i></div>
              <span className="aps-badge is-success"><i className="fa-solid fa-circle"></i> Actif</span>
            </div>
            <div className="aps-kpi__label">Structures publiées</div>
            <div className="aps-kpi__value">{kpi.publie.toLocaleString("fr-FR")}</div>
          </div>
        </div>

        <div className="col-6 col-lg-3">
          <div className="aps-kpi">
            <div className="aps-kpi__top">
              <div className="aps-kpi__icon is-warning"><i className="fa-solid fa-hourglass-half"></i></div>
              <span className="aps-badge is-warning"><i className="fa-solid fa-circle"></i> En attente</span>
            </div>
            <div className="aps-kpi__label">Inscriptions à valider</div>
            <div className="aps-kpi__value">{kpi.enCours.toLocaleString("fr-FR")}</div>
          </div>
        </div>

        <div className="col-6 col-lg-3">
          <div className="aps-kpi">
            <div className="aps-kpi__top">
              <div className="aps-kpi__icon is-danger"><i className="fa-solid fa-triangle-exclamation"></i></div>
              <span className="aps-badge is-danger"><i className="fa-solid fa-circle"></i> Non publié</span>
            </div>
            <div className="aps-kpi__label">Fiches non publiées</div>
            <div className="aps-kpi__value">{kpi.nonPublie.toLocaleString("fr-FR")}</div>
          </div>
        </div>
      </div>

      {/* =========================================================
           GRAPHIQUES CHART.JS (calculés depuis les centres réels)
           ========================================================= */}
      <div className="row g-3 mb-4">
        <div className="col-lg-6">
          <div className="aps-card h-100">
            <div className="aps-card__header"><h3>Répartition par type de structure</h3></div>
            <div className="aps-card__body">
              <div style={{ position: "relative", height: 260 }}>
                <canvas ref={refGraphType}></canvas>
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="aps-card h-100">
            <div className="aps-card__header"><h3>Statut de vérification</h3></div>
            <div className="aps-card__body">
              <div style={{ position: "relative", height: 260 }}>
                <canvas ref={refGraphStatut}></canvas>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-12">
          <div className="aps-card">
            <div className="aps-card__header"><h3>Structures par pays</h3></div>
            <div className="aps-card__body">
              <div style={{ position: "relative", height: 240 }}>
                <canvas ref={refGraphPays}></canvas>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================
           BANDEAU D'ALERTE (dynamique)
           ========================================================= */}
      {kpi.enCours > 0 && (
        <div className="aps-notice is-warning mb-4">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <div>
            <strong>{kpi.enCours} structure{kpi.enCours > 1 ? "s" : ""} en attente de vérification.</strong>{" "}
            Merci de contrôler les justificatifs d'inscription à l'Ordre ou les autorisations d'ouverture avant publication.
          </div>
        </div>
      )}

      {/* =========================================================
           FILTRES
           ========================================================= */}
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
                  placeholder="Nom du centre…" value={filtres.recherche}
                  onChange={(e) => modifierFiltre("recherche", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && appliquerFiltres()}
                />
              </div>
            </div>
            <div className="col-md-2">
              <label className="form-label">Type</label>
              <select className="form-select" value={filtres.type_structure} onChange={(e) => modifierFiltre("type_structure", e.target.value)}>
                <option value="">Tous les types</option>
                {TYPES_STRUCTURE.map((t) => <option key={t.valeur} value={t.valeur}>{t.libelle}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Statut</label>
              <select className="form-select" value={filtres.statut_verification} onChange={(e) => modifierFiltre("statut_verification", e.target.value)}>
                <option value="">Tous</option>
                {STATUTS_VERIFICATION.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
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

      {/* =========================================================
           LISTE DES STRUCTURES — AFFICHAGE EN CARDS
           ========================================================= */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="aps-text-muted" style={{ fontSize: 13 }}>
          {chargement ? "Chargement…" : (
            <>Affichage de <strong className="aps-text-strong">{debutAffichage}–{finAffichage}</strong> sur{" "}
              <strong className="aps-text-strong">{centresTries.length}</strong> structures</>
          )}
        </div>
        <div className="d-flex gap-2 align-items-center">
          <label className="aps-text-muted" style={{ fontSize: 13 }}>Trier par :</label>
          <select className="form-select form-select-sm" style={{ width: "auto" }} value={tri} onChange={(e) => setTri(e.target.value)}>
            <option value="nom">Nom (A-Z)</option>
            <option value="statut">Statut</option>
          </select>
        </div>
      </div>

      <div className="row g-3">
        {!chargement && centresPage.length === 0 && (
          <div className="col-12">
            <div className="aps-card">
              <div className="aps-card__body text-center aps-text-muted py-5">
                Aucune structure ne correspond à ces critères.
              </div>
            </div>
          </div>
        )}

        {centresPage.map((centre) => {
          const meta = TYPE_META[centre.type_structure] || {};
          const statut = STATUT_META[centre.statut_verification] || {};
          return (
            <div className="col-md-6 col-xl-4" key={centre.structure_id}>
              {/* Card Bootstrap "image en haut" — cf. maquette demandée :
                  <div class="card"><img class="card-img-top">...<div class="card-body">…</div></div> */}
              <div className="card h-100 shadow-sm">
                <img
                  src={centre.image_url}
                  className="card-img-top"
                  alt={centre.nom}
                  style={{ height: 160, objectFit: "cover" }}
                />
                <div className="card-body d-flex flex-column">
                  <div className="d-flex align-items-start justify-content-between mb-1">
                    <h5 className="card-title mb-0" style={{ fontSize: 16 }}>{centre.nom}</h5>
                    <span className={`aps-badge ${statut.badge || "is-info"} ms-2`}>
                      <i className="fa-solid fa-circle"></i> {STATUT_META[centre.statut_verification]?.libelle}
                    </span>
                  </div>
                  <p className="card-text aps-text-muted mb-2" style={{ fontSize: 13 }}>
                    <i className="fa-solid fa-location-dot me-1"></i>
                    {centre.ville?.nom}{centre.ville?.nom && centre.pays?.nom ? " · " : ""}{centre.pays?.nom}
                  </p>
                  <p className="card-text mb-3" style={{ fontSize: 13 }}>
                    <i className={`fa-solid ${meta.icone || "fa-house-medical"} me-1`}></i>
                    {meta.libelle || centre.type_structure}
                    <span className="mx-2">·</span>
                    <i className="fa-solid fa-phone me-1"></i>
                    {centre.telephone}
                  </p>

                  <div className="d-flex gap-2 mt-auto pt-2" style={{ borderTop: "1px solid var(--aps-border)" }}>
                    {centre.statut_verification === "en_cours" && peutModifier ? (
                      <button className="btn btn-sm btn-primary flex-grow-1" onClick={() => ouvrirEdition(centre)}>
                        <i className="fa-solid fa-file-signature me-1"></i> Examiner
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-outline-primary flex-grow-1" onClick={() => setCentreSelectionne(centre)}>
                        <i className="fa-solid fa-eye me-1"></i> Voir
                      </button>
                    )}
                    {peutModifier && (
                      <button className="btn btn-sm btn-light" title="Modifier" onClick={() => ouvrirEdition(centre)}>
                        <i className="fa-solid fa-pen"></i>
                      </button>
                    )}
                    {peutSupprimer && (
                      <button className="btn btn-sm btn-light" title="Supprimer" onClick={() => setCibleSuppression(centre)}>
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

      {/* =========================================================
           PAGINATION (client, l'API ne pagine pas côté serveur)
           ========================================================= */}
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
           MODALE — FICHE DÉTAIL
           ========================================================= */}
      {centreSelectionne && (
        <>
          <style>{STYLE_FICHE_DETAIL}</style>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={() => setCentreSelectionne(null)}>
            <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content aps-fiche-detail">
                <div className="modal-header aps-fiche-header">
                  <div>
                    <h5 className="modal-title mb-1">{centreSelectionne.nom}</h5>
                    <div className="aps-text-muted aps-fiche-souscritre">
                      <i className="fa-solid fa-location-dot me-1"></i>
                      {centreSelectionne.ville?.nom || "Ville non renseignée"}
                      {centreSelectionne.pays?.nom ? `, ${centreSelectionne.pays.nom}` : ""}
                    </div>
                  </div>
                  <button type="button" className="btn-close" onClick={() => setCentreSelectionne(null)}></button>
                </div>
                <div className="modal-body pt-3">
                  <div className="row g-4">
                    {/* ── Colonne image + type ─────────────────────── */}
                    <div className="col-md-5">
                      <div className="aps-fiche-image-wrap">
                        {centreSelectionne.image_url ? (
                          <img
                            src={centreSelectionne.image_url}
                            className="aps-fiche-image"
                            alt={centreSelectionne.nom}
                          />
                        ) : (
                          <div className="aps-fiche-image aps-fiche-image-vide">
                            <i className="fa-solid fa-image"></i>
                          </div>
                        )}
                        <span className={`aps-badge aps-fiche-statut-flottant ${STATUT_META[centreSelectionne.statut_verification]?.badge || "is-info"}`}>
                          <i className={`fa-solid ${STATUT_META[centreSelectionne.statut_verification]?.detailIcone || "fa-circle"}`}></i>
                          {STATUT_META[centreSelectionne.statut_verification]?.libelle || "—"}
                        </span>
                      </div>

                      <div className="aps-fiche-type-chip">
                        <span
                          className="aps-fiche-type-icone"
                          style={{
                            background: TYPE_META[centreSelectionne.type_structure]?.bg,
                            color: TYPE_META[centreSelectionne.type_structure]?.fg,
                          }}
                        >
                          <i className={`fa-solid ${TYPE_META[centreSelectionne.type_structure]?.icone || "fa-hospital"}`}></i>
                        </span>
                        <div>
                          <div className="fw-semibold" style={{ fontSize: 14 }}>
                            {TYPE_META[centreSelectionne.type_structure]?.libelle || "—"}
                          </div>
                          <div className="aps-text-muted" style={{ fontSize: 12 }}>Type de structure</div>
                        </div>
                      </div>
                    </div>

                    {/* ── Colonne infos + pièces justificatives ────── */}
                    <div className="col-md-7">
                      <div className="aps-fiche-info-grid">
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-phone"></i>
                          <div>
                            <div className="aps-fiche-info-label">Téléphone</div>
                            <div className="aps-fiche-info-valeur">{centreSelectionne.telephone || "—"}</div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-city"></i>
                          <div>
                            <div className="aps-fiche-info-label">Ville</div>
                            <div className="aps-fiche-info-valeur">{centreSelectionne.ville?.nom || "—"}</div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-flag"></i>
                          <div>
                            <div className="aps-fiche-info-label">Pays</div>
                            <div className="aps-fiche-info-valeur">{centreSelectionne.pays?.nom || "—"}</div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-map-pin"></i>
                          <div>
                            <div className="aps-fiche-info-label">Localisation</div>
                            <div className="aps-fiche-info-valeur">
                              {centreSelectionne.geolocalisation
                                ? `${centreSelectionne.geolocalisation.latitude.toFixed(4)}, ${centreSelectionne.geolocalisation.longitude.toFixed(4)}`
                                : "Non renseignée"}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="aps-fiche-section-titre">
                        <i className="fa-solid fa-folder-open me-1"></i> Pièces justificatives
                      </div>

                      <div className="aps-accordion">
                        {[
                          { id: "image", label: "Photo du centre", icone: "fa-image", url: centreSelectionne.image_url },
                          { id: "identite", label: "Pièce d'identité", icone: "fa-id-card", url: centreSelectionne.piece_identite_url },
                          { id: "agrement", label: "Agrément officiel", icone: "fa-file-shield", url: centreSelectionne.document_agrement_url },
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
                                  href={piece.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="aps-accordion-lien-externe"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Ouvrir dans un nouvel onglet"
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
                        {!centreSelectionne.image_url && !centreSelectionne.piece_identite_url && !centreSelectionne.document_agrement_url && (
                          <div className="aps-text-muted" style={{ fontSize: 13 }}>Aucune pièce justificative fournie.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  {peutModifier && (
                    <button type="button" className="btn btn-primary" onClick={() => ouvrirEdition(centreSelectionne)}>
                      <i className="fa-solid fa-pen me-1"></i> Modifier
                    </button>
                  )}
                  <button type="button" className="btn btn-light" onClick={() => setCentreSelectionne(null)}>Fermer</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — CRÉATION / ÉDITION (tout utilisateur connecté)
           ========================================================= */}
      {modaleOuverte && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={fermerModale}>
            <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
              <form className="modal-content" onSubmit={soumettreFormulaire}>
                <div className="modal-header">
                  <h5 className="modal-title">{modeEdition ? "Modifier le centre" : "Nouvelle structure"}</h5>
                  <button type="button" className="btn-close" onClick={fermerModale}></button>
                </div>
                <div className="modal-body">
                  {erreurFormulaire && (
                    <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreurFormulaire}</div></div>
                  )}
                  <div className="row g-3">
                    <div className="col-md-8">
                      <label className="form-label">Nom</label>
                      <input type="text" className="form-control" required value={formulaire.nom}
                             onChange={(e) => modifierChampFormulaire("nom", e.target.value)} />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Téléphone</label>
                      <input type="tel" className="form-control" required value={formulaire.telephone}
                             onChange={(e) => modifierChampFormulaire("telephone", e.target.value)} />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Type de structure</label>
                      <select className="form-select" required value={formulaire.type_structure}
                              onChange={(e) => modifierChampFormulaire("type_structure", e.target.value)}>
                        <option value="" disabled>Choisir…</option>
                        {TYPES_STRUCTURE.map((t) => <option key={t.valeur} value={t.valeur}>{t.libelle}</option>)}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Statut de vérification</label>
                      <select className="form-select" required value={formulaire.statut_verification}
                              onChange={(e) => modifierChampFormulaire("statut_verification", e.target.value)}>
                        {STATUTS_VERIFICATION.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
                      </select>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Pays</label>
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

                    {!modeEdition && (
                      <div className="col-12">
                        <hr />
                        <div className="aps-text-muted mb-2" style={{ fontSize: 13 }}>
                          Créer ce centre crée aussi un compte pour l'agent qui en aura la charge
                          (pas forcément vous-même). Un mot de passe temporaire lui sera généré ;
                          il devra le changer sous 24h à sa première connexion.
                        </div>
                      </div>
                    )}
                    {!modeEdition && (
                      <div className="col-md-6">
                        <label className="form-label">Nom de l'agent <span className="text-danger">*</span></label>
                        <input type="text" className="form-control" required value={formulaire.agent_nom}
                               onChange={(e) => modifierChampFormulaire("agent_nom", e.target.value)} />
                      </div>
                    )}
                    {!modeEdition && (
                      <div className="col-md-6">
                        <label className="form-label">Prénom de l'agent <span className="text-danger">*</span></label>
                        <input type="text" className="form-control" required value={formulaire.agent_prenom}
                               onChange={(e) => modifierChampFormulaire("agent_prenom", e.target.value)} />
                      </div>
                    )}
                    {!modeEdition && (
                      <div className="col-md-6">
                        <label className="form-label">Email de l'agent <span className="text-danger">*</span></label>
                        <input type="email" className="form-control" required value={formulaire.agent_email}
                               onChange={(e) => modifierChampFormulaire("agent_email", e.target.value)} />
                      </div>
                    )}
                    {!modeEdition && (
                      <div className="col-md-6">
                        <label className="form-label">Téléphone de l'agent <span className="aps-text-muted">(optionnel)</span></label>
                        <input type="tel" className="form-control" value={formulaire.agent_telephone}
                               onChange={(e) => modifierChampFormulaire("agent_telephone", e.target.value)} />
                      </div>
                    )}
                    {!modeEdition && (
                      <div className="col-md-6">
                        <label className="form-label">Fonction de l'agent au sein du centre <span className="text-danger">*</span></label>
                        <input type="text" className="form-control" required placeholder="Ex. Gérant, Directeur médical…"
                               value={formulaire.fonction}
                               onChange={(e) => modifierChampFormulaire("fonction", e.target.value)} />
                      </div>
                    )}

                    <div className="col-md-6">
                      <label className="form-label">Latitude <span className="aps-text-muted">(optionnel)</span></label>
                      <input type="number" step="any" className="form-control" value={formulaire.latitude}
                             onChange={(e) => modifierChampFormulaire("latitude", e.target.value)} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Longitude <span className="aps-text-muted">(optionnel)</span></label>
                      <input type="number" step="any" className="form-control" value={formulaire.longitude}
                             onChange={(e) => modifierChampFormulaire("longitude", e.target.value)} />
                    </div>

                    {/* ── Pièces justificatives ─────────────────────
                         Obligatoires à la création (contrôlé plus haut
                         dans soumettreFormulaire) ; optionnelles en
                         édition — un champ laissé vide conserve le
                         fichier déjà enregistré. */}
                    <div className="col-12">
                      <hr />
                      <div className="aps-text-muted mb-2" style={{ fontSize: 13 }}>
                        Pièces justificatives {modeEdition ? "(laisser vide pour conserver le fichier actuel)" : "(obligatoires)"}
                      </div>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Photo du centre {!modeEdition && <span className="text-danger">*</span>}</label>
                      <input type="file" className="form-control" accept="image/jpeg,image/png,image/webp"
                             onChange={(e) => modifierFichierFormulaire("image_structure", e.target.files?.[0])} />
                      {fichiersExistants?.image_url && (
                        <a href={fichiersExistants.image_url} target="_blank" rel="noreferrer" className="d-block mt-1" style={{ fontSize: 12 }}>
                          Voir le fichier actuel
                        </a>
                      )}
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Pièce d'identité {!modeEdition && <span className="text-danger">*</span>}</label>
                      <input type="file" className="form-control" accept="image/jpeg,image/png,image/webp,application/pdf"
                             onChange={(e) => modifierFichierFormulaire("piece_identite", e.target.files?.[0])} />
                      {fichiersExistants?.piece_identite_url && (
                        <a href={fichiersExistants.piece_identite_url} target="_blank" rel="noreferrer" className="d-block mt-1" style={{ fontSize: 12 }}>
                          Voir le fichier actuel
                        </a>
                      )}
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Agrément officiel {!modeEdition && <span className="text-danger">*</span>}</label>
                      <input type="file" className="form-control" accept="image/jpeg,image/png,image/webp,application/pdf"
                             onChange={(e) => modifierFichierFormulaire("document_agrement", e.target.files?.[0])} />
                      {fichiersExistants?.document_agrement_url && (
                        <a href={fichiersExistants.document_agrement_url} target="_blank" rel="noreferrer" className="d-block mt-1" style={{ fontSize: 12 }}>
                          Voir le fichier actuel
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={fermerModale}>Annuler</button>
                  <button type="submit" className="btn btn-primary" disabled={envoiEnCours}>
                    {envoiEnCours ? "Enregistrement…" : modeEdition ? "Enregistrer" : "Créer la structure"}
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
                  <h5 className="modal-title">Supprimer ce centre ?</h5>
                  <button type="button" className="btn-close" onClick={() => setCibleSuppression(null)}></button>
                </div>
                <div className="modal-body">
                  <p className="mb-0">
                    « {cibleSuppression.nom} » sera définitivement supprimé de l'annuaire. Cette action est
                    impossible si des agents y sont encore rattachés.
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
           MODALE — COMPTE AGENT CRÉÉ (mot de passe temporaire)
           Affichée UNE SEULE FOIS juste après la création d'un centre :
           le mot de passe n'est jamais restitué par l'API ensuite (non
           stocké en clair côté serveur) — à communiquer à l'agent par un
           canal sûr avant de fermer cette fenêtre.
           ========================================================= */}
      {compteAgentCree && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className="fa-solid fa-user-shield me-2 text-success"></i>
                    Compte agent créé
                  </h5>
                </div>
                <div className="modal-body">
                  <div className="aps-notice is-warning mb-3">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <div>
                      Ce mot de passe ne sera plus jamais affiché. Communiquez-le à l'agent par un
                      canal sûr — il devra le changer sous 24h à sa toute première connexion.
                    </div>
                  </div>
                  <dl className="row mb-0" style={{ fontSize: 14 }}>
                    <dt className="col-5 aps-text-muted">Agent</dt>
                    <dd className="col-7">
                      {compteAgentCree.utilisateur?.prenom} {compteAgentCree.utilisateur?.nom}
                    </dd>
                    <dt className="col-5 aps-text-muted">Email (identifiant)</dt>
                    <dd className="col-7">{compteAgentCree.utilisateur?.email}</dd>
                    <dt className="col-5 aps-text-muted">Fonction</dt>
                    <dd className="col-7">{compteAgentCree.fonction}</dd>
                    <dt className="col-5 aps-text-muted">Mot de passe temporaire</dt>
                    <dd className="col-7">
                      <code style={{ fontSize: 15 }}>{compteAgentCree.mot_de_passe_temporaire}</code>
                    </dd>
                  </dl>
                </div>
                <div className="modal-footer">
                  {navigator?.clipboard && (
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={() => navigator.clipboard.writeText(compteAgentCree.mot_de_passe_temporaire || "")}
                    >
                      <i className="fa-solid fa-copy me-1"></i> Copier le mot de passe
                    </button>
                  )}
                  <button type="button" className="btn btn-primary" onClick={() => setCompteAgentCree(null)}>
                    J'ai noté le mot de passe, fermer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}