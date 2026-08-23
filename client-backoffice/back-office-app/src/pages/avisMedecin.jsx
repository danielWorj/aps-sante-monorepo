// src/components/avisMedecin.jsx
//
// Back-office de modération des avis médecin, calqué sur
// avisPharmacie.jsx (mêmes classes aps-* / structure de carte
// "avis-card", mêmes modales "Éditer l'avis" / "Supprimer l'avis",
// même colonne latérale : mini-calendrier, alertes de modération,
// répartition des notes). Branché sur medecinService.js.
//
// -------------------------------------------------------------------
// Différences réelles avec avisPharmacie.jsx (pas de simple copier-
// coller — cf. les commentaires d'autorisation dans medecinService.js) :
//
//   1) MODÈLE D'AUTORISATION DIFFÉRENT
//      Pour les avis pharmacie, seul admin/superadmin pouvait éditer /
//      supprimer. Pour les avis médecin, medecinService.js documente :
//        - PUT  : l'auteur de l'avis (tant que statut = "en_attente",
//                 et seulement { note, commentaire }) OU admin/superadmin
//                 (qui peut en plus changer statut_moderation).
//        - DELETE : l'auteur (quel que soit le statut) OU admin/superadmin.
//      Ce composant gère donc DEUX modes d'édition sur la même modale :
//        - mode "admin"  → commentaire + note + statut_moderation ;
//        - mode "auteur" → commentaire + note uniquement, statut affiché
//          en lecture seule (toujours "En attente" à ce stade).
//      Pour déterminer "l'auteur", on compare l'identifiant de
//      l'utilisateur connecté (voir extraireIdUtilisateur ci-dessous)
//      à un champ d'identifiant porté par l'avis. Ni AuthContext.jsx ni
//      medecinService.js ne précisent le nom exact de ces champs :
//      HYPOTHÈSE (par analogie avec le reste du front, ex. patient_id
//      sur les rendez-vous) → `utilisateur_id` des deux côtés, avec
//      quelques repli (`id`, `auteur_id`) au cas où — à ajuster une
//      fois le schéma réel connu.
//
//   2) NOTE_MIN / NOTE_MAX / `badge` non exportés par medecinService.js
//      avisPharmacieService.js exportait NOTE_MIN, NOTE_MAX, et chaque
//      entrée de STATUTS_MODERATION_AVIS portait un champ `badge`.
//      STATUTS_MODERATION_AVIS_MEDECIN (medecinService.js) ne fournit
//      que { valeur, libelle } : NOTE_MIN/NOTE_MAX et le mapping des
//      classes `badge` sont donc redéfinis localement ci-dessous
//      (bornes 1–5 par analogie avec le système d'avis pharmacie).
//
//   3) `medecin_id` résolu via medecinService.listerMedecins (déjà
//      public, cf. commentaires du service), l'avis ne portant a
//      priori que l'identifiant — même logique que pharmacie_id dans
//      avisPharmacie.jsx. Champs supposés sur un médecin (non
//      documentés) : `nom`, `specialite`, `ville.nom`, `pays.nom`, par
//      analogie avec la fiche pharmacie.
//
//   4) Champs de l'avis non fournis par un schéma réel (mêmes
//      hypothèses que pour avis pharmacie, à ajuster) : `signale`,
//      `motif_signalement`, `auteur_avatar_url`, `auteur_verifie`,
//      `auteur_nombre_avis`, `utilisateur_id`.
//
//   5) Comme pour avisPharmacie.jsx, aucun bouton "Nouvel avis" : ce
//      back-office reste centré sur la modération d'avis déjà déposés
//      (voir creerAvisMedecin, exposé par le service mais non utilisé
//      ici). Le point 1 ci-dessus permet malgré tout à un auteur
//      connecté de corriger/retirer son propre avis en attente depuis
//      cette même vue, conformément aux règles serveur.
//
// Hypothèses reprises de Pharmacie.jsx / avisPharmacie.jsx (non
// fournies ici, donc à vérifier) :
//   - Bootstrap 5 (CSS uniquement) et Font Awesome déjà chargés
//     globalement par le layout parent ; modales pilotées par l'état
//     React, pas par data-bs-toggle.
//   - admin.css définit les classes aps-* génériques (aps-card,
//     aps-kpi, aps-badge, aps-notice, aps-avatar-cell, aps-pagination,
//     aps-mini-calendar, aps-highlight-box…). Les classes propres à
//     cette page sont injectées via STYLE_PAGE ci-dessous.

