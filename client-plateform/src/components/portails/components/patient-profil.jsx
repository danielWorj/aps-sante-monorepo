// src/pages/patient-profil.jsx
//
// ⚠️ DIFFÉRENCE IMPORTANTE avec medecin-profil.jsx : cette page est en
// LECTURE SEULE, volontairement.
//
// medecin-profil.jsx est un formulaire éditable parce qu'il existe
// côté backend une route PUT /medecins/:id (medecinService.modifierMedecin)
// pour la persister. Pour `patient`, les fichiers fournis
// (patient.routes.js, patient.controller.js, patientService.js)
// n'exposent AUCUNE route de modification : ni PUT/PATCH
// /patients/:id, ni /patients/mon-profil. Le modèle Prisma `Patient`
// lui-même ne porte que `date_naissance` en plus du lien vers
// `Utilisateur` (pas de spécialité, pas de documents, pas de photo —
// rien de comparable à la fiche médecin).
//
// Construire un <form> avec handleSubmit ici appellerait une route qui
// n'existe pas et échouerait systématiquement en production. Cette
// page se limite donc à :
//   1. Afficher le profil du patient connecté (identité + date de
//      naissance) en lecture seule, via GET /patients/mon-profil ;
//   2. Afficher un résumé d'activité (total rendez-vous, total
//      ordonnances, prochain rendez-vous) — déjà renvoyé par la même
//      route ;
//   3. Lister ses rendez-vous avec filtre par statut, via
//      GET /patients/:id/rendez-vous.
//
// Si un jour une vraie édition du profil patient est nécessaire
// (téléphone, pays de résidence, etc.), il faudra d'abord ajouter côté
// backend une route dédiée (ex. PATCH /patients/mon-profil ou
// PATCH /auth/me) puis une fonction modifierMonProfil() dans
// patientService.js — et alors seulement reprendre le patron de
// medecin-profil.jsx (state éditable + save-bar + toast).

import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import PortailSidebar from "../layouts/portail-sidebar";
import { useAuth } from "./../../../context/AuthContext";
import * as patientService from "../../../services/patientService";

// Labels + classes d'affichage pour les statuts de rendez-vous.
// Valeurs alignées sur STATUTS_RDV côté backend
// (patient.controller.js) — réutilisées telles quelles, pas de
// mapping à part deviner.
const STATUT_RDV_INFOS = {
  cree: { label: "Créé", classe: "chip-info" },
  confirme: { label: "Confirmé", classe: "chip-verifie" },
  en_attente_presence: { label: "En attente de présence", classe: "chip-semaine" },
  honore: { label: "Honoré", classe: "chip-verifie" },
  non_honore: { label: "Non honoré", classe: "chip-danger" },
  annule: { label: "Annulé", classe: "chip-danger" },
  conteste: { label: "Contesté", classe: "chip-danger" },
};

