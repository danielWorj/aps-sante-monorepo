// src/components/AbonnementMedecin.jsx
//
// Gestion des abonnements médecin (diagramme médecin : abonnement +
// lignes d'avantages) — donnée commerciale interne, jamais publique.
// C'est ici qu'un médecin (ou un admin en son nom) souscrit/actualise
// une offre payante (visibilité renforcée, avantages annuaire, etc.).
//
// Droits (voir commentaires de medecinService.js) :
//   - Lecture (GET)        : authentifié partout. Le serveur restreint
//     déjà le résultat (médecin concerné vs admin/superadmin qui voit
//     tout) — ce composant ne fait que relayer les filtres, sans
//     dupliquer cette logique côté client.
//   - Écriture (POST/PUT)  : le médecin concerné (son propre
//     abonnement) ou admin/superadmin.
//   - Suppression (DELETE) : idem — medecinService.js ne distingue pas
//     ce cas comme superadmin-only (contrairement à
//     forfait_publicitaire), donc "gérer" et "supprimer" utilisent ici
//     la même règle d'autorisation côté UI.
//
// Reprend le patron "Modal piloté par état React" de
// ForfaitPublicitaire.jsx / Referentiel.jsx.
//
// ⚠️ HYPOTHÈSES (medecin.controller.js non fourni, à confirmer) :
//   - Clés primaires : `abonnement_id` sur l'abonnement, `ligne_id` sur
//     une ligne d'avantage — par analogie avec forfait_publicitaire_id
//     / ligne_id côté ForfaitPublicitaire.jsx.
//   - `statut` n'est pas un champ envoyé à la création/modification
//     (absent des payloads POST/PUT documentés dans medecinService.js,
//     probablement dérivé côté serveur de la durée/date de fin) : il
//     n'est utilisé ici qu'en filtre de liste et en badge d'affichage,
//     jamais dans le formulaire. Les valeurs possibles ('actif',
//     'expire', 'annule') sont devinées par usage courant.
//   - Détection du médecin propriétaire connecté : aucun champ
//     `medecin_id` documenté sur l'objet utilisateur du contexte
//     d'authentification. `extraireMedecinIdPropre` teste plusieurs
//     candidats plausibles, par analogie avec `extraireNomRole` dans
//     ForfaitPublicitaire.jsx — à ajuster une fois la forme réelle de
//     `user` connue.

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  listerMedecins,
  listerAbonnementsMedecin,
  creerAbonnementMedecin,
  modifierAbonnementMedecin,
  supprimerAbonnementMedecin,
  ajouterLigneAbonnementMedecin,
  supprimerLigneAbonnementMedecin,
} from '../services/medecinService';

function extraireNomRole(objetUtilisateur) {
  if (!objetUtilisateur || typeof objetUtilisateur !== 'object') return null;
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
    if (typeof candidat === 'string' && candidat.trim()) return candidat.trim().toLowerCase();
  }
  return null;
}

// Hypothèse — voir bandeau d'en-tête ci-dessus.
function extraireMedecinIdPropre(objetUtilisateur) {
  if (!objetUtilisateur || typeof objetUtilisateur !== 'object') return null;
  const candidats = [
    objetUtilisateur.medecin_id,
    objetUtilisateur.medecin?.medecin_id,
    objetUtilisateur.profil_medecin?.medecin_id,
    objetUtilisateur.fiche_medecin?.medecin_id,
    objetUtilisateur.utilisateur?.medecin_id,
  ];
  for (const candidat of candidats) {
    if (typeof candidat === 'string' && candidat.trim()) return candidat.trim();
  }
  return null;
}

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

const FORM_VIDE = {
  abonnement_id: '',
  medecin_id: '',
  libelle: '',
  prix: '',
  duree_jours: '',
};

const LIGNE_VIDE = { libelle_avantage: '', description: '', ordre_affichage: 0 };

// Hypothèse : valeurs de `statut`, utilisées seulement pour filtrer/
// afficher (jamais envoyées en écriture — voir bandeau d'en-tête).
const STATUTS_ABONNEMENT_MEDECIN = [
  { valeur: 'actif', libelle: 'Actif' },
  { valeur: 'expire', libelle: 'Expiré' },
  { valeur: 'annule', libelle: 'Annulé' },
];

function libelleStatut(statut) {
  return STATUTS_ABONNEMENT_MEDECIN.find((s) => s.valeur === statut)?.libelle || statut;
}

function classeBadgeStatut(statut) {
  if (statut === 'actif') return 'is-success';
  if (statut === 'expire') return 'is-warning';
  if (statut === 'annule') return 'is-danger';
  return 'is-info';
}

