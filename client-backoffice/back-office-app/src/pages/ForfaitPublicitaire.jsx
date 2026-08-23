// src/components/ForfaitPublicitaire.jsx
//
// Catalogue commercial "forfait_publicitaire" (diagramme
// 09_presence_publicite_boost) : packages un emplacement_publicitaire
// (voir EmplacementForfaire.jsx) avec une durée/un prix. Chaque
// forfait porte des lignes d'avantages (ligne_forfait_publicitaire),
// affichées telles quelles côté vitrine. C'est dans ce catalogue que
// l'utilisateur choisit son forfait lors du dépôt d'une publicité
// (voir Publicite.jsx).
//
// Droits (voir publicite.controller.js) :
//   - Lecture (GET)          : PUBLIQUE — un utilisateur doit pouvoir
//     choisir un forfait avant de soumettre sa publicité.
//   - Écriture (POST/PUT)    : admin ou superadmin. Les lignes créées
//     en même temps qu'un forfait (champ `lignes` du POST) passent
//     dans la même transaction ; les lignes d'un forfait déjà existant
//     s'ajoutent/se modifient/se suppriment ensuite une à une (routes
//     dédiées, préfixe "/lignes-forfait-publicitaire").
//   - Suppression (DELETE)   : superadmin uniquement — 409 si des
//     publicités référencent encore le forfait.
//
// Reprend le patron "Modal piloté par état React" de Referentiel.jsx /
// EmplacementForfaire.jsx.

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  listerEmplacementsPublicitaires,
  listerForfaitsPublicitaires,
  creerForfaitPublicitaire,
  modifierForfaitPublicitaire,
  supprimerForfaitPublicitaire,
  ajouterLigneForfait,
  modifierLigneForfait,
  supprimerLigneForfait,
} from '../services/publiciteService';

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
  forfait_publicitaire_id: '',
  emplacement_publicitaire_id: '',
  libelle: '',
  prix: '',
  duree_jours: '',
};

const LIGNE_VIDE = { libelle_avantage: '', description: '', ordre_affichage: 0 };

function formaterPrix(prix) {
  const n = Number(prix);
  if (Number.isNaN(n)) return prix ?? '—';
  return `${n.toLocaleString('fr-FR')} `;
}

