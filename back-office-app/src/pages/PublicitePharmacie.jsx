// src/components/PublicitePharmacie.jsx
//
// Reprend la structure et le design system APS (Bootstrap 5) de
// Pharmacie.jsx / StructureSante.jsx — même logique, mêmes
// conventions — adapté au sous-module "Pharmacie — Publicité"
// (table publicite_pharmacie) et branché sur publiciteService.js.
//
// Particularités du modèle de droits (voir publicite.controller.js) :
//   - Lecture PUBLIQUE mais restreinte selon qui consulte : un tiers
//     (visiteur, ou utilisateur qui n'est ni l'agent de la pharmacie
//     concernée ni admin/superadmin) ne reçoit QUE les publicités
//     "validee". L'agent-propriétaire et l'admin/superadmin voient
//     tout le cycle de vie (en_attente / validee / rejetee), mais
//     UNIQUEMENT lorsqu'ils interrogent l'API filtrée sur leur
//     `pharmacie_id` (sinon le serveur applique la vue "grand public").
//     => Le filtre "Pharmacie" ci-dessous n'est donc pas un simple
//     confort UX ici : c'est ce qui déclenche, côté serveur, la vue
//     complète pour un agent qui veut suivre sa propre campagne.
//   - Création : agent de la pharmacie ou admin/superadmin. Toujours
//     "en_attente" à la création, sauf pour admin/superadmin qui peut
//     publier directement.
//   - Modification : l'agent-propriétaire ajuste dates + visuel tant
//     que la publicité n'a pas encore été modérée (409 sinon) ;
//     admin/superadmin change librement statut_moderation à tout
//     moment, mais ne touche jamais au visuel lui-même.
//   - Suppression : admin/superadmin uniquement.
//
// Hypothèses reprises de Pharmacie.jsx (non fournies ici, donc à
// vérifier) :
//   - Bootstrap 5 (CSS + JS bundle) et Font Awesome sont déjà chargés
//     globalement par le layout parent.
//   - admin.css définit les classes aps-* utilisées telles quelles.
//   - "chart.js" est une dépendance du projet ("chart.js/auto").
//
// Écarts assumés faute de schéma/service dédiés fournis pour
// formule_publicitaire et transaction_paiement :
//   - `formule_publicitaire_id` et `transaction_id` sont saisis comme
//     identifiants texte (la publicité est "toujours adossée à une
//     transaction_paiement déjà existante" — voir l'en-tête de
//     publicite.controller.js — donc créée en aval d'un autre écran de
//     paiement/abonnement qui produit cet identifiant, pas ici).
//   - L'objet `formule_publicitaire` inclus dans la réponse API est
//     affiché de façon défensive (plusieurs noms de champ plausibles
//     essayés) puisque son schéma exact n'est pas fourni.
//   - `pharmacie_id` est choisi dans un select alimenté par
//     pharmacieService.listerPharmacies (déjà public) plutôt que
//     saisi à la main.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Chart from "chart.js/auto";
import { useAuth } from "../context/AuthContext";
import {
  listerPublicitesPharmacie,
  creerPublicitePharmacie,
  modifierPublicitePharmacie,
  supprimerPublicitePharmacie,
  listerPagesWebsite,
  listerPays,
  STATUTS_MODERATION_PUBLICITE,
} from "../services/publiciteService.js";
import { listerPharmacies } from "../services/pharmacieService.js";

const STATUT_META = {
  validee: { libelle: "Validée", badge: "is-success", detailClasse: "aps-status-verified", detailIcone: "fa-circle-check" },
  en_attente: { libelle: "En attente", badge: "is-warning", detailClasse: "aps-status-pending", detailIcone: "fa-hourglass-half" },
  rejetee: { libelle: "Rejetée", badge: "is-danger", detailClasse: "aps-status-rejected", detailIcone: "fa-circle-xmark" },
};

const COULEURS_GRAPHIQUE = {
  primary: "#1C8FE0", teal: "#17B6C4", success: "#1B8A4B",
  warning: "#B7791F", danger: "#E5484D", violet: "#8B5CF6",
  text500: "#6B7280", border: "#E7EAF0",
};

const FORMULAIRE_VIDE = {
  pharmacie_id: "", page_web_id: "", formule_publicitaire_id: "",
  date_debut: "", date_fin: "", transaction_id: "",
  statut_moderation: "en_attente",
  // Fichier (voir CHAMP_FICHIER_VISUEL côté service) : obligatoire à
  // la création, optionnel en édition (n'envoyer que pour remplacer).
  visuel: null,
};

const TAILLES_PAGE = [8, 16, 32];

