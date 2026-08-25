// src/components/Urgences.jsx
//
// Reprend la structure et le design system APS (Bootstrap 5) de
// Pharmacie.jsx / PublicitePharmacie.jsx — même logique, mêmes
// conventions — adapté au module "Urgences" (tables type_urgence et
// urgence) et branché sur urgenceService.js.
//
// Modèle de droits (voir l'en-tête de urgenceService.js) :
//   - Lecture (types-urgence + urgences) : PUBLIQUE, aucune restriction
//     de contenu (contrairement à publicite_pharmacie, il n'y a pas de
//     notion de "vue grand public" partielle ici).
//   - Création / modification : admin ou superadmin.
//   - Suppression : superadmin uniquement.
// Ces règles s'appliquent identiquement aux deux entités (type_urgence
// et urgence), donc un seul jeu de booléens de droits suffit pour toute
// la page.
//
// `pays_id` est choisi dans un select alimenté par `listerPays()` du
// composant "référentiels" (referentielService.js — GET /referentiels/pays).
// Cette fonction accepte un `statut_activation` optionnel et retourne le
// tableau complet des pays ({ pays_id, nom, code_iso2, devise_id,
// langue_id, statut_activation }) ; seuls `pays_id` et `nom` sont utilisés
// ici. Les objets `type_urgence` / `pays` éventuellement inclus dans les
// réponses de listerUrgences sont utilisés quand présents, sinon on
// retombe sur une recherche dans les listes déjà chargées (mêmes helpers
// défensifs que nomPharmacie dans PublicitePharmacie.jsx).

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Chart from "chart.js/auto";
import { useAuth } from "../context/AuthContext";
import {
  listerTypesUrgence,
  creerTypeUrgence,
  modifierTypeUrgence,
  supprimerTypeUrgence,
  listerUrgences,
  creerUrgence,
  modifierUrgence,
  supprimerUrgence,
} from "../services/urgenceService";
import { listerPays } from "../services/referentielService";
import "./../assets/style/urgences.css";

const COULEURS_GRAPHIQUE = {
  primary: "#1C8FE0", teal: "#17B6C4", success: "#1B8A4B",
  warning: "#B7791F", danger: "#E5484D", violet: "#8B5CF6",
  text500: "#6B7280", border: "#E7EAF0",
};
const PALETTE_TYPES = [
  COULEURS_GRAPHIQUE.primary, COULEURS_GRAPHIQUE.teal, COULEURS_GRAPHIQUE.success,
  COULEURS_GRAPHIQUE.warning, COULEURS_GRAPHIQUE.danger, COULEURS_GRAPHIQUE.violet,
];

const FORMULAIRE_URGENCE_VIDE = {
  type_urgence_id: "", pays_id: "", libelle: "", description: "", telephone: "",
};
const FORMULAIRE_TYPE_VIDE = { libelle: "", description: "" };

const TAILLES_PAGE = [8, 16, 32];

/**
 * Icône Font Awesome plausible selon le libellé du type d'urgence
 * (recherche de mots-clés courants) — purement cosmétique, retombe sur
 * une icône générique si rien ne correspond.
 */
function iconePourType(libelleType) {
  const l = (libelleType || "").toLowerCase();
  if (l.includes("police") || l.includes("sécurité")) return "fa-user-shield";
  if (l.includes("pompier") || l.includes("incendie")) return "fa-fire-flame-curved";
  if (l.includes("ambulance") || l.includes("samu") || l.includes("médic")) return "fa-truck-medical";
  if (l.includes("hôpital") || l.includes("hopital") || l.includes("santé")) return "fa-hospital";
  if (l.includes("catastrophe") || l.includes("protection civile")) return "fa-house-chimney-crack";
  return "fa-phone-volume";
}

/** Couleur stable (cyclique) pour un type d'urgence donné, à partir de
 * sa position dans la liste des types chargés. */
function couleurPourType(typeUrgenceId, typesUrgence) {
  const index = typesUrgence.findIndex((t) => t.type_urgence_id === typeUrgenceId);
  return PALETTE_TYPES[index >= 0 ? index % PALETTE_TYPES.length : 0];
}

/** Extrait un nom de rôle (en minuscules) depuis un objet utilisateur —
 * même logique que Pharmacie.jsx / PublicitePharmacie.jsx, dupliquée
 * ici pour ne pas introduire de dépendance croisée entre composants. */
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

function useRoleUtilisateur() {
  const { user } = useAuth();
  return { role: extraireNomRole(user) };
}

