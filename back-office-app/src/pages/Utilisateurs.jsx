import { useMemo, useState } from 'react';

/* ------------------------------------------------------------------ */
/* Données de démonstration — à remplacer par un appel API (GET /users) */
/* Modèle aligné sur la table `utilisateur` du référentiel IAM :        */
/* nom, prenom, email, telephone, role, pays, statut_compte             */
/* ------------------------------------------------------------------ */
const MOCK_USERS = [
  {
    id: 1,
    nom: 'Stiedemann',
    prenom: 'Alfonso',
    email: 'alfonso.stiedemann@aps-sante.com',
    telephone: '+237 6 77 12 34 56',
    role: 'medecin',
    pays: 'Cameroun',
    statut: 'actif',
    creeLe: '2026-07-02',
    avatar: 'https://i.pravatar.cc/64?img=32',
  },
  {
    id: 2,
    nom: "O'Connell",
    prenom: 'Armando',
    email: 'armando.oconnell@aps-sante.com',
    telephone: '+237 6 90 45 21 08',
    role: 'medecin',
    pays: 'Cameroun',
    statut: 'actif',
    creeLe: '2026-07-01',
    avatar: 'https://i.pravatar.cc/64?img=12',
  },
  {
    id: 3,
    nom: 'Diallo',
    prenom: 'Fatou',
    email: 'fatou.diallo@gmail.com',
    telephone: '+221 77 234 56 78',
    role: 'patient',
    pays: 'Sénégal',
    statut: 'actif',
    creeLe: '2026-06-29',
    avatar: 'https://i.pravatar.cc/64?img=47',
  },
  {
    id: 4,
    nom: 'Pharmacie du Centre',
    prenom: 'Agent',
    email: 'contact@pharmacie-centre.cm',
    telephone: '+237 6 55 78 90 12',
    role: 'agent',
    pays: 'Cameroun',
    statut: 'suspendu',
    creeLe: '2026-06-29',
    avatar: 'https://i.pravatar.cc/64?img=15',
  },
  {
    id: 5,
    nom: 'Michel',
    prenom: 'Yves',
    email: 'yves.michel@aps-sante.com',
    telephone: '+237 6 99 00 11 22',
    role: 'super_admin',
    pays: 'Cameroun',
    statut: 'actif',
    creeLe: '2026-01-14',
    avatar: 'https://i.pravatar.cc/64?img=8',
  },
  {
    id: 6,
    nom: "N'Diaye",
    prenom: 'Awa',
    email: 'awa.ndiaye@aps-admin.sn',
    telephone: '+221 78 900 11 22',
    role: 'admin_pays',
    pays: 'Sénégal',
    statut: 'actif',
    creeLe: '2026-03-03',
    avatar: 'https://i.pravatar.cc/64?img=23',
  },
];

const ROLES = [
  { value: 'patient', label: 'Patient', badge: 'is-neutral' },
  { value: 'medecin', label: 'Médecin', badge: 'is-info' },
  { value: 'agent', label: 'Agent', badge: 'is-warning' },
  { value: 'admin_pays', label: 'Admin pays', badge: 'is-info' },
  { value: 'super_admin', label: 'Super admin', badge: 'is-danger' },
];

const PAYS = ['Cameroun', 'Sénégal', "Côte d'Ivoire", 'Gabon'];

const EMPTY_FORM = {
  id: null,
  nom: '',
  prenom: '',
  email: '',
  telephone: '',
  role: 'patient',
  pays: PAYS[0],
  statut: 'actif',
};

