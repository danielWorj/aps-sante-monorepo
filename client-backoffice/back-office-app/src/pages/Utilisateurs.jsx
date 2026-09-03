import { useEffect, useMemo, useState } from 'react';
import UtilisateurService, {
  ROLES_UTILISATEUR,
  MOT_DE_PASSE_LONGUEUR_MIN,
} from '../services/utilisateurService';
// ⚠️ Adaptez ce chemin à votre projet : ce composant a besoin de savoir
// qui est connecté (id + rôle) pour appliquer côté UI les mêmes
// garde-fous que le serveur (pas d'auto-suspension, pas d'auto-
// rétrogradation du superadmin). Le serveur reste la seule source de
// vérité (voir utilisateurs.controller.js) : ces vérifications côté
// front ne sont que du confort d'affichage.
import { useAuth } from '../context/AuthContext';

/* ------------------------------------------------------------------ */
/* Ce composant est le pendant front de utilisateurs.controller.js /   */
/* utilisateurs.routes.js : il ne gère QUE les comptes "admin" et      */
/* "superadmin" (back-office IAM), pas les patients / médecins /       */
/* agent_xxx (voir authentification côté back pour ceux-là).           */
/* ------------------------------------------------------------------ */

const STATUTS = [
  { value: 'actif', label: 'Actif', badge: 'is-success' },
  { value: 'suspendu', label: 'Suspendu', badge: 'is-danger' },
];

const ROLE_BADGE = {
  admin: 'is-info',
  superadmin: 'is-warning',
};

const EMPTY_FORM = {
  utilisateur_id: null,
  nom: '',
  prenom: '',
  email: '',
  telephone: '',
  pays_id: '',
  role: 'admin',
  mot_de_passe: '',
};

function roleLabel(role) {
  return ROLES_UTILISATEUR.find((r) => r.valeur === role)?.libelle ?? role;
}

function initiales(nom, prenom) {
  return `${(prenom || '?')[0] ?? ''}${(nom || '?')[0] ?? ''}`.toUpperCase();
}

// Message d'erreur exploitable, que l'erreur vienne d'apiFetch (avec
// .data.message, voir utilisateurService.js) ou d'ailleurs.
function messageErreur(err, repli = "Une erreur est survenue.") {
  return err?.data?.message || err?.message || repli;
}

