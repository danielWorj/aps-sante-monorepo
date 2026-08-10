// src/components/EmplacementForfaire.jsx
//
// Référentiel "emplacement_publicitaire" (diagramme
// 09_presence_publicite_boost) : décrit le TYPE d'espace publicitaire
// du site (ex. "accueil", "résultats de recherche", "fiche
// pharmacie"...) — table de référence pure, même patron que
// Langue/Devise/Pays/Ville (voir referentielService.js /
// Referentiel.jsx), pas un enum. C'est ici que sont administrés les
// emplacements que ForfaitPublicitaire.jsx packages ensuite avec un
// prix/une durée, et que Publicite.jsx propose au dépôt d'une
// publicité.
//
// Droits (voir publicite.controller.js) :
//   - Lecture (GET)          : PUBLIQUE.
//   - Écriture (POST/PUT)    : admin ou superadmin.
//   - Suppression (DELETE)   : superadmin uniquement — 409 si des
//     forfaits référencent encore l'emplacement (le serveur bloque, ce
//     composant se contente d'afficher le message d'erreur renvoyé).
//
// Reprend le patron "Modal piloté par état React" de Referentiel.jsx
// pour rester cohérent avec le reste du référentiel plutôt que le
// patron "cards" de PublicitePharmacie.jsx — cette table est petite et
// change rarement, une simple liste suffit.

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  listerEmplacementsPublicitaires,
  creerEmplacementPublicitaire,
  modifierEmplacementPublicitaire,
  supprimerEmplacementPublicitaire,
} from '../services/publiciteService';

/**
 * Extrait un nom de rôle (en minuscules) depuis un objet utilisateur,
 * quelle que soit la forme exacte sous laquelle il a été stocké après
 * connexion — même logique que Publicite.jsx / PublicitePharmacie.jsx,
 * dupliquée ici pour ne pas introduire de dépendance croisée entre
 * composants.
 */
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

