// src/components/RendezVous.jsx
//
// Gestion des rendez-vous (diagramme médecin, cf. medecinService.js /
// rendezVous.controller.js). Consomme exclusivement `medecinService.js` :
// listerRendezVous / creerRendezVous / modifierRendezVous /
// supprimerRendezVous, plus listerMedecins pour peupler le sélecteur
// de médecin à la création (côté patient).
//
// Droits (confirmés par rendezVous.controller.js — le serveur reste la
// seule source de vérité, le front ne fait que masquer les actions non
// pertinentes) :
//   - GET    : authentifié, toujours scopé au patient/médecin courant
//              côté serveur, sauf admin/superadmin qui filtre librement.
//   - POST   : réservé à un compte PATIENT (patient_id déduit du
//              token, jamais envoyé par le client) — 403 sinon, y
//              compris pour un médecin ou un admin.
//   - PUT    : le patient concerné, le médecin concerné, OU
//              admin/superadmin — reprogrammation (date_creneau),
//              changement de statut (confirmation, annulation,
//              contestation…), correction du motif. `type_rdv` est
//              IMMUABLE après création (absent du PUT côté serveur).
//   - DELETE : admin/superadmin UNIQUEMENT — suppression physique,
//              réservée en dernier recours (un rendez-vous s'annule
//              normalement via PUT statut="annule"). 409 si une
//              ordonnance est encore rattachée.
//
// `code_unique` (contrôle de présence à l'accueil) est affiché tel que
// renvoyé par le serveur ; `qr_token_secret` n'est JAMAIS affiché ici,
// même si le serveur le renvoie dans le corps de la réponse — c'est un
// secret de vérification, pas une donnée d'écran.
//
// Le rôle de l'utilisateur connecté détermine la vue :
//   - patient  → ne voit/ne filtre que SES rendez-vous (patient_id
//                déduit du token côté serveur) ; seul rôle pouvant
//                réserver un nouveau créneau ; peut reprogrammer,
//                préciser le motif, ou annuler/contester les siens.
//   - médecin  → ne voit/ne filtre que SES rendez-vous ; peut faire
//                évoluer le statut (confirmer, marquer honoré/non
//                honoré…) et préciser le motif, jamais en créer.
//   - admin/superadmin → vue élargie avec filtres médecin/patient/
//                statut libres ; peut tout modifier ; seul rôle
//                pouvant supprimer physiquement, jamais créer.
//
// ⚠️ Comme pour Ordonnance.jsx, l'identification du profil courant
// (medecin_id / patient_id à partir du compte connecté) reste une
// HYPOTHÈSE par analogie avec le reste du front (aucun profil
// "patient" distinct documenté dans AuthContext) — à confirmer avec
// /auth/me réel.
//
// Reprend le patron "Modal piloté par état React" de
// ForfaitPublicitaire.jsx / Ordonnance.jsx / Referentiel.jsx.

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  listerRendezVous,
  creerRendezVous,
  modifierRendezVous,
  supprimerRendezVous,
  listerMedecins,
  STATUTS_RENDEZ_VOUS,
  TYPES_RENDEZ_VOUS,
  MOTIF_RENDEZ_VOUS_LONGUEUR_MAX,
} from '../services/medecinService';
import './../assets/style/RendezVous.css';

/* ────────────────────────── Aides rôle / identité ────────────────────────── */

function extraireChampCandidat(objetUtilisateur, cles) {
  if (!objetUtilisateur || typeof objetUtilisateur !== 'object') return null;
  for (const cle of cles) {
    const valeur = cle.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), objetUtilisateur);
    if (valeur !== undefined && valeur !== null && valeur !== '') return valeur;
  }
  return null;
}

function extraireNomRole(objetUtilisateur) {
  const candidat = extraireChampCandidat(objetUtilisateur, [
    'role',
    'role.nom',
    'role.libelle',
    'role_nom',
    'type_compte',
    'utilisateur.role',
    'roles.0',
    'roles.0.nom',
  ]);
  return typeof candidat === 'string' ? candidat.trim().toLowerCase() : null;
}

// Hypothèse : le profil médecin réutilise l'identifiant du compte
// utilisateur (aucun `medecin.medecin_id` distinct garanti par
// AuthContext) — à confirmer avec /auth/me réel.
function extraireMedecinId(objetUtilisateur) {
  return extraireChampCandidat(objetUtilisateur, [
    'medecin_id',
    'medecin.medecin_id',
    'profil_medecin.medecin_id',
    'utilisateur_id',
    'id',
  ]);
}

// Hypothèse : idem côté patient — pas de profil "patient" distinct
// documenté, on suppose patient_id === utilisateur_id du compte.
function extraireUtilisateurId(objetUtilisateur) {
  return extraireChampCandidat(objetUtilisateur, ['utilisateur_id', 'id']);
}