export default function Urgences() {
  const { role } = useRoleUtilisateur();
  const peutEcrire = role === "admin" || role === "superadmin";
  const peutSupprimer = role === "superadmin";

  const [onglet, setOnglet] = useState("urgences"); // "urgences" | "types"

  /* ─────────────────────────────── Données ─────────────────────── */
  const [urgences, setUrgences] = useState([]);
  const [typesUrgence, setTypesUrgence] = useState([]);
  const [pays, setPays] = useState([]);

  const [chargementUrgences, setChargementUrgences] = useState(true);
  const [chargementTypes, setChargementTypes] = useState(true);
  const [erreur, setErreur] = useState(null);

  const [filtres, setFiltres] = useState({ pays_id: "", type_urgence_id: "" });
  const [filtresAppliques, setFiltresAppliques] = useState(filtres);

  const chargerUrgences = useCallback(async () => {
    setChargementUrgences(true);
    setErreur(null);
    try {
      const resultat = await listerUrgences(filtresAppliques);
      setUrgences(resultat);
      setPage(1);
    } catch (err) {
      setErreur(err.message || "Impossible de charger les urgences.");
    } finally {
      setChargementUrgences(false);
    }
  }, [filtresAppliques]);

  const chargerTypes = useCallback(async () => {
    setChargementTypes(true);
    try {
      const resultat = await listerTypesUrgence();
      setTypesUrgence(resultat);
    } catch (err) {
      setErreur(err.message || "Impossible de charger les types d'urgence.");
    } finally {
      setChargementTypes(false);
    }
  }, []);

  useEffect(() => { chargerUrgences(); }, [chargerUrgences]);
  useEffect(() => { chargerTypes(); }, [chargerTypes]);
  useEffect(() => { listerPays().then(setPays).catch(() => setPays([])); }, []);

  function nomPays(paysId) {
    return pays.find((p) => p.pays_id === paysId)?.nom || paysId || "—";
  }
  function libelleType(typeUrgenceId) {
    return typesUrgence.find((t) => t.type_urgence_id === typeUrgenceId)?.libelle || typeUrgenceId || "—";
  }
  function nomPaysDe(urgence) { return urgence.pays?.nom || nomPays(urgence.pays_id); }
  function typeDe(urgence) { return urgence.type_urgence?.libelle || libelleType(urgence.type_urgence_id); }

  function modifierFiltre(champ, valeur) { setFiltres((p) => ({ ...p, [champ]: valeur })); }
  function appliquerFiltres() { setFiltresAppliques(filtres); }
  function reinitialiserFiltres() {
    const vide = { pays_id: "", type_urgence_id: "" };
    setFiltres(vide);
    setFiltresAppliques(vide);
  }

  /* ─── Tri + pagination côté client (onglet "Urgences") ─────────── */
  const [tri, setTri] = useState("libelle_asc");
  const [page, setPage] = useState(1);
  const [parPage, setParPage] = useState(8);

  const urgencesTriees = useMemo(() => {
    const copie = [...urgences];
    if (tri === "type") copie.sort((a, b) => typeDe(a).localeCompare(typeDe(b)));
    else if (tri === "pays") copie.sort((a, b) => nomPaysDe(a).localeCompare(nomPaysDe(b)));
    else copie.sort((a, b) => (a.libelle || "").localeCompare(b.libelle || ""));
    return copie;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urgences, tri, typesUrgence, pays]);

  const nbPages = Math.max(1, Math.ceil(urgencesTriees.length / parPage));
  const pageCourante = Math.min(page, nbPages);
  const urgencesPage = urgencesTriees.slice((pageCourante - 1) * parPage, pageCourante * parPage);
  const debutAffichage = urgencesTriees.length === 0 ? 0 : (pageCourante - 1) * parPage + 1;
  const finAffichage = Math.min(pageCourante * parPage, urgencesTriees.length);

  /* ─────────────────────────────── KPI ───────────────────────────── */
  const kpi = useMemo(() => {
    const paysDistincts = new Set(urgences.map((u) => u.pays_id)).size;
    const sansTelephone = urgences.filter((u) => !u.telephone || !u.telephone.trim()).length;
    return { total: urgences.length, totalTypes: typesUrgence.length, paysDistincts, sansTelephone };
  }, [urgences, typesUrgence]);

  /* ─────────────────────────────── Graphiques ────────────────────── */
  const refGraphType = useRef(null);
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
    urgences.forEach((u) => { const l = typeDe(u); parType[l] = (parType[l] || 0) + 1; });
    const entrees = Object.entries(parType).sort((a, b) => b[1] - a[1]);

    instancesGraph.current.type?.destroy();
    instancesGraph.current.type = new Chart(refGraphType.current, {
      type: "bar",
      data: {
        labels: entrees.map(([nom]) => nom),
        datasets: [{
          label: "Urgences",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urgences, typesUrgence]);

  useEffect(() => {
    if (!refGraphPays.current) return;
    const parPaysCompte = {};
    urgences.forEach((u) => { const n = nomPaysDe(u); parPaysCompte[n] = (parPaysCompte[n] || 0) + 1; });
    const entrees = Object.entries(parPaysCompte).sort((a, b) => b[1] - a[1]).slice(0, 6);

    instancesGraph.current.pays?.destroy();
    instancesGraph.current.pays = new Chart(refGraphPays.current, {
      type: "doughnut",
      data: {
        labels: entrees.map(([nom]) => nom),
        datasets: [{
          data: entrees.map(([, n]) => n),
          backgroundColor: PALETTE_TYPES,
          borderColor: "#fff", borderWidth: 2,
        }],
      },
      options: {
        plugins: { legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", padding: 14 } } },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urgences, pays]);

  useEffect(() => () => { Object.values(instancesGraph.current).forEach((g) => g?.destroy()); }, []);

  /* ───────────────── Formulaire création / édition — Urgence ────── */
  const [urgenceSelectionnee, setUrgenceSelectionnee] = useState(null);
  const [modaleUrgenceOuverte, setModaleUrgenceOuverte] = useState(false);
  const [modeEditionUrgence, setModeEditionUrgence] = useState(false);
  const [urgenceEnEdition, setUrgenceEnEdition] = useState(null);
  const [formulaireUrgence, setFormulaireUrgence] = useState(FORMULAIRE_URGENCE_VIDE);
  const [envoiUrgenceEnCours, setEnvoiUrgenceEnCours] = useState(false);
  const [erreurFormulaireUrgence, setErreurFormulaireUrgence] = useState(null);
  const [cibleSuppressionUrgence, setCibleSuppressionUrgence] = useState(null);
  const [suppressionUrgenceEnCours, setSuppressionUrgenceEnCours] = useState(false);

  function ouvrirCreationUrgence() {
    setModeEditionUrgence(false);
    setUrgenceEnEdition(null);
    setFormulaireUrgence({
      ...FORMULAIRE_URGENCE_VIDE,
      pays_id: filtresAppliques.pays_id || "",
      type_urgence_id: filtresAppliques.type_urgence_id || "",
    });
    setErreurFormulaireUrgence(null);
    setModaleUrgenceOuverte(true);
  }

  function ouvrirEditionUrgence(urgence) {
    setModeEditionUrgence(true);
    setUrgenceEnEdition(urgence);
    setFormulaireUrgence({
      type_urgence_id: urgence.type_urgence_id ?? "",
      pays_id: urgence.pays_id ?? "",
      libelle: urgence.libelle ?? "",
      description: urgence.description ?? "",
      telephone: urgence.telephone ?? "",
    });
    setErreurFormulaireUrgence(null);
    setModaleUrgenceOuverte(true);
    setUrgenceSelectionnee(null);
  }

  function fermerModaleUrgence() { setModaleUrgenceOuverte(false); setErreurFormulaireUrgence(null); }
  function modifierChampUrgence(champ, valeur) { setFormulaireUrgence((p) => ({ ...p, [champ]: valeur })); }

  async function soumettreFormulaireUrgence(evenement) {
    evenement.preventDefault();
    setErreurFormulaireUrgence(null);

    const manquants = [];
    if (!formulaireUrgence.type_urgence_id) manquants.push("type d'urgence");
    if (!formulaireUrgence.pays_id) manquants.push("pays");
    if (!formulaireUrgence.libelle.trim()) manquants.push("libellé");
    if (!formulaireUrgence.telephone.trim()) manquants.push("téléphone");
    if (manquants.length) {
      setErreurFormulaireUrgence(`Champ(s) manquant(s) : ${manquants.join(", ")}.`);
      return;
    }

    setEnvoiUrgenceEnCours(true);
    try {
      const donnees = {
        type_urgence_id: formulaireUrgence.type_urgence_id,
        pays_id: formulaireUrgence.pays_id,
        libelle: formulaireUrgence.libelle.trim(),
        description: formulaireUrgence.description.trim(),
        telephone: formulaireUrgence.telephone.trim(),
      };
      if (modeEditionUrgence) await modifierUrgence(urgenceEnEdition.urgence_id, donnees);
      else await creerUrgence(donnees);
      setModaleUrgenceOuverte(false);
      await chargerUrgences();
    } catch (err) {
      setErreurFormulaireUrgence(err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setEnvoiUrgenceEnCours(false);
    }
  }

  async function confirmerSuppressionUrgence() {
    if (!cibleSuppressionUrgence) return;
    setSuppressionUrgenceEnCours(true);
    try {
      await supprimerUrgence(cibleSuppressionUrgence.urgence_id);
      setCibleSuppressionUrgence(null);
      if (urgenceSelectionnee?.urgence_id === cibleSuppressionUrgence.urgence_id) setUrgenceSelectionnee(null);
      await chargerUrgences();
    } catch (err) {
      setErreur(err.message || "Impossible de supprimer cette urgence.");
      setCibleSuppressionUrgence(null);
    } finally {
      setSuppressionUrgenceEnCours(false);
    }
  }

  /* ───────────────── Formulaire création / édition — Type ───────── */
  const [modaleTypeOuverte, setModaleTypeOuverte] = useState(false);
  const [modeEditionType, setModeEditionType] = useState(false);
  const [typeEnEdition, setTypeEnEdition] = useState(null);
  const [formulaireType, setFormulaireType] = useState(FORMULAIRE_TYPE_VIDE);
  const [envoiTypeEnCours, setEnvoiTypeEnCours] = useState(false);
  const [erreurFormulaireType, setErreurFormulaireType] = useState(null);
  const [cibleSuppressionType, setCibleSuppressionType] = useState(null);
  const [suppressionTypeEnCours, setSuppressionTypeEnCours] = useState(false);

  function ouvrirCreationType() {
    setModeEditionType(false);
    setTypeEnEdition(null);
    setFormulaireType(FORMULAIRE_TYPE_VIDE);
    setErreurFormulaireType(null);
    setModaleTypeOuverte(true);
  }

  function ouvrirEditionType(type) {
    setModeEditionType(true);
    setTypeEnEdition(type);
    setFormulaireType({ libelle: type.libelle ?? "", description: type.description ?? "" });
    setErreurFormulaireType(null);
    setModaleTypeOuverte(true);
  }

  function fermerModaleType() { setModaleTypeOuverte(false); setErreurFormulaireType(null); }

  async function soumettreFormulaireType(evenement) {
    evenement.preventDefault();
    setErreurFormulaireType(null);
    if (!formulaireType.libelle.trim()) {
      setErreurFormulaireType("Le libellé est obligatoire.");
      return;
    }
    setEnvoiTypeEnCours(true);
    try {
      const donnees = { libelle: formulaireType.libelle.trim(), description: formulaireType.description.trim() };
      if (modeEditionType) await modifierTypeUrgence(typeEnEdition.type_urgence_id, donnees);
      else await creerTypeUrgence(donnees);
      setModaleTypeOuverte(false);
      await chargerTypes();
    } catch (err) {
      setErreurFormulaireType(err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setEnvoiTypeEnCours(false);
    }
  }

  // Un type encore rattaché à au moins une urgence ne peut pas être
  // supprimé côté backend (contrainte d'intégrité) — on le signale
  // avant même d'envoyer la requête pour éviter un aller-retour inutile.
  function nbUrgencesPourType(typeUrgenceId) {
    return urgences.filter((u) => u.type_urgence_id === typeUrgenceId).length;
  }

  async function confirmerSuppressionType() {
    if (!cibleSuppressionType) return;
    setSuppressionTypeEnCours(true);
    try {
      await supprimerTypeUrgence(cibleSuppressionType.type_urgence_id);
      setCibleSuppressionType(null);
      await chargerTypes();
    } catch (err) {
      setErreur(err.message || "Impossible de supprimer ce type d'urgence.");
      setCibleSuppressionType(null);
    } finally {
      setSuppressionTypeEnCours(false);
    }
  }

  function exporterCsv() {
    const entetes = ["Libellé", "Type", "Pays", "Téléphone", "Description"];
    const lignes = urgencesTriees.map((u) => [
      u.libelle, typeDe(u), nomPaysDe(u), u.telephone, u.description,
    ]);
    const csv = [entetes, ...lignes]
      .map((ligne) => ligne.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(blob);
    lien.download = "urgences.csv";
    lien.click();
    URL.revokeObjectURL(lien.href);
  }

  return (
    <>
      <main className="aps-content">
        {/* =====================================================
             EN-TÊTE DE PAGE
             ===================================================== */}
        <div className="aps-page-header">
          <div>
            <nav className="aps-breadcrumb">
              <a href="dashboard.html">Tableau de bord</a>
              <span className="sep">/</span>
              <span>Urgences</span>
            </nav>
            <h1>Urgences</h1>
            <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
              Numéros d'urgence par pays et par type (police, pompiers, ambulance…).
            </p>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-light" type="button" onClick={exporterCsv}>
              <i className="fa-solid fa-file-export me-1"></i> Exporter
            </button>
            {peutEcrire && onglet === "types" && (
              <button className="btn btn-outline-primary" type="button" onClick={ouvrirCreationType}>
                <i className="fa-solid fa-plus me-1"></i> Nouveau type
              </button>
            )}
            {peutEcrire && onglet === "urgences" && (
              <button className="btn btn-primary" type="button" onClick={ouvrirCreationUrgence}>
                <i className="fa-solid fa-plus me-1"></i> Nouvelle urgence
              </button>
            )}
          </div>
        </div>

        {/* =====================================================
             KPI PRINCIPAUX
             ===================================================== */}
        <div className="row g-3 mb-4">
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-primary"><i className="fa-solid fa-phone-volume"></i></div>
                <span className="aps-badge is-info"><i className="fa-solid fa-circle"></i> Total</span>
              </div>
              <div className="aps-kpi__label">Numéros d'urgence</div>
              <div className="aps-kpi__value">{kpi.total.toLocaleString("fr-FR")}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-success"><i className="fa-solid fa-list-check"></i></div>
                <span className="aps-badge is-success"><i className="fa-solid fa-circle"></i> Config</span>
              </div>
              <div className="aps-kpi__label">Types d'urgence</div>
              <div className="aps-kpi__value">{kpi.totalTypes.toLocaleString("fr-FR")}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-primary"><i className="fa-solid fa-globe"></i></div>
                <span className="aps-badge is-info"><i className="fa-solid fa-circle"></i> Couverture</span>
              </div>
              <div className="aps-kpi__label">Pays couverts</div>
              <div className="aps-kpi__value">{kpi.paysDistincts.toLocaleString("fr-FR")}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-warning"><i className="fa-solid fa-triangle-exclamation"></i></div>
                <span className="aps-badge is-warning"><i className="fa-solid fa-circle"></i> À vérifier</span>
              </div>
              <div className="aps-kpi__label">Sans téléphone renseigné</div>
              <div className="aps-kpi__value">{kpi.sansTelephone.toLocaleString("fr-FR")}</div>
            </div>
          </div>
        </div>

        {/* =====================================================
             GRAPHIQUES CHART.JS
             ===================================================== */}
        {/* <div className="row g-3 mb-4">
          <div className="col-lg-6">
            <div className="aps-card h-100">
              <div className="aps-card__header"><h3>Urgences par type</h3></div>
              <div className="aps-card__body">
                <div style={{ position: "relative", height: 260 }}>
                  <canvas ref={refGraphType}></canvas>
                </div>
              </div>
            </div>
          </div>
          <div className="col-lg-6">
            <div className="aps-card h-100">
              <div className="aps-card__header"><h3>Urgences par pays</h3></div>
              <div className="aps-card__body">
                <div style={{ position: "relative", height: 260 }}>
                  <canvas ref={refGraphPays}></canvas>
                </div>
              </div>
            </div>
          </div>
        </div> */}

        {erreur && (
          <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreur}</div></div>
        )}

        {/* =====================================================
             ONGLETS
             ===================================================== */}
        <ul className="nav nav-tabs aps-urg-tabs mb-3">
          <li className="nav-item">
            <button type="button" className={`nav-link ${onglet === "urgences" ? "active" : ""}`} onClick={() => setOnglet("urgences")}>
              <i className="fa-solid fa-phone-volume me-1"></i> Urgences
            </button>
          </li>
          <li className="nav-item">
            <button type="button" className={`nav-link ${onglet === "types" ? "active" : ""}`} onClick={() => setOnglet("types")}>
              <i className="fa-solid fa-list-check me-1"></i> Types d'urgence
            </button>
          </li>
        </ul>

        {/* =====================================================
             ONGLET — URGENCES
             ===================================================== */}
        {onglet === "urgences" && (
          <>
            <div className="aps-card mb-3">
              <div className="aps-card__body">
                <div className="row g-3 align-items-end">
                  <div className="col-md-4">
                    <label className="form-label">Pays</label>
                    <select className="form-select" value={filtres.pays_id} onChange={(e) => modifierFiltre("pays_id", e.target.value)}>
                      <option value="">Tous</option>
                      {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Type d'urgence</label>
                    <select className="form-select" value={filtres.type_urgence_id} onChange={(e) => modifierFiltre("type_urgence_id", e.target.value)}>
                      <option value="">Tous</option>
                      {typesUrgence.map((t) => <option key={t.type_urgence_id} value={t.type_urgence_id}>{t.libelle}</option>)}
                    </select>
                  </div>
                  <div className="col-md-4 d-flex gap-2">
                    <button className="btn btn-outline-primary flex-grow-1" type="button" onClick={appliquerFiltres}>Filtrer</button>
                    <button className="btn btn-light" type="button" title="Réinitialiser" onClick={reinitialiserFiltres}>
                      <i className="fa-solid fa-rotate-left"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="d-flex align-items-center justify-content-between mb-3">
              <div className="aps-text-muted" style={{ fontSize: 13 }}>
                {chargementUrgences ? "Chargement…" : (
                  <>Affichage de <strong className="aps-text-strong">{debutAffichage}–{finAffichage}</strong> sur{" "}
                    <strong className="aps-text-strong">{urgencesTriees.length}</strong> urgences</>
                )}
              </div>
              <div className="d-flex gap-2 align-items-center">
                <label className="aps-text-muted" style={{ fontSize: 13 }}>Trier par :</label>
                <select className="form-select form-select-sm" style={{ width: "auto" }} value={tri} onChange={(e) => setTri(e.target.value)}>
                  <option value="libelle_asc">Libellé (A → Z)</option>
                  <option value="type">Type d'urgence</option>
                  <option value="pays">Pays</option>
                </select>
              </div>
            </div>

            <div className="aps-card">
              <div className="table-responsive">
                <table className="table aps-table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Urgence</th>
                      <th>Type</th>
                      <th>Pays</th>
                      <th>Téléphone</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!chargementUrgences && urgencesPage.length === 0 && (
                      <tr><td colSpan={5} className="text-center aps-text-muted py-5">Aucune urgence ne correspond à ces critères.</td></tr>
                    )}
                    {urgencesPage.map((urgence) => {
                      const couleur = couleurPourType(urgence.type_urgence_id, typesUrgence);
                      return (
                        <tr key={urgence.urgence_id}>
                          <td>
                            <div className="fw-semibold">{urgence.libelle}</div>
                            {urgence.description && (
                              <div className="aps-text-muted aps-urg-desc-tronquee">{urgence.description}</div>
                            )}
                          </td>
                          <td>
                            <span className="aps-urg-type-badge" style={{ "--aps-urg-couleur": couleur }}>
                              <i className={`fa-solid ${iconePourType(typeDe(urgence))}`}></i>
                              {typeDe(urgence)}
                            </span>
                          </td>
                          <td>{nomPaysDe(urgence)}</td>
                          <td>
                            <a href={`tel:${urgence.telephone}`} className="aps-urg-telephone">
                              <i className="fa-solid fa-phone me-1"></i>{urgence.telephone || "—"}
                            </a>
                          </td>
                          <td className="text-end">
                            <div className="d-flex gap-1 justify-content-end">
                              <button className="btn btn-sm btn-light" title="Voir" onClick={() => setUrgenceSelectionnee(urgence)}>
                                <i className="fa-solid fa-eye"></i>
                              </button>
                              {peutEcrire && (
                                <button className="btn btn-sm btn-light" title="Modifier" onClick={() => ouvrirEditionUrgence(urgence)}>
                                  <i className="fa-solid fa-pen"></i>
                                </button>
                              )}
                              {peutSupprimer && (
                                <button className="btn btn-sm btn-light" title="Supprimer" onClick={() => setCibleSuppressionUrgence(urgence)}>
                                  <i className="fa-solid fa-trash"></i>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination (client, l'API ne pagine pas côté serveur) */}
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
          </>
        )}

        {/* =====================================================
             ONGLET — TYPES D'URGENCE
             ===================================================== */}
        {onglet === "types" && (
          <div className="aps-card">
            <div className="table-responsive">
              <table className="table aps-table align-middle mb-0">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Urgences liées</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!chargementTypes && typesUrgence.length === 0 && (
                    <tr><td colSpan={4} className="text-center aps-text-muted py-5">Aucun type d'urgence configuré.</td></tr>
                  )}
                  {typesUrgence.map((type) => (
                    <tr key={type.type_urgence_id}>
                      <td>
                        <span className="aps-urg-type-badge" style={{ "--aps-urg-couleur": couleurPourType(type.type_urgence_id, typesUrgence) }}>
                          <i className={`fa-solid ${iconePourType(type.libelle)}`}></i>
                          {type.libelle}
                        </span>
                      </td>
                      <td className="aps-text-muted">{type.description || "—"}</td>
                      <td>{nbUrgencesPourType(type.type_urgence_id)}</td>
                      <td className="text-end">
                        <div className="d-flex gap-1 justify-content-end">
                          {peutEcrire && (
                            <button className="btn btn-sm btn-light" title="Modifier" onClick={() => ouvrirEditionType(type)}>
                              <i className="fa-solid fa-pen"></i>
                            </button>
                          )}
                          {peutSupprimer && (
                            <button className="btn btn-sm btn-light" title="Supprimer" onClick={() => setCibleSuppressionType(type)}>
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* =========================================================
           MODALE — FICHE DÉTAIL URGENCE
           ========================================================= */}
      {urgenceSelectionnee && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={() => setUrgenceSelectionnee(null)}>
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content aps-urg-fiche">
                <div className="modal-header">
                  <div>
                    <h5 className="modal-title mb-1">{urgenceSelectionnee.libelle}</h5>
                    <span className="aps-urg-type-badge" style={{ "--aps-urg-couleur": couleurPourType(urgenceSelectionnee.type_urgence_id, typesUrgence) }}>
                      <i className={`fa-solid ${iconePourType(typeDe(urgenceSelectionnee))}`}></i>
                      {typeDe(urgenceSelectionnee)}
                    </span>
                  </div>
                  <button type="button" className="btn-close" onClick={() => setUrgenceSelectionnee(null)}></button>
                </div>
                <div className="modal-body">
                  <div className="aps-urg-info-grid">
                    <div className="aps-urg-info-item">
                      <i className="fa-solid fa-phone"></i>
                      <div>
                        <div className="aps-urg-info-label">Téléphone</div>
                        <a href={`tel:${urgenceSelectionnee.telephone}`} className="aps-urg-info-valeur">
                          {urgenceSelectionnee.telephone || "—"}
                        </a>
                      </div>
                    </div>
                    <div className="aps-urg-info-item">
                      <i className="fa-solid fa-globe"></i>
                      <div>
                        <div className="aps-urg-info-label">Pays</div>
                        <div className="aps-urg-info-valeur">{nomPaysDe(urgenceSelectionnee)}</div>
                      </div>
                    </div>
                  </div>
                  {urgenceSelectionnee.description && (
                    <>
                      <div className="aps-urg-section-titre">Description</div>
                      <p className="mb-0" style={{ fontSize: 14 }}>{urgenceSelectionnee.description}</p>
                    </>
                  )}
                </div>
                <div className="modal-footer">
                  {peutEcrire && (
                    <button type="button" className="btn btn-primary" onClick={() => ouvrirEditionUrgence(urgenceSelectionnee)}>
                      <i className="fa-solid fa-pen me-1"></i> Modifier
                    </button>
                  )}
                  <button type="button" className="btn btn-light" onClick={() => setUrgenceSelectionnee(null)}>Fermer</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — CRÉATION / ÉDITION URGENCE
           ========================================================= */}
      {modaleUrgenceOuverte && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={fermerModaleUrgence}>
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <form className="modal-content" onSubmit={soumettreFormulaireUrgence}>
                <div className="modal-header">
                  <h5 className="modal-title">{modeEditionUrgence ? "Modifier l'urgence" : "Nouvelle urgence"}</h5>
                  <button type="button" className="btn-close" onClick={fermerModaleUrgence}></button>
                </div>
                <div className="modal-body">
                  {erreurFormulaireUrgence && (
                    <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreurFormulaireUrgence}</div></div>
                  )}
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Type d'urgence</label>
                      <select className="form-select" required value={formulaireUrgence.type_urgence_id}
                              onChange={(e) => modifierChampUrgence("type_urgence_id", e.target.value)}>
                        <option value="" disabled>Choisir…</option>
                        {typesUrgence.map((t) => <option key={t.type_urgence_id} value={t.type_urgence_id}>{t.libelle}</option>)}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Pays</label>
                      <select className="form-select" required value={formulaireUrgence.pays_id}
                              onChange={(e) => modifierChampUrgence("pays_id", e.target.value)}>
                        <option value="" disabled>Choisir…</option>
                        {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Libellé</label>
                      <input type="text" className="form-control" required value={formulaireUrgence.libelle}
                             onChange={(e) => modifierChampUrgence("libelle", e.target.value)}
                             placeholder="Ex. Police secours" />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Téléphone</label>
                      <input type="tel" className="form-control" required value={formulaireUrgence.telephone}
                             onChange={(e) => modifierChampUrgence("telephone", e.target.value)}
                             placeholder="Ex. 117" />
                    </div>
                    <div className="col-12">
                      <label className="form-label">Description <span className="aps-text-muted">(optionnel)</span></label>
                      <textarea className="form-control" rows={3} value={formulaireUrgence.description}
                                onChange={(e) => modifierChampUrgence("description", e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={fermerModaleUrgence}>Annuler</button>
                  <button type="submit" className="btn btn-primary" disabled={envoiUrgenceEnCours}>
                    {envoiUrgenceEnCours ? "Enregistrement…" : modeEditionUrgence ? "Enregistrer" : "Créer l'urgence"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — CRÉATION / ÉDITION TYPE D'URGENCE
           ========================================================= */}
      {modaleTypeOuverte && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={fermerModaleType}>
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <form className="modal-content" onSubmit={soumettreFormulaireType}>
                <div className="modal-header">
                  <h5 className="modal-title">{modeEditionType ? "Modifier le type d'urgence" : "Nouveau type d'urgence"}</h5>
                  <button type="button" className="btn-close" onClick={fermerModaleType}></button>
                </div>
                <div className="modal-body">
                  {erreurFormulaireType && (
                    <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreurFormulaireType}</div></div>
                  )}
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label">Libellé</label>
                      <input type="text" className="form-control" required value={formulaireType.libelle}
                             onChange={(e) => setFormulaireType((p) => ({ ...p, libelle: e.target.value }))}
                             placeholder="Ex. Ambulance" />
                    </div>
                    <div className="col-12">
                      <label className="form-label">Description <span className="aps-text-muted">(optionnel)</span></label>
                      <textarea className="form-control" rows={3} value={formulaireType.description}
                                onChange={(e) => setFormulaireType((p) => ({ ...p, description: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={fermerModaleType}>Annuler</button>
                  <button type="submit" className="btn btn-primary" disabled={envoiTypeEnCours}>
                    {envoiTypeEnCours ? "Enregistrement…" : modeEditionType ? "Enregistrer" : "Créer le type"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — CONFIRMATION SUPPRESSION URGENCE (superadmin)
           ========================================================= */}
      {cibleSuppressionUrgence && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={() => setCibleSuppressionUrgence(null)}>
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Supprimer cette urgence ?</h5>
                  <button type="button" className="btn-close" onClick={() => setCibleSuppressionUrgence(null)}></button>
                </div>
                <div className="modal-body">
                  <p className="mb-0">
                    L'urgence « {cibleSuppressionUrgence.libelle} » ({nomPaysDe(cibleSuppressionUrgence)}) sera définitivement supprimée.
                  </p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={() => setCibleSuppressionUrgence(null)}>Annuler</button>
                  <button type="button" className="btn btn-danger" onClick={confirmerSuppressionUrgence} disabled={suppressionUrgenceEnCours}>
                    {suppressionUrgenceEnCours ? "Suppression…" : "Supprimer définitivement"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — CONFIRMATION SUPPRESSION TYPE (superadmin)
           ========================================================= */}
      {cibleSuppressionType && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={() => setCibleSuppressionType(null)}>
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Supprimer ce type d'urgence ?</h5>
                  <button type="button" className="btn-close" onClick={() => setCibleSuppressionType(null)}></button>
                </div>
                <div className="modal-body">
                  <p className="mb-2">Le type « {cibleSuppressionType.libelle} » sera définitivement supprimé.</p>
                  {nbUrgencesPourType(cibleSuppressionType.type_urgence_id) > 0 && (
                    <div className="aps-notice is-warning">
                      <i className="fa-solid fa-triangle-exclamation"></i>
                      <div>
                        {nbUrgencesPourType(cibleSuppressionType.type_urgence_id)} urgence(s) utilisent encore ce type.
                        Le backend refusera probablement la suppression tant qu'elles ne sont pas reclassées ou supprimées.
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={() => setCibleSuppressionType(null)}>Annuler</button>
                  <button type="button" className="btn btn-danger" onClick={confirmerSuppressionType} disabled={suppressionTypeEnCours}>
                    {suppressionTypeEnCours ? "Suppression…" : "Supprimer définitivement"}
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