export default function ForfaitPublicitaire() {
  const { user } = useAuth();
  const role = extraireNomRole(user);
  const peutEcrire = role === 'admin' || role === 'superadmin';
  const peutSupprimer = role === 'superadmin';

  const [emplacements, setEmplacements] = useState([]);
  const [forfaits, setForfaits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState(null);
  const [filtreEmplacement, setFiltreEmplacement] = useState('');
  const [recherche, setRecherche] = useState('');

  const chargerEmplacements = useCallback(() => {
    listerEmplacementsPublicitaires().then(setEmplacements).catch(() => setEmplacements([]));
  }, []);

  const chargerForfaits = useCallback(async () => {
    setLoading(true);
    setErreurChargement(null);
    try {
      const liste = await listerForfaitsPublicitaires(
        filtreEmplacement ? { emplacement_publicitaire_id: filtreEmplacement } : {}
      );
      setForfaits(liste);
    } catch (err) {
      setErreurChargement(err.message || 'Impossible de charger les forfaits publicitaires.');
    } finally {
      setLoading(false);
    }
  }, [filtreEmplacement]);

  useEffect(() => { chargerEmplacements(); }, [chargerEmplacements]);
  useEffect(() => { chargerForfaits(); }, [chargerForfaits]);

  function libelleEmplacement(id) {
    return emplacements.find((e) => e.emplacement_publicitaire_id === id)?.libelle || id || '—';
  }

  const lignesTable = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return forfaits;
    return forfaits.filter(
      (f) => f.libelle.toLowerCase().includes(q) || libelleEmplacement(f.emplacement_publicitaire_id).toLowerCase().includes(q)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forfaits, recherche, emplacements]);

  /* ─── Modale création / édition du forfait ─────────────────── */

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [lignesForm, setLignesForm] = useState([]); // lignes existantes (édition) ou à créer (création)
  const [ligneEnCours, setLigneEnCours] = useState(LIGNE_VIDE);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [ligneSaving, setLigneSaving] = useState(false);
  const [ligneError, setLigneError] = useState(null);

  function ouvrirCreation() {
    setForm({ ...FORM_VIDE, emplacement_publicitaire_id: filtreEmplacement || '' });
    setLignesForm([]);
    setLigneEnCours(LIGNE_VIDE);
    setFormError(null);
    setLigneError(null);
    setModalOpen(true);
  }

  function ouvrirEdition(f) {
    setForm({
      forfait_publicitaire_id: f.forfait_publicitaire_id,
      emplacement_publicitaire_id: f.emplacement_publicitaire_id,
      libelle: f.libelle,
      prix: String(f.prix ?? ''),
      duree_jours: String(f.duree_jours ?? ''),
    });
    setLignesForm(f.lignes || []);
    setLigneEnCours(LIGNE_VIDE);
    setFormError(null);
    setLigneError(null);
    setModalOpen(true);
  }

  const modeEdition = !!form.forfait_publicitaire_id;

  async function enregistrerForfait() {
    setFormError(null);
    if (!form.emplacement_publicitaire_id || !form.libelle.trim() || form.prix === '' || form.duree_jours === '') {
      setFormError('Emplacement, libellé, prix et durée (en jours) sont requis.');
      return;
    }
    setSaving(true);
    try {
      if (modeEdition) {
        await modifierForfaitPublicitaire(form.forfait_publicitaire_id, {
          emplacement_publicitaire_id: form.emplacement_publicitaire_id,
          libelle: form.libelle.trim(),
          prix: Number(form.prix),
          duree_jours: Number(form.duree_jours),
        });
        setModalOpen(false);
      } else {
        await creerForfaitPublicitaire({
          emplacement_publicitaire_id: form.emplacement_publicitaire_id,
          libelle: form.libelle.trim(),
          prix: Number(form.prix),
          duree_jours: Number(form.duree_jours),
          // Les lignes ajoutées avant la création du forfait (pas
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
      await chargerForfaits();
    } catch (err) {
      setFormError(err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  /* ─── Gestion des lignes d'avantages ───────────────────────── */
  // En création : simple liste locale, envoyée avec le forfait.
  // En édition : chaque ajout/suppression appelle immédiatement l'API
  // (le forfait existe déjà côté serveur).

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
    ajouterLigneForfait(form.forfait_publicitaire_id, {
      libelle_avantage: ligneEnCours.libelle_avantage.trim(),
      description: ligneEnCours.description || undefined,
      ordre_affichage: lignesForm.length,
    })
      .then((ligne) => {
        setLignesForm((prev) => [...prev, ligne]);
        setLigneEnCours(LIGNE_VIDE);
      })
      .catch((err) => setLigneError(err.message || "Impossible d'ajouter cette ligne."))
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
    supprimerLigneForfait(ligne.ligne_id)
      .then(() => setLignesForm((prev) => prev.filter((_, i) => i !== index)))
      .catch((err) => setLigneError(err.message || 'Impossible de supprimer cette ligne.'))
      .finally(() => setLigneSaving(false));
  }

  /* ─── Suppression du forfait ────────────────────────────────── */

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function askDelete(f) {
    setDeleteError(null);
    setPendingDelete(f);
  }
  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await supprimerForfaitPublicitaire(pendingDelete.forfait_publicitaire_id);
      setPendingDelete(null);
      await chargerForfaits();
    } catch (err) {
      setDeleteError(err.message || 'Impossible de supprimer ce forfait.');
    } finally {
      setDeleteSaving(false);
    }
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
              <span>Forfaits publicitaires</span>
            </nav>
            <h1>Forfaits publicitaires</h1>
            <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
              Catalogue commercial : durée et prix packagés par emplacement, avec leurs avantages.
            </p>
          </div>
          {peutEcrire && (
            <button className="btn btn-primary" type="button" onClick={ouvrirCreation}>
              <i className="fa-solid fa-plus me-1"></i> Nouveau forfait
            </button>
          )}
        </div>

        <div className="row g-3 mb-4">
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-primary"><i className="fa-solid fa-box-open"></i></div>
              </div>
              <div className="aps-kpi__label">Forfaits actifs</div>
              <div className="aps-kpi__value">{forfaits.length.toLocaleString('fr-FR')}</div>
            </div>
          </div>
        </div>

        {erreurChargement && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div className="flex-grow-1">{erreurChargement}</div>
            <button className="btn btn-sm btn-light" onClick={chargerForfaits}>
              <i className="fa-solid fa-rotate-right me-1"></i>Réessayer
            </button>
          </div>
        )}

        <div className="aps-card mb-3">
          <div className="aps-card__body">
            <div className="row g-3 align-items-end">
              <div className="col-md-4">
                <label className="form-label">Emplacement</label>
                <select
                  className="form-select"
                  value={filtreEmplacement}
                  onChange={(e) => setFiltreEmplacement(e.target.value)}
                >
                  <option value="">Tous</option>
                  {emplacements.map((e) => (
                    <option key={e.emplacement_publicitaire_id} value={e.emplacement_publicitaire_id}>
                      {e.libelle}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-8">
                <label className="form-label">Recherche</label>
                <div className="aps-search">
                  <i className="fa-solid fa-magnifying-glass"></i>
                  <input
                    type="text"
                    placeholder="Rechercher par libellé ou emplacement…"
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
              <div className="aps-card"><div className="aps-card__body text-center aps-text-muted py-5">Aucun forfait ne correspond à ces critères.</div></div>
            </div>
          ) : (
            lignesTable.map((f) => (
              <div className="col-md-6 col-xl-4" key={f.forfait_publicitaire_id}>
                <div className="aps-card h-100">
                  <div className="aps-card__body d-flex flex-column">
                    <div className="d-flex align-items-start justify-content-between mb-1">
                      <h5 style={{ fontSize: 15 }} className="mb-0">{f.libelle}</h5>
                      <span className="aps-badge is-info">
                        <i className="fa-solid fa-window-restore"></i> {libelleEmplacement(f.emplacement_publicitaire_id)}
                      </span>
                    </div>
                    <p className="mb-2" style={{ fontSize: 20, fontWeight: 600 }}>
                      {formaterPrix(f.prix)}
                      <span className="aps-text-muted" style={{ fontSize: 13, fontWeight: 400 }}> / {f.duree_jours} j</span>
                    </p>
                    {f.lignes?.length > 0 && (
                      <ul className="mb-3" style={{ fontSize: 13, paddingLeft: 18 }}>
                        {f.lignes.map((l) => (
                          <li key={l.ligne_id}>{l.libelle_avantage}</li>
                        ))}
                      </ul>
                    )}
                    <div className="d-flex gap-2 mt-auto pt-2" style={{ borderTop: '1px solid var(--aps-border)' }}>
                      {peutEcrire && (
                        <button className="btn btn-sm btn-outline-primary flex-grow-1" onClick={() => ouvrirEdition(f)}>
                          <i className="fa-solid fa-pen me-1"></i> Gérer
                        </button>
                      )}
                      {peutSupprimer && (
                        <button className="btn btn-sm btn-light" title="Supprimer" onClick={() => askDelete(f)}>
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
        id="modalForfait"
        large
        title={modeEdition ? 'Gérer le forfait publicitaire' : 'Nouveau forfait publicitaire'}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setModalOpen(false)} disabled={saving}>
              {modeEdition ? 'Fermer' : 'Annuler'}
            </button>
            <button className="btn btn-primary" onClick={enregistrerForfait} disabled={saving}>
              {saving ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin me-2"></i>Enregistrement…
                </>
              ) : modeEdition ? 'Enregistrer les modifications' : 'Créer le forfait'}
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
          <div className="col-md-6">
            <label className="form-label">Emplacement <span className="text-danger">*</span></label>
            <select
              className="form-select"
              value={form.emplacement_publicitaire_id}
              onChange={(e) => setForm((f) => ({ ...f, emplacement_publicitaire_id: e.target.value }))}
            >
              <option value="" disabled>Choisir…</option>
              {emplacements.map((e) => (
                <option key={e.emplacement_publicitaire_id} value={e.emplacement_publicitaire_id}>
                  {e.libelle}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Libellé <span className="text-danger">*</span></label>
            <input
              type="text"
              className="form-control"
              placeholder="Ex. Forfait 30 jours — Accueil"
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
        id="modalDeleteForfait"
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
            Supprimer définitivement le forfait « {pendingDelete?.libelle} » ? Impossible si des publicités le
            référencent encore.
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