/**
 * Styles scoping la fiche détail (modale "MODALE — FICHE DÉTAIL").
 * Injectés en ligne, préfixés "aps-fiche-" pour ne pas entrer en
 * collision avec admin.css — identiques à Pharmacie.jsx pour rester
 * cohérent avec le reste du design system.
 */
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

/**
 * Extrait un nom de rôle (en minuscules) depuis un objet utilisateur,
 * quelle que soit la forme exacte sous laquelle il a été stocké après
 * connexion — même logique que Pharmacie.jsx / StructureSante.jsx,
 * dupliquée ici pour ne pas introduire de dépendance croisée entre
 * composants.
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

function useRoleUtilisateur() {
  const { user, isAuthenticated } = useAuth();
  return {
    role: extraireNomRole(user),
    estConnecte: isAuthenticated,
  };
}

/** Formate une date ISO (ou déjà "YYYY-MM-DD") pour un <input type="date">. */
function versDateInput(valeur) {
  if (!valeur) return "";
  const chaine = typeof valeur === "string" ? valeur : new Date(valeur).toISOString();
  return chaine.slice(0, 10);
}

/** Formate une date pour l'affichage lecture seule (fiche détail). */
function formaterDate(valeur) {
  if (!valeur) return "—";
  try {
    return new Date(valeur).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return "—";
  }
}

/** Libellé défensif de la formule publicitaire : le schéma exact de
 * `formule_publicitaire` n'est pas fourni, on essaie plusieurs noms de
 * champ plausibles avant de retomber sur l'identifiant brut. */
function libelleFormule(publicite) {
  const f = publicite?.formule_publicitaire;
  if (!f) return publicite?.formule_publicitaire_id || "—";
  return f.nom || f.libelle || f.titre || publicite.formule_publicitaire_id || "—";
}