import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listerAvisMedecin,
  modifierAvisMedecin,
  supprimerAvisMedecin,
  listerMedecins,
  STATUTS_MODERATION_AVIS_MEDECIN,
} from "../services/medecinService.js";

const TAILLE_PAGE = 6; // reprend le "Affichage de 1 à 6 sur …" de la maquette avis pharmacie

// Non exportés par medecinService.js (voir point 2 en en-tête) —
// bornes reprises par analogie avec le système d'avis pharmacie.
const NOTE_MIN = 1;
const NOTE_MAX = 5;

// STATUTS_MODERATION_AVIS_MEDECIN ne porte pas de champ `badge`
// (contrairement à STATUTS_MODERATION_AVIS côté pharmacie) : mapping
// local, à ajuster si le service est complété.
const BADGE_STATUT = {
  en_attente: "is-warning",
  publie: "is-success",
  rejete: "is-danger",
};

/**
 * Styles propres à cette page — repris tels quels de avisPharmacie.jsx
 * (structure de carte générique, pas spécifique au domaine pharmacie),
 * pour ne pas dupliquer ces règles dans admin.css.
 */
const STYLE_PAGE = `
  .cell-title { font-weight:600; color:var(--aps-text-900); }
  .cell-sub   { font-size:12px; color:var(--aps-text-400); }
  .aps-stars  { display:inline-flex; gap:2px; font-size:11.5px; color:#F2B01E; vertical-align:middle; }
  .aps-stars .is-off { color:var(--aps-border-strong); }
  .avis-card__top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:10px; }
  .avis-card__message { margin:0 0 14px; color:var(--aps-text-700); }
  .avis-card__foot { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding-top:12px; border-top:1px solid var(--aps-border); }
  .avis-card__foot .aps-avatar-cell .name { font-size:13.5px; font-weight:600; color:var(--aps-text-900); }
  .avis-card__meta { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:var(--aps-text-400); }
  .aps-bar { flex:1; height:6px; border-radius:999px; background:var(--aps-bg); overflow:hidden; }
  .aps-bar span { display:block; height:100%; border-radius:999px; background:var(--aps-primary); }
`;

/**
 * Extrait un nom de rôle (en minuscules) depuis un objet utilisateur —
 * même logique que dans avisPharmacie.jsx / Pharmacie.jsx, dupliquée
 * ici pour ne pas introduire de dépendance croisée entre composants.
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
 * Extrait l'identifiant de l'utilisateur connecté, pour déterminer
 * s'il est l'auteur d'un avis donné (voir point 1 en en-tête — nom de
 * champ exact non confirmé côté serveur).
 */
function extraireIdUtilisateur(objetUtilisateur) {
  if (!objetUtilisateur || typeof objetUtilisateur !== "object") return null;

  const candidats = [
    objetUtilisateur.utilisateur_id,
    objetUtilisateur.id,
    objetUtilisateur.user_id,
  ];

  for (const candidat of candidats) {
    if (candidat !== undefined && candidat !== null) return String(candidat);
  }
  return null;
}

function useUtilisateurCourant() {
  const { user, isAuthenticated } = useAuth();
  return {
    role: extraireNomRole(user),
    idUtilisateur: extraireIdUtilisateur(user),
    estConnecte: isAuthenticated,
  };
}

/** Formate une date ISO en "9 août 2026 · 08:42", comme la maquette avis pharmacie. */
function formaterDateHeure(valeur) {
  if (!valeur) return "—";
  try {
    const date = new Date(valeur);
    const jour = date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const heure = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `${jour} · ${heure}`;
  } catch {
    return "—";
  }
}

/** Étoiles en lecture seule (pleines / .is-off), identiques à la maquette avis pharmacie. */
function Etoiles({ note }) {
  const valeur = Math.round(Number(note) || 0);
  return (
    <span className="aps-stars">
      {Array.from({ length: NOTE_MAX }, (_, i) => (
        <i key={i} className={`fa-solid fa-star${i < valeur ? "" : " is-off"}`}></i>
      ))}
    </span>
  );
}