function idsEgaux(a, b) {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  return String(a) === String(b);
}

/* ────────────────────────── Référentiels d'affichage ────────────────────────── */

// Confirmés par rendezVous.controller.js (STATUTS_RDV / TYPES_RDV) via
// STATUTS_RENDEZ_VOUS / TYPES_RENDEZ_VOUS (medecinService.js) — le
// libellé/badge/icône associés restent un choix d'affichage local.
const STATUT_META = {
  cree: { badge: 'is-info', icone: 'fa-circle-plus' },
  confirme: { badge: 'is-primary', icone: 'fa-circle-check' },
  en_attente_presence: { badge: 'is-warning', icone: 'fa-hourglass-half' },
  honore: { badge: 'is-success', icone: 'fa-check-double' },
  non_honore: { badge: 'is-danger', icone: 'fa-user-xmark' },
  annule: { badge: 'is-muted', icone: 'fa-ban' },
  conteste: { badge: 'is-danger', icone: 'fa-triangle-exclamation' },
};

const TYPE_META = {
  physique: { libelle: 'Physique', icone: 'fa-hospital' },
  teleconsultation: { libelle: 'Téléconsultation', icone: 'fa-video' },
};

function libelleStatut(valeur) {
  return STATUTS_RENDEZ_VOUS.find((s) => s.valeur === valeur)?.libelle || valeur || '—';
}

function libelleType(valeur) {
  return TYPE_META[valeur]?.libelle || valeur || '—';
}

// Transitions de statut proposées côté front, par rôle — le serveur
// ne valide que l'appartenance à l'enum (voir commentaire de
// modifierRendezVous dans rendezVous.controller.js) : ces listes ne
// sont qu'un garde-fou d'UX, pas une règle de sécurité.
function statutsProposes(role, statutActuel) {
  let autorises;
  if (role === 'admin' || role === 'superadmin') {
    autorises = STATUTS_RENDEZ_VOUS.map((s) => s.valeur);
  } else if (role === 'medecin') {
    autorises = ['confirme', 'en_attente_presence', 'honore', 'non_honore', 'annule'];
  } else {
    // patient
    autorises = ['annule', 'conteste'];
  }
  const ensemble = new Set(autorises);
  if (statutActuel) ensemble.add(statutActuel);
  return STATUTS_RENDEZ_VOUS.filter((s) => ensemble.has(s.valeur));
}

/* ────────────────────────── Aides d'affichage ────────────────────────── */

