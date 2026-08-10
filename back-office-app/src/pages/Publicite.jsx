// src/components/Publicite.jsx
// (renomme PublicitePharmacie.jsx — le module "publicité" est désormais
// AUTONOME, voir schema.prisma / publicite.controller.js : il ne
// référence plus aucune fiche annuaire, Pharmacie incluse.)
//
// Reprend la structure et le design system APS (Bootstrap 5 + Chart.js)
// de l'ancien PublicitePharmacie.jsx — même logique, mêmes
// conventions — adapté au module autonome "Présence, publicité & boost
// commercial" (table publicite) et branché sur le publiciteService.js
// réécrit.
//
// Particularités du modèle de droits (voir publicite.controller.js) :
//   - Lecture (GET /publicites) : PUBLIQUE, mais TOUJOURS restreinte
//     aux publicités "validee" pour quiconque n'est pas admin/superadmin
//     — y compris l'AUTEUR lui-même : contrairement à l'ancien module
//     Pharmacie, il n'existe pas de paramètre "mes publicités" côté
//     backend. Un utilisateur ne peut consulter le détail d'une
//     publicité qu'il a déposée mais pas encore validée qu'en la
//     rouvrant individuellement (GET /publicites/:id, autorisé pour
//     l'auteur par `filtrerSelonVisibilite`). On garde donc ici, en
//     mémoire de session uniquement, la liste des publicités que
//     l'utilisateur courant vient de créer/modifier dans cet onglet
//     (`mesSoumissions`) pour lui permettre de suivre leur statut sans
//     rafraîchir toute la page — ce n'est pas un historique persistant.
//   - Création (POST) : tout utilisateur authentifié, quel que soit son
//     rôle. Toujours créée "en_attente" côté serveur, quel que soit le
//     rôle de l'appelant — même un admin ne peut pas publier directement.
//   - emplacement_publicitaire_id DOIT correspondre à l'emplacement du
//     forfait_publicitaire_id choisi (vérifié côté serveur, 400 sinon) :
//     l'emplacement n'est donc jamais saisi indépendamment ici, il est
//     dérivé automatiquement du forfait sélectionné (voir
//     `forfaitSelectionne` plus bas) — l'utilisateur choisit d'abord un
//     emplacement pour filtrer le catalogue, puis un forfait dans cet
//     emplacement.
//   - Modification (PUT) : l'auteur peut corriger titre / visuel
//     (nouveau fichier) / dates, tant que la publicité
//     est encore "en_attente" (409 sinon — déjà modérée). Le forfait et
//     l'emplacement ne sont jamais modifiables après création. Un
//     admin/superadmin peut à tout moment changer statut_moderation
//     (et seulement ce champ).
//   - Suppression (DELETE) : l'auteur (quel que soit le statut) ou
//     admin/superadmin.
//
// Hypothèses reprises de l'ancien composant (non fournies ici, donc à
// vérifier) :
//   - Bootstrap 5 (CSS + JS bundle) et Font Awesome sont déjà chargés
//     globalement par le layout parent.
//   - admin.css définit les classes aps-* utilisées telles quelles.
//   - "chart.js" est une dépendance du projet ("chart.js/auto").

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Chart from "chart.js/auto";
import { useAuth } from "../context/AuthContext";
import {
  listerPublicites,
  obtenirPublicite,
  creerPublicite,
  modifierPublicite,
  supprimerPublicite,
  listerEmplacementsPublicitaires,
  listerForfaitsPublicitaires,
  listerPays,
  STATUTS_MODERATION_PUBLICITE,
} from "../services/publiciteService.js";

const STATUT_META = {
  validee: { libelle: "Validée", badge: "is-success", detailIcone: "fa-circle-check" },
  en_attente: { libelle: "En attente", badge: "is-warning", detailIcone: "fa-hourglass-half" },
  rejetee: { libelle: "Rejetée", badge: "is-danger", detailIcone: "fa-circle-xmark" },
};

const COULEURS_GRAPHIQUE = {
  primary: "#1C8FE0", teal: "#17B6C4", success: "#1B8A4B",
  warning: "#B7791F", danger: "#E5484D", violet: "#8B5CF6",
  text500: "#6B7280", border: "#E7EAF0",
};

const FORMULAIRE_VIDE = {
  emplacement_publicitaire_id: "",
  forfait_publicitaire_id: "",
  pays_id: "",
  titre: "",
  date_debut: "",
  date_fin: "",
  statut_moderation: "en_attente",
  // Fichier : obligatoire à la création, optionnel en édition
  // (n'envoyer que pour remplacer le visuel existant).
  visuel: null,
};

const TAILLES_PAGE = [8, 16, 32];

const STYLE_FICHE_DETAIL = `
  .aps-fiche-header { align-items: flex-start; }
  .aps-fiche-souscritre { font-size: 13px; }

  .aps-fiche-image-wrap { position: relative; border-radius: 14px; overflow: hidden; }
  .aps-fiche-image { display: block; width: 100%; height: 260px; object-fit: contain; background: #FAFBFC; }
  .aps-fiche-image-vide {
    display: flex; align-items: center; justify-content: center;
    background: var(--aps-primary-100, #EAF4FD); color: var(--aps-primary, #1C8FE0);
    font-size: 40px; height: 260px; border-radius: 14px;
  }
  .aps-fiche-statut-flottant {
    position: absolute; top: 10px; left: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,.18);
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
`;

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
    if (typeof candidat === "string" && candidat.trim()) return candidat.trim().toLowerCase();
  }
  return null;
}

