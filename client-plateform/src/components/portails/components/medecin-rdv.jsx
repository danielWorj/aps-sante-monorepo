// medecin-rdv.jsx
//
// Politique de fonds v2 (voir GUIDE_FRONT_POLITIQUE_FONDS_V2.md) :
//   - B3 : « Refuser » (et l'annulation d'un RDV à reprogrammer) est une
//     annulation médecin — avertissement financier AVANT (remboursement du
//     patient, amende si < 24 h), résultat réel du serveur APRÈS (toast 9 s) ;
//   - B4 : statut « a_reprogrammer » (deux absents) — chip dédié, bandeau,
//     panneau de reprogrammation (48 h), pas de visio ;
//   - B7 : dans la modale de détail d'un RDV payé, « Vous recevrez X
//     (honoraires − commission APS (part médecin, CM)) », lu dans
//     paiement.decomposition (renvoyé au seul médecin concerné). Net AVANT
//     amendes éventuelles. Le médecin ne voit JAMAIS la commission patient (CP).
//   - D8 : un RDV NON PAYÉ (statut « cree ») est en lecture seule pour le médecin :
//     grisé, libellé « En attente de paiement », toutes les actions désactivées
//     (confirmer, refuser, annuler, absence, reprogrammer, visio). Le serveur ne
//     renvoie que { rdv_id, date_creneau, statut, non_paye: true } : aucune
//     identité patient, aucun motif. Un 409 RDV_NON_PAYE est géré proprement. Le
//     médecin n'« accepte » plus un RDV : la confirmation résulte du paiement.
//   - le client n'invente aucun montant : il affiche ce que le serveur renvoie.
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import PortailSidebar from "./../layouts/portail-sidebar";
import VisioModal from "./visio-modal";
import MotifAnnulationModal from "./motif-annulation-modal";
import AvertissementAnnulation from "./avertissement-annulation";
import ReprogrammationPanel from "./reprogrammation-panel";
import {
  listerRendezVousMedecinConnecte,
  MOTIFS_ANNULATION_MEDECIN,
} from "./../../../services/medecinService";
import { annulerRendezVousDetaille } from "./../../../services/fondsService";
import { obtenirStatutPaiementRdv } from "./../../../services/paiementService";
import { useAuth } from "./../../../context/AuthContext";
import { categoriserRdv, estRdvNonPaye, estErreurRdvNonPaye } from "./../../../utils/rdv";
import { montantDevise, resumerAnnulation } from "./../../../utils/fonds";
import "./medecin-rdv-non-paye.css";

const MESSAGE_RDV_NON_PAYE =
  "Ce rendez-vous n'est pas encore payé : vous pourrez agir dessus une fois le paiement confirmé.";

// ─── Helpers de formatage ─────────────────────────────────────
const TYPE_RDV_LABEL = {
  physique: "Consultation physique",
  teleconsultation: "Téléconsultation",
};

/**
 * Formate une date ISO en libellé lisible : "Auj.", "Demain", "Lun 25", etc.
 */