function formaterPrix(prix) {
  const n = Number(prix);
  if (Number.isNaN(n)) return prix ?? '—';
  return `${n.toLocaleString('fr-FR')} `;
}

function libelleMedecin(medecins, medecinId) {
  const m = medecins.find((x) => x.medecin_id === medecinId);
  if (!m) return medecinId || '—';
  if (m.nom_complet) return m.nom_complet;
  const compose = [m.prenom, m.nom].filter(Boolean).join(' ').trim();
  return compose || m.nom || medecinId;
}

/**
 * @param {Object} props
 * @param {string} [props.medecinId] - Si fourni, la vue est verrouillée
 *   sur ce médecin (ex. page "Mon abonnement" dans l'espace médecin) :
 *   pas de sélecteur médecin, création limitée à cette fiche. Omis,
 *   le composant se comporte comme une page d'administration listant
 *   tous les abonnements auxquels l'utilisateur connecté a droit
 *   (le serveur filtre déjà selon son rôle).
 */
export default function AbonnementMedecin({ medecinId } = {}) {
  const { user } = useAuth();
  const role = extraireNomRole(user);
  const estAdmin = role === 'admin' || role === 'superadmin';
  const medecinIdPropre = medecinId || extraireMedecinIdPropre(user);
  const scopeForcee = !estAdmin ? medecinIdPropre : medecinId || '';

  const [medecins, setMedecins] = useState([]);
  const [abonnements, setAbonnements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState(null);
  const [filtreMedecin, setFiltreMedecin] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('');
  const [recherche, setRecherche] = useState('');

  const chargerMedecins = useCallback(() => {
    listerMedecins().then(setMedecins).catch(() => setMedecins([]));
  }, []);

  const chargerAbonnements = useCallback(async () => {
    setLoading(true);
    setErreurChargement(null);
    try {
      const filtres = {};
      const medecinCible = scopeForcee || filtreMedecin;
      if (medecinCible) filtres.medecin_id = medecinCible;
      if (filtreStatut) filtres.statut = filtreStatut;
      const liste = await listerAbonnementsMedecin(filtres);
      setAbonnements(liste);
    } catch (err) {
      setErreurChargement(err.message || 'Impossible de charger les abonnements médecin.');
    } finally {
      setLoading(false);
    }
  }, [scopeForcee, filtreMedecin, filtreStatut]);

  useEffect(() => { chargerMedecins(); }, [chargerMedecins]);
  useEffect(() => { chargerAbonnements(); }, [chargerAbonnements]);

  const lignesTable = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return abonnements;
    return abonnements.filter(
      (a) =>
        (a.libelle || '').toLowerCase().includes(q) ||
        libelleMedecin(medecins, a.medecin_id).toLowerCase().includes(q)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abonnements, recherche, medecins]);

  const totalMontant = useMemo(
    () => abonnements.reduce((acc, a) => acc + (Number(a.prix) || 0), 0),
    [abonnements]
  );
  const totalActifs = useMemo(
    () => abonnements.filter((a) => a.statut === 'actif').length,
    [abonnements]
  );

  function peutGerer(a) {
    if (estAdmin) return true;
    return role === 'medecin' && !!medecinIdPropre && a.medecin_id === medecinIdPropre;
  }
  const peutCreer = estAdmin || (role === 'medecin' && !!medecinIdPropre);

  /* ─── Modale création / édition de l'abonnement ─────────────── */

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [lignesForm, setLignesForm] = useState([]); // lignes existantes (édition) ou à créer (création)
  const [ligneEnCours, setLigneEnCours] = useState(LIGNE_VIDE);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [ligneSaving, setLigneSaving] = useState(false);
  const [ligneError, setLigneError] = useState(null);

  function ouvrirCreation() {
    setForm({ ...FORM_VIDE, medecin_id: scopeForcee || filtreMedecin || '' });
    setLignesForm([]);
    setLigneEnCours(LIGNE_VIDE);
    setFormError(null);
    setLigneError(null);
    setModalOpen(true);
  }

  function ouvrirEdition(a) {
    setForm({
      abonnement_id: a.abonnement_id,
      medecin_id: a.medecin_id,
      libelle: a.libelle || '',
      prix: String(a.prix ?? ''),
      duree_jours: String(a.duree_jours ?? ''),
    });
    setLignesForm(a.lignes || []);
    setLigneEnCours(LIGNE_VIDE);
    setFormError(null);
    setLigneError(null);
    setModalOpen(true);
  }

  const modeEdition = !!form.abonnement_id;

  async function enregistrerAbonnement() {
    setFormError(null);
    const medecinCible = scopeForcee || form.medecin_id;
    if (!medecinCible || !form.libelle.trim() || form.prix === '' || form.duree_jours === '') {
      setFormError('Médecin, libellé, prix et durée (en jours) sont requis.');
      return;
    }
    setSaving(true);
    try {
      if (modeEdition) {
        await modifierAbonnementMedecin(form.abonnement_id, {
          libelle: form.libelle.trim(),
          prix: Number(form.prix),
          duree_jours: Number(form.duree_jours),
        });
        setModalOpen(false);
      } else {
        await creerAbonnementMedecin({
          medecin_id: medecinCible,
          libelle: form.libelle.trim(),
          prix: Number(form.prix),
          duree_jours: Number(form.duree_jours),
          // Les lignes ajoutées avant la création de l'abonnement (pas
          // encore de ligne_id) partent dans la même transaction.
          lignes: lignesForm
            .filter((l) => !l.ligne_id)
            .map((l) => ({
              libelle_avantage: l.libelle_avantage,
              description: l.description || undefined,
              ordre_affichage: l.ordre_affichage,
            })),
        });
        setModalOpen(false);
      }
      await chargerAbonnements();
    } catch (err) {
      setFormError(err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  /* ─── Gestion des lignes d'avantages ───────────────────────── */
  // En création : simple liste locale, envoyée avec l'abonnement.
  // En édition : chaque ajout/suppression appelle immédiatement l'API
  // (l'abonnement existe déjà côté serveur).

  function ajouterLigneLocale() {
    setLigneError(null);
    if (!ligneEnCours.libelle_avantage.trim()) {
      setLigneError("Le libellé de l'avantage est requis.");
      return;
    }
    if (!modeEdition) {
      setLignesForm((prev) => [...prev, { ...ligneEnCours, ordre_affichage: prev.length }]);
      setLigneEnCours(LIGNE_VIDE);
      return;
    }
    setLigneSaving(true);
    ajouterLigneAbonnementMedecin(form.abonnement_id, {
      libelle_avantage: ligneEnCours.libelle_avantage.trim(),
      description: ligneEnCours.description || undefined,
      ordre_affichage: lignesForm.length,
    })
      .then((ligne) => {
        setLignesForm((prev) => [...prev, ligne]);
        setLigneEnCours(LIGNE_VIDE);
      })
      .catch((err) => setLigneError(err.message || "Impossible d'ajouter cet avantage."))
      .finally(() => setLigneSaving(false));
  }

  function supprimerLigneLocale(index) {
    const ligne = lignesForm[index];
    if (!modeEdition || !ligne.ligne_id) {
      setLignesForm((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    setLigneSaving(true);
    setLigneError(null);
    supprimerLigneAbonnementMedecin(ligne.ligne_id)
      .then(() => setLignesForm((prev) => prev.filter((_, i) => i !== index)))
      .catch((err) => setLigneError(err.message || 'Impossible de supprimer cet avantage.'))
      .finally(() => setLigneSaving(false));
  }

  /* ─── Suppression de l'abonnement ──────────────────────────── */

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function askDelete(a) {
    setDeleteError(null);
    setPendingDelete(a);
  }
  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await supprimerAbonnementMedecin(pendingDelete.abonnement_id);
      setPendingDelete(null);
      await chargerAbonnements();
    } catch (err) {
      setDeleteError(err.message || 'Impossible de supprimer cet abonnement.');
    } finally {
      setDeleteSaving(false);
    }
  }

  const afficherSelecteurMedecin = !scopeForcee; // masqué si la vue est verrouillée sur un seul médecin
  const titrePage = scopeForcee && !estAdmin ? 'Mon abonnement' : 'Abonnements médecins';
  const sousTitrePage =
    scopeForcee && !estAdmin
      ? "Gérez votre offre d'abonnement sur la plateforme et ses avantages."
      : 'Donnée commerciale interne : abonnements et avantages par médecin.';

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
              <span>Abonnements</span>
            </nav>
            <h1>{titrePage}</h1>
            <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
              {sousTitrePage}
            </p>
          </div>
          {peutCreer && (
            <button className="btn btn-primary" type="button" onClick={ouvrirCreation}>
              <i className="fa-solid fa-plus me-1"></i> Nouvel abonnement
            </button>
          )}
        </div>

        <div className="row g-3 mb-4">
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-primary"><i className="fa-solid fa-file-invoice-dollar"></i></div>
              </div>
              <div className="aps-kpi__label">Abonnements</div>
              <div className="aps-kpi__value">{abonnements.length.toLocaleString('fr-FR')}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-success"><i className="fa-solid fa-circle-check"></i></div>
              </div>
              <div className="aps-kpi__label">Actifs</div>
              <div className="aps-kpi__value">{totalActifs.toLocaleString('fr-FR')}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-warning"><i className="fa-solid fa-sack-dollar"></i></div>
              </div>
              <div className="aps-kpi__label">Montant cumulé</div>
              <div className="aps-kpi__value">{formaterPrix(totalMontant)}</div>
            </div>
          </div>
        </div>

        {erreurChargement && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div className="flex-grow-1">{erreurChargement}</div>
            <button className="btn btn-sm btn-light" onClick={chargerAbonnements}>
              <i className="fa-solid fa-rotate-right me-1"></i>Réessayer
            </button>
          </div>
        )}

        <div className="aps-card mb-3">
          <div className="aps-card__body">
            <div className="row g-3 align-items-end">
              {afficherSelecteurMedecin && (
                <div className="col-md-4">
                  <label className="form-label">Médecin</label>
                  <select
                    className="form-select"
                    value={filtreMedecin}
                    onChange={(e) => setFiltreMedecin(e.target.value)}
                  >
                    <option value="">Tous</option>
                    {medecins.map((m) => (
                      <option key={m.medecin_id} value={m.medecin_id}>
                        {libelleMedecin(medecins, m.medecin_id)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="col-md-3">
                <label className="form-label">Statut</label>
                <select
                  className="form-select"
                  value={filtreStatut}
                  onChange={(e) => setFiltreStatut(e.target.value)}
                >
                  <option value="">Tous</option>
                  {STATUTS_ABONNEMENT_MEDECIN.map((s) => (
                    <option key={s.valeur} value={s.valeur}>{s.libelle}</option>
                  ))}
                </select>
              </div>
              <div className={afficherSelecteurMedecin ? 'col-md-5' : 'col-md-9'}>
                <label className="form-label">Recherche</label>
                <div className="aps-search">
                  <i className="fa-solid fa-magnifying-glass"></i>
                  <input
                    type="text"
                    placeholder="Rechercher par libellé ou médecin…"
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="row g-3">
          {loading ? (
            <div className="col-12">
              <div className="aps-card"><div className="aps-card__body text-center py-5"><i className="fa-solid fa-spinner fa-spin"></i></div></div>
            </div>
          ) : lignesTable.length === 0 ? (
            <div className="col-12">
              <div className="aps-card"><div className="aps-card__body text-center aps-text-muted py-5">Aucun abonnement ne correspond à ces critères.</div></div>
            </div>
          ) : (
            lignesTable.map((a) => (
              <div className="col-md-6 col-xl-4" key={a.abonnement_id}>
                <div className="aps-card h-100">
                  <div className="aps-card__body d-flex flex-column">
                    <div className="d-flex align-items-start justify-content-between mb-1">
                      <h5 style={{ fontSize: 15 }} className="mb-0">{a.libelle || 'Abonnement'}</h5>
                      {a.statut && (
                        <span className={`aps-badge ${classeBadgeStatut(a.statut)}`}>
                          <i className="fa-solid fa-circle-check"></i> {libelleStatut(a.statut)}
                        </span>
                      )}
                    </div>
                    {afficherSelecteurMedecin && (
                      <div className="mb-2">
                        <span className="aps-badge is-info">
                          <i className="fa-solid fa-user-doctor"></i> {libelleMedecin(medecins, a.medecin_id)}
                        </span>
                      </div>
                    )}
                    <p className="mb-2" style={{ fontSize: 20, fontWeight: 600 }}>
                      {formaterPrix(a.prix)}
                      <span className="aps-text-muted" style={{ fontSize: 13, fontWeight: 400 }}> / {a.duree_jours} j</span>
                    </p>
                    {a.lignes?.length > 0 && (
                      <ul className="mb-3" style={{ fontSize: 13, paddingLeft: 18 }}>
                        {a.lignes.map((l) => (
                          <li key={l.ligne_id}>{l.libelle_avantage}</li>
                        ))}
                      </ul>
                    )}
                    <div className="d-flex gap-2 mt-auto pt-2" style={{ borderTop: '1px solid var(--aps-border)' }}>
                      {peutGerer(a) && (
                        <button className="btn btn-sm btn-outline-primary flex-grow-1" onClick={() => ouvrirEdition(a)}>
                          <i className="fa-solid fa-pen me-1"></i> Gérer
                        </button>
                      )}
                      {peutGerer(a) && (
                        <button className="btn btn-sm btn-light" title="Supprimer" onClick={() => askDelete(a)}>
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* ===================== MODAL CRÉATION / ÉDITION ===================== */}
      <Modal
        id="modalAbonnementMedecin"
        large
        title={modeEdition ? "Gérer l'abonnement" : 'Nouvel abonnement médecin'}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setModalOpen(false)} disabled={saving}>
              {modeEdition ? 'Fermer' : 'Annuler'}
            </button>
            <button className="btn btn-primary" onClick={enregistrerAbonnement} disabled={saving}>
              {saving ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin me-2"></i>Enregistrement…
                </>
              ) : modeEdition ? 'Enregistrer les modifications' : "Créer l'abonnement"}
            </button>
          </>
        }
      >
        {formError && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div>{formError}</div>
          </div>
        )}
        <div className="row g-3 mb-3">
          {afficherSelecteurMedecin && (
            <div className="col-md-6">
              <label className="form-label">Médecin <span className="text-danger">*</span></label>
              <select
                className="form-select"
                value={form.medecin_id}
                disabled={modeEdition}
                onChange={(e) => setForm((f) => ({ ...f, medecin_id: e.target.value }))}
              >
                <option value="" disabled>Choisir…</option>
                {medecins.map((m) => (
                  <option key={m.medecin_id} value={m.medecin_id}>
                    {libelleMedecin(medecins, m.medecin_id)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className={afficherSelecteurMedecin ? 'col-md-6' : 'col-md-12'}>
            <label className="form-label">Libellé <span className="text-danger">*</span></label>
            <input
              type="text"
              className="form-control"
              placeholder="Ex. Abonnement Premium — 12 mois"
              value={form.libelle}
              onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">Prix <span className="text-danger">*</span></label>
            <input
              type="number" min="0" step="0.01"
              className="form-control"
              value={form.prix}
              onChange={(e) => setForm((f) => ({ ...f, prix: e.target.value }))}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">Durée (jours) <span className="text-danger">*</span></label>
            <input
              type="number" min="1" step="1"
              className="form-control"
              value={form.duree_jours}
              onChange={(e) => setForm((f) => ({ ...f, duree_jours: e.target.value }))}
            />
          </div>
        </div>

        <hr />
        <h6 className="mb-2">Avantages inclus (lignes)</h6>
        {ligneError && (
          <div className="aps-notice is-danger mb-2">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div>{ligneError}</div>
          </div>
        )}
        <div className="row g-2 align-items-end mb-3">
          <div className="col-md-5">
            <input
              type="text" className="form-control form-control-sm" placeholder="Libellé de l'avantage"
              value={ligneEnCours.libelle_avantage}
              onChange={(e) => setLigneEnCours((l) => ({ ...l, libelle_avantage: e.target.value }))}
            />
          </div>
          <div className="col-md-5">
            <input
              type="text" className="form-control form-control-sm" placeholder="Description (optionnel)"
              value={ligneEnCours.description}
              onChange={(e) => setLigneEnCours((l) => ({ ...l, description: e.target.value }))}
            />
          </div>
          <div className="col-md-2">
            <button type="button" className="btn btn-sm btn-outline-primary w-100" onClick={ajouterLigneLocale} disabled={ligneSaving}>
              <i className="fa-solid fa-plus"></i> Ajouter
            </button>
          </div>
        </div>

        {lignesForm.length === 0 ? (
          <p className="aps-text-muted" style={{ fontSize: 13 }}>Aucun avantage ajouté pour le moment.</p>
        ) : (
          <ul className="list-group">
            {lignesForm.map((l, i) => (
              <li key={l.ligne_id || `local-${i}`} className="list-group-item d-flex align-items-center justify-content-between">
                <div>
                  <strong style={{ fontSize: 13 }}>{l.libelle_avantage}</strong>
                  {l.description && <div className="aps-text-muted" style={{ fontSize: 12 }}>{l.description}</div>}
                </div>
                <button type="button" className="btn btn-sm btn-light" onClick={() => supprimerLigneLocale(i)} disabled={ligneSaving}>
                  <i className="fa-solid fa-trash"></i>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* ===================== MODAL SUPPRESSION ===================== */}
      <Modal
        id="modalDeleteAbonnementMedecin"
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
            Supprimer définitivement l'abonnement « {pendingDelete?.libelle} » ?
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