/** Identifiant de l'utilisateur courant, quelle que soit la forme sous
 * laquelle il a été stocké après connexion (mêmes précautions que pour
 * le rôle, voir extraireNomRole). */
function extraireIdUtilisateur(objetUtilisateur) {
  if (!objetUtilisateur || typeof objetUtilisateur !== "object") return null;
  return (
    objetUtilisateur.utilisateur_id ||
    objetUtilisateur.id ||
    objetUtilisateur.utilisateur?.utilisateur_id ||
    null
  );
}

function useUtilisateurCourant() {
  const { user, isAuthenticated } = useAuth();
  return {
    role: extraireNomRole(user),
    utilisateurId: extraireIdUtilisateur(user),
    estConnecte: isAuthenticated,
  };
}

function versDateInput(valeur) {
  if (!valeur) return "";
  const chaine = typeof valeur === "string" ? valeur : new Date(valeur).toISOString();
  return chaine.slice(0, 10);
}

function formaterDate(valeur) {
  if (!valeur) return "—";
  try {
    return new Date(valeur).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return "—";
  }
}

function formaterPrix(prix) {
  const n = Number(prix);
  if (Number.isNaN(n)) return prix ?? "—";
  return n.toLocaleString("fr-FR");
}

export default function Publicite() {
  const { role, utilisateurId, estConnecte } = useUtilisateurCourant();
  const peutModererTout = role === "admin" || role === "superadmin";
  const peutCreer = estConnecte;
  const peutSupprimerTout = peutModererTout;

  const [publicites, setPublicites] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  // Publicités créées/modifiées par l'utilisateur courant durant cette
  // session — voir la note d'en-tête sur l'absence d'un "mes
  // publicités" côté backend pour un utilisateur non-admin.
  const [mesSoumissions, setMesSoumissions] = useState([]);

  const [filtres, setFiltres] = useState({
    emplacement_publicitaire_id: "", forfait_publicitaire_id: "", pays_id: "", statut_moderation: "",
  });
  const [filtresAppliques, setFiltresAppliques] = useState(filtres);

  const [emplacements, setEmplacements] = useState([]);
  const [forfaits, setForfaits] = useState([]);
  const [pays, setPays] = useState([]);

  const [tri, setTri] = useState("date_debut_desc");
  const [page, setPage] = useState(1);
  const [parPage, setParPage] = useState(8);

  const [publiciteSelectionnee, setPubliciteSelectionnee] = useState(null);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [modeEdition, setModeEdition] = useState(false);
  const [publiciteEnEdition, setPubliciteEnEdition] = useState(null);
  const [formulaire, setFormulaire] = useState(FORMULAIRE_VIDE);
  const [visuelExistantUrl, setVisuelExistantUrl] = useState(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreurFormulaire, setErreurFormulaire] = useState(null);

  const [cibleSuppression, setCibleSuppression] = useState(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  const chargerPublicites = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const resultat = await listerPublicites(filtresAppliques);
      setPublicites(resultat);
      setPage(1);
    } catch (err) {
      setErreur(err.message || "Impossible de charger les publicités.");
    } finally {
      setChargement(false);
    }
  }, [filtresAppliques]);

  useEffect(() => { chargerPublicites(); }, [chargerPublicites]);

  useEffect(() => {
    listerEmplacementsPublicitaires().then(setEmplacements).catch(() => setEmplacements([]));
  }, []);

  useEffect(() => {
    listerForfaitsPublicitaires().then(setForfaits).catch(() => setForfaits([]));
  }, []);

  useEffect(() => {
    listerPays().then(setPays).catch(() => setPays([]));
  }, []);

  function libelleEmplacement(id) {
    return emplacements.find((e) => e.emplacement_publicitaire_id === id)?.libelle || id || "—";
  }
  function libelleForfait(id) {
    return forfaits.find((f) => f.forfait_publicitaire_id === id)?.libelle || id || "—";
  }
  function nomPays(id) {
    return pays.find((p) => p.pays_id === id)?.nom || id || "—";
  }

  function modifierFiltre(champ, valeur) {
    setFiltres((p) => {
      const suivant = { ...p, [champ]: valeur };
      // Filtrer par emplacement doit réinitialiser un forfait qui n'y
      // appartiendrait plus, pour éviter un filtre incohérent.
      if (champ === "emplacement_publicitaire_id" && p.forfait_publicitaire_id) {
        const forfait = forfaits.find((f) => f.forfait_publicitaire_id === p.forfait_publicitaire_id);
        if (forfait && forfait.emplacement_publicitaire_id !== valeur) suivant.forfait_publicitaire_id = "";
      }
      return suivant;
    });
  }

  function appliquerFiltres() { setFiltresAppliques(filtres); }

  function reinitialiserFiltres() {
    const vide = { emplacement_publicitaire_id: "", forfait_publicitaire_id: "", pays_id: "", statut_moderation: "" };
    setFiltres(vide);
    setFiltresAppliques(vide);
  }

  const forfaitsFiltreDisponibles = useMemo(() => {
    if (!filtres.emplacement_publicitaire_id) return forfaits;
    return forfaits.filter((f) => f.emplacement_publicitaire_id === filtres.emplacement_publicitaire_id);
  }, [forfaits, filtres.emplacement_publicitaire_id]);

  /* ─── Tri + pagination côté client ─────────────────────────── */

  const publicitesTriees = useMemo(() => {
    const copie = [...publicites];
    if (tri === "statut") {
      const ordre = { en_attente: 0, validee: 1, rejetee: 2 };
      copie.sort((a, b) => (ordre[a.statut_moderation] ?? 9) - (ordre[b.statut_moderation] ?? 9));
    } else if (tri === "date_debut_asc") {
      copie.sort((a, b) => new Date(a.date_debut) - new Date(b.date_debut));
    } else {
      copie.sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut));
    }
    return copie;
  }, [publicites, tri]);

  const nbPages = Math.max(1, Math.ceil(publicitesTriees.length / parPage));
  const pageCourante = Math.min(page, nbPages);
  const publicitesPage = publicitesTriees.slice((pageCourante - 1) * parPage, pageCourante * parPage);
  const debutAffichage = publicitesTriees.length === 0 ? 0 : (pageCourante - 1) * parPage + 1;
  const finAffichage = Math.min(pageCourante * parPage, publicitesTriees.length);

  const kpi = useMemo(() => {
    const total = publicites.length;
    const validee = publicites.filter((p) => p.statut_moderation === "validee").length;
    const enAttente = publicites.filter((p) => p.statut_moderation === "en_attente").length;
    const rejetee = publicites.filter((p) => p.statut_moderation === "rejetee").length;
    return { total, validee, enAttente, rejetee };
  }, [publicites]);

  const refGraphStatut = useRef(null);
  const refGraphEmplacement = useRef(null);
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
        labels: ["Validée", "En attente", "Rejetée"],
        datasets: [{
          data: [kpi.validee, kpi.enAttente, kpi.rejetee],
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
    if (!refGraphEmplacement.current) return;
    const parEmplacement = {};
    publicites.forEach((p) => {
      const libelle = libelleEmplacement(p.emplacement_publicitaire_id);
      parEmplacement[libelle] = (parEmplacement[libelle] || 0) + 1;
    });
    const entrees = Object.entries(parEmplacement).sort((a, b) => b[1] - a[1]).slice(0, 6);

    instancesGraph.current.emplacement?.destroy();
    instancesGraph.current.emplacement = new Chart(refGraphEmplacement.current, {
      type: "bar",
      data: {
        labels: entrees.map(([nom]) => nom),
        datasets: [{
          label: "Publicités",
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
  }, [publicites, emplacements]);

  useEffect(() => () => {
    Object.values(instancesGraph.current).forEach((g) => g?.destroy());
  }, []);

  /* ─── Formulaire création / édition ────────────────────────── */

  function ouvrirCreation() {
    setModeEdition(false);
    setPubliciteEnEdition(null);
    setFormulaire({
      ...FORMULAIRE_VIDE,
      emplacement_publicitaire_id: filtresAppliques.emplacement_publicitaire_id || "",
      pays_id: filtresAppliques.pays_id || "",
    });
    setVisuelExistantUrl(null);
    setErreurFormulaire(null);
    setModaleOuverte(true);
  }

  function ouvrirEdition(publicite) {
    setModeEdition(true);
    setPubliciteEnEdition(publicite);
    setFormulaire({
      emplacement_publicitaire_id: publicite.emplacement_publicitaire_id ?? "",
      forfait_publicitaire_id: publicite.forfait_publicitaire_id ?? "",
      pays_id: publicite.pays_id ?? "",
      titre: publicite.titre ?? "",
      date_debut: versDateInput(publicite.date_debut),
      date_fin: versDateInput(publicite.date_fin),
      statut_moderation: publicite.statut_moderation ?? "en_attente",
      visuel: null,
    });
    setVisuelExistantUrl(publicite.visuel_url ?? null);
    setErreurFormulaire(null);
    setModaleOuverte(true);
    setPubliciteSelectionnee(null);
  }

  function fermerModale() { setModaleOuverte(false); setErreurFormulaire(null); }

  function modifierChampFormulaire(champ, valeur) {
    setFormulaire((p) => ({ ...p, [champ]: valeur }));
  }

  /** Choisir un emplacement à la création réinitialise le forfait s'il
   * n'y appartient plus (garantit la cohérence exigée côté serveur). */
  function choisirEmplacement(id) {
    setFormulaire((p) => {
      const forfaitActuel = forfaits.find((f) => f.forfait_publicitaire_id === p.forfait_publicitaire_id);
      const doitReinitialiser = forfaitActuel && forfaitActuel.emplacement_publicitaire_id !== id;
      return { ...p, emplacement_publicitaire_id: id, forfait_publicitaire_id: doitReinitialiser ? "" : p.forfait_publicitaire_id };
    });
  }

  /** Choisir un forfait dérive automatiquement son emplacement — c'est
   * ce couplage forfait → emplacement qui est vérifié côté serveur
   * (voir en-tête, `creerPublicite`). */
  function choisirForfait(id) {
    const forfait = forfaits.find((f) => f.forfait_publicitaire_id === id);
    setFormulaire((p) => ({
      ...p,
      forfait_publicitaire_id: id,
      emplacement_publicitaire_id: forfait ? forfait.emplacement_publicitaire_id : p.emplacement_publicitaire_id,
    }));
  }

  function modifierFichierFormulaire(fichier) {
    setFormulaire((p) => ({ ...p, visuel: fichier ?? null }));
  }

  const estAuteurEnEdition = modeEdition && publiciteEnEdition?.utilisateur_id === utilisateurId;
  const editionContenuVerrouillee =
    modeEdition && !peutModererTout && publiciteEnEdition?.statut_moderation !== "en_attente";

  const forfaitsCreationDisponibles = useMemo(() => {
    if (!formulaire.emplacement_publicitaire_id) return forfaits;
    return forfaits.filter((f) => f.emplacement_publicitaire_id === formulaire.emplacement_publicitaire_id);
  }, [forfaits, formulaire.emplacement_publicitaire_id]);

  async function soumettreFormulaire(evenement) {
    evenement.preventDefault();
    setErreurFormulaire(null);

    if (!modeEdition) {
      const manquants = [];
      if (!formulaire.pays_id) manquants.push("pays");
      if (!formulaire.emplacement_publicitaire_id) manquants.push("emplacement");
      if (!formulaire.forfait_publicitaire_id) manquants.push("forfait publicitaire");
      if (!formulaire.titre.trim()) manquants.push("titre");
      if (!formulaire.date_debut) manquants.push("date de début");
      if (!formulaire.date_fin) manquants.push("date de fin");
      if (!formulaire.visuel) manquants.push("visuel de l'encart");
      if (manquants.length) {
        setErreurFormulaire(`Champ(s)/fichier manquant(s) : ${manquants.join(", ")}.`);
        return;
      }
      if (new Date(formulaire.date_fin) < new Date(formulaire.date_debut)) {
        setErreurFormulaire("La date de fin ne peut pas être antérieure à la date de début.");
        return;
      }
    }

    setEnvoiEnCours(true);
    try {
      let resultat;
      if (modeEdition) {
        if (peutModererTout) {
          resultat = await modifierPublicite(publiciteEnEdition.publicite_id, {
            statut_moderation: formulaire.statut_moderation,
          });
        } else {
          const donnees = {};
          if (formulaire.titre) donnees.titre = formulaire.titre;
          if (formulaire.date_debut) donnees.date_debut = formulaire.date_debut;
          if (formulaire.date_fin) donnees.date_fin = formulaire.date_fin;
          if (formulaire.visuel) donnees.visuel = formulaire.visuel;
          resultat = await modifierPublicite(publiciteEnEdition.publicite_id, donnees);
        }
      } else {
        resultat = await creerPublicite({
          emplacement_publicitaire_id: formulaire.emplacement_publicitaire_id,
          forfait_publicitaire_id: formulaire.forfait_publicitaire_id,
          pays_id: formulaire.pays_id,
          titre: formulaire.titre,
          date_debut: formulaire.date_debut,
          date_fin: formulaire.date_fin,
          visuel: formulaire.visuel,
          // statut_moderation n'est jamais envoyé : le serveur force
          // toujours "en_attente" à la création, quel que soit le rôle.
        });
      }
      if (resultat) {
        setMesSoumissions((prev) => {
          const sansDoublon = prev.filter((p) => p.publicite_id !== resultat.publicite_id);
          return [resultat, ...sansDoublon];
        });
      }
      setModaleOuverte(false);
      await chargerPublicites();
    } catch (err) {
      setErreurFormulaire(err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  /** Récupère l'état à jour d'une publicité (utile pour "mes
   * soumissions" : GET /publicites/:id autorise l'auteur même si la
   * publicité n'est pas encore validée, contrairement à la liste). */
  async function rafraichirSoumission(publiciteId) {
    try {
      const fraiche = await obtenirPublicite(publiciteId);
      setMesSoumissions((prev) => prev.map((p) => (p.publicite_id === publiciteId ? fraiche : p)));
    } catch {
      // silencieux : la publicité a pu être supprimée entre temps
    }
  }

  async function confirmerSuppression() {
    if (!cibleSuppression) return;
    setSuppressionEnCours(true);
    try {
      await supprimerPublicite(cibleSuppression.publicite_id);
      setCibleSuppression(null);
      setMesSoumissions((prev) => prev.filter((p) => p.publicite_id !== cibleSuppression.publicite_id));
      if (publiciteSelectionnee?.publicite_id === cibleSuppression.publicite_id) setPubliciteSelectionnee(null);
      await chargerPublicites();
    } catch (err) {
      setErreur(err.message || "Impossible de supprimer cette publicité.");
      setCibleSuppression(null);
    } finally {
      setSuppressionEnCours(false);
    }
  }

  function exporterCsv() {
    const entetes = ["Titre", "Emplacement", "Forfait", "Pays", "Statut", "Début", "Fin"];
    const lignes = publicitesTriees.map((p) => [
      p.titre,
      libelleEmplacement(p.emplacement_publicitaire_id),
      libelleForfait(p.forfait_publicitaire_id),
      nomPays(p.pays_id),
      STATUT_META[p.statut_moderation]?.libelle || p.statut_moderation,
      versDateInput(p.date_debut), versDateInput(p.date_fin),
    ]);
    const csv = [entetes, ...lignes]
      .map((ligne) => ligne.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(blob);
    lien.download = "publicites.csv";
    lien.click();
    URL.revokeObjectURL(lien.href);
  }

  function peutModifierCettePublicite(p) {
    if (peutModererTout) return true;
    return p.utilisateur_id === utilisateurId && p.statut_moderation === "en_attente";
  }
  function peutSupprimerCettePublicite(p) {
    return peutModererTout || p.utilisateur_id === utilisateurId;
  }

  return (
    <>
      <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <nav className="aps-breadcrumb">
            <a href="dashboard.html">Tableau de bord</a>
            <span className="sep">/</span>
            <span>Publicité</span>
            <span className="sep">/</span>
            <span>Publicités</span>
          </nav>
          <h1>Publicités</h1>
          <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
            Encarts publicitaires diffusés sur les emplacements du site — module autonome, indépendant de toute
            fiche annuaire.
          </p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-light" type="button" onClick={exporterCsv}>
            <i className="fa-solid fa-file-export me-1"></i> Exporter
          </button>
          {peutCreer && (
            <button className="btn btn-primary" type="button" onClick={ouvrirCreation}>
              <i className="fa-solid fa-plus me-1"></i> Nouvelle publicité
            </button>
          )}
        </div>
      </div>

      {!peutModererTout && (
        <div className="aps-notice is-info mb-4">
          <i className="fa-solid fa-circle-info"></i>
          <div>
            Cette liste n'affiche que les publicités <strong>validées</strong> (vue grand public) — le serveur ne
            propose pas de vue "mes publicités" pour un compte non-admin. Vos propres soumissions de cette session
            apparaissent séparément ci-dessous, avec leur statut à jour.
          </div>
        </div>
      )}

      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3">
          <div className="aps-kpi">
            <div className="aps-kpi__top">
              <div className="aps-kpi__icon is-primary"><i className="fa-solid fa-rectangle-ad"></i></div>
              <span className="aps-badge is-info"><i className="fa-solid fa-circle"></i> Total</span>
            </div>
            <div className="aps-kpi__label">Publicités (vue actuelle)</div>
            <div className="aps-kpi__value">{kpi.total.toLocaleString("fr-FR")}</div>
          </div>
        </div>

        <div className="col-6 col-lg-3">
          <div className="aps-kpi">
            <div className="aps-kpi__top">
              <div className="aps-kpi__icon is-success"><i className="fa-solid fa-circle-check"></i></div>
              <span className="aps-badge is-success"><i className="fa-solid fa-circle"></i> Actif</span>
            </div>
            <div className="aps-kpi__label">Publicités validées</div>
            <div className="aps-kpi__value">{kpi.validee.toLocaleString("fr-FR")}</div>
          </div>
        </div>

        <div className="col-6 col-lg-3">
          <div className="aps-kpi">
            <div className="aps-kpi__top">
              <div className="aps-kpi__icon is-warning"><i className="fa-solid fa-hourglass-half"></i></div>
              <span className="aps-badge is-warning"><i className="fa-solid fa-circle"></i> En attente</span>
            </div>
            <div className="aps-kpi__label">À modérer</div>
            <div className="aps-kpi__value">{kpi.enAttente.toLocaleString("fr-FR")}</div>
          </div>
        </div>

        <div className="col-6 col-lg-3">
          <div className="aps-kpi">
            <div className="aps-kpi__top">
              <div className="aps-kpi__icon is-danger"><i className="fa-solid fa-triangle-exclamation"></i></div>
              <span className="aps-badge is-danger"><i className="fa-solid fa-circle"></i> Rejetée</span>
            </div>
            <div className="aps-kpi__label">Publicités rejetées</div>
            <div className="aps-kpi__value">{kpi.rejetee.toLocaleString("fr-FR")}</div>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-lg-6">
          <div className="aps-card h-100">
            <div className="aps-card__header"><h3>Statut de modération</h3></div>
            <div className="aps-card__body">
              <div style={{ position: "relative", height: 260 }}>
                <canvas ref={refGraphStatut}></canvas>
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="aps-card h-100">
            <div className="aps-card__header"><h3>Publicités par emplacement</h3></div>
            <div className="aps-card__body">
              <div style={{ position: "relative", height: 260 }}>
                <canvas ref={refGraphEmplacement}></canvas>
              </div>
            </div>
          </div>
        </div>
      </div>

      {kpi.enAttente > 0 && peutModererTout && (
        <div className="aps-notice is-warning mb-4">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <div>
            <strong>{kpi.enAttente} publicité{kpi.enAttente > 1 ? "s" : ""} en attente de modération.</strong>{" "}
            Vérifiez le visuel et les dates avant de valider ou rejeter.
          </div>
        </div>
      )}

      {/* =========================================================
           MES SOUMISSIONS DE LA SESSION (utilisateur non-admin)
           ========================================================= */}
      {!peutModererTout && mesSoumissions.length > 0 && (
        <div className="aps-card mb-4">
          <div className="aps-card__header"><h3>Mes publicités soumises (cette session)</h3></div>
          <div className="aps-card__body">
            <div className="row g-3">
              {mesSoumissions.map((p) => {
                const statut = STATUT_META[p.statut_moderation] || {};
                return (
                  <div className="col-md-6 col-xl-4" key={p.publicite_id}>
                    <div className="card h-100 shadow-sm">
                      <div className="card-body d-flex flex-column">
                        <div className="d-flex align-items-start justify-content-between mb-1">
                          <h5 className="card-title mb-0" style={{ fontSize: 15 }}>{p.titre}</h5>
                          <span className={`aps-badge ${statut.badge || "is-info"} ms-2`}>
                            <i className="fa-solid fa-circle"></i> {statut.libelle || p.statut_moderation}
                          </span>
                        </div>
                        <p className="card-text aps-text-muted mb-2" style={{ fontSize: 13 }}>
                          {libelleEmplacement(p.emplacement_publicitaire_id)} · {libelleForfait(p.forfait_publicitaire_id)}
                        </p>
                        <div className="d-flex gap-2 mt-auto pt-2" style={{ borderTop: "1px solid var(--aps-border)" }}>
                          <button className="btn btn-sm btn-outline-primary flex-grow-1" onClick={() => rafraichirSoumission(p.publicite_id)}>
                            <i className="fa-solid fa-rotate-right me-1"></i> Actualiser le statut
                          </button>
                          {peutModifierCettePublicite(p) && (
                            <button className="btn btn-sm btn-light" title="Modifier" onClick={() => ouvrirEdition(p)}>
                              <i className="fa-solid fa-pen"></i>
                            </button>
                          )}
                          {peutSupprimerCettePublicite(p) && (
                            <button className="btn btn-sm btn-light" title="Supprimer" onClick={() => setCibleSuppression(p)}>
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
              <label className="form-label">Emplacement</label>
              <select className="form-select" value={filtres.emplacement_publicitaire_id} onChange={(e) => modifierFiltre("emplacement_publicitaire_id", e.target.value)}>
                <option value="">Tous</option>
                {emplacements.map((e) => <option key={e.emplacement_publicitaire_id} value={e.emplacement_publicitaire_id}>{e.libelle}</option>)}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Forfait</label>
              <select className="form-select" value={filtres.forfait_publicitaire_id} onChange={(e) => modifierFiltre("forfait_publicitaire_id", e.target.value)}>
                <option value="">Tous</option>
                {forfaitsFiltreDisponibles.map((f) => <option key={f.forfait_publicitaire_id} value={f.forfait_publicitaire_id}>{f.libelle}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Pays</label>
              <select className="form-select" value={filtres.pays_id} onChange={(e) => modifierFiltre("pays_id", e.target.value)}>
                <option value="">Tous</option>
                {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Statut {!peutModererTout && <span className="aps-text-muted">(admin seul.)</span>}</label>
              <select className="form-select" value={filtres.statut_moderation} onChange={(e) => modifierFiltre("statut_moderation", e.target.value)} disabled={!peutModererTout}>
                <option value="">Tous</option>
                {STATUTS_MODERATION_PUBLICITE.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
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
           LISTE DES PUBLICITÉS — AFFICHAGE EN CARDS
           ========================================================= */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="aps-text-muted" style={{ fontSize: 13 }}>
          {chargement ? "Chargement…" : (
            <>Affichage de <strong className="aps-text-strong">{debutAffichage}–{finAffichage}</strong> sur{" "}
              <strong className="aps-text-strong">{publicitesTriees.length}</strong> publicités</>
          )}
        </div>
        <div className="d-flex gap-2 align-items-center">
          <label className="aps-text-muted" style={{ fontSize: 13 }}>Trier par :</label>
          <select className="form-select form-select-sm" style={{ width: "auto" }} value={tri} onChange={(e) => setTri(e.target.value)}>
            <option value="date_debut_desc">Date de début (récent → ancien)</option>
            <option value="date_debut_asc">Date de début (ancien → récent)</option>
            <option value="statut">Statut</option>
          </select>
        </div>
      </div>

      <div className="row g-3">
        {!chargement && publicitesPage.length === 0 && (
          <div className="col-12">
            <div className="aps-card">
              <div className="aps-card__body text-center aps-text-muted py-5">
                Aucune publicité ne correspond à ces critères.
              </div>
            </div>
          </div>
        )}

        {publicitesPage.map((publicite) => {
          const statut = STATUT_META[publicite.statut_moderation] || {};
          return (
            <div className="col-md-6 col-xl-4" key={publicite.publicite_id}>
              <div className="card h-100 shadow-sm">
                <img
                  src={publicite.visuel_url}
                  className="card-img-top"
                  alt={`Visuel — ${publicite.titre}`}
                  style={{ height: 160, objectFit: "cover" }}
                />
                <div className="card-body d-flex flex-column">
                  <div className="d-flex align-items-start justify-content-between mb-1">
                    <h5 className="card-title mb-0" style={{ fontSize: 15 }}>{publicite.titre}</h5>
                    <span className={`aps-badge ${statut.badge || "is-info"} ms-2`}>
                      <i className="fa-solid fa-circle"></i> {statut.libelle || publicite.statut_moderation}
                    </span>
                  </div>
                  <p className="card-text aps-text-muted mb-2" style={{ fontSize: 13 }}>
                    <i className="fa-solid fa-window-restore me-1"></i>
                    {libelleEmplacement(publicite.emplacement_publicitaire_id)}
                    <span className="mx-1">·</span>
                    {libelleForfait(publicite.forfait_publicitaire_id)}
                  </p>
                  <p className="card-text mb-3" style={{ fontSize: 13 }}>
                    <i className="fa-solid fa-calendar-days me-1"></i>
                    {versDateInput(publicite.date_debut)} → {versDateInput(publicite.date_fin)}
                  </p>

                  <div className="d-flex gap-2 mt-auto pt-2" style={{ borderTop: "1px solid var(--aps-border)" }}>
                    {publicite.statut_moderation === "en_attente" && peutModererTout ? (
                      <button className="btn btn-sm btn-primary flex-grow-1" onClick={() => ouvrirEdition(publicite)}>
                        <i className="fa-solid fa-gavel me-1"></i> Modérer
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-outline-primary flex-grow-1" onClick={() => setPubliciteSelectionnee(publicite)}>
                        <i className="fa-solid fa-eye me-1"></i> Voir
                      </button>
                    )}
                    {peutModifierCettePublicite(publicite) && (
                      <button className="btn btn-sm btn-light" title="Modifier" onClick={() => ouvrirEdition(publicite)}>
                        <i className="fa-solid fa-pen"></i>
                      </button>
                    )}
                    {peutSupprimerCettePublicite(publicite) && (
                      <button className="btn btn-sm btn-light" title="Supprimer" onClick={() => setCibleSuppression(publicite)}>
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
      {publiciteSelectionnee && (
        <>
          <style>{STYLE_FICHE_DETAIL}</style>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={() => setPubliciteSelectionnee(null)}>
            <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content aps-fiche-detail">
                <div className="modal-header aps-fiche-header">
                  <div>
                    <h5 className="modal-title mb-1">{publiciteSelectionnee.titre}</h5>
                    <div className="aps-text-muted aps-fiche-souscritre">
                      <i className="fa-solid fa-window-restore me-1"></i>
                      {libelleEmplacement(publiciteSelectionnee.emplacement_publicitaire_id)}
                    </div>
                  </div>
                  <button type="button" className="btn-close" onClick={() => setPubliciteSelectionnee(null)}></button>
                </div>
                <div className="modal-body pt-3">
                  <div className="row g-4">
                    <div className="col-md-5">
                      <div className="aps-fiche-image-wrap">
                        {publiciteSelectionnee.visuel_url ? (
                          <img
                            src={publiciteSelectionnee.visuel_url}
                            className="aps-fiche-image"
                            alt="Visuel de l'encart"
                          />
                        ) : (
                          <div className="aps-fiche-image-vide">
                            <i className="fa-solid fa-image"></i>
                          </div>
                        )}
                        <span className={`aps-badge aps-fiche-statut-flottant ${STATUT_META[publiciteSelectionnee.statut_moderation]?.badge || "is-info"}`}>
                          <i className={`fa-solid ${STATUT_META[publiciteSelectionnee.statut_moderation]?.detailIcone || "fa-circle"}`}></i>
                          {STATUT_META[publiciteSelectionnee.statut_moderation]?.libelle || "—"}
                        </span>
                      </div>
                    </div>

                    <div className="col-md-7">
                      <div className="aps-fiche-info-grid">
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-calendar-day"></i>
                          <div>
                            <div className="aps-fiche-info-label">Début</div>
                            <div className="aps-fiche-info-valeur">{formaterDate(publiciteSelectionnee.date_debut)}</div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-calendar-check"></i>
                          <div>
                            <div className="aps-fiche-info-label">Fin</div>
                            <div className="aps-fiche-info-valeur">{formaterDate(publiciteSelectionnee.date_fin)}</div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-tags"></i>
                          <div>
                            <div className="aps-fiche-info-label">Forfait</div>
                            <div className="aps-fiche-info-valeur">{libelleForfait(publiciteSelectionnee.forfait_publicitaire_id)}</div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-earth-africa"></i>
                          <div>
                            <div className="aps-fiche-info-label">Pays</div>
                            <div className="aps-fiche-info-valeur">{nomPays(publiciteSelectionnee.pays_id)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  {peutModifierCettePublicite(publiciteSelectionnee) && (
                    <button type="button" className="btn btn-primary" onClick={() => ouvrirEdition(publiciteSelectionnee)}>
                      <i className="fa-solid fa-pen me-1"></i> Modifier
                    </button>
                  )}
                  <button type="button" className="btn btn-light" onClick={() => setPubliciteSelectionnee(null)}>Fermer</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — CRÉATION / ÉDITION
           ========================================================= */}
      {modaleOuverte && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={fermerModale}>
            <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
              <form className="modal-content" onSubmit={soumettreFormulaire}>
                <div className="modal-header">
                  <h5 className="modal-title">
                    {modeEdition ? (peutModererTout ? "Modérer la publicité" : "Modifier la publicité") : "Nouvelle publicité"}
                  </h5>
                  <button type="button" className="btn-close" onClick={fermerModale}></button>
                </div>
                <div className="modal-body">
                  {erreurFormulaire && (
                    <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreurFormulaire}</div></div>
                  )}

                  {/* ── Édition — admin/superadmin : uniquement le
                       statut de modération, jamais le reste du contenu ── */}
                  {modeEdition && peutModererTout && (
                    <div className="row g-3">
                      <div className="col-12">
                        <div className="aps-text-muted mb-2" style={{ fontSize: 13 }}>
                          {publiciteEnEdition?.titre} — {libelleEmplacement(publiciteEnEdition?.emplacement_publicitaire_id)}
                          <span className="mx-2">·</span>
                          {versDateInput(publiciteEnEdition?.date_debut)} → {versDateInput(publiciteEnEdition?.date_fin)}
                        </div>
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Statut de modération</label>
                        <select className="form-select" required value={formulaire.statut_moderation}
                                onChange={(e) => modifierChampFormulaire("statut_moderation", e.target.value)}>
                          {STATUTS_MODERATION_PUBLICITE.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* ── Édition — auteur : titre/lien/dates/visuel, tant
                       que la publicité est encore "en_attente" ── */}
                  {modeEdition && !peutModererTout && (
                    <>
                      {editionContenuVerrouillee ? (
                        <div className="aps-notice is-warning">
                          <i className="fa-solid fa-lock"></i>
                          <div>Cette publicité a déjà été modérée : son contenu ne peut plus être modifié.</div>
                        </div>
                      ) : (
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label">Titre</label>
                            <input type="text" className="form-control" value={formulaire.titre}
                                   onChange={(e) => modifierChampFormulaire("titre", e.target.value)} />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label">Date de début</label>
                            <input type="date" className="form-control" value={formulaire.date_debut}
                                   onChange={(e) => modifierChampFormulaire("date_debut", e.target.value)} />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label">Date de fin</label>
                            <input type="date" className="form-control" value={formulaire.date_fin}
                                   onChange={(e) => modifierChampFormulaire("date_fin", e.target.value)} />
                          </div>
                          <div className="col-12">
                            <label className="form-label">Visuel de l'encart <span className="aps-text-muted">(laisser vide pour conserver le visuel actuel)</span></label>
                            <input type="file" className="form-control" accept="image/jpeg,image/png,image/webp"
                                   onChange={(e) => modifierFichierFormulaire(e.target.files?.[0])} />
                            {visuelExistantUrl && (
                              <a href={visuelExistantUrl} target="_blank" rel="noreferrer" className="d-block mt-1" style={{ fontSize: 12 }}>
                                Voir le visuel actuel
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Création : pays → emplacement → forfait
                       (le forfait dérive automatiquement son emplacement,
                       et inversement — voir choisirEmplacement/choisirForfait) ── */}
                  {!modeEdition && (
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label">Pays</label>
                        <select className="form-select" required value={formulaire.pays_id}
                                onChange={(e) => modifierChampFormulaire("pays_id", e.target.value)}>
                          <option value="" disabled>Choisir…</option>
                          {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Emplacement</label>
                        <select className="form-select" required value={formulaire.emplacement_publicitaire_id}
                                onChange={(e) => choisirEmplacement(e.target.value)}>
                          <option value="" disabled>Choisir…</option>
                          {emplacements.map((e) => <option key={e.emplacement_publicitaire_id} value={e.emplacement_publicitaire_id}>{e.libelle}</option>)}
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Forfait publicitaire</label>
                        <select className="form-select" required value={formulaire.forfait_publicitaire_id}
                                onChange={(e) => choisirForfait(e.target.value)}>
                          <option value="" disabled>Choisir…</option>
                          {forfaitsCreationDisponibles.map((f) => (
                            <option key={f.forfait_publicitaire_id} value={f.forfait_publicitaire_id}>
                              {f.libelle} — {formaterPrix(f.prix)} / {f.duree_jours} j
                            </option>
                          ))}
                        </select>
                        {formulaire.emplacement_publicitaire_id && forfaitsCreationDisponibles.length === 0 && (
                          <div className="aps-text-muted mt-1" style={{ fontSize: 12 }}>
                            Aucun forfait disponible pour cet emplacement.
                          </div>
                        )}
                      </div>

                      <div className="col-md-6">
                        <label className="form-label">Titre</label>
                        <input type="text" className="form-control" required value={formulaire.titre}
                               onChange={(e) => modifierChampFormulaire("titre", e.target.value)}
                               placeholder="Ex. Promotion de rentrée" />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Date de début</label>
                        <input type="date" className="form-control" required value={formulaire.date_debut}
                               onChange={(e) => modifierChampFormulaire("date_debut", e.target.value)} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Date de fin</label>
                        <input type="date" className="form-control" required value={formulaire.date_fin}
                               onChange={(e) => modifierChampFormulaire("date_fin", e.target.value)} />
                      </div>

                      <div className="col-12">
                        <hr />
                        <label className="form-label">Visuel de l'encart <span className="text-danger">*</span></label>
                        <input type="file" className="form-control" required accept="image/jpeg,image/png,image/webp"
                               onChange={(e) => modifierFichierFormulaire(e.target.files?.[0])} />
                        <div className="aps-text-muted mt-1" style={{ fontSize: 12 }}>
                          Votre publicité sera créée « en attente » : elle ne sera diffusée qu'après validation par
                          un administrateur, quel que soit votre rôle.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={fermerModale}>Annuler</button>
                  <button type="submit" className="btn btn-primary" disabled={envoiEnCours || editionContenuVerrouillee}>
                    {envoiEnCours ? "Enregistrement…" : modeEdition ? "Enregistrer" : "Créer la publicité"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — CONFIRMATION DE SUPPRESSION
           ========================================================= */}
      {cibleSuppression && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={() => setCibleSuppression(null)}>
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Supprimer cette publicité ?</h5>
                  <button type="button" className="btn-close" onClick={() => setCibleSuppression(null)}></button>
                </div>
                <div className="modal-body">
                  <p className="mb-0">
                    La publicité « {cibleSuppression.titre} » sera définitivement supprimée, ainsi que son visuel.
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
    </>
  );
}