export default function Utilisateurs() {
  const { user: moi } = useAuth() ?? {};
  const peutEcrire = moi?.role === 'superadmin';

  // ─── Liste + filtres ────────────────────────────────────────────
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limite: 20, total: 0, total_pages: 1 });
  const [chargement, setChargement] = useState(true);
  const [erreurListe, setErreurListe] = useState(null);

  const [searchInput, setSearchInput] = useState('');
  const [filtres, setFiltres] = useState({ role: 'all', statut: 'all', recherche: '', page: 1 });

  // ─── KPI (vue d'ensemble, indépendante des filtres de la table) ──
  const [stats, setStats] = useState(null);

  // ─── Pays (référentiel, pour afficher un nom plutôt qu'un id) ────
  const [paysListe, setPaysListe] = useState([]);
  const paysParId = useMemo(() => {
    const m = new Map();
    paysListe.forEach((p) => m.set(p.pays_id ?? p.id, p.nom ?? p.libelle));
    return m;
  }, [paysListe]);

  const [selected, setSelected] = useState([]);
  const [openMenuId, setOpenMenuId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErreur, setFormErreur] = useState(null);
  const [enregistrement, setEnregistrement] = useState(false);

  const [actionEnCours, setActionEnCours] = useState(null); // id de l'utilisateur en cours de suspension/réactivation
  const [banniere, setBanniere] = useState(null); // { type: 'success' | 'error', texte }

  // Débounce de la recherche texte : on ne déclenche l'appel API
  // qu'après une pause de frappe, pour éviter une requête par lettre.
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltres((f) => ({ ...f, recherche: searchInput.trim(), page: 1 }));
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Chargement du référentiel pays (une seule fois). Le endpoint exact
  // dépend de votre referentielService.js — à ajuster si différent.
  useEffect(() => {
    let annule = false;
    import('../services/referentielService')
      .then((mod) => mod.listerPays?.())
      .then((liste) => {
        if (!annule && Array.isArray(liste)) setPaysListe(liste);
      })
      .catch(() => {
        // Référentiel indisponible : on affichera l'id du pays en repli.
      });
    return () => {
      annule = true;
    };
  }, []);

  async function chargerListe() {
    setChargement(true);
    setErreurListe(null);
    try {
      const reponse = await UtilisateurService.listerUtilisateurs({
        role: filtres.role === 'all' ? undefined : filtres.role,
        statut: filtres.statut === 'all' ? undefined : filtres.statut,
        recherche: filtres.recherche || undefined,
        page: filtres.page,
        limite: pagination.limite,
      });
      setUtilisateurs(reponse.utilisateurs);
      setPagination(reponse.pagination);
      setSelected([]);
    } catch (err) {
      setErreurListe(messageErreur(err, "Impossible de charger les utilisateurs."));
    } finally {
      setChargement(false);
    }
  }

  // Vue d'ensemble pour les KPI : indépendante des filtres du tableau.
  // On se limite au périmètre admin/superadmin (déjà appliqué côté
  // serveur), avec une limite large ; ce module reste de petite taille
  // par nature (comptes privilégiés uniquement).
  async function chargerStats() {
    try {
      const [tousRes, actifsRes, suspendusRes, superadminsRes] = await Promise.all([
        UtilisateurService.listerUtilisateurs({ limite: 1 }),
        UtilisateurService.listerUtilisateurs({ statut: 'actif', limite: 1 }),
        UtilisateurService.listerUtilisateurs({ statut: 'suspendu', limite: 1 }),
        UtilisateurService.listerUtilisateurs({ role: 'superadmin', limite: 1 }),
      ]);
      setStats({
        total: tousRes.pagination.total,
        actifs: actifsRes.pagination.total,
        suspendus: suspendusRes.pagination.total,
        superadmins: superadminsRes.pagination.total,
      });
    } catch {
      // Les KPI sont secondaires : on n'affiche pas d'erreur bloquante
      // pour ça, le tableau reste la source d'information principale.
    }
  }

  useEffect(() => {
    chargerListe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtres, pagination.limite]);

  useEffect(() => {
    chargerStats();
  }, []);

  const allChecked = utilisateurs.length > 0 && selected.length === utilisateurs.length;

  function toggleAll() {
    setSelected(allChecked ? [] : utilisateurs.map((u) => u.utilisateur_id));
  }

  function toggleOne(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function ouvrirCreation() {
    setForm(EMPTY_FORM);
    setFormErreur(null);
    setShowModal(true);
  }

  function ouvrirEdition(u) {
    setForm({
      utilisateur_id: u.utilisateur_id,
      nom: u.nom,
      prenom: u.prenom,
      email: u.email,
      telephone: u.telephone ?? '',
      pays_id: u.pays_id ?? '',
      role: u.role,
      mot_de_passe: '',
    });
    setFormErreur(null);
    setOpenMenuId(null);
    setShowModal(true);
  }

  function majFormulaire(champ, valeur) {
    setForm((f) => ({ ...f, [champ]: valeur }));
  }

  async function soumettreFormulaire(e) {
    e.preventDefault();
    setFormErreur(null);

    if (!form.utilisateur_id && form.mot_de_passe.length < MOT_DE_PASSE_LONGUEUR_MIN) {
      setFormErreur(
        `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_LONGUEUR_MIN} caractères.`
      );
      return;
    }

    setEnregistrement(true);
    try {
      if (form.utilisateur_id) {
        await UtilisateurService.modifierUtilisateur(form.utilisateur_id, {
          nom: form.nom,
          prenom: form.prenom,
          telephone: form.telephone || undefined,
          pays_id: form.pays_id || undefined,
          role: form.role,
        });
        setBanniere({ type: 'success', texte: 'Utilisateur mis à jour.' });
      } else {
        await UtilisateurService.creerUtilisateur({
          nom: form.nom,
          prenom: form.prenom,
          email: form.email,
          telephone: form.telephone || undefined,
          pays_id: form.pays_id,
          role: form.role,
          mot_de_passe: form.mot_de_passe,
        });
        setBanniere({ type: 'success', texte: 'Compte créé avec succès.' });
      }
      setShowModal(false);
      await chargerListe();
      await chargerStats();
    } catch (err) {
      setFormErreur(messageErreur(err, "Impossible d'enregistrer cet utilisateur."));
    } finally {
      setEnregistrement(false);
    }
  }

  async function basculerStatut(u) {
    setOpenMenuId(null);
    setActionEnCours(u.utilisateur_id);
    try {
      if (u.statut_compte === 'actif') {
        await UtilisateurService.suspendreUtilisateur(u.utilisateur_id);
        setBanniere({ type: 'success', texte: `${u.prenom} ${u.nom} a été suspendu.` });
      } else {
        await UtilisateurService.reactiverUtilisateur(u.utilisateur_id);
        setBanniere({ type: 'success', texte: `${u.prenom} ${u.nom} a été réactivé.` });
      }
      await chargerListe();
      await chargerStats();
    } catch (err) {
      setBanniere({ type: 'error', texte: messageErreur(err) });
    } finally {
      setActionEnCours(null);
    }
  }

  return (
    <main className="aps-content">
      {/* Header de page */}
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">
            Back-office <span className="sep">/</span> IAM <span className="sep">/</span> Utilisateurs
          </div>
          <h1>Comptes admin &amp; superadmin</h1>
        </div>
        {peutEcrire && (
          <div className="d-flex gap-2">
            <button className="btn btn-primary" onClick={ouvrirCreation}>
              <i className="fa-solid fa-plus me-2" />
              Nouveau compte
            </button>
          </div>
        )}
      </div>

      {banniere && (
        <div
          className={`alert ${banniere.type === 'success' ? 'alert-success' : 'alert-danger'} d-flex justify-content-between align-items-center`}
          role="alert"
        >
          <span>{banniere.texte}</span>
          <button
            type="button"
            className="btn-close"
            aria-label="Fermer"
            onClick={() => setBanniere(null)}
          />
        </div>
      )}

      {!peutEcrire && (
        <div className="alert alert-info">
          <i className="fa-solid fa-circle-info me-2" />
          Vous êtes connecté en tant qu&apos;admin : cette page est en lecture seule. Seul un
          superadmin peut créer, modifier, suspendre ou réactiver un compte.
        </div>
      )}

      {/* KPI */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3">
          <div className="aps-kpi">
            <div className="aps-kpi__top">
              <div className="aps-kpi__icon is-primary">
                <i className="fa-solid fa-users" />
              </div>
            </div>
            <div className="aps-kpi__label">Comptes totaux</div>
            <div className="aps-kpi__value">{stats ? stats.total : '—'}</div>
          </div>
        </div>
        <div className="col-6 col-lg-3">
          <div className="aps-kpi">
            <div className="aps-kpi__top">
              <div className="aps-kpi__icon is-success">
                <i className="fa-solid fa-user-check" />
              </div>
            </div>
            <div className="aps-kpi__label">Comptes actifs</div>
            <div className="aps-kpi__value">{stats ? stats.actifs : '—'}</div>
          </div>
        </div>
        <div className="col-6 col-lg-3">
          <div className="aps-kpi">
            <div className="aps-kpi__top">
              <div className="aps-kpi__icon is-danger">
                <i className="fa-solid fa-user-slash" />
              </div>
            </div>
            <div className="aps-kpi__label">Comptes suspendus</div>
            <div className="aps-kpi__value">{stats ? stats.suspendus : '—'}</div>
          </div>
        </div>
        <div className="col-6 col-lg-3">
          <div className="aps-kpi">
            <div className="aps-kpi__top">
              <div className="aps-kpi__icon is-warning">
                <i className="fa-solid fa-user-shield" />
              </div>
            </div>
            <div className="aps-kpi__label">Superadmins</div>
            <div className="aps-kpi__value">{stats ? stats.superadmins : '—'}</div>
          </div>
        </div>
      </div>

      {/* Filtres + tableau */}
      <div className="aps-card">
        <div className="aps-card__header flex-wrap gap-2">
          <h2>Tous les comptes</h2>
          <div className="d-flex flex-wrap gap-2">
            <div className="aps-topbar__search" style={{ maxWidth: 240 }}>
              <i className="fa-solid fa-magnifying-glass" />
              <input
                type="text"
                placeholder="Rechercher nom, prénom, email..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={filtres.role}
              onChange={(e) => setFiltres((f) => ({ ...f, role: e.target.value, page: 1 }))}
            >
              <option value="all">Tous les rôles</option>
              {ROLES_UTILISATEUR.map((r) => (
                <option key={r.valeur} value={r.valeur}>{r.libelle}</option>
              ))}
            </select>
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={filtres.statut}
              onChange={(e) => setFiltres((f) => ({ ...f, statut: e.target.value, page: 1 }))}
            >
              <option value="all">Tous les statuts</option>
              {STATUTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="aps-table-wrap">
          <table className="table aps-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={allChecked}
                    onChange={toggleAll}
                    disabled={utilisateurs.length === 0}
                  />
                </th>
                <th>Utilisateur</th>
                <th>Rôle</th>
                <th>Téléphone</th>
                <th>Pays</th>
                <th>Statut</th>
                {peutEcrire && <th></th>}
              </tr>
            </thead>
            <tbody>
              {chargement && (
                <tr>
                  <td colSpan={peutEcrire ? 7 : 6}>
                    <div className="aps-empty-state">
                      <i className="fa-solid fa-spinner fa-spin" />
                      <div>Chargement des utilisateurs...</div>
                    </div>
                  </td>
                </tr>
              )}

              {!chargement && erreurListe && (
                <tr>
                  <td colSpan={peutEcrire ? 7 : 6}>
                    <div className="aps-empty-state">
                      <i className="fa-solid fa-triangle-exclamation" />
                      <div>{erreurListe}</div>
                      <button className="btn btn-sm btn-light mt-2" onClick={chargerListe}>
                        Réessayer
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {!chargement && !erreurListe && utilisateurs.length === 0 && (
                <tr>
                  <td colSpan={peutEcrire ? 7 : 6}>
                    <div className="aps-empty-state">
                      <i className="fa-solid fa-user-slash" />
                      <div>Aucun utilisateur ne correspond à ces critères.</div>
                    </div>
                  </td>
                </tr>
              )}

              {!chargement && !erreurListe && utilisateurs.map((u) => {
                const estMoi = u.utilisateur_id === moi?.utilisateur_id;
                const statutMeta = STATUTS.find((s) => s.value === u.statut_compte);
                return (
                  <tr key={u.utilisateur_id}>
                    <td>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={selected.includes(u.utilisateur_id)}
                        onChange={() => toggleOne(u.utilisateur_id)}
                      />
                    </td>
                    <td>
                      <div className="aps-avatar-cell">
                        <div className="aps-avatar-initiales">{initiales(u.nom, u.prenom)}</div>
                        <div>
                          <div className="cell-title">
                            {u.prenom} {u.nom}
                            {estMoi && <span className="aps-badge is-neutral ms-2">Vous</span>}
                          </div>
                          <div className="cell-sub">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`aps-badge ${ROLE_BADGE[u.role] ?? 'is-neutral'}`}>
                        <i className="fa-solid fa-circle" />
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td>{u.telephone || '—'}</td>
                    <td>{paysParId.get(u.pays_id) ?? u.pays_id ?? '—'}</td>
                    <td>
                      <span className={`aps-badge ${statutMeta?.badge ?? 'is-neutral'}`}>
                        <i className="fa-solid fa-circle" />
                        {statutMeta?.label ?? u.statut_compte}
                      </span>
                    </td>
                    {peutEcrire && (
                      <td className="text-end position-relative">
                        <button
                          className="btn btn-sm btn-light"
                          onClick={() => setOpenMenuId(openMenuId === u.utilisateur_id ? null : u.utilisateur_id)}
                          disabled={actionEnCours === u.utilisateur_id}
                        >
                          {actionEnCours === u.utilisateur_id ? (
                            <i className="fa-solid fa-spinner fa-spin" />
                          ) : (
                            <i className="fa-solid fa-ellipsis" />
                          )}
                        </button>

                        {openMenuId === u.utilisateur_id && (
                          <>
                            <div
                              style={{ position: 'fixed', inset: 0, zIndex: 1040 }}
                              onClick={() => setOpenMenuId(null)}
                            />
                            <ul
                              className="dropdown-menu d-block"
                              style={{ position: 'absolute', right: 0, top: '100%', zIndex: 1050 }}
                            >
                              <li>
                                <button className="dropdown-item" onClick={() => ouvrirEdition(u)}>
                                  <i className="fa-solid fa-pen me-2" />Modifier
                                </button>
                              </li>
                              <li><hr className="dropdown-divider" /></li>
                              <li>
                                <button
                                  className={`dropdown-item ${u.statut_compte === 'actif' ? 'text-danger' : 'text-success'}`}
                                  onClick={() => basculerStatut(u)}
                                  disabled={estMoi}
                                  title={estMoi ? 'Vous ne pouvez pas agir sur votre propre compte.' : undefined}
                                >
                                  {u.statut_compte === 'actif' ? (
                                    <><i className="fa-solid fa-user-slash me-2" />Suspendre</>
                                  ) : (
                                    <><i className="fa-solid fa-user-check me-2" />Réactiver</>
                                  )}
                                </button>
                              </li>
                            </ul>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="aps-pagination">
          <span>
            Page {pagination.page} sur {pagination.total_pages} — {pagination.total} compte(s)
          </span>
          <div className="pages">
            <button
              disabled={pagination.page <= 1}
              onClick={() => setFiltres((f) => ({ ...f, page: f.page - 1 }))}
            >
              <i className="fa-solid fa-chevron-left" />
            </button>
            <button className="is-active">{pagination.page}</button>
            <button
              disabled={pagination.page >= pagination.total_pages}
              onClick={() => setFiltres((f) => ({ ...f, page: f.page + 1 }))}
            >
              <i className="fa-solid fa-chevron-right" />
            </button>
          </div>
        </div>
      </div>

      {/* Modale création / édition */}
      {showModal && (
        <div className="modal d-block" tabIndex={-1} style={{ background: 'rgba(16,24,40,.45)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              <form onSubmit={soumettreFormulaire}>
                <div className="modal-header">
                  <h5 className="modal-title">
                    {form.utilisateur_id ? 'Modifier le compte' : 'Nouveau compte admin / superadmin'}
                  </h5>
                  <button type="button" className="btn-close" onClick={() => setShowModal(false)} />
                </div>
                <div className="modal-body">
                  {formErreur && (
                    <div className="alert alert-danger">{formErreur}</div>
                  )}
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Nom</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        value={form.nom}
                        onChange={(e) => majFormulaire('nom', e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Prénom</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        value={form.prenom}
                        onChange={(e) => majFormulaire('prenom', e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Email</label>
                      <input
                        type="email"
                        className="form-control"
                        required
                        disabled={!!form.utilisateur_id}
                        value={form.email}
                        onChange={(e) => majFormulaire('email', e.target.value)}
                      />
                      {form.utilisateur_id && (
                        <div className="form-text">L&apos;email n&apos;est pas modifiable ici.</div>
                      )}
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Téléphone</label>
                      <input
                        type="tel"
                        className="form-control"
                        value={form.telephone}
                        onChange={(e) => majFormulaire('telephone', e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Rôle</label>
                      <select
                        className="form-select"
                        value={form.role}
                        disabled={form.utilisateur_id === moi?.utilisateur_id}
                        onChange={(e) => majFormulaire('role', e.target.value)}
                      >
                        {ROLES_UTILISATEUR.map((r) => (
                          <option key={r.valeur} value={r.valeur}>{r.libelle}</option>
                        ))}
                      </select>
                      {form.utilisateur_id === moi?.utilisateur_id && (
                        <div className="form-text">
                          Vous ne pouvez pas modifier votre propre rôle.
                        </div>
                      )}
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Pays</label>
                      <select
                        className="form-select"
                        required
                        value={form.pays_id}
                        onChange={(e) => majFormulaire('pays_id', e.target.value)}
                      >
                        <option value="" disabled>Sélectionner un pays</option>
                        {paysListe.map((p) => (
                          <option key={p.pays_id ?? p.id} value={p.pays_id ?? p.id}>
                            {p.nom ?? p.libelle}
                          </option>
                        ))}
                      </select>
                    </div>
                    {!form.utilisateur_id && (
                      <div className="col-md-6">
                        <label className="form-label">Mot de passe temporaire</label>
                        <input
                          type="password"
                          className="form-control"
                          required
                          minLength={MOT_DE_PASSE_LONGUEUR_MIN}
                          value={form.mot_de_passe}
                          onChange={(e) => majFormulaire('mot_de_passe', e.target.value)}
                        />
                        <div className="form-text">
                          Au moins {MOT_DE_PASSE_LONGUEUR_MIN} caractères. À communiquer à
                          l&apos;utilisateur de façon sécurisée.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={() => setShowModal(false)}>
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={enregistrement}>
                    {enregistrement ? (
                      <i className="fa-solid fa-spinner fa-spin me-2" />
                    ) : (
                      <i className="fa-solid fa-check me-2" />
                    )}
                    Enregistrer
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}