function formaterDate(valeur, avecHeure = false) {
  if (!valeur) return "—";
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...(avecHeure ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

const PatientProfil = () => {
  const { status: authStatus } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [profile, setProfile] = useState(null);
  const [statistiques, setStatistiques] = useState(null);

  const [rendezVous, setRendezVous] = useState([]);
  const [chargementRdv, setChargementRdv] = useState(false);
  const [filtreStatut, setFiltreStatut] = useState("");

  // Chargement initial du profil (identité + statistiques).
  useEffect(() => {
    if (authStatus === "loading") return;
    if (authStatus === "unauthenticated") {
      navigate("/login");
      return;
    }

    async function chargerProfil() {
      try {
        setLoading(true);
        setError(null);

        const { patient, statistiques: stats } = await patientService.obtenirMonProfil();

        setProfile({
          patient_id: patient.patient_id,
          utilisateur_id: patient.utilisateur_id,
          date_naissance: patient.date_naissance,
          nom: patient.utilisateur?.nom || "",
          prenom: patient.utilisateur?.prenom || "",
          email: patient.utilisateur?.email || "",
          telephone: patient.utilisateur?.telephone || "",
          statut_compte: patient.utilisateur?.statut_compte || "",
        });
        setStatistiques(stats);
      } catch (err) {
        console.error("Erreur de chargement du profil patient", err);
        setError(err.message || "Impossible de charger votre profil.");
      } finally {
        setLoading(false);
      }
    }

    chargerProfil();
  }, [authStatus, navigate]);

  // Chargement (et rechargement au changement de filtre) des rendez-vous
  // du patient. Utilise directement listerRendezVousPatient(patient_id)
  // plutôt que patientService.listerMesRendezVous() : on a déjà
  // patient_id via obtenirMonProfil() ci-dessus, pas besoin de refaire
  // un aller-retour /patients/mon-profil pour chaque changement de
  // filtre (voir la note d'optimisation dans patientService.js).
  const chargerRendezVous = useCallback(async () => {
    if (!profile?.patient_id) return;
    try {
      setChargementRdv(true);
      const filtres = filtreStatut ? { statut: filtreStatut } : {};
      const data = await patientService.listerRendezVousPatient(profile.patient_id, filtres);
      setRendezVous(data || []);
    } catch (err) {
      console.error("Erreur de chargement des rendez-vous", err);
    } finally {
      setChargementRdv(false);
    }
  }, [profile?.patient_id, filtreStatut]);

  useEffect(() => {
    chargerRendezVous();
  }, [chargerRendezVous]);

  if (authStatus === "loading" || loading) {
    return (
      <div className="container-aps">
        <div className="portail-shell">
          <main className="portail-main d-flex justify-content-center align-items-center" style={{ minHeight: "60vh" }}>
            <div className="text-center">
              <div className="spinner-border text-primary mb-3" role="status" />
              <div>Chargement de votre profil…</div>
            </div>
          </main>
          <PortailSidebar />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container-aps">
        <div className="portail-shell">
          <main className="portail-main">
            <div className="alert alert-danger" role="alert">
              <i className="fa-solid fa-triangle-exclamation me-2"></i>
              {error || "Profil introuvable."}
            </div>
          </main>
          <PortailSidebar />
        </div>
      </div>
    );
  }

  const prochainRdv = statistiques?.prochain_rendez_vous;

  return (
    <div className="container-aps">
      <div className="portail-shell">
        <main className="portail-main">
          <header className="portail-head">
            <div>
              <span className="eyebrow">Espace patient</span>
              <h1>Mon profil</h1>
              <p>Vos informations personnelles et le suivi de vos rendez-vous.</p>
              <div className="chips-row">
                {statistiques && (
                  <>
                    <span className="chip chip-info">
                      <i className="fa-solid fa-calendar-check"></i> {statistiques.total_rendez_vous} rendez-vous
                    </span>
                    <span className="chip chip-info">
                      <i className="fa-solid fa-file-prescription"></i> {statistiques.total_ordonnances} ordonnances
                    </span>
                  </>
                )}
              </div>
            </div>
            <Link to="/rendez-vous/nouveau" className="btn btn-primary btn-sm-aps">
              <i className="fa-solid fa-calendar-plus"></i> Prendre rendez-vous
            </Link>
          </header>

          {/* Identité — lecture seule : aucune route de modification
              n'existe côté backend pour le profil patient (voir note
              d'en-tête). */}
          <div className="info-card">
            <h3><i className="fa-solid fa-id-card"></i> Identité</h3>
            <p className="text-muted small mb-3">
              Ces informations ne sont pas modifiables depuis cette page. Contactez le support APS pour toute correction.
            </p>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label-aps">Nom</label>
                <input type="text" className="form-control" value={profile.nom} readOnly disabled />
              </div>
              <div className="col-md-6">
                <label className="form-label-aps">Prénom</label>
                <input type="text" className="form-control" value={profile.prenom} readOnly disabled />
              </div>
              <div className="col-md-6">
                <label className="form-label-aps">Adresse e-mail</label>
                <input type="email" className="form-control" value={profile.email} readOnly disabled />
              </div>
              <div className="col-md-6">
                <label className="form-label-aps">Téléphone</label>
                <input type="tel" className="form-control" value={profile.telephone || "—"} readOnly disabled />
              </div>
              <div className="col-md-6">
                <label className="form-label-aps">Date de naissance</label>
                <input type="text" className="form-control" value={formaterDate(profile.date_naissance)} readOnly disabled />
              </div>
            </div>
          </div>

          {/* Prochain rendez-vous en évidence */}
          {prochainRdv && (
            <div className="info-card">
              <h3><i className="fa-solid fa-clock"></i> Prochain rendez-vous</h3>
              <div className="p-3 border rounded d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                  <strong>
                    Dr {prochainRdv.medecin?.utilisateur?.prenom} {prochainRdv.medecin?.utilisateur?.nom}
                  </strong>
                  <div className="text-muted small">{formaterDate(prochainRdv.date_creneau, true)}</div>
                </div>
                <span className={`chip ${STATUT_RDV_INFOS[prochainRdv.statut]?.classe || "chip-info"}`}>
                  {STATUT_RDV_INFOS[prochainRdv.statut]?.label || prochainRdv.statut}
                </span>
              </div>
            </div>
          )}

          {/* Liste des rendez-vous, avec filtre par statut */}
          <div className="info-card">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
              <h3 className="mb-0"><i className="fa-solid fa-calendar-days"></i> Mes rendez-vous</h3>
              <select
                className="form-select form-select-sm"
                style={{ maxWidth: 240 }}
                value={filtreStatut}
                onChange={(e) => setFiltreStatut(e.target.value)}
              >
                <option value="">Tous les statuts</option>
                {Object.entries(STATUT_RDV_INFOS).map(([valeur, { label }]) => (
                  <option key={valeur} value={valeur}>{label}</option>
                ))}
              </select>
            </div>

            {chargementRdv && (
              <div className="text-center py-3">
                <span className="spinner-border spinner-border-sm text-primary" role="status" />
              </div>
            )}

            {!chargementRdv && rendezVous.length === 0 && (
              <div className="note-box">
                <i className="fa-solid fa-circle-info"></i>
                <span>Aucun rendez-vous {filtreStatut ? "pour ce statut" : "pour le moment"}.</span>
              </div>
            )}

            {!chargementRdv && rendezVous.length > 0 && (
              <div className="table-responsive">
                <table className="table align-middle">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Médecin</th>
                      <th>Structure</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rendezVous.map((rdv) => (
                      <tr key={rdv.rdv_id}>
                        <td>{formaterDate(rdv.date_creneau, true)}</td>
                        <td>
                          {rdv.medecin?.utilisateur
                            ? `Dr ${rdv.medecin.utilisateur.prenom} ${rdv.medecin.utilisateur.nom}`
                            : "—"}
                        </td>
                        <td>{rdv.structure?.nom || "—"}</td>
                        <td>
                          <span className={`chip ${STATUT_RDV_INFOS[rdv.statut]?.classe || "chip-info"}`}>
                            {STATUT_RDV_INFOS[rdv.statut]?.label || rdv.statut}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
        <PortailSidebar />
      </div>
    </div>
  );
};

export default PatientProfil;