/** Libellé "Patient vérifié · N avis" / "Nouveau patient · N avis". */
function metaAuteur(unAvis) {
  const n = unAvis.auteur_nombre_avis ?? 0;
  const type = unAvis.auteur_verifie ? "Patient vérifié" : "Nouveau patient";
  return `${type} · ${n} avis`;
}

/* ===================================================================
 * Mini-calendrier (colonne latérale) — purement décoratif, calculé
 * depuis le mois affiché en état local ; ne dépend d'aucune donnée
 * d'avis (aucune spécification fournie pour y rattacher des événements).
 * Repris tel quel de avisPharmacie.jsx.
 * =================================================================== */
const NOMS_MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function MiniCalendrier() {
  const aujourdHui = useMemo(() => new Date(), []);
  const [moisAffiche, setMoisAffiche] = useState(() => new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), 1));

  const jours = useMemo(() => {
    const annee = moisAffiche.getFullYear();
    const mois = moisAffiche.getMonth();
    const premierJourSemaine = (new Date(annee, mois, 1).getDay() + 6) % 7; // lundi = 0
    const nbJours = new Date(annee, mois + 1, 0).getDate();
    const cases = [];
    for (let i = 0; i < premierJourSemaine; i += 1) cases.push(null);
    for (let j = 1; j <= nbJours; j += 1) cases.push(j);
    while (cases.length % 7 !== 0) cases.push(null);
    return cases;
  }, [moisAffiche]);

  function changerMois(delta) {
    setMoisAffiche((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  const estAujourdHui = (jour) =>
    jour === aujourdHui.getDate() &&
    moisAffiche.getMonth() === aujourdHui.getMonth() &&
    moisAffiche.getFullYear() === aujourdHui.getFullYear();

  return (
    <div className="aps-card">
      <div className="aps-card__body aps-mini-calendar">
        <div className="aps-mini-calendar__head">
          <button type="button" className="aps-icon-btn" style={{ width: 28, height: 28 }} aria-label="Mois précédent" onClick={() => changerMois(-1)}>
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          {NOMS_MOIS[moisAffiche.getMonth()]} {moisAffiche.getFullYear()}
          <button type="button" className="aps-icon-btn" style={{ width: 28, height: 28 }} aria-label="Mois suivant" onClick={() => changerMois(1)}>
            <i className="fa-solid fa-chevron-right"></i>
          </button>
        </div>
        <div className="aps-mini-calendar__grid">
          {["L", "M", "M", "J", "V", "S", "D"].map((j, i) => <span className="dow" key={`dow-${i}`}>{j}</span>)}
          {jours.map((jour, i) => (
            <span className={`day${jour && estAujourdHui(jour) ? " is-selected" : ""}`} key={i}>{jour ?? ""}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AvisMedecin() {
  const { role, idUtilisateur } = useUtilisateurCourant();
  const peutModererTout = role === "admin" || role === "superadmin";

  const [avis, setAvis] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const [recherche, setRecherche] = useState("");
  const [statutFiltre, setStatutFiltre] = useState("");
  const [noteFiltre, setNoteFiltre] = useState("");
  const [medecinFiltre, setMedecinFiltre] = useState("");
  const [filtresAppliques, setFiltresAppliques] = useState({ recherche: "", statut_moderation: "", note: "", medecin_id: "" });

  const [medecins, setMedecins] = useState([]);
  const [page, setPage] = useState(1);

  const [avisEnEdition, setAvisEnEdition] = useState(null);
  const [modaleEditerOuverte, setModaleEditerOuverte] = useState(false);
  const [formulaire, setFormulaire] = useState({ commentaire: "", statut_moderation: "en_attente", note: NOTE_MIN });
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreurFormulaire, setErreurFormulaire] = useState(null);

  const [cibleSuppression, setCibleSuppression] = useState(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  const chargerAvis = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const resultat = await listerAvisMedecin(filtresAppliques);
      setAvis(resultat);
      setPage(1);
    } catch (err) {
      setErreur(err.message || "Impossible de charger les avis.");
    } finally {
      setChargement(false);
    }
  }, [filtresAppliques]);

  useEffect(() => { chargerAvis(); }, [chargerAvis]);

  useEffect(() => {
    listerMedecins({}).then(setMedecins).catch(() => setMedecins([]));
  }, []);

  // Filtre "recherche" appliqué avec un léger débounce (pas de bouton
  // "Filtrer" — uniquement un champ de recherche live et un bouton
  // "Réinitialiser"), comme dans avisPharmacie.jsx.
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltresAppliques((p) => ({ ...p, recherche }));
    }, 400);
    return () => clearTimeout(t);
  }, [recherche]);

  useEffect(() => {
    setFiltresAppliques((p) => ({ ...p, statut_moderation: statutFiltre }));
  }, [statutFiltre]);

  useEffect(() => {
    setFiltresAppliques((p) => ({ ...p, note: noteFiltre }));
  }, [noteFiltre]);

  useEffect(() => {
    setFiltresAppliques((p) => ({ ...p, medecin_id: medecinFiltre }));
  }, [medecinFiltre]);

  function reinitialiserFiltres() {
    setRecherche("");
    setStatutFiltre("");
    setNoteFiltre("");
    setMedecinFiltre("");
    setFiltresAppliques({ recherche: "", statut_moderation: "", note: "", medecin_id: "" });
  }

  function infosMedecin(medecinId) {
    const m = medecins.find((x) => x.medecin_id === medecinId);
    return {
      nom: m?.nom ? `Dr. ${m.nom}` : "Médecin",
      specialite: m?.specialite || "",
      localisation: m ? [m.ville?.nom, m.pays?.nom].filter(Boolean).join(" — ") : "",
    };
  }

  /**
   * Un avis est modifiable par l'utilisateur courant s'il modère tout
   * (admin/superadmin) OU s'il en est l'auteur ET que l'avis est
   * encore "en_attente" (cf. point 1 en en-tête).
   */
  function estAuteurDeAvis(unAvis) {
    if (!idUtilisateur) return false;
    const idAuteur = unAvis.utilisateur_id ?? unAvis.auteur_id;
    return idAuteur !== undefined && idAuteur !== null && String(idAuteur) === idUtilisateur;
  }

  function peutModifierAvis(unAvis) {
    return peutModererTout || (estAuteurDeAvis(unAvis) && unAvis.statut_moderation === "en_attente");
  }

  function peutSupprimerAvis(unAvis) {
    return peutModererTout || estAuteurDeAvis(unAvis);
  }

  /* ─── Pagination côté client (l'API ne pagine pas côté serveur) ─── */
  const nbPages = Math.max(1, Math.ceil(avis.length / TAILLE_PAGE));
  const pageCourante = Math.min(page, nbPages);
  const avisPage = avis.slice((pageCourante - 1) * TAILLE_PAGE, pageCourante * TAILLE_PAGE);
  const debutAffichage = avis.length === 0 ? 0 : (pageCourante - 1) * TAILLE_PAGE + 1;
  const finAffichage = Math.min(pageCourante * TAILLE_PAGE, avis.length);

  /* ─── KPI ───────────────────────────────────────────────────── */
  const kpi = useMemo(() => {
    const enAttente = avis.filter((a) => a.statut_moderation === "en_attente").length;
    const publies = avis.filter((a) => a.statut_moderation === "publie").length;
    const rejetes = avis.filter((a) => a.statut_moderation === "rejete").length;
    const notesPubliees = avis.filter((a) => a.statut_moderation === "publie").map((a) => Number(a.note) || 0);
    const noteMoyenne = notesPubliees.length ? notesPubliees.reduce((s, n) => s + n, 0) / notesPubliees.length : 0;
    return { enAttente, publies, rejetes, noteMoyenne, totalPublies: notesPubliees.length };
  }, [avis]);

  /* ─── Répartition des notes (parmi les avis publiés) ───────────── */
  const repartitionNotes = useMemo(() => {
    const publies = avis.filter((a) => a.statut_moderation === "publie");
    return [5, 4, 3, 2, 1].map((n) => {
      const nb = publies.filter((a) => Math.round(Number(a.note) || 0) === n).length;
      const pourcentage = publies.length ? Math.round((nb / publies.length) * 100) : 0;
      return { note: n, pourcentage };
    });
  }, [avis]);

  /* ─── Alertes de modération, calculées depuis les avis chargés ─── */
  const alertes = useMemo(() => {
    const signales = avis.filter((a) => a.signale);
    const enAttente48h = avis.filter((a) => {
      if (a.statut_moderation !== "en_attente" || !a.created_at) return false;
      return Date.now() - new Date(a.created_at).getTime() > 48 * 3600 * 1000;
    });
    return { signales, enAttente48h };
  }, [avis]);

  function ouvrirEdition(unAvis) {
    setAvisEnEdition(unAvis);
    setFormulaire({
      commentaire: unAvis.commentaire ?? "",
      statut_moderation: unAvis.statut_moderation ?? "en_attente",
      note: Number(unAvis.note) || NOTE_MIN,
    });
    setErreurFormulaire(null);
    setModaleEditerOuverte(true);
  }

  function fermerModaleEditer() {
    setModaleEditerOuverte(false);
    setErreurFormulaire(null);
  }

  function modifierChampFormulaire(champ, valeur) {
    setFormulaire((p) => ({ ...p, [champ]: valeur }));
  }

  async function enregistrerEdition() {
    if (!avisEnEdition) return;
    if (!formulaire.commentaire.trim()) {
      setErreurFormulaire("Le commentaire ne peut pas être vide.");
      return;
    }
    setEnvoiEnCours(true);
    setErreurFormulaire(null);
    try {
      // Un auteur non-admin ne peut pas changer le statut de
      // modération (cf. point 1 en en-tête) : on n'envoie ce champ que
      // pour un admin/superadmin, pour rester conforme à ce qu'accepte
      // le serveur côté auteur ({ note?, commentaire? } uniquement).
      const editeParAdmin = peutModererTout;
      const donnees = editeParAdmin
        ? {
            commentaire: formulaire.commentaire,
            statut_moderation: formulaire.statut_moderation,
            note: Number(formulaire.note),
          }
        : {
            commentaire: formulaire.commentaire,
            note: Number(formulaire.note),
          };
      await modifierAvisMedecin(avisEnEdition.avis_id, donnees);
      setModaleEditerOuverte(false);
      await chargerAvis();
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
      await supprimerAvisMedecin(cibleSuppression.avis_id);
      setCibleSuppression(null);
      await chargerAvis();
    } catch (err) {
      setErreur(err.message || "Impossible de supprimer cet avis.");
      setCibleSuppression(null);
    } finally {
      setSuppressionEnCours(false);
    }
  }

  function exporterCsv() {
    const entetes = ["Médecin", "Auteur", "Note", "Statut", "Signalé", "Commentaire", "Date"];
    const lignes = avis.map((a) => [
      infosMedecin(a.medecin_id).nom,
      a.auteur_nom,
      a.note,
      STATUTS_MODERATION_AVIS_MEDECIN.find((s) => s.valeur === a.statut_moderation)?.libelle || a.statut_moderation,
      a.signale ? "Oui" : "Non",
      a.commentaire,
      formaterDateHeure(a.created_at),
    ]);
    const csv = [entetes, ...lignes]
      .map((ligne) => ligne.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(blob);
    lien.download = "avis-medecin.csv";
    lien.click();
    URL.revokeObjectURL(lien.href);
  }

  return (
    <>
      <style>{STYLE_PAGE}</style>
      <div className="aps-content">

        {/* ===================================================
             PAGE HEADER
             =================================================== */}
        <div className="aps-page-header">
          <div>
            <div className="aps-breadcrumb">
              <a href="dashboard.html">Back-office</a><span className="sep">/</span>
              <a href="medecins.html">Médecin</a><span className="sep">/</span>Avis médecin
            </div>
            <h1>Avis médecin</h1>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-light" type="button" onClick={exporterCsv}>
              <i className="fa-solid fa-file-export me-2"></i>Exporter
            </button>
          </div>
        </div>

        {/* ===================================================
             KPI
             =================================================== */}
        <div className="row g-3 g-xl-4 mb-4">
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top"><div className="aps-kpi__icon is-warning"><i className="fa-solid fa-hourglass-half"></i></div></div>
              <div className="aps-kpi__label">Avis en attente</div>
              <div className="aps-kpi__value">{kpi.enAttente.toLocaleString("fr-FR")}</div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top"><div className="aps-kpi__icon is-success"><i className="fa-solid fa-circle-check"></i></div></div>
              <div className="aps-kpi__label">Avis publiés</div>
              <div className="aps-kpi__value">{kpi.publies.toLocaleString("fr-FR")}</div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top"><div className="aps-kpi__icon is-primary"><i className="fa-solid fa-star"></i></div></div>
              <div className="aps-kpi__label">Note moyenne</div>
              <div className="aps-kpi__value">
                {kpi.totalPublies ? kpi.noteMoyenne.toFixed(1).replace(".", ",") : "—"}
                <span className="aps-text-muted" style={{ fontSize: 14, fontWeight: 600 }}>/5</span>
              </div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top"><div className="aps-kpi__icon is-danger"><i className="fa-solid fa-ban"></i></div></div>
              <div className="aps-kpi__label">Avis rejetés</div>
              <div className="aps-kpi__value">{kpi.rejetes.toLocaleString("fr-FR")}</div>
            </div>
          </div>
        </div>

        <div className="row g-4">
          {/* ================= COLONNE PRINCIPALE : LISTE DE CARTES ================= */}
          <div className="col-12 col-xl-8">

            {/* Filtres */}
            <div className="aps-card mb-4">
              <div className="aps-card__body d-flex flex-wrap align-items-center gap-2">
                <input
                  type="search"
                  className="form-control w-auto flex-grow-1"
                  style={{ maxWidth: 250 }}
                  placeholder="Rechercher un patient, un médecin…"
                  aria-label="Recherche"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
                <select className="form-select w-auto" aria-label="Statut" value={statutFiltre} onChange={(e) => setStatutFiltre(e.target.value)}>
                  <option value="">Tous statuts</option>
                  {STATUTS_MODERATION_AVIS_MEDECIN.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
                </select>
                <select className="form-select w-auto" aria-label="Note" value={noteFiltre} onChange={(e) => setNoteFiltre(e.target.value)}>
                  <option value="">Toutes notes</option>
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
                </select>
                <select className="form-select w-auto" aria-label="Médecin" value={medecinFiltre} onChange={(e) => setMedecinFiltre(e.target.value)}>
                  <option value="">Tous médecins</option>
                  {[...medecins]
                    .sort((a, b) => (a.nom || "").localeCompare(b.nom || ""))
                    .map((m) => <option key={m.medecin_id} value={m.medecin_id}>Dr. {m.nom}</option>)}
                </select>
                <button className="btn btn-light btn-sm ms-auto" type="button" onClick={reinitialiserFiltres}>
                  <i className="fa-solid fa-rotate-left me-1"></i>Réinitialiser
                </button>
              </div>
            </div>

            {erreur && (
              <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreur}</div></div>
            )}

            {chargement && (
              <div className="aps-card mb-3"><div className="aps-card__body text-center aps-text-muted py-5">Chargement…</div></div>
            )}

            {!chargement && avisPage.length === 0 && (
              <div className="aps-card mb-3"><div className="aps-card__body text-center aps-text-muted py-5">Aucun avis ne correspond à ces critères.</div></div>
            )}

            {/* ============ CARTES AVIS ============ */}
            {avisPage.map((unAvis) => {
              const meta = STATUTS_MODERATION_AVIS_MEDECIN.find((s) => s.valeur === unAvis.statut_moderation) || {};
              const { nom: nomMedecin, specialite, localisation } = infosMedecin(unAvis.medecin_id);
              const editable = peutModifierAvis(unAvis);
              const supprimable = peutSupprimerAvis(unAvis);
              return (
                <div className="aps-card mb-3 avis-card" key={unAvis.avis_id}>
                  <div className="aps-card__body">
                    <div className="avis-card__top">
                      <div>
                        <div className="cell-title">{nomMedecin}</div>
                        <div className="cell-sub">{[specialite, localisation].filter(Boolean).join(" · ")}</div>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <Etoiles note={unAvis.note} />
                        <span className={`aps-badge ${BADGE_STATUT[unAvis.statut_moderation] || "is-info"}`}>
                          <i className="fa-solid fa-circle"></i>{meta.libelle || unAvis.statut_moderation}
                        </span>
                        {unAvis.signale && (
                          <span className="aps-badge is-danger"><i className="fa-solid fa-circle"></i>Signalé</span>
                        )}
                      </div>
                    </div>
                    <p className="avis-card__message">« {unAvis.commentaire} »</p>
                    <div className="avis-card__foot">
                      <div className="aps-avatar-cell">
                        <img src={unAvis.auteur_avatar_url || "https://i.pravatar.cc/64"} alt="" />
                        <div className="name">{unAvis.auteur_nom || "Anonyme"}</div>
                      </div>
                      <span className="avis-card__meta"><i className="fa-regular fa-clock"></i>{formaterDateHeure(unAvis.created_at)}</span>
                      <div className="ms-auto d-flex gap-2">
                        {editable && (
                          <button className="btn btn-sm btn-outline-primary" type="button" onClick={() => ouvrirEdition(unAvis)}>
                            <i className="fa-solid fa-pen me-1"></i>Éditer
                          </button>
                        )}
                        {supprimable && (
                          <button className="btn btn-sm btn-light" type="button" onClick={() => setCibleSuppression(unAvis)}>
                            <i className="fa-solid fa-trash text-danger me-1"></i>Supprimer
                          </button>
                        )}
                        {!editable && !supprimable && (
                          <span className="aps-text-muted" style={{ fontSize: 12.5 }}>Lecture seule</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Pagination */}
            <div className="aps-card mt-4">
              <div className="aps-pagination">
                <span>
                  {avis.length === 0
                    ? "Aucun avis"
                    : <>Affichage de {debutAffichage} à {finAffichage} sur {avis.length.toLocaleString("fr-FR")}</>}
                </span>
                <div className="pages">
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
                </div>
              </div>
            </div>
          </div>

          {/* ================= COLONNE LATÉRALE ================= */}
          <div className="col-12 col-xl-4 d-flex flex-column gap-4">
            <MiniCalendrier />

            <div className="aps-card">
              <div className="aps-card__header"><h3>Alertes modération</h3></div>
              <div className="aps-card__body d-flex flex-column gap-2">
                {alertes.signales.length > 0 && (
                  <div className="aps-notice is-danger">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <div>
                      {alertes.signales.length} avis signalé{alertes.signales.length > 1 ? "s" : ""} —
                      revue prioritaire recommandée.
                    </div>
                  </div>
                )}
                {alertes.enAttente48h.length > 0 && (
                  <div className="aps-notice is-warning">
                    <i className="fa-solid fa-clock"></i>
                    <div>
                      {alertes.enAttente48h.length} avis en attente de modération depuis plus de 48 h.
                    </div>
                  </div>
                )}
                {alertes.signales.length === 0 && alertes.enAttente48h.length === 0 && (
                  <div className="aps-notice is-info">
                    <i className="fa-solid fa-circle-info"></i>
                    <div>Aucune alerte de modération pour le moment.</div>
                  </div>
                )}
              </div>
            </div>

            <div className="aps-card">
              <div className="aps-card__header"><h3>Répartition des notes</h3></div>
              <div className="aps-card__body d-flex flex-column gap-2">
                {repartitionNotes.map(({ note, pourcentage }) => (
                  <div className="d-flex align-items-center gap-2" key={note}>
                    <span className="cell-sub" style={{ width: 30 }}>{note} ★</span>
                    <div className="aps-bar"><span style={{ width: `${pourcentage}%` }}></span></div>
                    <span className="cell-sub" style={{ width: 38, textAlign: "right" }}>{pourcentage} %</span>
                  </div>
                ))}
                <div className="aps-highlight-box mt-2">
                  <div className="label"><i className="fa-solid fa-star"></i>Note moyenne</div>
                  <div className="value">{kpi.totalPublies ? kpi.noteMoyenne.toFixed(1).replace(".", ",") : "—"}</div>
                  <div className="sub">sur 5 — {kpi.totalPublies.toLocaleString("fr-FR")} avis publiés</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================
           MODALE — ÉDITER / VOIR LES DÉTAILS
           ========================================================= */}
      {modaleEditerOuverte && avisEnEdition && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={fermerModaleEditer}>
            <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Éditer l'avis</h5>
                  <button type="button" className="btn-close" onClick={fermerModaleEditer}></button>
                </div>
                <div className="modal-body">
                  <div className="row g-3 mb-3">
                    <div className="col-md-6">
                      <div className="aps-avatar-cell">
                        <img src={avisEnEdition.auteur_avatar_url || "https://i.pravatar.cc/64"} alt="" style={{ width: 44, height: 44 }} />
                        <div>
                          <div className="cell-title">{avisEnEdition.auteur_nom || "Anonyme"}</div>
                          <div className="cell-sub">{metaAuteur(avisEnEdition)}</div>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="cell-title">{infosMedecin(avisEnEdition.medecin_id).nom}</div>
                      <div className="cell-sub">
                        {[infosMedecin(avisEnEdition.medecin_id).specialite, infosMedecin(avisEnEdition.medecin_id).localisation]
                          .filter(Boolean).join(" · ")}
                      </div>
                      <div className="mt-1 d-flex align-items-center gap-2">
                        <Etoiles note={formulaire.note} />
                        <span className="cell-sub">{formulaire.note}/5</span>
                      </div>
                    </div>
                  </div>

                  <div className="d-flex flex-wrap gap-2 mb-3">
                    <span className="aps-badge is-neutral"><i className="fa-regular fa-clock"></i><span>{formaterDateHeure(avisEnEdition.created_at)}</span></span>
                    <span className={`aps-badge ${BADGE_STATUT[avisEnEdition.statut_moderation] || "is-neutral"}`}>
                      <i className="fa-solid fa-circle"></i>
                      {STATUTS_MODERATION_AVIS_MEDECIN.find((s) => s.valeur === avisEnEdition.statut_moderation)?.libelle || avisEnEdition.statut_moderation}
                    </span>
                    {!peutModererTout && (
                      <span className="aps-text-muted" style={{ fontSize: 12.5, alignSelf: "center" }}>
                        Seul un administrateur peut changer le statut de modération.
                      </span>
                    )}
                  </div>

                  {avisEnEdition.signale && (
                    <div className="aps-notice is-danger mb-3">
                      <i className="fa-solid fa-triangle-exclamation"></i>
                      <div><strong>Signalement :</strong> {avisEnEdition.motif_signalement || "avis signalé."}</div>
                    </div>
                  )}

                  {erreurFormulaire && (
                    <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreurFormulaire}</div></div>
                  )}

                  <label className="form-label" htmlFor="mCommentaire">Commentaire</label>
                  <textarea
                    className="form-control"
                    id="mCommentaire"
                    rows={4}
                    value={formulaire.commentaire}
                    onChange={(e) => modifierChampFormulaire("commentaire", e.target.value)}
                  />
                  <div className="row g-3 mt-1">
                    {peutModererTout && (
                      <div className="col-md-6">
                        <label className="form-label" htmlFor="mStatutSelect">Statut de modération</label>
                        <select
                          className="form-select"
                          id="mStatutSelect"
                          value={formulaire.statut_moderation}
                          onChange={(e) => modifierChampFormulaire("statut_moderation", e.target.value)}
                        >
                          {STATUTS_MODERATION_AVIS_MEDECIN.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
                        </select>
                      </div>
                    )}
                    <div className={peutModererTout ? "col-md-6" : "col-md-6 col-lg-4"}>
                      <label className="form-label" htmlFor="mNoteSelect">Note</label>
                      <select
                        className="form-select"
                        id="mNoteSelect"
                        value={formulaire.note}
                        onChange={(e) => modifierChampFormulaire("note", Number(e.target.value))}
                      >
                        {Array.from({ length: NOTE_MAX - NOTE_MIN + 1 }, (_, i) => NOTE_MIN + i).map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={fermerModaleEditer}>Annuler</button>
                  <button type="button" className="btn btn-primary" disabled={envoiEnCours} onClick={enregistrerEdition}>
                    <i className="fa-solid fa-floppy-disk me-2"></i>{envoiEnCours ? "Enregistrement…" : "Enregistrer"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — CONFIRMER LA SUPPRESSION
           ========================================================= */}
      {cibleSuppression && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={() => setCibleSuppression(null)}>
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Supprimer l'avis</h5>
                  <button type="button" className="btn-close" onClick={() => setCibleSuppression(null)}></button>
                </div>
                <div className="modal-body">
                  <div className="aps-notice is-danger">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <div>
                      Supprimer définitivement l'avis de <strong>{cibleSuppression.auteur_nom || "Anonyme"}</strong> sur{" "}
                      <strong>{infosMedecin(cibleSuppression.medecin_id).nom}</strong> ? Cette action est irréversible.
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={() => setCibleSuppression(null)}>Annuler</button>
                  <button type="button" className="btn btn-danger" disabled={suppressionEnCours} onClick={confirmerSuppression}>
                    <i className="fa-solid fa-trash me-2"></i>{suppressionEnCours ? "Suppression…" : "Supprimer"}
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