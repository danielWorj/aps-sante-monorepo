// medecin-rdv.jsx
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import PortailNavbar from "./../layouts/portail-navbar";
import PortailFooter from "./../layouts/portail-footer";
import PortailSidebar from "./../layouts/portail-sidebar";
import VisioModal from "./visio-modal";
import {
  listerRendezVousMedecinConnecte,
  modifierRendezVous,
  STATUTS_RENDEZ_VOUS,
  TYPES_RENDEZ_VOUS,
} from "./../../../services/medecinService";
import { useAuth } from "./../../../context/AuthContext";
import { categoriserRdv } from "./../../../utils/rdv";

// ─── Helpers de formatage ─────────────────────────────────────
const TYPE_RDV_LABEL = {
  physique: "Consultation physique",
  teleconsultation: "Téléconsultation",
};

const STATUT_LABEL = Object.fromEntries(
  STATUTS_RENDEZ_VOUS.map((s) => [s.valeur, s.libelle])
);

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

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

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

    const aujourdhuiCount = rdvParCategorie.avenir.filter((r) => {
      const d = new Date(r.date_creneau);
      return d >= aujourdhui && d < finJournee;
    }).length;

    const semaineCount = rdvParCategorie.avenir.filter((r) => {
      const d = new Date(r.date_creneau);
      return d >= aujourdhui && d < finSemaine;
    }).length;

    const teleconsultations = rdvParCategorie.avenir.filter(
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
        label: "Demandes en attente",
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

  // ─── Actions accepter / refuser ─────────────────────────────
  const accepter = async (id) => {
    setActionEnCours(id);
    try {
      await modifierRendezVous(id, { statut: "confirme" });
      setRendezVous((prev) =>
        prev.map((r) => (r.rdv_id === id ? { ...r, statut: "confirme" } : r))
      );
      showToast("Rendez-vous confirmé — le patient a été notifié.");
    } catch (err) {
      showToast("Erreur : " + (err.message || "impossible de confirmer le RDV."));
    } finally {
      setActionEnCours(null);
    }
  };

  const refuser = async (id) => {
    setActionEnCours(id);
    try {
      await modifierRendezVous(id, { statut: "annule" });
      setRendezVous((prev) =>
        prev.map((r) => (r.rdv_id === id ? { ...r, statut: "annule" } : r))
      );
      showToast("Demande refusée — le patient sera remboursé.");
    } catch (err) {
      showToast("Erreur : " + (err.message || "impossible de refuser le RDV."));
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
    const patient = nomPatient(rdv);
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
        className={`rdv-item ${categorie === "attente" && rdv.statut === "cree" ? "is-pending" : ""}`}
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
            <span>
              <i className={`fa-solid ${typeIcon}`}></i>
              {typeLabel}
            </span>
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

    const patient = nomPatient(rdv);
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
            <div className="rdv-modal-avatar">{initials}</div>
            <div className="rdv-modal-heading">
              <h3 id="rdv-modal-title">{patient}</h3>
              <span className="rdv-modal-type">
                <i className={`fa-solid ${typeIcon}`}></i> {typeLabel}
              </span>
            </div>
          </div>

          <div className="rdv-modal-status">
            {categorie === "attente" && rdv.statut === "cree" && (
              <span className="chip chip-st-attente">
                <i className="fa-solid fa-hourglass-half"></i> En attente de votre validation
              </span>
            )}
            {categorie === "avenir" && (
              <span className="chip chip-st-confirme">
                <i className="fa-solid fa-circle-check"></i> Confirmé
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
            <div className="rdv-modal-row">
              <i className={`fa-solid ${lieuIcon}`}></i>
              <div>
                <span className="label">Lieu</span>
                <span className="value">{lieu}</span>
              </div>
            </div>
            {rdv.motif && (
              <div className="rdv-modal-row">
                <i className="fa-solid fa-comment-medical"></i>
                <div>
                  <span className="label">Motif</span>
                  <span className="value">{rdv.motif}</span>
                </div>
              </div>
            )}
          </div>

          <div className="rdv-modal-actions">
            {categorie === "attente" && rdv.statut === "cree" && (
              <>
                <button
                  className="btn btn-primary btn-sm-aps"
                  onClick={() => {
                    accepter(rdv.rdv_id);
                    fermerDetail();
                  }}
                  disabled={actionEnCours === rdv.rdv_id}
                >
                  {actionEnCours === rdv.rdv_id ? (
                    <span className="spinner-border spinner-border-sm me-1"></span>
                  ) : (
                    <i className="fa-solid fa-check"></i>
                  )}
                  Accepter
                </button>
                <button
                  className="btn btn-outline-primary btn-sm-aps"
                  onClick={() => {
                    refuser(rdv.rdv_id);
                    fermerDetail();
                  }}
                  disabled={actionEnCours === rdv.rdv_id}
                >
                  <i className="fa-solid fa-xmark"></i> Refuser
                </button>
              </>
            )}
            {categorie === "avenir" && isTeleconsultation && (
              <button
                className="btn btn-primary btn-sm-aps"
                onClick={() => ouvrirVisio(rdv)}
              >
                <i className="fa-solid fa-video"></i> Démarrer la visio
              </button>
            )}
            {categorie === "avenir" && !isTeleconsultation && (
              <>
                <button className="btn btn-outline-primary btn-sm-aps">
                  <i className="fa-solid fa-folder-open"></i> Dossier
                </button>
                <button className="btn btn-ghost btn-sm-aps btn-icon" title="Reprogrammer">
                  <i className="fa-solid fa-rotate"></i>
                </button>
              </>
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
                          <i className="fa-solid fa-circle-info"></i> Acceptez
                          ou refusez chaque demande : les fonds ne sont capturés
                          qu'après votre acceptation.
                        </p>
                        <div className="rdv-list">
                          {rdvParCategorie.attente.length === 0 ? (
                            <div className="aps-empty-state">
                              <i className="fa-solid fa-inbox"></i>
                              <div>Aucune demande en attente.</div>
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