function formaterDateHeure(valeur) {
  if (!valeur) return '—';
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// input[type=datetime-local] attend "YYYY-MM-DDTHH:mm" en heure locale.
function versDatetimeLocal(valeur) {
  if (!valeur) return '';
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function apercuTexte(texte, longueur = 90) {
  if (!texte) return '—';
  const propre = String(texte).replace(/\s+/g, ' ').trim();
  return propre.length > longueur ? `${propre.slice(0, longueur)}…` : propre;
}

function libelleMedecin(m) {
  if (!m) return '—';
  const nomComplet = [m.prenom, m.nom].filter(Boolean).join(' ').trim();
  const specialite = m.specialite?.nom || m.specialite_nom || null;
  if (nomComplet && specialite) return `Dr ${nomComplet} — ${specialite}`;
  if (nomComplet) return `Dr ${nomComplet}`;
  return m.medecin_id || '—';
}

/* ────────────────────────── Modale générique ────────────────────────── */

function Modal({ id, title, isOpen, onClose, children, footer, large }) {
  if (!isOpen) return null;
  return (
    <>
      <div className="modal fade show d-block" id={id} tabIndex="-1" role="dialog">
        <div className={`modal-dialog${large ? ' modal-lg' : ''}`}>
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{title}</h5>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body">{children}</div>
            <div className="modal-footer">{footer}</div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" onClick={onClose}></div>
    </>
  );
}

const FORM_CREATION_VIDE = { medecin_id: '', type_rdv: 'physique', date_creneau: '', structure_id: '', motif: '' };
const FORM_EDITION_VIDE = { rdv_id: '', statut: '', date_creneau: '', structure_id: '', motif: '' };

export default function RendezVous() {
  const { user, status } = useAuth();
  const role = extraireNomRole(user);
  const estMedecin = role === 'medecin';
  const estAdmin = role === 'admin' || role === 'superadmin';
  // Faute de rôle "patient" explicite dans le référentiel des rôles,
  // tout compte ni médecin ni admin est traité comme un patient.
  const estPatient = !estMedecin && !estAdmin;

  const medecinId = estMedecin ? extraireMedecinId(user) : null;
  const patientId = estPatient ? extraireUtilisateurId(user) : null;

  const peutCreer = estPatient; // seul un compte patient peut réserver, cf. contrôleur
  const peutSupprimer = estAdmin; // suppression physique, jamais côté médecin/patient
  const peutModifier = useCallback(
    (rdv) =>
      estAdmin ||
      (estMedecin && idsEgaux(rdv.medecin_id, medecinId)) ||
      (estPatient && idsEgaux(rdv.patient_id, patientId)),
    [estAdmin, estMedecin, estPatient, medecinId, patientId]
  );

  /* ─── Chargement des données ─────────────────────────────────── */

  const [rendezVous, setRendezVous] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState(null);

  const [medecinsDisponibles, setMedecinsDisponibles] = useState([]); // sélecteur de création (patient uniquement)
  const [chargementMedecins, setChargementMedecins] = useState(false);

  const [filtreStatut, setFiltreStatut] = useState('');
  const [filtreMedecinAdmin, setFiltreMedecinAdmin] = useState('');
  const [filtrePatientAdmin, setFiltrePatientAdmin] = useState('');
  const [recherche, setRecherche] = useState('');

  // Options des sélecteurs de filtre admin (médecin / patient) —
  // chargées une seule fois, indépendamment des filtres actifs, pour
  // ne pas faire disparaître des options au fur et à mesure qu'on
  // filtre la liste des rendez-vous.
  const [medecinsFiltrablesAdmin, setMedecinsFiltrablesAdmin] = useState([]);
  const [patientsFiltrablesAdmin, setPatientsFiltrablesAdmin] = useState([]);
  const [chargementFiltresAdmin, setChargementFiltresAdmin] = useState(false);

  const chargerMedecinsDisponibles = useCallback(() => {
    if (!peutCreer) {
      setMedecinsDisponibles([]);
      return;
    }
    setChargementMedecins(true);
    // Hypothèse : on ne propose à la réservation que les fiches déjà
    // publiées (même patron que STATUT_META.publie dans Medecin.jsx).
    listerMedecins({ statut_verification: 'publie' })
      .then((liste) => setMedecinsDisponibles(liste))
      .catch(() => setMedecinsDisponibles([]))
      .finally(() => setChargementMedecins(false));
  }, [peutCreer]);

  // Alimente les sélecteurs "Médecin" / "Patient" du filtre admin.
  // `listerMedecins()` sans filtre renvoie l'annuaire complet (à la
  // différence de `medecinsDisponibles` ci-dessus, restreint aux
  // fiches publiées pour la réservation côté patient).
  // ⚠️ Aucun `listerPatients()` n'existe dans medecinService.js : la
  // liste des patients est donc déduite des rendez-vous existants
  // (non filtrés), seule source de cette information côté front — à
  // remplacer par un vrai annuaire si un endpoint patients est ajouté
  // côté serveur.
  const chargerFiltresAdmin = useCallback(() => {
    if (!estAdmin) {
      setMedecinsFiltrablesAdmin([]);
      setPatientsFiltrablesAdmin([]);
      return;
    }
    setChargementFiltresAdmin(true);
    Promise.all([listerMedecins(), listerRendezVous()])
      .then(([medecins, tousLesRdv]) => {
        setMedecinsFiltrablesAdmin(medecins);
        const parPatient = new Map();
        tousLesRdv.forEach((rdv) => {
          if (rdv.patient_id == null) return;
          const cle = String(rdv.patient_id);
          if (!parPatient.has(cle)) {
            parPatient.set(cle, { patient_id: rdv.patient_id, nom: rdv.patient?.nom_complet || null });
          }
        });
        setPatientsFiltrablesAdmin(
          Array.from(parPatient.values()).sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'))
        );
      })
      .catch(() => {
        setMedecinsFiltrablesAdmin([]);
        setPatientsFiltrablesAdmin([]);
      })
      .finally(() => setChargementFiltresAdmin(false));
  }, [estAdmin]);

  const chargerRendezVous = useCallback(async () => {
    setLoading(true);
    setErreurChargement(null);
    try {
      const filtres = {};
      if (estMedecin) {
        filtres.medecin_id = medecinId;
      } else if (estPatient) {
        filtres.patient_id = patientId;
      } else if (estAdmin) {
        if (filtreMedecinAdmin.trim()) filtres.medecin_id = filtreMedecinAdmin.trim();
        if (filtrePatientAdmin.trim()) filtres.patient_id = filtrePatientAdmin.trim();
      }
      if (filtreStatut) filtres.statut = filtreStatut;
      const liste = await listerRendezVous(filtres);
      setRendezVous(liste);
    } catch (err) {
      setErreurChargement(err.message || 'Impossible de charger les rendez-vous.');
    } finally {
      setLoading(false);
    }
  }, [estMedecin, estPatient, estAdmin, medecinId, patientId, filtreStatut, filtreMedecinAdmin, filtrePatientAdmin]);

  useEffect(() => {
    if (status === 'loading') return;
    chargerMedecinsDisponibles();
  }, [status, chargerMedecinsDisponibles]);

  useEffect(() => {
    if (status === 'loading') return;
    chargerFiltresAdmin();
  }, [status, chargerFiltresAdmin]);

  useEffect(() => {
    if (status === 'loading') return;
    chargerRendezVous();
  }, [status, chargerRendezVous]);

  const lignesTable = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return rendezVous;
    return rendezVous.filter((rdv) => {
      const medecinNom = [rdv.medecin?.prenom, rdv.medecin?.nom].filter(Boolean).join(' ');
      const patientNom = rdv.patient?.nom_complet || '';
      return (
        (rdv.motif || '').toLowerCase().includes(q) ||
        (rdv.code_unique || '').toLowerCase().includes(q) ||
        medecinNom.toLowerCase().includes(q) ||
        patientNom.toLowerCase().includes(q) ||
        String(rdv.medecin_id || '').toLowerCase().includes(q) ||
        String(rdv.patient_id || '').toLowerCase().includes(q)
      );
    });
  }, [rendezVous, recherche]);

  const compteurs = useMemo(() => {
    const base = { total: rendezVous.length, aVenir: 0, honores: 0, annules: 0 };
    const maintenant = Date.now();
    rendezVous.forEach((rdv) => {
      if (rdv.statut === 'honore') base.honores += 1;
      else if (rdv.statut === 'annule' || rdv.statut === 'conteste') base.annules += 1;
      else if (new Date(rdv.date_creneau).getTime() > maintenant) base.aVenir += 1;
    });
    return base;
  }, [rendezVous]);

  /* ─── Modale création ─────────────────────────────────────────── */

  const [modalCreationOuverte, setModalCreationOuverte] = useState(false);
  const [formCreation, setFormCreation] = useState(FORM_CREATION_VIDE);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [erreurCreation, setErreurCreation] = useState(null);

  function ouvrirCreation() {
    setFormCreation(FORM_CREATION_VIDE);
    setErreurCreation(null);
    setModalCreationOuverte(true);
  }

  async function soumettreCreation() {
    setErreurCreation(null);

    if (!formCreation.medecin_id) {
      setErreurCreation('Le médecin est requis.');
      return;
    }
    if (!formCreation.date_creneau) {
      setErreurCreation('La date et l’heure du rendez-vous sont requises.');
      return;
    }
    if (formCreation.motif.length > MOTIF_RENDEZ_VOUS_LONGUEUR_MAX) {
      setErreurCreation(`Le motif est trop long (${MOTIF_RENDEZ_VOUS_LONGUEUR_MAX} caractères maximum).`);
      return;
    }

    setCreationEnCours(true);
    try {
      await creerRendezVous({
        medecin_id: formCreation.medecin_id,
        type_rdv: formCreation.type_rdv,
        date_creneau: new Date(formCreation.date_creneau).toISOString(),
        structure_id: formCreation.type_rdv === 'physique' && formCreation.structure_id ? formCreation.structure_id : undefined,
        motif: formCreation.motif.trim() || undefined,
      });
      setModalCreationOuverte(false);
      await chargerRendezVous();
    } catch (err) {
      setErreurCreation(err.message || 'Une erreur est survenue lors de la réservation.');
    } finally {
      setCreationEnCours(false);
    }
  }

  /* ─── Modale détail / édition ─────────────────────────────────── */

  const [modalDetailOuverte, setModalDetailOuverte] = useState(false);
  const [rdvActif, setRdvActif] = useState(null);
  const [modeEdition, setModeEdition] = useState(false);
  const [formEdition, setFormEdition] = useState(FORM_EDITION_VIDE);
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);
  const [erreurEdition, setErreurEdition] = useState(null);

  function ouvrirDetail(rdv) {
    setRdvActif(rdv);
    setModeEdition(false);
    setFormEdition({
      rdv_id: rdv.rdv_id,
      statut: rdv.statut,
      date_creneau: versDatetimeLocal(rdv.date_creneau),
      structure_id: rdv.structure_id || '',
      motif: rdv.motif || '',
    });
    setErreurEdition(null);
    setModalDetailOuverte(true);
  }

  async function enregistrerEdition() {
    if (!rdvActif) return;
    setErreurEdition(null);

    if (formEdition.motif.length > MOTIF_RENDEZ_VOUS_LONGUEUR_MAX) {
      setErreurEdition(`Le motif est trop long (${MOTIF_RENDEZ_VOUS_LONGUEUR_MAX} caractères maximum).`);
      return;
    }

    const donnees = {};
    if (formEdition.statut !== rdvActif.statut) donnees.statut = formEdition.statut;

    const dateInitiale = versDatetimeLocal(rdvActif.date_creneau);
    if (formEdition.date_creneau && formEdition.date_creneau !== dateInitiale) {
      donnees.date_creneau = new Date(formEdition.date_creneau).toISOString();
    }

    if ((formEdition.structure_id || '') !== (rdvActif.structure_id || '')) {
      donnees.structure_id = formEdition.structure_id || null;
    }

    if ((formEdition.motif || '').trim() !== (rdvActif.motif || '')) {
      donnees.motif = formEdition.motif.trim() || null;
    }

    if (Object.keys(donnees).length === 0) {
      setModeEdition(false);
      return;
    }

    setEnregistrementEnCours(true);
    try {
      const rdvMisAJour = await modifierRendezVous(rdvActif.rdv_id, donnees);
      setRdvActif(rdvMisAJour);
      setModeEdition(false);
      await chargerRendezVous();
    } catch (err) {
      setErreurEdition(err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setEnregistrementEnCours(false);
    }
  }

  async function annulerRapide(rdv) {
    setErreurChargement(null);
    try {
      await modifierRendezVous(rdv.rdv_id, { statut: 'annule' });
      await chargerRendezVous();
    } catch (err) {
      setErreurChargement(err.message || "Impossible d'annuler ce rendez-vous.");
    }
  }

  /* ─── Suppression physique (admin/superadmin uniquement) ────────── */

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function askDelete(rdv) {
    setDeleteError(null);
    setPendingDelete(rdv);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await supprimerRendezVous(pendingDelete.rdv_id);
      setPendingDelete(null);
      setModalDetailOuverte(false);
      await chargerRendezVous();
    } catch (err) {
      setDeleteError(err.message || 'Impossible de supprimer ce rendez-vous.');
    } finally {
      setDeleteSaving(false);
    }
  }

  /* ─── Rendu ───────────────────────────────────────────────────── */

  if (status === 'loading') {
    return (
      <main className="aps-content">
        <div className="text-center py-5">
          <i className="fa-solid fa-spinner fa-spin"></i>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="aps-content rdv-page">
        <div className="aps-page-header">
          <div>
            <nav className="aps-breadcrumb">
              <a href="dashboard.html">Tableau de bord</a>
              <span className="sep">/</span>
              <span>Médecins</span>
              <span className="sep">/</span>
              <span>Rendez-vous</span>
            </nav>
            <h1>Rendez-vous</h1>
            <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
              {estMedecin
                ? 'Rendez-vous pris par vos patients.'
                : estAdmin
                ? 'Ensemble des rendez-vous de la plateforme.'
                : 'Vos rendez-vous médicaux, physiques ou en téléconsultation.'}
            </p>
          </div>
          {peutCreer && (
            <button className="btn btn-primary" type="button" onClick={ouvrirCreation}>
              <i className="fa-solid fa-calendar-plus me-1"></i> Prendre rendez-vous
            </button>
          )}
        </div>

        <div className="row g-3 mb-4">
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-primary">
                  <i className="fa-solid fa-calendar-days"></i>
                </div>
              </div>
              <div className="aps-kpi__label">Total</div>
              <div className="aps-kpi__value">{compteurs.total.toLocaleString('fr-FR')}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-info">
                  <i className="fa-solid fa-hourglass-half"></i>
                </div>
              </div>
              <div className="aps-kpi__label">À venir</div>
              <div className="aps-kpi__value">{compteurs.aVenir.toLocaleString('fr-FR')}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-success">
                  <i className="fa-solid fa-check-double"></i>
                </div>
              </div>
              <div className="aps-kpi__label">Honorés</div>
              <div className="aps-kpi__value">{compteurs.honores.toLocaleString('fr-FR')}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-danger">
                  <i className="fa-solid fa-ban"></i>
                </div>
              </div>
              <div className="aps-kpi__label">Annulés / contestés</div>
              <div className="aps-kpi__value">{compteurs.annules.toLocaleString('fr-FR')}</div>
            </div>
          </div>
        </div>

        {erreurChargement && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div className="flex-grow-1">{erreurChargement}</div>
            <button className="btn btn-sm btn-light" onClick={chargerRendezVous}>
              <i className="fa-solid fa-rotate-right me-1"></i>Réessayer
            </button>
          </div>
        )}

        <div className="aps-card mb-3">
          <div className="aps-card__body">
            <div className="row g-3 align-items-end">
              <div className="col-md-3">
                <label className="form-label">Statut</label>
                <select className="form-select" value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
                  <option value="">Tous</option>
                  {STATUTS_RENDEZ_VOUS.map((s) => (
                    <option key={s.valeur} value={s.valeur}>
                      {s.libelle}
                    </option>
                  ))}
                </select>
              </div>
              {estAdmin && (
                <>
                  <div className="col-md-3">
                    <label className="form-label">Médecin</label>
                    <select
                      className="form-select"
                      value={filtreMedecinAdmin}
                      onChange={(e) => setFiltreMedecinAdmin(e.target.value)}
                      disabled={chargementFiltresAdmin}
                    >
                      <option value="">Tous les médecins</option>
                      {medecinsFiltrablesAdmin.map((m) => (
                        <option key={m.medecin_id} value={m.medecin_id}>
                          {libelleMedecin(m)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Patient</label>
                    <select
                      className="form-select"
                      value={filtrePatientAdmin}
                      onChange={(e) => setFiltrePatientAdmin(e.target.value)}
                      disabled={chargementFiltresAdmin}
                    >
                      <option value="">Tous les patients</option>
                      {patientsFiltrablesAdmin.map((p) => (
                        <option key={p.patient_id} value={p.patient_id}>
                          {p.nom || `Patient #${p.patient_id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div className={estAdmin ? 'col-md-3' : 'col-md-9'}>
                <label className="form-label">Recherche</label>
                <div className="aps-search">
                  <i className="fa-solid fa-magnifying-glass"></i>
                  <input
                    type="text"
                    placeholder="Motif, médecin, patient, code…"
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                  />
                  {recherche && (
                    <button
                      type="button"
                      className="aps-search__clear"
                      aria-label="Effacer la recherche"
                      onClick={() => setRecherche('')}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'inherit',
                        opacity: 0.6,
                        cursor: 'pointer',
                      }}
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="aps-card">
          <div className="aps-card__body p-0">
            {loading ? (
              <div className="text-center py-5">
                <i className="fa-solid fa-spinner fa-spin"></i>
              </div>
            ) : lignesTable.length === 0 ? (
              <div className="text-center aps-text-muted py-5">Aucun rendez-vous ne correspond à ces critères.</div>
            ) : (
              <div className="table-responsive">
                <table className="table aps-table mb-0 align-middle">
                  <thead>
                    <tr>
                      <th>Créneau</th>
                      <th>Type</th>
                      {(estAdmin || estPatient) && <th>Médecin</th>}
                      {(estAdmin || estMedecin) && <th>Patient</th>}
                      <th>Motif</th>
                      <th>Statut</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesTable.map((rdv) => {
                      const meta = STATUT_META[rdv.statut] || {};
                      const peutAnnulerRapide =
                        peutModifier(rdv) && !['annule', 'honore', 'non_honore', 'conteste'].includes(rdv.statut);
                      return (
                        <tr key={rdv.rdv_id}>
                          <td>{formaterDateHeure(rdv.date_creneau)}</td>
                          <td>
                            <i className={`fa-solid ${TYPE_META[rdv.type_rdv]?.icone || 'fa-circle'} me-1 aps-text-muted`}></i>
                            {libelleType(rdv.type_rdv)}
                          </td>
                          {(estAdmin || estPatient) && (
                            <td>{[rdv.medecin?.prenom, rdv.medecin?.nom].filter(Boolean).join(' ') || rdv.medecin_id || '—'}</td>
                          )}
                          {(estAdmin || estMedecin) && (
                            <td>{rdv.patient?.nom_complet || rdv.patient_id || '—'}</td>
                          )}
                          <td style={{ maxWidth: 240 }}>{apercuTexte(rdv.motif)}</td>
                          <td>
                            <span className={`aps-badge ${meta.badge || 'is-info'}`}>
                              <i className={`fa-solid ${meta.icone || 'fa-circle'}`}></i> {libelleStatut(rdv.statut)}
                            </span>
                          </td>
                          <td className="text-end">
                            <div className="d-flex gap-1 justify-content-end">
                              <button className="btn btn-sm btn-light" title="Voir / modifier" onClick={() => ouvrirDetail(rdv)}>
                                <i className="fa-solid fa-eye"></i>
                              </button>
                              {peutAnnulerRapide && (
                                <button
                                  className="btn btn-sm btn-light"
                                  title="Annuler le rendez-vous"
                                  onClick={() => annulerRapide(rdv)}
                                >
                                  <i className="fa-solid fa-ban"></i>
                                </button>
                              )}
                              {peutSupprimer && (
                                <button className="btn btn-sm btn-light" title="Supprimer" onClick={() => askDelete(rdv)}>
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
            )}
          </div>
        </div>
      </main>

      {/* ===================== MODAL CRÉATION (patient) ===================== */}
      <Modal
        id="modalCreationRendezVous"
        title="Prendre rendez-vous"
        isOpen={modalCreationOuverte}
        onClose={() => setModalCreationOuverte(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setModalCreationOuverte(false)} disabled={creationEnCours}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={soumettreCreation} disabled={creationEnCours}>
              {creationEnCours ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin me-2"></i>Réservation…
                </>
              ) : (
                'Confirmer la réservation'
              )}
            </button>
          </>
        }
      >
        {erreurCreation && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div>{erreurCreation}</div>
          </div>
        )}

        <div className="mb-3">
          <label className="form-label">
            Médecin <span className="text-danger">*</span>
          </label>
          <select
            className="form-select"
            value={formCreation.medecin_id}
            onChange={(e) => setFormCreation((f) => ({ ...f, medecin_id: e.target.value }))}
            disabled={chargementMedecins}
          >
            <option value="" disabled>
              {chargementMedecins ? 'Chargement…' : 'Choisir…'}
            </option>
            {medecinsDisponibles.map((m) => (
              <option key={m.medecin_id} value={m.medecin_id}>
                {libelleMedecin(m)}
              </option>
            ))}
          </select>
          {!chargementMedecins && medecinsDisponibles.length === 0 && (
            <div className="aps-text-muted mt-1" style={{ fontSize: 12 }}>
              Aucun médecin disponible pour le moment.
            </div>
          )}
        </div>

        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label">
              Type de consultation <span className="text-danger">*</span>
            </label>
            <select
              className="form-select"
              value={formCreation.type_rdv}
              onChange={(e) => setFormCreation((f) => ({ ...f, type_rdv: e.target.value, structure_id: '' }))}
            >
              {TYPES_RENDEZ_VOUS.map((t) => (
                <option key={t.valeur} value={t.valeur}>
                  {t.libelle}
                </option>
              ))}
            </select>
            {formCreation.type_rdv === 'teleconsultation' && (
              <div className="aps-text-muted mt-1" style={{ fontSize: 12 }}>
                Le médecin choisi doit avoir activé la téléconsultation.
              </div>
            )}
          </div>
          <div className="col-md-6">
            <label className="form-label">
              Date et heure <span className="text-danger">*</span>
            </label>
            <input
              type="datetime-local"
              className="form-control"
              value={formCreation.date_creneau}
              onChange={(e) => setFormCreation((f) => ({ ...f, date_creneau: e.target.value }))}
            />
          </div>
        </div>

        {formCreation.type_rdv === 'physique' && (
          <div className="mb-3">
            <label className="form-label">Structure de santé (optionnel)</label>
            <input
              type="text"
              className="form-control"
              placeholder="Identifiant de la structure (cabinet libéral si vide)…"
              value={formCreation.structure_id}
              onChange={(e) => setFormCreation((f) => ({ ...f, structure_id: e.target.value }))}
            />
          </div>
        )}

        <div className="mb-1">
          <label className="form-label d-flex justify-content-between">
            <span>Motif de consultation (optionnel)</span>
            <span className="aps-text-muted" style={{ fontSize: 12 }}>
              {formCreation.motif.length}/{MOTIF_RENDEZ_VOUS_LONGUEUR_MAX}
            </span>
          </label>
          <textarea
            className="form-control"
            rows={4}
            maxLength={MOTIF_RENDEZ_VOUS_LONGUEUR_MAX}
            placeholder="Décrivez brièvement la raison de votre visite…"
            value={formCreation.motif}
            onChange={(e) => setFormCreation((f) => ({ ...f, motif: e.target.value }))}
          />
        </div>
      </Modal>

      {/* ===================== MODAL DÉTAIL / ÉDITION ===================== */}
      <Modal
        id="modalDetailRendezVous"
        large
        title={modeEdition ? 'Modifier le rendez-vous' : 'Détail du rendez-vous'}
        isOpen={modalDetailOuverte}
        onClose={() => setModalDetailOuverte(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setModalDetailOuverte(false)} disabled={enregistrementEnCours}>
              Fermer
            </button>
            {rdvActif && peutSupprimer && (
              <button className="btn btn-outline-danger" onClick={() => askDelete(rdvActif)} disabled={enregistrementEnCours}>
                <i className="fa-solid fa-trash me-1"></i>Supprimer
              </button>
            )}
            {rdvActif && peutModifier(rdvActif) && !modeEdition && (
              <button className="btn btn-primary" onClick={() => setModeEdition(true)}>
                <i className="fa-solid fa-pen me-1"></i>Modifier
              </button>
            )}
            {modeEdition && (
              <button className="btn btn-primary" onClick={enregistrerEdition} disabled={enregistrementEnCours}>
                {enregistrementEnCours ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin me-2"></i>Enregistrement…
                  </>
                ) : (
                  'Enregistrer les modifications'
                )}
              </button>
            )}
          </>
        }
      >
        {erreurEdition && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div>{erreurEdition}</div>
          </div>
        )}

        {rdvActif && (
          <>
            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <label className="form-label">Type de consultation</label>
                <div className="form-control-plaintext" style={{ fontSize: 14 }}>
                  <i className={`fa-solid ${TYPE_META[rdvActif.type_rdv]?.icone || 'fa-circle'} me-1 aps-text-muted`}></i>
                  {libelleType(rdvActif.type_rdv)}
                  <span className="aps-text-muted ms-2" style={{ fontSize: 12 }}>
                    (non modifiable)
                  </span>
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Code de contrôle (accueil)</label>
                <div className="form-control-plaintext rdv-code-unique">{rdvActif.code_unique || '—'}</div>
              </div>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <label className="form-label">Date et heure</label>
                {modeEdition ? (
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={formEdition.date_creneau}
                    onChange={(e) => setFormEdition((f) => ({ ...f, date_creneau: e.target.value }))}
                  />
                ) : (
                  <div className="form-control-plaintext" style={{ fontSize: 14 }}>
                    {formaterDateHeure(rdvActif.date_creneau)}
                  </div>
                )}
              </div>
              <div className="col-md-6">
                <label className="form-label">Statut</label>
                {modeEdition ? (
                  <select
                    className="form-select"
                    value={formEdition.statut}
                    onChange={(e) => setFormEdition((f) => ({ ...f, statut: e.target.value }))}
                  >
                    {statutsProposes(estAdmin ? 'admin' : estMedecin ? 'medecin' : 'patient', rdvActif.statut).map((s) => (
                      <option key={s.valeur} value={s.valeur}>
                        {s.libelle}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div>
                    <span className={`aps-badge ${STATUT_META[rdvActif.statut]?.badge || 'is-info'}`}>
                      <i className={`fa-solid ${STATUT_META[rdvActif.statut]?.icone || 'fa-circle'}`}></i>{' '}
                      {libelleStatut(rdvActif.statut)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {rdvActif.type_rdv === 'physique' && (
              <div className="mb-3">
                <label className="form-label">Structure de santé</label>
                {modeEdition ? (
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Identifiant de la structure (vide = cabinet libéral)…"
                    value={formEdition.structure_id}
                    onChange={(e) => setFormEdition((f) => ({ ...f, structure_id: e.target.value }))}
                  />
                ) : (
                  <div className="form-control-plaintext" style={{ fontSize: 14 }}>
                    {rdvActif.structure_id || 'Cabinet libéral'}
                  </div>
                )}
              </div>
            )}

            <div className="mb-1">
              <label className="form-label d-flex justify-content-between">
                <span>Motif de consultation</span>
                {modeEdition && (
                  <span className="aps-text-muted" style={{ fontSize: 12 }}>
                    {formEdition.motif.length}/{MOTIF_RENDEZ_VOUS_LONGUEUR_MAX}
                  </span>
                )}
              </label>
              {modeEdition ? (
                <textarea
                  className="form-control"
                  rows={5}
                  maxLength={MOTIF_RENDEZ_VOUS_LONGUEUR_MAX}
                  placeholder="Aucun motif renseigné…"
                  value={formEdition.motif}
                  onChange={(e) => setFormEdition((f) => ({ ...f, motif: e.target.value }))}
                />
              ) : (
                <div className="aps-card" style={{ padding: 12, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>
                  {rdvActif.motif || '—'}
                </div>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* ===================== MODAL SUPPRESSION ===================== */}
      <Modal
        id="modalDeleteRendezVous"
        title="Confirmer la suppression"
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setPendingDelete(null)} disabled={deleteSaving}>
              Annuler
            </button>
            <button className="btn btn-danger" onClick={confirmDelete} disabled={deleteSaving}>
              {deleteSaving ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin me-2"></i>Suppression…
                </>
              ) : (
                'Supprimer'
              )}
            </button>
          </>
        }
      >
        <div className="aps-notice is-danger">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <div>
            Supprimer définitivement ce rendez-vous ? Action irréversible, réservée aux cas d'erreur manifeste — un
            rendez-vous s'annule normalement via son statut, sans être supprimé physiquement.
          </div>
        </div>
        {deleteError && (
          <div className="aps-notice is-danger mt-3">
            <i className="fa-solid fa-circle-xmark"></i>
            <div>{deleteError}</div>
          </div>
        )}
      </Modal>
    </>
  );
}