function formaterDateRelative(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const maintenant = new Date();
  const aujourdhui = new Date(
    maintenant.getFullYear(),
    maintenant.getMonth(),
    maintenant.getDate()
  );
  const jour = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffJours = Math.round((jour - aujourdhui) / (1000 * 60 * 60 * 24));

  if (diffJours === 0) return "Auj.";
  if (diffJours === 1) return "Demain";
  if (diffJours === -1) return "Hier";

  return date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formaterHeure(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extraireInitiales(nom) {
  if (!nom) return "?";
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

/**
 * Extrait le nom complet du patient depuis un objet rendez-vous.
 * Le backend peut renvoyer patient sous forme d'objet joint ou
 * uniquement patient_id — on gère les deux cas.
 */
function nomPatient(rdv) {
  if (rdv.patient?.nom_complet) return rdv.patient.nom_complet;

  // Cas Prisma : nom/prenom vivent sur Utilisateur, pas sur Patient
  // (Patient -> utilisateur -> { nom, prenom }).
  const u = rdv.patient?.utilisateur;
  if (u?.prenom && u?.nom) return `${u.prenom} ${u.nom}`;

  // Cas où le backend aurait aplati les champs directement sur patient.
  if (rdv.patient?.prenom && rdv.patient?.nom)
    return `${rdv.patient.prenom} ${rdv.patient.nom}`;

  if (rdv.patient_id) return `Patient #${String(rdv.patient_id).slice(0, 8)}`;
  return "Patient inconnu";
}

const MedecinRdv = () => {
  // status: 'loading' (session en cours de restauration) |
  // 'authenticated' | 'unauthenticated' — voir AuthContext.jsx.
  const { user, status } = useAuth();
  const estMedecin = status === "authenticated" && user?.role === "medecin";

  const [activeTab, setActiveTab] = useState("avenir");
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // ─── État des rendez-vous ───────────────────────────────────
  const [rendezVous, setRendezVous] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [actionEnCours, setActionEnCours] = useState(null); // id du RDV en cours de traitement

  // ─── Pop-up de détails d'une consultation ───────────────────
  const [detailRdv, setDetailRdv] = useState(null); // { rdv, categorie } | null
  const ouvrirDetail = (rdv, categorie) => setDetailRdv({ rdv, categorie });
  const fermerDetail = () => setDetailRdv(null);

  // ─── Modale de téléconsultation (visio) ──────────────────────
  const [visioRdv, setVisioRdv] = useState(null); // rdv | null
  const ouvrirVisio = (rdv) => {
    fermerDetail();
    setVisioRdv(rdv);
  };
  const fermerVisio = () => setVisioRdv(null);

  useEffect(() => {
    if (!detailRdv) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") fermerDetail();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [detailRdv]);

  // Durée optionnelle : un résumé financier (annulation) doit rester lisible
  // plus longtemps qu'un simple message de confirmation.
  const showToast = (msg, dureeMs = 2600) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), dureeMs);
  };

  // ─── Paiement du RDV affiché dans la modale de détail (B7) ──────
  // { rdvId, paiement } | null. `paiement.decomposition` contient, pour le
  // médecin concerné, { honoraires, commission_medecin (CM), net_medecin } —
  // jamais CP, ni les frais d'envoi, ni le total payé (D7) ; null pour une
  // transaction antérieure à la v2. Rien n'est lu pour un RDV non payé (D8).
  // Échec silencieux : ce bloc est purement informatif.
  const [paiementDetail, setPaiementDetail] = useState(null);
  useEffect(() => {
    if (!detailRdv || detailRdv.categorie === "annules") return undefined;
    if (estRdvNonPaye(detailRdv.rdv)) return undefined;
    const rdvId = detailRdv.rdv.rdv_id;
    let annule = false;
    (async () => {
      try {
        const { paiement } = await obtenirStatutPaiementRdv(rdvId);
        if (!annule) setPaiementDetail({ rdvId, paiement });
      } catch {
        if (!annule) setPaiementDetail(null);
      }
    })();
    return () => {
      annule = true;
    };
  }, [detailRdv]);

  // ─── Chargement initial ─────────────────────────────────────
  const chargerRendezVous = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const data = await listerRendezVousMedecinConnecte();
      setRendezVous(Array.isArray(data) ? data : []);
    } catch (err) {
      setErreur(err.message || "Impossible de charger vos rendez-vous.");
      setRendezVous([]);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    if (estMedecin) {
      chargerRendezVous();
    }
  }, [estMedecin, chargerRendezVous]);

  // ─── Répartition par onglet ─────────────────────────────────
  const rdvParCategorie = useMemo(() => {
    const categories = { avenir: [], attente: [], passes: [], annules: [] };
    for (const rdv of rendezVous) {
      const cat = categoriserRdv(rdv);
      if (categories[cat]) categories[cat].push(rdv);
    }
    // Tri : les plus proches en premier pour avenir/attente,
    // les plus récents en premier pour passes/annules
    categories.avenir.sort(
      (a, b) => new Date(a.date_creneau) - new Date(b.date_creneau)
    );
    categories.attente.sort(
      (a, b) => new Date(a.date_creneau) - new Date(b.date_creneau)
    );
    categories.passes.sort(
      (a, b) => new Date(b.date_creneau) - new Date(a.date_creneau)
    );
    categories.annules.sort(
      (a, b) => new Date(b.date_creneau) - new Date(a.date_creneau)
    );
    return categories;
  }, [rendezVous]);

  // ─── Statistiques dynamiques ────────────────────────────────
  const stats = useMemo(() => {
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    const finJournee = new Date(aujourdhui);
    finJournee.setDate(finJournee.getDate() + 1);

    const debutSemaine = new Date(aujourdhui);
    debutSemaine.setDate(debutSemaine.getDate() - debutSemaine.getDay() + 1);
    const finSemaine = new Date(debutSemaine);
    finSemaine.setDate(finSemaine.getDate() + 7);

    // « a_reprogrammer » reste dans « À venir » mais son créneau initial est
    // passé : on l'exclut des compteurs de la journée / semaine / visio.
    const avenirPlanifies = rdvParCategorie.avenir.filter(
      (r) => r.statut !== "a_reprogrammer"
    );

    const aujourdhuiCount = avenirPlanifies.filter((r) => {
      const d = new Date(r.date_creneau);
      return d >= aujourdhui && d < finJournee;
    }).length;

    const semaineCount = avenirPlanifies.filter((r) => {
      const d = new Date(r.date_creneau);
      return d >= aujourdhui && d < finSemaine;
    }).length;

    const teleconsultations = avenirPlanifies.filter(
      (r) => r.type_rdv === "teleconsultation"
    ).length;

    return [
      {
        label: "RDV aujourd'hui",
        value: aujourdhuiCount,
        icon: "fa-calendar-day",
        tint: "primary",
      },
      {
        label: "En attente de paiement",
        value: rdvParCategorie.attente.length,
        icon: "fa-hourglass-half",
        tint: "gold",
      },
      {
        label: "Cette semaine",
        value: semaineCount,
        icon: "fa-calendar-week",
        tint: "teal",
      },
      {
        label: "Téléconsultations",
        value: teleconsultations,
        icon: "fa-video",
        tint: "violet",
      },
    ];
  }, [rdvParCategorie]);

  // ─── Actions sur un RDV (D8) ────────────────────────────────
  // Le médecin n'« accepte » plus un rendez-vous : un RDV « cree » (non payé) est
  // en lecture seule pour lui, et la confirmation « cree -> confirme » résulte du
  // seul paiement du patient (le médecin est alors notifié). Le serveur refuse de
  // toute façon toute action médecin sur un RDV non payé (409 RDV_NON_PAYE) ;
  // l'interface désactive les boutons pour éviter un clic inutile.
  //
  // Refuser = annuler : le serveur exige un motif d'annulation (400
  // sinon) et déclenche le remboursement du patient. À moins de 24 h du
  // RDV, une amende est enregistrée au nom du médecin (déduite de sa
  // prochaine libération de fonds). Le même parcours sert à annuler un
  // RDV « a_reprogrammer » (aucune amende dans ce cas).
  const [rdvARefuser, setRdvARefuser] = useState(null); // rdv_id | null
  const refuser = (id) => {
    const rdv = rendezVous.find((r) => r.rdv_id === id);
    if (rdv && estRdvNonPaye(rdv)) {
      showToast(MESSAGE_RDV_NON_PAYE);
      return;
    }
    setRdvARefuser(id);
  };
  const fermerRefus = () => {
    if (!actionEnCours) setRdvARefuser(null);
  };
  // RDV visé par la modale d'annulation (avertissement + libellés).
  const rdvACibler = rendezVous.find((r) => r.rdv_id === rdvARefuser) ?? null;

  const confirmerRefus = async ({ motif, commentaire }) => {
    const id = rdvARefuser;
    if (!id) return;
    setActionEnCours(id);
    try {
      const data = await annulerRendezVousDetaille(id, { motif, commentaire });
      setRendezVous((prev) =>
        prev.map((r) => (r.rdv_id === id ? { ...r, statut: "annule" } : r))
      );
      setRdvARefuser(null);
      showToast(resumerAnnulation(data, "medecin"), 9000);
    } catch (err) {
      setRdvARefuser(null);
      if (estErreurRdvNonPaye(err)) {
        // Course ou liste périmée : le RDV n'est pas (ou plus) payé côté serveur.
        showToast(MESSAGE_RDV_NON_PAYE);
        chargerRendezVous();
      } else {
        showToast("Erreur : " + (err.message || "impossible de refuser le RDV."));
      }
    } finally {
      setActionEnCours(null);
    }
  };

  const tabs = [
    { key: "avenir", label: "À venir", count: rdvParCategorie.avenir.length },
    { key: "attente", label: "En attente", count: rdvParCategorie.attente.length },
    { key: "passes", label: "Passés", count: rdvParCategorie.passes.length },
    { key: "annules", label: "Annulés", count: rdvParCategorie.annules.length },
  ];

  // ─── Rendu d'un RDV (mutualisé) ────────────────────────────
  const renderRdvItem = (rdv, categorie) => {
    // D8 : RDV non payé = données minimales (aucune identité patient côté serveur).
    const nonPaye = estRdvNonPaye(rdv);
    const patient = nonPaye ? "Rendez-vous en attente de paiement" : nomPatient(rdv);
    const heure = formaterHeure(rdv.date_creneau);
    const date = formaterDateRelative(rdv.date_creneau);
    const typeLabel = TYPE_RDV_LABEL[rdv.type_rdv] || rdv.type_rdv;
    const typeIcon =
      rdv.type_rdv === "teleconsultation"
        ? "fa-video"
        : "fa-stethoscope";

    return (
      <article
        key={rdv.rdv_id}
        className={`rdv-item ${nonPaye ? "is-pending is-non-paye" : ""}`}
        onClick={() => ouvrirDetail(rdv, categorie)}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            ouvrirDetail(rdv, categorie);
          }
        }}
      >
        <div className="rdv-time">
          <span className="t">{heure}</span>
          <span className="d">{date}</span>
        </div>
        <div className="rdv-body">
          <h3>{patient}</h3>
          <div className="rdv-meta">
            {nonPaye ? (
              <span className="chip chip-st-attente">
                <i className="fa-solid fa-hourglass-half"></i> En attente de paiement
              </span>
            ) : (
              <span>
                <i className={`fa-solid ${typeIcon}`}></i>
                {typeLabel}
              </span>
            )}
            {rdv.statut === "a_reprogrammer" && (
              <span className="chip chip-st-attente">
                <i className="fa-solid fa-calendar-xmark"></i> À reprogrammer
              </span>
            )}
          </div>
        </div>
        <i className="fa-solid fa-chevron-right rdv-chevron" aria-hidden="true"></i>
      </article>
    );
  };

  // ─── Pop-up de détails d'une consultation ───────────────────
  const renderDetailModal = () => {
    if (!detailRdv) return null;
    const { rdv, categorie } = detailRdv;

    // D8 : RDV non payé = lecture seule, sans identité patient ni motif.
    const nonPaye = estRdvNonPaye(rdv);
    const patient = nonPaye ? "Rendez-vous en attente de paiement" : nomPatient(rdv);
    const initials = extraireInitiales(patient);
    const heure = formaterHeure(rdv.date_creneau);
    const dateComplete = rdv.date_creneau
      ? new Date(rdv.date_creneau).toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";
    const typeLabel = TYPE_RDV_LABEL[rdv.type_rdv] || rdv.type_rdv;
    const isTeleconsultation = rdv.type_rdv === "teleconsultation";
    const lieu = isTeleconsultation ? "Téléconsultation" : rdv.structure?.nom || "Cabinet";
    const lieuIcon = isTeleconsultation ? "fa-video" : "fa-location-dot";
    const typeIcon = isTeleconsultation ? "fa-video" : "fa-stethoscope";

    // B7 : net perçu, uniquement si le RDV est payé et que le serveur a
    // renvoyé la décomposition (absente pour les transactions pré-v2).
    const paiement =
      paiementDetail?.rdvId === rdv.rdv_id ? paiementDetail.paiement : null;
    const decomposition =
      paiement?.statut === "reussie" &&
      paiement.decomposition?.net_medecin != null
        ? paiement.decomposition
        : null;

    return (
      <div className="rdv-modal-overlay" onClick={fermerDetail}>
        <div
          className="rdv-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rdv-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <button className="rdv-modal-close" onClick={fermerDetail} aria-label="Fermer">
            <i className="fa-solid fa-xmark"></i>
          </button>

          <div className="rdv-modal-head">
            <div className="rdv-modal-avatar">
              {nonPaye ? <i className="fa-solid fa-hourglass-half"></i> : initials}
            </div>
            <div className="rdv-modal-heading">
              <h3 id="rdv-modal-title">{patient}</h3>
              {!nonPaye && (
                <span className="rdv-modal-type">
                  <i className={`fa-solid ${typeIcon}`}></i> {typeLabel}
                </span>
              )}
            </div>
          </div>

          <div className="rdv-modal-status">
            {nonPaye && (
              <span className="chip chip-st-attente">
                <i className="fa-solid fa-hourglass-half"></i> En attente de paiement
              </span>
            )}
            {categorie === "avenir" && rdv.statut !== "a_reprogrammer" && (
              <span className="chip chip-st-confirme">
                <i className="fa-solid fa-circle-check"></i> Confirmé
              </span>
            )}
            {rdv.statut === "a_reprogrammer" && (
              <span className="chip chip-st-attente">
                <i className="fa-solid fa-calendar-xmark"></i> À reprogrammer
              </span>
            )}
            {categorie === "passes" && (
              <>
                <span className="chip chip-st-termine">
                  <i className="fa-solid fa-circle-check"></i> Terminé
                </span>
                {rdv.statut === "non_honore" && (
                  <span className="chip chip-st-annule">
                    <i className="fa-solid fa-triangle-exclamation"></i> Non honoré
                  </span>
                )}
              </>
            )}
            {categorie === "annules" && (
              <span className="chip chip-st-annule">
                <i className="fa-solid fa-ban"></i>
                {rdv.statut === "conteste" ? "Contesté" : "Annulé"}
              </span>
            )}
          </div>

          {rdv.statut === "a_reprogrammer" && (
            <ReprogrammationPanel
              rdv={rdv}
              role="medecin"
              onChange={() => {
                fermerDetail();
                chargerRendezVous();
              }}
            />
          )}

          <div className="rdv-modal-details">
            <div className="rdv-modal-row">
              <i className="fa-solid fa-calendar-day"></i>
              <div>
                <span className="label">Date</span>
                <span className="value">{dateComplete}</span>
              </div>
            </div>
            <div className="rdv-modal-row">
              <i className="fa-solid fa-clock"></i>
              <div>
                <span className="label">Heure</span>
                <span className="value">{heure}</span>
              </div>
            </div>
            {!nonPaye && (
              <div className="rdv-modal-row">
                <i className={`fa-solid ${lieuIcon}`}></i>
                <div>
                  <span className="label">Lieu</span>
                  <span className="value">{lieu}</span>
                </div>
              </div>
            )}
            {!nonPaye && rdv.motif && (
              <div className="rdv-modal-row">
                <i className="fa-solid fa-comment-medical"></i>
                <div>
                  <span className="label">Motif</span>
                  <span className="value">{rdv.motif}</span>
                </div>
              </div>
            )}
          </div>

          {nonPaye && (
            <div className="note-box">
              <i className="fa-solid fa-circle-info"></i>
              <span>
                Ce rendez-vous n’est pas encore payé : vous ne pouvez pas agir
                dessus. Vous serez notifié et les détails vous seront communiqués
                dès que le patient aura réglé.
              </span>
            </div>
          )}

          {decomposition && (
            <div className="note-box">
              <i className="fa-solid fa-wallet"></i>
              <span>
                Vous recevrez{" "}
                <strong>
                  {montantDevise(decomposition.net_medecin, paiement.devise)}
                </strong>{" "}
                (honoraires{" "}
                {montantDevise(decomposition.honoraires, paiement.devise)} −
                commission APS (part médecin){" "}
                {montantDevise(
                  decomposition.commission_medecin ?? decomposition.commission_aps,
                  paiement.devise
                )}
                ). Montant avant amendes éventuelles.
              </span>
            </div>
          )}

          <div className="rdv-modal-actions">
            {/* D8 : RDV non payé — actions visibles mais désactivées. */}
            {nonPaye && (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm-aps"
                  disabled
                  title="Disponible une fois le paiement confirmé"
                >
                  <i className="fa-solid fa-check"></i> Accepter
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm-aps"
                  disabled
                  title="Disponible une fois le paiement confirmé"
                >
                  <i className="fa-solid fa-xmark"></i> Refuser
                </button>
              </>
            )}
            {/* Pas de visio pour « a_reprogrammer » : le créneau initial est passé. */}
            {categorie === "avenir" &&
              isTeleconsultation &&
              rdv.statut !== "a_reprogrammer" && (
                <button
                  className="btn btn-primary btn-sm-aps"
                  onClick={() => ouvrirVisio(rdv)}
                >
                  <i className="fa-solid fa-video"></i> Démarrer la visio
                </button>
              )}
            {categorie === "avenir" &&
              !isTeleconsultation &&
              rdv.statut !== "a_reprogrammer" && (
              <>
                <button className="btn btn-outline-primary btn-sm-aps">
                  <i className="fa-solid fa-folder-open"></i> Dossier
                </button>
                <button className="btn btn-ghost btn-sm-aps btn-icon" title="Reprogrammer">
                  <i className="fa-solid fa-rotate"></i>
                </button>
              </>
            )}
            {rdv.statut === "a_reprogrammer" && (
              <button
                className="btn btn-ghost btn-sm-aps"
                onClick={() => {
                  refuser(rdv.rdv_id);
                  fermerDetail();
                }}
                disabled={actionEnCours === rdv.rdv_id}
              >
                <i className="fa-solid fa-xmark"></i> Annuler le rendez-vous
              </button>
            )}
            {categorie === "passes" && (
              <button className="btn btn-outline-primary btn-sm-aps">
                <i className="fa-solid fa-file-pen"></i> Compte rendu
              </button>
            )}
            {categorie === "annules" && (
              <button className="btn btn-ghost btn-sm-aps">
                <i className="fa-solid fa-rotate"></i> Reprogrammer
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ─── Garde d'accès (session / rôle) ─────────────────────────
  // La restauration de session (voir AuthContext.jsx) est
  // asynchrone : tant qu'elle n'est pas résolue, on affiche un
  // simple état de chargement plutôt que de risquer un appel API
  // avec un access token pas encore posé en mémoire.
  if (status === "loading") {
    return (
      <div className="container-aps">
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Chargement…</span>
          </div>
          <p className="text-faint mt-2">Vérification de votre session…</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="container-aps">
        <div className="aps-empty-state">
          <i className="fa-solid fa-lock"></i>
          <div>Vous devez être connecté en tant que médecin pour accéder à cet espace.</div>
          {/* Adapter le chemin ci-dessous à la route de connexion réelle de l'app. */}
          <Link to="/connexion" className="btn btn-primary btn-sm-aps mt-3">
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  if (!estMedecin) {
    return (
      <div className="container-aps">
        <div className="aps-empty-state">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <div>Cet espace est réservé aux comptes médecin.</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="container-aps">
        <div className="portail-shell">
          <main className="portail-main">
            <header className="portail-head">
              <div>
                <span className="eyebrow">Espace médecin</span>
                <h1>Rendez-vous</h1>
                <p>
                  Demandes, confirmations et historique de vos consultations
                  {user?.prenom ? `, Dr. ${user.prenom}` : ""}.
                </p>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <button
                  className="btn btn-outline-primary btn-sm-aps"
                  onClick={() => showToast("Export en cours de préparation (démo).")}
                >
                  <i className="fa-solid fa-download"></i> Exporter
                </button>
                <Link
                  to="/portail/medecin-agenda"
                  className="btn btn-primary btn-sm-aps"
                >
                  <i className="fa-solid fa-calendar-days"></i> Ouvrir l'agenda
                </Link>
              </div>
            </header>

            {/* Stats */}
            <div className="stat-row">
              {stats.map((stat) => (
                <div key={stat.label} className="stat-card">
                  <div className={`stat-icon i-${stat.tint}`}>
                    <i className={`fa-solid ${stat.icon}`}></i>
                  </div>
                  <div>
                    <div className="stat-value">{stat.value}</div>
                    <div className="stat-label">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bandeau : RDV à reprogrammer (visible sans ouvrir le détail) */}
            {rdvParCategorie.avenir.some((r) => r.statut === "a_reprogrammer") && (
              <div className="alert alert-warning" role="status">
                <i className="fa-solid fa-triangle-exclamation me-2"></i>
                {rdvParCategorie.avenir.filter((r) => r.statut === "a_reprogrammer").length}{" "}
                rendez-vous à reprogrammer : ouvrez-le pour proposer ou accepter
                une date (délai de 48 h).
              </div>
            )}

            {/* Bandeau d'erreur */}
            {erreur && (
              <div className="alert alert-danger d-flex align-items-center" role="alert">
                <i className="fa-solid fa-circle-exclamation me-2"></i>
                <div className="flex-grow-1">{erreur}</div>
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={chargerRendezVous}
                >
                  Réessayer
                </button>
              </div>
            )}

            {/* Onglets + listes */}
            <div className="info-card">
              <div className="aps-tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={activeTab === tab.key ? "active" : ""}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}{" "}
                    {tab.count != null && (
                      <span className="tab-count">{tab.count}</span>
                    )}
                  </button>
                ))}
              </div>

              <div>
                {chargement ? (
                  <div className="text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Chargement…</span>
                    </div>
                    <p className="text-faint mt-2">Chargement de vos rendez-vous…</p>
                  </div>
                ) : (
                  <>
                    {/* À VENIR */}
                    {activeTab === "avenir" && (
                      <div className="tab-panel active">
                        <div className="rdv-list">
                          {rdvParCategorie.avenir.length === 0 ? (
                            <div className="aps-empty-state">
                              <i className="fa-solid fa-calendar-check"></i>
                              <div>Aucun rendez-vous à venir.</div>
                            </div>
                          ) : (
                            rdvParCategorie.avenir.map((rdv) => renderRdvItem(rdv, "avenir"))
                          )}
                        </div>
                      </div>
                    )}

                    {/* EN ATTENTE */}
                    {activeTab === "attente" && (
                      <div className="tab-panel active">
                        <p
                          className="text-faint mb-3"
                          style={{ fontSize: ".82rem" }}
                        >
                          <i className="fa-solid fa-circle-info"></i> Ces
                          rendez-vous attendent le paiement du patient : vous ne
                          pouvez pas agir dessus. Vous serez notifié dès que le
                          paiement sera confirmé.
                        </p>
                        <div className="rdv-list">
                          {rdvParCategorie.attente.length === 0 ? (
                            <div className="aps-empty-state">
                              <i className="fa-solid fa-inbox"></i>
                              <div>Aucun rendez-vous en attente de paiement.</div>
                            </div>
                          ) : (
                            rdvParCategorie.attente.map((rdv) =>
                              renderRdvItem(rdv, "attente")
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {/* PASSÉS */}
                    {activeTab === "passes" && (
                      <div className="tab-panel active">
                        <div className="rdv-list">
                          {rdvParCategorie.passes.length === 0 ? (
                            <div className="aps-empty-state">
                              <i className="fa-solid fa-clock-rotate-left"></i>
                              <div>Aucun rendez-vous passé.</div>
                            </div>
                          ) : (
                            rdvParCategorie.passes.map((rdv) =>
                              renderRdvItem(rdv, "passes")
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {/* ANNULÉS */}
                    {activeTab === "annules" && (
                      <div className="tab-panel active">
                        <div className="rdv-list">
                          {rdvParCategorie.annules.length === 0 ? (
                            <div className="aps-empty-state">
                              <i className="fa-solid fa-ban"></i>
                              <div>Aucun rendez-vous annulé.</div>
                            </div>
                          ) : (
                            rdvParCategorie.annules.map((rdv) =>
                              renderRdvItem(rdv, "annules")
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </main>
          <PortailSidebar />
        </div>
      </div>

      <div className={`toast-aps ${toast ? "show" : ""}`} role="status">
        <i className="fa-solid fa-circle-check"></i>
        <span>{toast}</span>
      </div>

      {renderDetailModal()}

      <MotifAnnulationModal
        open={rdvARefuser !== null}
        titre={
          rdvACibler?.statut === "a_reprogrammer"
            ? "Annuler ce rendez-vous ?"
            : "Refuser cette demande ?"
        }
        message="Le rendez-vous sera annulé et le patient remboursé selon la politique de fonds."
        avertissement={
          rdvACibler ? (
            <AvertissementAnnulation key={rdvACibler.rdv_id} rdv={rdvACibler} role="medecin" />
          ) : null
        }
        labelConfirmer={
          rdvACibler?.statut === "a_reprogrammer" ? "Annuler le RDV" : "Refuser"
        }
        motifs={MOTIFS_ANNULATION_MEDECIN}
        enCours={actionEnCours !== null && actionEnCours === rdvARefuser}
        onClose={fermerRefus}
        onConfirm={confirmerRefus}
      />

      {visioRdv && (
        <VisioModal
          rdv={visioRdv}
          patientNom={nomPatient(visioRdv)}
          onClose={fermerVisio}
        />
      )}
    </>
  );
};

export default MedecinRdv;