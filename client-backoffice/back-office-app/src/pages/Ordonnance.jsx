// src/components/Ordonnance.jsx
//
// Gestion des ordonnances (diagramme médecin, cf. medecinService.js).
// Une ordonnance est rattachée à un rendez-vous, donc à un couple
// médecin/patient précis. Consomme exclusivement `medecinService.js` :
// listerOrdonnances / creerOrdonnance / modifierOrdonnance /
// supprimerOrdonnance, plus listerRendezVous pour peupler le
// sélecteur de rendez-vous à la création.
//
// Droits (repris tels quels des commentaires de medecin.routes.js dans
// medecinService.js — le serveur reste la seule source de vérité, le
// front ne fait que masquer les actions non pertinentes) :
//   - GET  : authentifié, autorisation fine côté serveur.
//   - POST : réservé au MÉDECIN du rendez-vous concerné — pièce
//            médicale nominative, même un admin ne peut émettre à sa
//            place. Un admin/superadmin ne voit donc jamais le bouton
//            de création ici.
//   - PUT  : médecin auteur ou admin/superadmin.
//   - DELETE : admin/superadmin UNIQUEMENT, jamais par le médecin
//              après émission (cf. commentaire de medecin.routes.js).
//
// Le rôle de l'utilisateur connecté détermine la vue :
//   - médecin  → ne voit/ne filtre que SES ordonnances (medecin_id
//                déduit du token côté serveur ; le front applique déjà
//                le filtre pour éviter un aller-retour inutile) ; peut
//                créer et modifier le contenu des siennes.
//   - patient (rôle par défaut si ni médecin ni admin — aucun profil
//                "patient" dédié n'étant documenté, on suppose que
//                patient_id correspond à l'utilisateur_id du compte
//                connecté, à confirmer avec le contrôleur réel) → vue
//                strictement en lecture de son propre historique.
//   - admin/superadmin → vue élargie avec filtres médecin/patient
//                libres ; peut modifier ou supprimer, jamais créer.
//
// ⚠️ Comme medecin.controller.js n'est pas fourni, la forme exacte
// d'une ordonnance (champs embarqués rendez_vous/patient/médecin,
// nom du champ de date d'émission, etc.) est une HYPOTHÈSE. Le code
// ci-dessous reste défensif (fallback sur les identifiants bruts) et
// se limite aux deux seuls champs de saisie documentés dans
// medecinService.js : `rendez_vous_id` et `contenu`.
//
// Reprend le patron "Modal piloté par état React" de
// ForfaitPublicitaire.jsx / EmplacementForfaire.jsx / Referentiel.jsx.

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  listerOrdonnances,
  creerOrdonnance,
  modifierOrdonnance,
  supprimerOrdonnance,
  listerRendezVous,
  listerMedecins,
} from '../services/medecinService';

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

/* ────────────────────────── Aides d'affichage ────────────────────────── */