function roleMeta(role) {
  return ROLES.find((r) => r.value === role) ?? { label: role, badge: 'is-neutral' };
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Utilisateurs() {
  const [users, setUsers] = useState(MOCK_USERS);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [paysFilter, setPaysFilter] = useState('all');
  const [statutFilter, setStatutFilter] = useState('all');
  const [selected, setSelected] = useState([]);
  const [openMenuId, setOpenMenuId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesSearch =
        !q ||
        `${u.prenom} ${u.nom}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.telephone.toLowerCase().includes(q);
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesPays = paysFilter === 'all' || u.pays === paysFilter;
      const matchesStatut = statutFilter === 'all' || u.statut === statutFilter;
      return matchesSearch && matchesRole && matchesPays && matchesStatut;
    });
  }, [users, search, roleFilter, paysFilter, statutFilter]);

  const kpis = useMemo(
    () => ({
      total: users.length,
      actifs: users.filter((u) => u.statut === 'actif').length,
      suspendus: users.filter((u) => u.statut === 'suspendu').length,
      admins: users.filter((u) => u.role === 'admin_pays' || u.role === 'super_admin').length,
    }),
    [users]
  );

  const allChecked = filtered.length > 0 && selected.length === filtered.length;

  function toggleAll() {
    setSelected(allChecked ? [] : filtered.map((u) => u.id));
  }

  function toggleOne(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function openCreateModal() {
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEditModal(user) {
    setForm({
      id: user.id,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      telephone: user.telephone,
      role: user.role,
      pays: user.pays,
      statut: user.statut,
    });
    setOpenMenuId(null);
    setShowModal(true);
  }

  function handleFormChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (form.id) {
      setUsers((prev) => prev.map((u) => (u.id === form.id ? { ...u, ...form } : u)));
    } else {
      setUsers((prev) => [
        ...prev,
        {
          ...form,
          id: Math.max(0, ...prev.map((u) => u.id)) + 1,
          creeLe: new Date().toISOString().slice(0, 10),
          avatar: `https://i.pravatar.cc/64?img=${Math.floor(Math.random() * 60) + 1}`,
        },
      ]);
    }
    setShowModal(false);
  }

  function toggleStatut(id) {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, statut: u.statut === 'actif' ? 'suspendu' : 'actif' } : u))
    );
    setOpenMenuId(null);
  }

  return (
    <main className="aps-content">
      {/* Header de page */}
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">
            Back-office <span className="sep">/</span> IAM <span className="sep">/</span> Utilisateurs
          </div>
          <h1>Gestion des utilisateurs</h1>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-light">
            <i className="fa-solid fa-download me-2" />
            Exporter
          </button>
          <button className="btn btn-primary" onClick={openCreateModal}>
            <i className="fa-solid fa-plus me-2" />
            Nouvel utilisateur
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3">
          <div className="aps-kpi">
            <div className="aps-kpi__top">
              <div className="aps-kpi__icon is-primary">
                <i className="fa-solid fa-users" />
              </div>
            </div>
            <div className="aps-kpi__label">Utilisateurs totaux</div>
            <div className="aps-kpi__value">{kpis.total}</div>
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
            <div className="aps-kpi__value">{kpis.actifs}</div>
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
            <div className="aps-kpi__value">{kpis.suspendus}</div>
          </div>
        </div>
        <div className="col-6 col-lg-3">
          <div className="aps-kpi">
            <div className="aps-kpi__top">
              <div className="aps-kpi__icon is-warning">
                <i className="fa-solid fa-user-shield" />
              </div>
            </div>
            <div className="aps-kpi__label">Administrateurs</div>
            <div className="aps-kpi__value">{kpis.admins}</div>
          </div>
        </div>
      </div>

      {/* Filtres + tableau */}
      <div className="aps-card">
        <div className="aps-card__header flex-wrap gap-2">
          <h2>Tous les utilisateurs</h2>
          <div className="d-flex flex-wrap gap-2">
            <div className="aps-topbar__search" style={{ maxWidth: 240 }}>
              <i className="fa-solid fa-magnifying-glass" />
              <input
                type="text"
                placeholder="Rechercher nom, email, tél..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="form-select form-select-sm" style={{ width: 'auto' }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">Tous les rôles</option>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <select className="form-select form-select-sm" style={{ width: 'auto' }} value={paysFilter} onChange={(e) => setPaysFilter(e.target.value)}>
              <option value="all">Tous les pays</option>
              {PAYS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select className="form-select form-select-sm" style={{ width: 'auto' }} value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)}>
              <option value="all">Tous les statuts</option>
              <option value="actif">Actif</option>
              <option value="suspendu">Suspendu</option>
            </select>
          </div>
        </div>

        <div className="aps-table-wrap">
          <table className="table aps-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" className="form-check-input" checked={allChecked} onChange={toggleAll} />
                </th>
                <th>Utilisateur</th>
                <th>Rôle</th>
                <th>Téléphone</th>
                <th>Pays</th>
                <th>Créé le</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="aps-empty-state">
                      <i className="fa-solid fa-user-slash" />
                      <div>Aucun utilisateur ne correspond à ces critères.</div>
                    </div>
                  </td>
                </tr>
              )}

              {filtered.map((u) => {
                const meta = roleMeta(u.role);
                return (
                  <tr key={u.id}>
                    <td>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={selected.includes(u.id)}
                        onChange={() => toggleOne(u.id)}
                      />
                    </td>
                    <td>
                      <div className="aps-avatar-cell">
                        <img src={u.avatar} alt="" />
                        <div>
                          <div className="cell-title">{u.prenom} {u.nom}</div>
                          <div className="cell-sub">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`aps-badge ${meta.badge}`}>
                        <i className="fa-solid fa-circle" />
                        {meta.label}
                      </span>
                    </td>
                    <td>{u.telephone}</td>
                    <td>{u.pays}</td>
                    <td>{formatDate(u.creeLe)}</td>
                    <td>
                      {u.statut === 'actif' ? (
                        <span className="aps-badge is-success"><i className="fa-solid fa-circle" />Actif</span>
                      ) : (
                        <span className="aps-badge is-danger"><i className="fa-solid fa-circle" />Suspendu</span>
                      )}
                    </td>
                    <td className="text-end position-relative">
                      <button
                        className="btn btn-sm btn-light"
                        onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                      >
                        <i className="fa-solid fa-ellipsis" />
                      </button>

                      {openMenuId === u.id && (
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
                              <a className="dropdown-item" href="#">
                                <i className="fa-solid fa-eye me-2" />Voir la fiche
                              </a>
                            </li>
                            <li>
                              <button className="dropdown-item" onClick={() => openEditModal(u)}>
                                <i className="fa-solid fa-pen me-2" />Modifier
                              </button>
                            </li>
                            <li>
                              <a className="dropdown-item" href="#">
                                <i className="fa-solid fa-key me-2" />Réinitialiser mot de passe
                              </a>
                            </li>
                            <li><hr className="dropdown-divider" /></li>
                            <li>
                              <button
                                className={`dropdown-item ${u.statut === 'actif' ? 'text-danger' : 'text-success'}`}
                                onClick={() => toggleStatut(u.id)}
                              >
                                {u.statut === 'actif' ? (
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="aps-pagination">
          <span>Affichage de 1 à {filtered.length} sur {users.length}</span>
          <div className="pages">
            <button className="is-active">1</button>
          </div>
        </div>
      </div>

      {/* Modale création / édition */}
      {showModal && (
        <div className="modal d-block" tabIndex={-1} style={{ background: 'rgba(16,24,40,.45)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              <form onSubmit={handleSubmit}>
                <div className="modal-header">
                  <h5 className="modal-title">{form.id ? 'Modifier l’utilisateur' : 'Nouvel utilisateur'}</h5>
                  <button type="button" className="btn-close" onClick={() => setShowModal(false)} />
                </div>
                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Nom</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        value={form.nom}
                        onChange={(e) => handleFormChange('nom', e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Prénom</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        value={form.prenom}
                        onChange={(e) => handleFormChange('prenom', e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Email</label>
                      <input
                        type="email"
                        className="form-control"
                        required
                        value={form.email}
                        onChange={(e) => handleFormChange('email', e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Téléphone</label>
                      <input
                        type="tel"
                        className="form-control"
                        value={form.telephone}
                        onChange={(e) => handleFormChange('telephone', e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Rôle</label>
                      <select
                        className="form-select"
                        value={form.role}
                        onChange={(e) => handleFormChange('role', e.target.value)}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Pays</label>
                      <select
                        className="form-select"
                        value={form.pays}
                        onChange={(e) => handleFormChange('pays', e.target.value)}
                      >
                        {PAYS.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Statut du compte</label>
                      <select
                        className="form-select"
                        value={form.statut}
                        onChange={(e) => handleFormChange('statut', e.target.value)}
                      >
                        <option value="actif">Actif</option>
                        <option value="suspendu">Suspendu</option>
                      </select>
                    </div>
                    {!form.id && (
                      <div className="col-md-6">
                        <label className="form-label">Mot de passe temporaire</label>
                        <input type="password" className="form-control" placeholder="Généré automatiquement si vide" />
                        <div className="form-text">L'utilisateur devra le modifier à la première connexion.</div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={() => setShowModal(false)}>
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary">
                    <i className="fa-solid fa-check me-2" />
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