function Modal({ id, title, isOpen, onClose, children, footer }) {
  if (!isOpen) return null;
  return (
    <>
      <div className="modal fade show d-block" id={id} tabIndex="-1" role="dialog">
        <div className="modal-dialog">
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

const FORM_VIDE = { emplacement_publicitaire_id: '', code: '', libelle: '', description: '' };

export default function EmplacementForfaire() {
  const { user } = useAuth();
  const role = extraireNomRole(user);
  const peutEcrire = role === 'admin' || role === 'superadmin';
  const peutSupprimer = role === 'superadmin';

  const [emplacements, setEmplacements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState(null);
  const [recherche, setRecherche] = useState('');

  const chargerEmplacements = useCallback(async () => {
    setLoading(true);
    setErreurChargement(null);
    try {
      const liste = await listerEmplacementsPublicitaires();
      setEmplacements(liste);
    } catch (err) {
      setErreurChargement(err.message || 'Impossible de charger les emplacements publicitaires.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    chargerEmplacements();
  }, [chargerEmplacements]);

  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return emplacements;
    return emplacements.filter(
      (e) => e.code.toLowerCase().includes(q) || e.libelle.toLowerCase().includes(q)
    );
  }, [emplacements, recherche]);

  // --- Modale création / édition ---
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  function ouvrirCreation() {
    setForm(FORM_VIDE);
    setFormError(null);
    setModalOpen(true);
  }
  function ouvrirEdition(e) {
    setForm({
      emplacement_publicitaire_id: e.emplacement_publicitaire_id,
      code: e.code,
      libelle: e.libelle,
      description: e.description || '',
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function enregistrer() {
    setFormError(null);
    if (!form.code.trim() || !form.libelle.trim()) {
      setFormError('Le code et le libellé sont requis.');
      return;
    }
    setSaving(true);
    try {
      const donnees = { code: form.code.trim(), libelle: form.libelle.trim(), description: form.description.trim() || '' };
      if (form.emplacement_publicitaire_id) {
        await modifierEmplacementPublicitaire(form.emplacement_publicitaire_id, donnees);
      } else {
        await creerEmplacementPublicitaire(donnees);
      }
      setModalOpen(false);
      await chargerEmplacements();
    } catch (err) {
      setFormError(err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  // --- Suppression ---
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  function askDelete(e) {
    setDeleteError(null);
    setPendingDelete(e);
  }
  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await supprimerEmplacementPublicitaire(pendingDelete.emplacement_publicitaire_id);
      setPendingDelete(null);
      await chargerEmplacements();
    } catch (err) {
      setDeleteError(err.message || 'Impossible de supprimer cet emplacement.');
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
              <span>Emplacements publicitaires</span>
            </nav>
            <h1>Emplacements publicitaires</h1>
            <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
              Types d'espaces publicitaires disponibles sur le site (accueil, résultats de recherche, fiche
              pharmacie…), packagés ensuite en forfaits.
            </p>
          </div>
          {peutEcrire && (
            <button className="btn btn-primary" type="button" onClick={ouvrirCreation}>
              <i className="fa-solid fa-plus me-1"></i> Nouvel emplacement
            </button>
          )}
        </div>

        <div className="row g-3 mb-4">
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-primary"><i className="fa-solid fa-window-restore"></i></div>
              </div>
              <div className="aps-kpi__label">Emplacements référencés</div>
              <div className="aps-kpi__value">{emplacements.length.toLocaleString('fr-FR')}</div>
            </div>
          </div>
        </div>

        {erreurChargement && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div className="flex-grow-1">{erreurChargement}</div>
            <button className="btn btn-sm btn-light" onClick={chargerEmplacements}>
              <i className="fa-solid fa-rotate-right me-1"></i>Réessayer
            </button>
          </div>
        )}

        <div className="aps-card">
          <div className="aps-card__body">
            <div className="aps-search mb-3">
              <i className="fa-solid fa-magnifying-glass"></i>
              <input
                type="text"
                placeholder="Rechercher par code ou libellé…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
              />
            </div>

            <div className="aps-table-wrap">
              <table className="table aps-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Libellé</th>
                    <th>Description</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4}>
                        <div className="aps-empty-mini py-4 text-center">
                          <i className="fa-solid fa-spinner fa-spin d-block mb-2"></i>
                          Chargement…
                        </div>
                      </td>
                    </tr>
                  ) : lignes.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <div className="aps-empty-mini py-4 text-center">Aucun emplacement trouvé.</div>
                      </td>
                    </tr>
                  ) : (
                    lignes.map((e) => (
                      <tr key={e.emplacement_publicitaire_id}>
                        <td><code>{e.code}</code></td>
                        <td className="cell-title">{e.libelle}</td>
                        <td className="aps-text-muted">{e.description || '—'}</td>
                        <td className="text-end">
                          <div className="aps-row-actions">
                            {peutEcrire && (
                              <button className="btn btn-sm btn-outline-primary" onClick={() => ouvrirEdition(e)}>
                                <i className="fa-solid fa-pen"></i>
                              </button>
                            )}
                            {peutSupprimer && (
                              <button className="btn btn-sm btn-light" onClick={() => askDelete(e)}>
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* ===================== MODAL CRÉATION / ÉDITION ===================== */}
      <Modal
        id="modalEmplacement"
        title={form.emplacement_publicitaire_id ? "Modifier l'emplacement" : 'Nouvel emplacement publicitaire'}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setModalOpen(false)} disabled={saving}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={enregistrer} disabled={saving}>
              {saving ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin me-2"></i>Enregistrement…
                </>
              ) : (
                'Enregistrer'
              )}
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
        <div className="mb-3">
          <label className="form-label">Code <span className="text-danger">*</span></label>
          <input
            type="text"
            className="form-control"
            placeholder="Ex. accueil, fiche_pharmacie…"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          />
        </div>
        <div className="mb-3">
          <label className="form-label">Libellé <span className="text-danger">*</span></label>
          <input
            type="text"
            className="form-control"
            placeholder="Ex. Page d'accueil"
            value={form.libelle}
            onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
          />
        </div>
        <div className="mb-1">
          <label className="form-label">Description</label>
          <textarea
            className="form-control"
            rows={3}
            placeholder="Optionnel"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
      </Modal>

      {/* ===================== MODAL SUPPRESSION ===================== */}
      <Modal
        id="modalDeleteEmplacement"
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
            Supprimer définitivement l'emplacement « {pendingDelete?.libelle} » ? Impossible si des forfaits
            publicitaires le référencent encore.
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