function formaterDate(valeur) {
  if (!valeur) return '—';
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formaterDateHeure(valeur) {
  if (!valeur) return '—';
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function apercuTexte(texte, longueur = 120) {
  if (!texte) return '—';
  const propre = String(texte).replace(/\s+/g, ' ').trim();
  return propre.length > longueur ? `${propre.slice(0, longueur)}…` : propre;
}

// Libellé lisible d'un rendez-vous brut (utilisé pour peupler le
// sélecteur de création côté médecin).
function libelleMedecin(m) {
  if (!m) return '—';
  const nomComplet = [m.prenom, m.nom].filter(Boolean).join(' ').trim();
  const specialite = m.specialite?.nom || m.specialite_nom || null;
  if (nomComplet && specialite) return `Dr ${nomComplet} — ${specialite}`;
  if (nomComplet) return `Dr ${nomComplet}`;
  return m.medecin_id || '—';
}

function libelleRendezVous(rv) {
  if (!rv) return '—';
  const date = formaterDateHeure(rv.date_heure);
  const patient = rv.patient?.nom_complet || rv.patient_nom || rv.patient_id;
  const motif = rv.motif ? ` — ${rv.motif}` : '';
  return patient ? `${date} · ${patient}${motif}` : `${date}${motif}`;
}

// Libellé du rendez-vous rattaché à une ordonnance déjà existante :
// on privilégie un rendez-vous embarqué par le serveur (o.rendez_vous),
// sinon on retombe sur la liste locale des rendez-vous du médecin
// (uniquement disponible côté médecin), sinon sur l'identifiant brut.
function libelleRendezVousOrdonnance(o, rendezVousConnus) {
  if (o.rendez_vous) return libelleRendezVous(o.rendez_vous);
  const trouve = rendezVousConnus.find((rv) => idsEgaux(rv.rendez_vous_id, o.rendez_vous_id));
  if (trouve) return libelleRendezVous(trouve);
  return o.rendez_vous_id || '—';
}

function imprimerOrdonnance(o, rendezVousConnus) {
  const fenetre = window.open('', '_blank', 'width=800,height=900');
  if (!fenetre) return; // popup bloqué par le navigateur — on n'insiste pas
  const echapper = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  fenetre.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Ordonnance</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; padding: 32px; color: #111; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          .meta { color: #555; font-size: 13px; margin-bottom: 24px; }
          .contenu { white-space: pre-wrap; font-size: 14px; line-height: 1.7; border-top: 1px solid #ccc; padding-top: 16px; }
        </style>
      </head>
      <body>
        <h1>Ordonnance médicale</h1>
        <div class="meta">
          ${echapper(libelleRendezVousOrdonnance(o, rendezVousConnus))}<br />
          Émise le ${echapper(formaterDate(o.date_emission || o.created_at || o.createdAt))}
        </div>
        <div class="contenu">${echapper(o.contenu)}</div>
      </body>
    </html>
  `);
  fenetre.document.close();
  fenetre.focus();
  fenetre.print();
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

const FORM_VIDE = { ordonnance_id: '', rendez_vous_id: '', contenu: '' };

export default function Ordonnance() {
  const { user, status } = useAuth();
  const role = extraireNomRole(user);
  const estMedecin = role === 'medecin';
  const estAdmin = role === 'admin' || role === 'superadmin';
  // Faute de rôle "patient" explicite dans le référentiel des rôles,
  // tout compte ni médecin ni admin est traité comme un patient
  // consultant son propre historique (lecture seule).
  const estPatient = !estMedecin && !estAdmin;

  const medecinId = estMedecin ? extraireMedecinId(user) : null;
  const patientId = estPatient ? extraireUtilisateurId(user) : null;

  const peutCreer = estMedecin; // jamais l'admin — voir en-tête
  const peutSupprimer = estAdmin;
  const peutModifier = useCallback(
    (o) => estAdmin || (estMedecin && idsEgaux(o.medecin_id, medecinId)),
    [estAdmin, estMedecin, medecinId]
  );

  /* ─── Chargement des données ─────────────────────────────────── */

  const [ordonnances, setOrdonnances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState(null);

  const [rendezVousMedecin, setRendezVousMedecin] = useState([]); // pour le sélecteur de création (médecin uniquement)

  const [filtreRendezVous, setFiltreRendezVous] = useState(''); // médecin
  const [filtreMedecinAdmin, setFiltreMedecinAdmin] = useState(''); // admin
  const [filtrePatientAdmin, setFiltrePatientAdmin] = useState(''); // admin
  const [recherche, setRecherche] = useState('');

  // Options des sélecteurs de filtre admin (médecin / patient) —
  // chargées une seule fois, indépendamment des filtres actifs, pour
  // ne pas faire disparaître des options au fur et à mesure qu'on
  // filtre la liste des ordonnances.
  const [medecinsFiltrablesAdmin, setMedecinsFiltrablesAdmin] = useState([]);
  const [patientsFiltrablesAdmin, setPatientsFiltrablesAdmin] = useState([]);
  const [chargementFiltresAdmin, setChargementFiltresAdmin] = useState(false);

  // Alimente les sélecteurs "Médecin" / "Patient" du filtre admin.
  // `listerMedecins()` sans filtre renvoie l'annuaire complet.
  // ⚠️ Aucun `listerPatients()` n'existe dans medecinService.js : la
  // liste des patients est donc déduite des ordonnances existantes
  // (non filtrées), seule source de cette information côté front — à
  // remplacer par un vrai annuaire si un endpoint patients est ajouté
  // côté serveur.
  const chargerFiltresAdmin = useCallback(() => {
    if (!estAdmin) {
      setMedecinsFiltrablesAdmin([]);
      setPatientsFiltrablesAdmin([]);
      return;
    }
    setChargementFiltresAdmin(true);
    Promise.all([listerMedecins(), listerOrdonnances()])
      .then(([medecins, toutesLesOrdonnances]) => {
        setMedecinsFiltrablesAdmin(medecins);
        const parPatient = new Map();
        toutesLesOrdonnances.forEach((o) => {
          if (o.patient_id == null) return;
          const cle = String(o.patient_id);
          if (!parPatient.has(cle)) {
            parPatient.set(cle, { patient_id: o.patient_id, nom: o.patient?.nom_complet || null });
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

  const chargerRendezVousMedecin = useCallback(() => {
    if (!estMedecin || !medecinId) {
      setRendezVousMedecin([]);
      return;
    }
    listerRendezVous({ medecin_id: medecinId })
      .then((liste) => setRendezVousMedecin(liste.filter((rv) => rv.statut !== 'annule')))
      .catch(() => setRendezVousMedecin([]));
  }, [estMedecin, medecinId]);

  const chargerOrdonnances = useCallback(async () => {
    setLoading(true);
    setErreurChargement(null);
    try {
      const filtres = {};
      if (estMedecin) {
        filtres.medecin_id = medecinId;
        if (filtreRendezVous) filtres.rendez_vous_id = filtreRendezVous;
      } else if (estPatient) {
        filtres.patient_id = patientId;
      } else if (estAdmin) {
        if (filtreMedecinAdmin.trim()) filtres.medecin_id = filtreMedecinAdmin.trim();
        if (filtrePatientAdmin.trim()) filtres.patient_id = filtrePatientAdmin.trim();
      }
      const liste = await listerOrdonnances(filtres);
      setOrdonnances(liste);
    } catch (err) {
      setErreurChargement(err.message || 'Impossible de charger les ordonnances.');
    } finally {
      setLoading(false);
    }
  }, [estMedecin, estPatient, estAdmin, medecinId, patientId, filtreRendezVous, filtreMedecinAdmin, filtrePatientAdmin]);

  useEffect(() => {
    if (status === 'loading') return;
    chargerRendezVousMedecin();
  }, [status, chargerRendezVousMedecin]);

  useEffect(() => {
    if (status === 'loading') return;
    chargerFiltresAdmin();
  }, [status, chargerFiltresAdmin]);

  useEffect(() => {
    if (status === 'loading') return;
    chargerOrdonnances();
  }, [status, chargerOrdonnances]);

  const lignesTable = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return ordonnances;
    return ordonnances.filter((o) => {
      const medecinNom = o.medecin?.nom_complet || '';
      const patientNom = o.patient?.nom_complet || '';
      return (
        (o.contenu || '').toLowerCase().includes(q) ||
        medecinNom.toLowerCase().includes(q) ||
        patientNom.toLowerCase().includes(q) ||
        String(o.medecin_id || '').toLowerCase().includes(q) ||
        String(o.patient_id || '').toLowerCase().includes(q)
      );
    });
  }, [ordonnances, recherche]);

  /* ─── Modale création / consultation / édition ─────────────────── */

  const [modalOpen, setModalOpen] = useState(false);
  const [modeModal, setModeModal] = useState('creation'); // 'creation' | 'edition' | 'lecture'
  const [form, setForm] = useState(FORM_VIDE);
  const [ordonnanceActive, setOrdonnanceActive] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  function ouvrirCreation() {
    setModeModal('creation');
    setForm({ ...FORM_VIDE, rendez_vous_id: filtreRendezVous || '' });
    setOrdonnanceActive(null);
    setFormError(null);
    setModalOpen(true);
  }

  function ouvrirDetail(o) {
    setModeModal(peutModifier(o) ? 'edition' : 'lecture');
    setForm({ ordonnance_id: o.ordonnance_id, rendez_vous_id: o.rendez_vous_id, contenu: o.contenu || '' });
    setOrdonnanceActive(o);
    setFormError(null);
    setModalOpen(true);
  }

  async function enregistrer() {
    if (modeModal === 'lecture') {
      setModalOpen(false);
      return;
    }
    setFormError(null);
    if (modeModal === 'creation' && !form.rendez_vous_id) {
      setFormError('Le rendez-vous concerné est requis.');
      return;
    }
    if (!form.contenu.trim()) {
      setFormError("Le contenu de l'ordonnance est requis.");
      return;
    }
    setSaving(true);
    try {
      if (modeModal === 'creation') {
        await creerOrdonnance({ rendez_vous_id: form.rendez_vous_id, contenu: form.contenu.trim() });
      } else {
        await modifierOrdonnance(form.ordonnance_id, { contenu: form.contenu.trim() });
      }
      setModalOpen(false);
      await chargerOrdonnances();
    } catch (err) {
      setFormError(err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  /* ─── Suppression (admin/superadmin uniquement) ─────────────────── */

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function askDelete(o) {
    setDeleteError(null);
    setPendingDelete(o);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await supprimerOrdonnance(pendingDelete.ordonnance_id);
      setPendingDelete(null);
      await chargerOrdonnances();
    } catch (err) {
      setDeleteError(err.message || 'Impossible de supprimer cette ordonnance.');
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

  const nbColonnesFiltres = (estMedecin ? 1 : 0) + (estAdmin ? 2 : 0);

  return (
    <>
      <main className="aps-content">
        <div className="aps-page-header">
          <div>
            <nav className="aps-breadcrumb">
              <a href="dashboard.html">Tableau de bord</a>
              <span className="sep">/</span>
              <span>Médecins</span>
              <span className="sep">/</span>
              <span>Ordonnances</span>
            </nav>
            <h1>Ordonnances</h1>
            <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
              {estMedecin
                ? 'Ordonnances que vous avez émises pour vos patients.'
                : estAdmin
                ? 'Ensemble des ordonnances émises sur la plateforme.'
                : 'Historique des ordonnances qui vous ont été prescrites.'}
            </p>
          </div>
          {peutCreer && (
            <button className="btn btn-primary" type="button" onClick={ouvrirCreation}>
              <i className="fa-solid fa-plus me-1"></i> Nouvelle ordonnance
            </button>
          )}
        </div>

        <div className="row g-3 mb-4">
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-primary">
                  <i className="fa-solid fa-file-prescription"></i>
                </div>
              </div>
              <div className="aps-kpi__label">Ordonnances</div>
              <div className="aps-kpi__value">{ordonnances.length.toLocaleString('fr-FR')}</div>
            </div>
          </div>
        </div>

        {erreurChargement && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div className="flex-grow-1">{erreurChargement}</div>
            <button className="btn btn-sm btn-light" onClick={chargerOrdonnances}>
              <i className="fa-solid fa-rotate-right me-1"></i>Réessayer
            </button>
          </div>
        )}

        <div className="aps-card mb-3">
          <div className="aps-card__body">
            <div className="row g-3 align-items-end">
              {estMedecin && (
                <div className="col-md-4">
                  <label className="form-label">Rendez-vous</label>
                  <select
                    className="form-select"
                    value={filtreRendezVous}
                    onChange={(e) => setFiltreRendezVous(e.target.value)}
                  >
                    <option value="">Tous</option>
                    {rendezVousMedecin.map((rv) => (
                      <option key={rv.rendez_vous_id} value={rv.rendez_vous_id}>
                        {libelleRendezVous(rv)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
              <div className={nbColonnesFiltres > 0 ? 'col-md-5' : 'col-md-12'}>
                <label className="form-label">Recherche</label>
                <div className="aps-search">
                  <i className="fa-solid fa-magnifying-glass"></i>
                  <input
                    type="text"
                    placeholder="Contenu, médecin, patient…"
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                  />
                  {recherche && (
                    <button
                      type="button"
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
              <div className="text-center aps-text-muted py-5">Aucune ordonnance ne correspond à ces critères.</div>
            ) : (
              <div className="table-responsive">
                <table className="table aps-table mb-0 align-middle">
                  <thead>
                    <tr>
                      <th>Rendez-vous</th>
                      {estAdmin && <th>Médecin</th>}
                      {(estAdmin || estMedecin) && <th>Patient</th>}
                      <th>Émise le</th>
                      <th>Aperçu</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesTable.map((o) => (
                      <tr key={o.ordonnance_id}>
                        <td>{libelleRendezVousOrdonnance(o, rendezVousMedecin)}</td>
                        {estAdmin && <td>{o.medecin?.nom_complet || o.medecin_id || '—'}</td>}
                        {(estAdmin || estMedecin) && <td>{o.patient?.nom_complet || o.patient_id || '—'}</td>}
                        <td>{formaterDate(o.date_emission || o.created_at || o.createdAt)}</td>
                        <td style={{ maxWidth: 320 }}>{apercuTexte(o.contenu)}</td>
                        <td className="text-end">
                          <div className="d-flex gap-1 justify-content-end">
                            <button className="btn btn-sm btn-light" title="Voir" onClick={() => ouvrirDetail(o)}>
                              <i className="fa-solid fa-eye"></i>
                            </button>
                            <button
                              className="btn btn-sm btn-light"
                              title="Imprimer"
                              onClick={() => imprimerOrdonnance(o, rendezVousMedecin)}
                            >
                              <i className="fa-solid fa-print"></i>
                            </button>
                            {peutSupprimer && (
                              <button className="btn btn-sm btn-light" title="Supprimer" onClick={() => askDelete(o)}>
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
            )}
          </div>
        </div>
      </main>

      {/* ===================== MODAL CRÉATION / CONSULTATION / ÉDITION ===================== */}
      <Modal
        id="modalOrdonnance"
        large
        title={
          modeModal === 'creation'
            ? 'Nouvelle ordonnance'
            : modeModal === 'edition'
            ? "Modifier l'ordonnance"
            : "Consulter l'ordonnance"
        }
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setModalOpen(false)} disabled={saving}>
              {modeModal === 'lecture' ? 'Fermer' : 'Annuler'}
            </button>
            {ordonnanceActive && (
              <button
                className="btn btn-outline-primary"
                onClick={() => imprimerOrdonnance(ordonnanceActive, rendezVousMedecin)}
              >
                <i className="fa-solid fa-print me-1"></i>Imprimer
              </button>
            )}
            {modeModal !== 'lecture' && (
              <button className="btn btn-primary" onClick={enregistrer} disabled={saving}>
                {saving ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin me-2"></i>Enregistrement…
                  </>
                ) : modeModal === 'edition' ? (
                  'Enregistrer les modifications'
                ) : (
                  "Créer l'ordonnance"
                )}
              </button>
            )}
          </>
        }
      >
        {formError && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div>{formError}</div>
          </div>
        )}

        {modeModal === 'creation' ? (
          <div className="mb-3">
            <label className="form-label">
              Rendez-vous <span className="text-danger">*</span>
            </label>
            <select
              className="form-select"
              value={form.rendez_vous_id}
              onChange={(e) => setForm((f) => ({ ...f, rendez_vous_id: e.target.value }))}
            >
              <option value="" disabled>
                Choisir…
              </option>
              {rendezVousMedecin.map((rv) => (
                <option key={rv.rendez_vous_id} value={rv.rendez_vous_id}>
                  {libelleRendezVous(rv)}
                </option>
              ))}
            </select>
            {rendezVousMedecin.length === 0 && (
              <div className="aps-text-muted mt-1" style={{ fontSize: 12 }}>
                Aucun rendez-vous disponible pour émettre une ordonnance.
              </div>
            )}
          </div>
        ) : (
          <div className="mb-3">
            <label className="form-label">Rendez-vous</label>
            <div className="form-control-plaintext" style={{ fontSize: 14 }}>
              {ordonnanceActive ? libelleRendezVousOrdonnance(ordonnanceActive, rendezVousMedecin) : '—'}
            </div>
          </div>
        )}

        <div className="mb-1">
          <label className="form-label">
            Contenu {modeModal !== 'lecture' && <span className="text-danger">*</span>}
          </label>
          {modeModal === 'lecture' ? (
            <div
              className="aps-card"
              style={{ padding: 12, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}
            >
              {form.contenu || '—'}
            </div>
          ) : (
            <textarea
              className="form-control"
              rows={8}
              placeholder="Médicaments prescrits, posologie, recommandations…"
              value={form.contenu}
              onChange={(e) => setForm((f) => ({ ...f, contenu: e.target.value }))}
            />
          )}
        </div>
      </Modal>

      {/* ===================== MODAL SUPPRESSION ===================== */}
      <Modal
        id="modalDeleteOrdonnance"
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
            Supprimer définitivement cette ordonnance ? Action irréversible, réservée aux cas d'erreur
            manifeste — une ordonnance n'est jamais supprimée par le médecin après émission.
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