export default function PublicitePharmacie() {
  const { role, estConnecte } = useRoleUtilisateur();
  const peutModererTout = role === "admin" || role === "superadmin";
  // Création et modification "dates + visuel" : ouvertes à tout
  // utilisateur connecté — le serveur vérifie ensuite s'il est bien
  // l'agent de la pharmacie ciblée (estAgentDeLaPharmacie) ou
  // admin/superadmin ; un refus se traduit ici par le message d'erreur
  // renvoyé par l'API (403), affiché tel quel dans le formulaire.
  const peutCreer = estConnecte;
  const peutModifier = estConnecte;
  const peutSupprimer = peutModererTout;

  const [publicites, setPublicites] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const [filtres, setFiltres] = useState({
    pharmacie_id: "", page_web_id: "", pays_id: "", statut_moderation: "",
  });
  const [filtresAppliques, setFiltresAppliques] = useState(filtres);

  const [pharmacies, setPharmacies] = useState([]);
  const [pages, setPages] = useState([]);
  const [pays, setPays] = useState([]);

  const [tri, setTri] = useState("date_debut_desc");
  const [page, setPage] = useState(1);
  const [parPage, setParPage] = useState(8);

  const [publiciteSelectionnee, setPubliciteSelectionnee] = useState(null);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [modeEdition, setModeEdition] = useState(false);
  const [publiciteEnEdition, setPubliciteEnEdition] = useState(null); // objet original, pour connaître son statut_moderation
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
      const resultat = await listerPublicitesPharmacie(filtresAppliques);
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
    listerPharmacies({}).then(setPharmacies).catch(() => setPharmacies([]));
  }, []);

  useEffect(() => {
    listerPagesWebsite().then(setPages).catch(() => setPages([]));
  }, []);

  useEffect(() => {
    listerPays().then(setPays).catch(() => setPays([]));
  }, []);

  function nomPharmacie(pharmacieId) {
    return pharmacies.find((p) => p.pharmacie_id === pharmacieId)?.nom || pharmacieId || "—";
  }

  function modifierFiltre(champ, valeur) {
    setFiltres((p) => ({ ...p, [champ]: valeur }));
  }

  function appliquerFiltres() { setFiltresAppliques(filtres); }

  function reinitialiserFiltres() {
    const vide = { pharmacie_id: "", page_web_id: "", pays_id: "", statut_moderation: "" };
    setFiltres(vide);
    setFiltresAppliques(vide);
  }

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

  /* ─── KPI (calculés depuis le jeu déjà chargé, respectant les
       filtres appliqués — le serveur ne renvoie de toute façon jamais
       plus que ce que l'utilisateur courant est autorisé à voir) ─── */

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
    const parPage_ = {};
    publicites.forEach((p) => {
      const libelle = p.page_web?.libelle || "—";
      parPage_[libelle] = (parPage_[libelle] || 0) + 1;
    });
    const entrees = Object.entries(parPage_).sort((a, b) => b[1] - a[1]).slice(0, 6);

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
    });
  }, [publicites]);

  useEffect(() => () => {
    Object.values(instancesGraph.current).forEach((g) => g?.destroy());
  }, []);

  /* ─── Formulaire création / édition ────────────────────────── */

  function ouvrirCreation() {
    setModeEdition(false);
    setPubliciteEnEdition(null);
    setFormulaire({
      ...FORMULAIRE_VIDE,
      // Pré-sélectionne la pharmacie déjà filtrée pour limiter les
      // erreurs de saisie quand on gère la campagne d'une pharmacie
      // précise.
      pharmacie_id: filtresAppliques.pharmacie_id || "",
      // Un agent (non admin) ne peut de toute façon jamais publier
      // directement : le champ ne lui est même pas proposé (voir plus
      // bas), donc peu importe la valeur par défaut ici.
    });
    setVisuelExistantUrl(null);
    setErreurFormulaire(null);
    setModaleOuverte(true);
  }

  function ouvrirEdition(publicite) {
    setModeEdition(true);
    setPubliciteEnEdition(publicite);
    setFormulaire({
      pharmacie_id: publicite.pharmacie_id ?? "",
      page_web_id: publicite.page_web_id ?? "",
      formule_publicitaire_id: publicite.formule_publicitaire_id ?? "",
      date_debut: versDateInput(publicite.date_debut),
      date_fin: versDateInput(publicite.date_fin),
      transaction_id: publicite.transaction_id ?? "",
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

  function modifierFichierFormulaire(fichier) {
    setFormulaire((p) => ({ ...p, visuel: fichier ?? null }));
  }

  // Tant que la modération n'a pas encore eu lieu, un agent-propriétaire
  // peut encore ajuster ses dates/visuel ; une fois modérée, seul
  // admin/superadmin agit dessus (statut_moderation) — voir l'en-tête
  // du contrôleur. En édition, on affiche donc soit le bloc
  // "dates + visuel" (agent, tant que en_attente), soit le bloc
  // "statut de modération" (admin/superadmin), jamais les deux.
  const editionVerrouilleePourAgent = modeEdition && !peutModererTout && publiciteEnEdition?.statut_moderation !== "en_attente";

  async function soumettreFormulaire(evenement) {
    evenement.preventDefault();
    setErreurFormulaire(null);

    if (!modeEdition) {
      const manquants = [];
      if (!formulaire.pharmacie_id) manquants.push("pharmacie");
      if (!formulaire.page_web_id) manquants.push("emplacement (page du site)");
      if (!formulaire.formule_publicitaire_id || !formulaire.formule_publicitaire_id.trim()) manquants.push("formule publicitaire");
      if (!formulaire.date_debut) manquants.push("date de début");
      if (!formulaire.date_fin) manquants.push("date de fin");
      if (!formulaire.transaction_id || !formulaire.transaction_id.trim()) manquants.push("transaction de paiement");
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
      if (modeEdition) {
        if (peutModererTout) {
          // Admin/superadmin : ne touche qu'au statut de modération.
          await modifierPublicitePharmacie(publiciteEnEdition.publicite_id, {
            statut_moderation: formulaire.statut_moderation,
          });
        } else {
          // Agent-propriétaire : dates + visuel (le serveur renverra
          // un 409 explicite si la publicité a été modérée entre
          // temps par quelqu'un d'autre).
          const donnees = {};
          if (formulaire.date_debut) donnees.date_debut = formulaire.date_debut;
          if (formulaire.date_fin) donnees.date_fin = formulaire.date_fin;
          if (formulaire.visuel) donnees.visuel = formulaire.visuel;
          await modifierPublicitePharmacie(publiciteEnEdition.publicite_id, donnees);
        }
      } else {
        const donnees = {
          pharmacie_id: formulaire.pharmacie_id,
          page_web_id: formulaire.page_web_id,
          formule_publicitaire_id: formulaire.formule_publicitaire_id,
          date_debut: formulaire.date_debut,
          date_fin: formulaire.date_fin,
          transaction_id: formulaire.transaction_id,
          visuel: formulaire.visuel,
          // Seul admin/superadmin peut publier directement — envoyé
          // uniquement dans ce cas (sinon toujours forcé "en_attente"
          // côté serveur, l'envoyer ne servirait à rien pour les
          // autres profils).
          ...(peutModererTout ? { statut_moderation: formulaire.statut_moderation } : {}),
        };
        await creerPublicitePharmacie(donnees);
      }
      setModaleOuverte(false);
      await chargerPublicites();
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
      await supprimerPublicitePharmacie(cibleSuppression.publicite_id);
      setCibleSuppression(null);
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
    const entetes = ["Pharmacie", "Emplacement", "Statut", "Début", "Fin", "Transaction"];
    const lignes = publicitesTriees.map((p) => [
      nomPharmacie(p.pharmacie_id),
      p.page_web?.libelle || "",
      STATUT_META[p.statut_moderation]?.libelle || p.statut_moderation,
      versDateInput(p.date_debut), versDateInput(p.date_fin), p.transaction_id,
    ]);
    const csv = [entetes, ...lignes]
      .map((ligne) => ligne.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(blob);
    lien.download = "publicites-pharmacie.csv";
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
            <span>Pharmacie</span>
            <span className="sep">/</span>
            <span>Publicités</span>
          </nav>
          <h1>Publicités pharmacie</h1>
          <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
            Encarts publicitaires diffusés par les pharmacies sur les pages du site.
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

      {!peutModererTout && !filtresAppliques.pharmacie_id && (
        <div className="aps-notice is-info mb-4">
          <i className="fa-solid fa-circle-info"></i>
          <div>
            Vous voyez ici uniquement les publicités <strong>validées</strong> (vue grand public).
            Pour suivre le cycle complet de vos propres campagnes (en attente / rejetées incluses),
            filtrez ci-dessous sur votre pharmacie.
          </div>
        </div>
      )}

      {/* =========================================================
           KPI PRINCIPAUX
           ========================================================= */}
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

      {/* =========================================================
           GRAPHIQUES CHART.JS (calculés depuis les publicités chargées)
           ========================================================= */}
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
           FILTRES
           ========================================================= */}
      <div className="aps-card mb-3">
        <div className="aps-card__body">
          <div className="row g-3 align-items-end">
            <div className="col-md-3">
              <label className="form-label">Pharmacie</label>
              <select className="form-select" value={filtres.pharmacie_id} onChange={(e) => modifierFiltre("pharmacie_id", e.target.value)}>
                <option value="">Toutes</option>
                {pharmacies.map((p) => <option key={p.pharmacie_id} value={p.pharmacie_id}>{p.nom}</option>)}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Emplacement</label>
              <select className="form-select" value={filtres.page_web_id} onChange={(e) => modifierFiltre("page_web_id", e.target.value)}>
                <option value="">Tous</option>
                {pages.map((pg) => <option key={pg.page_web_id} value={pg.page_web_id}>{pg.libelle}</option>)}
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
              <label className="form-label">Statut</label>
              <select className="form-select" value={filtres.statut_moderation} onChange={(e) => modifierFiltre("statut_moderation", e.target.value)}>
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
                  alt={`Visuel — ${publicite.page_web?.libelle || "publicité"}`}
                  style={{ height: 160, objectFit: "cover" }}
                />
                <div className="card-body d-flex flex-column">
                  <div className="d-flex align-items-start justify-content-between mb-1">
                    <h5 className="card-title mb-0" style={{ fontSize: 15 }}>
                      {publicite.page_web?.libelle || "Emplacement inconnu"}
                    </h5>
                    <span className={`aps-badge ${statut.badge || "is-info"} ms-2`}>
                      <i className="fa-solid fa-circle"></i> {statut.libelle || publicite.statut_moderation}
                    </span>
                  </div>
                  <p className="card-text aps-text-muted mb-2" style={{ fontSize: 13 }}>
                    <i className="fa-solid fa-prescription-bottle-medical me-1"></i>
                    {nomPharmacie(publicite.pharmacie_id)}
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
                    {peutModifier && (
                      <button className="btn btn-sm btn-light" title="Modifier" onClick={() => ouvrirEdition(publicite)}>
                        <i className="fa-solid fa-pen"></i>
                      </button>
                    )}
                    {peutSupprimer && (
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
      {publiciteSelectionnee && (
        <>
          <style>{STYLE_FICHE_DETAIL}</style>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={() => setPubliciteSelectionnee(null)}>
            <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content aps-fiche-detail">
                <div className="modal-header aps-fiche-header">
                  <div>
                    <h5 className="modal-title mb-1">{publiciteSelectionnee.page_web?.libelle || "Publicité"}</h5>
                    <div className="aps-text-muted aps-fiche-souscritre">
                      <i className="fa-solid fa-prescription-bottle-medical me-1"></i>
                      {nomPharmacie(publiciteSelectionnee.pharmacie_id)}
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
                            <div className="aps-fiche-info-label">Formule</div>
                            <div className="aps-fiche-info-valeur">{libelleFormule(publiciteSelectionnee)}</div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-receipt"></i>
                          <div>
                            <div className="aps-fiche-info-label">Transaction</div>
                            <div className="aps-fiche-info-valeur">{publiciteSelectionnee.transaction_id}</div>
                          </div>
                        </div>
                      </div>

                      <div className="aps-fiche-section-titre">
                        <i className="fa-solid fa-window-restore me-1"></i> Emplacement
                      </div>
                      <p className="mb-0" style={{ fontSize: 14 }}>
                        {publiciteSelectionnee.page_web?.libelle || "—"}
                        {publiciteSelectionnee.page_web?.description && (
                          <span className="aps-text-muted"> — {publiciteSelectionnee.page_web.description}</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  {peutModifier && (
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
                       statut de modération, jamais dates/visuel ── */}
                  {modeEdition && peutModererTout && (
                    <div className="row g-3">
                      <div className="col-12">
                        <div className="aps-text-muted mb-2" style={{ fontSize: 13 }}>
                          {publiciteEnEdition?.page_web?.libelle} — {nomPharmacie(publiciteEnEdition?.pharmacie_id)}
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

                  {/* ── Édition — agent-propriétaire : dates + visuel,
                       tant que la publicité est encore "en_attente" ── */}
                  {modeEdition && !peutModererTout && (
                    <>
                      {editionVerrouilleePourAgent ? (
                        <div className="aps-notice is-warning">
                          <i className="fa-solid fa-lock"></i>
                          <div>Cette publicité a déjà été modérée : ses dates et son visuel ne peuvent plus être modifiés.</div>
                        </div>
                      ) : (
                        <div className="row g-3">
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

                  {/* ── Création ── */}
                  {!modeEdition && (
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label">Pharmacie</label>
                        <select className="form-select" required value={formulaire.pharmacie_id}
                                onChange={(e) => modifierChampFormulaire("pharmacie_id", e.target.value)}>
                          <option value="" disabled>Choisir…</option>
                          {pharmacies.map((p) => <option key={p.pharmacie_id} value={p.pharmacie_id}>{p.nom}</option>)}
                        </select>
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Emplacement (page du site)</label>
                        <select className="form-select" required value={formulaire.page_web_id}
                                onChange={(e) => modifierChampFormulaire("page_web_id", e.target.value)}>
                          <option value="" disabled>Choisir…</option>
                          {pages.map((pg) => <option key={pg.page_web_id} value={pg.page_web_id}>{pg.libelle}</option>)}
                        </select>
                      </div>

                      <div className="col-md-6">
                        <label className="form-label">Formule publicitaire <span className="aps-text-muted">(identifiant)</span></label>
                        <input type="text" className="form-control" required value={formulaire.formule_publicitaire_id}
                               onChange={(e) => modifierChampFormulaire("formule_publicitaire_id", e.target.value)}
                               placeholder="formule_publicitaire_id" />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Transaction de paiement <span className="aps-text-muted">(identifiant)</span></label>
                        <input type="text" className="form-control" required value={formulaire.transaction_id}
                               onChange={(e) => modifierChampFormulaire("transaction_id", e.target.value)}
                               placeholder="transaction_id" />
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

                      {peutModererTout && (
                        <div className="col-md-6">
                          <label className="form-label">Statut de modération</label>
                          <select className="form-select" value={formulaire.statut_moderation}
                                  onChange={(e) => modifierChampFormulaire("statut_moderation", e.target.value)}>
                            {STATUTS_MODERATION_PUBLICITE.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
                          </select>
                          <div className="aps-text-muted mt-1" style={{ fontSize: 12 }}>
                            Seul un admin/superadmin peut publier directement ; sinon la publicité reste "en attente".
                          </div>
                        </div>
                      )}

                      <div className="col-12">
                        <hr />
                        <label className="form-label">Visuel de l'encart <span className="text-danger">*</span></label>
                        <input type="file" className="form-control" required accept="image/jpeg,image/png,image/webp"
                               onChange={(e) => modifierFichierFormulaire(e.target.files?.[0])} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={fermerModale}>Annuler</button>
                  <button type="submit" className="btn btn-primary" disabled={envoiEnCours || editionVerrouilleePourAgent}>
                    {envoiEnCours ? "Enregistrement…" : modeEdition ? "Enregistrer" : "Créer la publicité"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — CONFIRMATION DE SUPPRESSION (admin/superadmin)
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
                    La publicité « {cibleSuppression.page_web?.libelle || cibleSuppression.publicite_id} » de{" "}
                    « {nomPharmacie(cibleSuppression.pharmacie_id)} » sera définitivement supprimée, ainsi que
                    son visuel.
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