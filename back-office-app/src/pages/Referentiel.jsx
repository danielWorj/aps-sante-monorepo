import { useState, useMemo } from 'react';
import './../assets/style/Referentiel.css';
// Sidebar et Navbar sont déjà rendus par App.jsx (route layout) et
// admin.css est déjà importé globalement dans main.jsx : on ne les
// réimporte pas ici pour éviter la double mise en page.

// ---------------------------------------------------------------------
// Données de démonstration — à remplacer par les appels API du back-office
// ---------------------------------------------------------------------
const LANGUES_INIT = [
  { id: 'l1', nom: 'Français' },
  { id: 'l2', nom: 'Anglais' },
  { id: 'l3', nom: 'Portugais' },
];

const DEVISES_INIT = [
  { id: 'd1', libelle: 'Franc CFA (XAF)' },
  { id: 'd2', libelle: 'Naira (NGN)' },
  { id: 'd3', libelle: 'Franc guinéen (GNF)' },
];

const PAYS_INIT = [
  { id: 'p1', code: 'CM', nom: 'Cameroun', devise: 'd1', langue: 'l1', statut: 'actif' },
  { id: 'p2', code: 'SN', nom: 'Sénégal', devise: 'd1', langue: 'l1', statut: 'actif' },
  { id: 'p3', code: 'NG', nom: 'Nigéria', devise: 'd2', langue: 'l2', statut: 'pilote' },
  { id: 'p4', code: 'GN', nom: 'Guinée', devise: 'd3', langue: 'l1', statut: 'pilote' },
  { id: 'p5', code: 'GH', nom: 'Ghana', devise: null, langue: 'l2', statut: 'inactif' },
];

const uid = (p) => p + Math.random().toString(36).slice(2, 8);
const byId = (arr, id) => arr.find((x) => x.id === id);

const STATUT_LABELS = {
  pays: 'Nouveau pays',
  langues: 'Nouvelle langue',
  devises: 'Nouvelle devise',
};
const STATUT_MODALS = {
  pays: 'pays',
  langues: 'langue',
  devises: 'devise',
};

function StatutBadge({ statut }) {
  const map = {
    actif: ['is-success', 'Actif'],
    pilote: ['is-warning', 'Pilote'],
    inactif: ['is-neutral', 'Inactif'],
  };
  const [cls, label] = map[statut] || map.inactif;
  return (
    <span className={`aps-badge ${cls}`}>
      <i className="fa-solid fa-circle"></i>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------
// Modale générique (remplace bootstrap.Modal, piloté par l'état React)
// ---------------------------------------------------------------------
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

export default function Referentiel() {
  const [langues, setLangues] = useState(LANGUES_INIT);
  const [devises, setDevises] = useState(DEVISES_INIT);
  const [pays, setPays] = useState(PAYS_INIT);

  const [activeTab, setActiveTab] = useState('pays');

  const [searchPays, setSearchPays] = useState('');
  const [filterStatutPays, setFilterStatutPays] = useState('');
  const [searchLangues, setSearchLangues] = useState('');
  const [searchDevises, setSearchDevises] = useState('');

  // --- Modale Pays ---
  const [paysModalOpen, setPaysModalOpen] = useState(false);
  const [paysForm, setPaysForm] = useState({ id: '', nom: '', code: '', devise: '', langue: '', statut: 'pilote' });

  // --- Modale Langue ---
  const [langueModalOpen, setLangueModalOpen] = useState(false);
  const [langueForm, setLangueForm] = useState({ id: '', nom: '' });

  // --- Modale Devise ---
  const [deviseModalOpen, setDeviseModalOpen] = useState(false);
  const [deviseForm, setDeviseForm] = useState({ id: '', libelle: '' });

  // --- Modale Suppression ---
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  // ---------------------------------------------------------------------
  // KPI
  // ---------------------------------------------------------------------
  const kpiPaysTotal = pays.length;
  const kpiPaysActifs = pays.filter((p) => p.statut === 'actif').length;
  const kpiLangues = langues.length;
  const kpiDevises = devises.length;

  // ---------------------------------------------------------------------
  // Listes filtrées
  // ---------------------------------------------------------------------
  const paysRows = useMemo(() => {
    const q = searchPays.toLowerCase();
    return pays.filter(
      (p) =>
        (!filterStatutPays || p.statut === filterStatutPays) &&
        (p.nom.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
    );
  }, [pays, searchPays, filterStatutPays]);

  const languesRows = useMemo(() => {
    const q = searchLangues.toLowerCase();
    return langues.filter((l) => l.nom.toLowerCase().includes(q));
  }, [langues, searchLangues]);

  const devisesRows = useMemo(() => {
    const q = searchDevises.toLowerCase();
    return devises.filter((d) => d.libelle.toLowerCase().includes(q));
  }, [devises, searchDevises]);

  // ---------------------------------------------------------------------
  // Ouverture des modales
  // ---------------------------------------------------------------------
  function openAddPays() {
    setPaysForm({ id: '', nom: '', code: '', devise: '', langue: '', statut: 'pilote' });
    setPaysModalOpen(true);
  }
  function openEditPays(p) {
    setPaysForm({ id: p.id, nom: p.nom, code: p.code, devise: p.devise || '', langue: p.langue || '', statut: p.statut });
    setPaysModalOpen(true);
  }
  function openAddLangue() {
    setLangueForm({ id: '', nom: '' });
    setLangueModalOpen(true);
  }
  function openEditLangue(l) {
    setLangueForm({ id: l.id, nom: l.nom });
    setLangueModalOpen(true);
  }
  function openAddDevise() {
    setDeviseForm({ id: '', libelle: '' });
    setDeviseModalOpen(true);
  }
  function openEditDevise(d) {
    setDeviseForm({ id: d.id, libelle: d.libelle });
    setDeviseModalOpen(true);
  }

  function openContextualAdd() {
    if (activeTab === 'pays') openAddPays();
    if (activeTab === 'langues') openAddLangue();
    if (activeTab === 'devises') openAddDevise();
  }

  // ---------------------------------------------------------------------
  // Enregistrement
  // ---------------------------------------------------------------------
  function savePays() {
    const nom = paysForm.nom.trim();
    const code = paysForm.code.trim().toUpperCase();
    const devise = paysForm.devise || null;
    const langue = paysForm.langue || null;
    const statut = paysForm.statut;

    if (!nom || code.length !== 2) {
      alert('Merci de renseigner un nom et un code ISO2 à 2 lettres.');
      return;
    }
    if (statut !== 'inactif' && (!devise || !langue)) {
      alert("Un pays « actif » ou « pilote » doit avoir une devise et une langue par défaut.");
      return;
    }

    if (paysForm.id) {
      setPays((prev) => prev.map((p) => (p.id === paysForm.id ? { ...p, nom, code, devise, langue, statut } : p)));
    } else {
      setPays((prev) => [...prev, { id: uid('p'), nom, code, devise, langue, statut }]);
    }
    setPaysModalOpen(false);
  }

  function saveLangue() {
    const nom = langueForm.nom.trim();
    if (!nom) {
      alert('Merci de renseigner un nom.');
      return;
    }
    if (langueForm.id) {
      setLangues((prev) => prev.map((l) => (l.id === langueForm.id ? { ...l, nom } : l)));
    } else {
      setLangues((prev) => [...prev, { id: uid('l'), nom }]);
    }
    setLangueModalOpen(false);
  }

  function saveDevise() {
    const libelle = deviseForm.libelle.trim();
    if (!libelle) {
      alert('Merci de renseigner un libellé.');
      return;
    }
    if (deviseForm.id) {
      setDevises((prev) => prev.map((d) => (d.id === deviseForm.id ? { ...d, libelle } : d)));
    } else {
      setDevises((prev) => [...prev, { id: uid('d'), libelle }]);
    }
    setDeviseModalOpen(false);
  }

  // ---------------------------------------------------------------------
  // Suppression (avec vérification d'usage)
  // ---------------------------------------------------------------------
  function askDelete(type, id) {
    let msg = 'Cette action est irréversible.';
    if (type === 'langue' && pays.some((p) => p.langue === id)) {
      msg = "Cette langue est utilisée par au moins un pays. La supprimer retirera cette association — êtes-vous sûr(e) ?";
    }
    if (type === 'devise' && pays.some((p) => p.devise === id)) {
      msg = "Cette devise est utilisée par au moins un pays. La supprimer retirera cette association — êtes-vous sûr(e) ?";
    }
    if (type === 'pays') {
      msg = 'Ce pays sera définitivement retiré du référentiel.';
    }
    setPendingDelete({ type, id, msg });
    setDeleteModalOpen(true);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;
    if (type === 'pays') setPays((prev) => prev.filter((p) => p.id !== id));
    if (type === 'langue') {
      setLangues((prev) => prev.filter((l) => l.id !== id));
      setPays((prev) => prev.map((p) => (p.langue === id ? { ...p, langue: null } : p)));
    }
    if (type === 'devise') {
      setDevises((prev) => prev.filter((d) => d.id !== id));
      setPays((prev) => prev.map((p) => (p.devise === id ? { ...p, devise: null } : p)));
    }
    setPendingDelete(null);
    setDeleteModalOpen(false);
  }

  return (
    <>
      <main className="aps-content">
          <div className="aps-page-header">
            <div>
              <div className="aps-breadcrumb">
                Back-office <span className="sep">/</span> Socle technique <span className="sep">/</span> Référentiel pays
              </div>
              <h1>Référentiel pays, langues &amp; devises</h1>
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-light">
                <i className="fa-solid fa-download me-2"></i>Exporter
              </button>
              <button className="btn btn-primary" id="btnAddContextual" onClick={openContextualAdd}>
                <i className="fa-solid fa-plus me-2"></i>
                {STATUT_LABELS[activeTab]}
              </button>
            </div>
          </div>

          <div className="aps-notice is-info mb-4">
            <i className="fa-solid fa-circle-info"></i>
            <div>
              Ce référentiel constitue le socle technique de la Phase 2 : tous les modules métier (annuaire, paiements,
              assurances…) s'appuient sur les pays, langues et devises actifs ici. Un pays ne peut être activé que si une
              devise et une langue par défaut lui sont associées.
            </div>
          </div>

          {/* KPI */}
          <div className="row g-3 mb-4">
            <div className="col-6 col-lg-3">
              <div className="aps-kpi">
                <div className="aps-kpi__top">
                  <div className="aps-kpi__icon is-primary">
                    <i className="fa-solid fa-earth-africa"></i>
                  </div>
                </div>
                <div className="aps-kpi__label">Pays référencés</div>
                <div className="aps-kpi__value">{kpiPaysTotal}</div>
              </div>
            </div>
            <div className="col-6 col-lg-3">
              <div className="aps-kpi">
                <div className="aps-kpi__top">
                  <div className="aps-kpi__icon is-success">
                    <i className="fa-solid fa-circle-check"></i>
                  </div>
                </div>
                <div className="aps-kpi__label">Pays actifs</div>
                <div className="aps-kpi__value">{kpiPaysActifs}</div>
              </div>
            </div>
            <div className="col-6 col-lg-3">
              <div className="aps-kpi">
                <div className="aps-kpi__top">
                  <div className="aps-kpi__icon is-warning">
                    <i className="fa-solid fa-language"></i>
                  </div>
                </div>
                <div className="aps-kpi__label">Langues</div>
                <div className="aps-kpi__value">{kpiLangues}</div>
              </div>
            </div>
            <div className="col-6 col-lg-3">
              <div className="aps-kpi">
                <div className="aps-kpi__top">
                  <div className="aps-kpi__icon is-danger">
                    <i className="fa-solid fa-coins"></i>
                  </div>
                </div>
                <div className="aps-kpi__label">Devises</div>
                <div className="aps-kpi__value">{kpiDevises}</div>
              </div>
            </div>
          </div>

          {/* Onglets */}
          <div className="aps-card">
            <div className="aps-tabs px-2 pt-1">
              <button className={activeTab === 'pays' ? 'is-active' : ''} onClick={() => setActiveTab('pays')}>
                <i className="fa-solid fa-earth-africa"></i>Pays
              </button>
              <button className={activeTab === 'langues' ? 'is-active' : ''} onClick={() => setActiveTab('langues')}>
                <i className="fa-solid fa-language"></i>Langues
              </button>
              <button className={activeTab === 'devises' ? 'is-active' : ''} onClick={() => setActiveTab('devises')}>
                <i className="fa-solid fa-coins"></i>Devises
              </button>
            </div>

            {/* ===================== PAYS ===================== */}
            {activeTab === 'pays' && (
              <div className="aps-tab-pane is-active">
                <div className="aps-toolbar">
                  <div className="aps-search">
                    <i className="fa-solid fa-magnifying-glass"></i>
                    <input
                      type="text"
                      placeholder="Rechercher un pays, un code ISO…"
                      value={searchPays}
                      onChange={(e) => setSearchPays(e.target.value)}
                    />
                  </div>
                  <select
                    className="form-select form-select-sm"
                    style={{ maxWidth: 170 }}
                    value={filterStatutPays}
                    onChange={(e) => setFilterStatutPays(e.target.value)}
                  >
                    <option value="">Tous les statuts</option>
                    <option value="pilote">Pilote</option>
                    <option value="actif">Actif</option>
                    <option value="inactif">Inactif</option>
                  </select>
                  <div className="ms-auto"></div>
                  <button className="btn btn-sm btn-primary" onClick={openAddPays}>
                    <i className="fa-solid fa-plus me-1"></i>Nouveau pays
                  </button>
                </div>
                <div className="aps-table-wrap">
                  <table className="table aps-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Pays</th>
                        <th>Devise</th>
                        <th>Langue</th>
                        <th>Statut</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paysRows.length === 0 ? (
                        <tr>
                          <td colSpan={6}>
                            <div className="aps-empty-mini">
                              <i className="fa-solid fa-earth-africa d-block mb-2" style={{ fontSize: 22 }}></i>
                              Aucun pays ne correspond à votre recherche.
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paysRows.map((p) => {
                          const d = byId(devises, p.devise);
                          const l = byId(langues, p.langue);
                          return (
                            <tr key={p.id}>
                              <td>
                                <span className="aps-code-chip">{p.code}</span>
                              </td>
                              <td>
                                <span className="cell-title">{p.nom}</span>
                              </td>
                              <td>{d ? d.libelle : <span className="aps-text-muted">— non définie</span>}</td>
                              <td>{l ? l.nom : <span className="aps-text-muted">— non définie</span>}</td>
                              <td>
                                <StatutBadge statut={p.statut} />
                              </td>
                              <td className="text-end">
                                <div className="aps-row-actions">
                                  <button className="btn btn-sm btn-outline-primary" onClick={() => openEditPays(p)}>
                                    <i className="fa-solid fa-pen"></i>
                                  </button>
                                  <button className="btn btn-sm btn-light" onClick={() => askDelete('pays', p.id)}>
                                    <i className="fa-solid fa-trash"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ===================== LANGUES ===================== */}
            {activeTab === 'langues' && (
              <div className="aps-tab-pane is-active">
                <div className="aps-toolbar">
                  <div className="aps-search">
                    <i className="fa-solid fa-magnifying-glass"></i>
                    <input
                      type="text"
                      placeholder="Rechercher une langue…"
                      value={searchLangues}
                      onChange={(e) => setSearchLangues(e.target.value)}
                    />
                  </div>
                  <div className="ms-auto"></div>
                  <button className="btn btn-sm btn-primary" onClick={openAddLangue}>
                    <i className="fa-solid fa-plus me-1"></i>Nouvelle langue
                  </button>
                </div>
                <div className="aps-table-wrap">
                  <table className="table aps-table">
                    <thead>
                      <tr>
                        <th>Langue</th>
                        <th>Pays utilisant cette langue</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {languesRows.length === 0 ? (
                        <tr>
                          <td colSpan={3}>
                            <div className="aps-empty-mini">Aucune langue ne correspond à votre recherche.</div>
                          </td>
                        </tr>
                      ) : (
                        languesRows.map((l) => {
                          const nbPays = pays.filter((p) => p.langue === l.id).length;
                          return (
                            <tr key={l.id}>
                              <td>
                                <span className="cell-title">{l.nom}</span>
                              </td>
                              <td>
                                {nbPays ? (
                                  <span className="aps-badge is-info">{nbPays} pays</span>
                                ) : (
                                  <span className="aps-text-muted">Aucun</span>
                                )}
                              </td>
                              <td className="text-end">
                                <div className="aps-row-actions">
                                  <button className="btn btn-sm btn-outline-primary" onClick={() => openEditLangue(l)}>
                                    <i className="fa-solid fa-pen"></i>
                                  </button>
                                  <button className="btn btn-sm btn-light" onClick={() => askDelete('langue', l.id)}>
                                    <i className="fa-solid fa-trash"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ===================== DEVISES ===================== */}
            {activeTab === 'devises' && (
              <div className="aps-tab-pane is-active">
                <div className="aps-toolbar">
                  <div className="aps-search">
                    <i className="fa-solid fa-magnifying-glass"></i>
                    <input
                      type="text"
                      placeholder="Rechercher une devise…"
                      value={searchDevises}
                      onChange={(e) => setSearchDevises(e.target.value)}
                    />
                  </div>
                  <div className="ms-auto"></div>
                  <button className="btn btn-sm btn-primary" onClick={openAddDevise}>
                    <i className="fa-solid fa-plus me-1"></i>Nouvelle devise
                  </button>
                </div>
                <div className="aps-table-wrap">
                  <table className="table aps-table">
                    <thead>
                      <tr>
                        <th>Devise</th>
                        <th>Pays utilisant cette devise</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {devisesRows.length === 0 ? (
                        <tr>
                          <td colSpan={3}>
                            <div className="aps-empty-mini">Aucune devise ne correspond à votre recherche.</div>
                          </td>
                        </tr>
                      ) : (
                        devisesRows.map((d) => {
                          const nbPays = pays.filter((p) => p.devise === d.id).length;
                          return (
                            <tr key={d.id}>
                              <td>
                                <span className="cell-title">{d.libelle}</span>
                              </td>
                              <td>
                                {nbPays ? (
                                  <span className="aps-badge is-info">{nbPays} pays</span>
                                ) : (
                                  <span className="aps-text-muted">Aucun</span>
                                )}
                              </td>
                              <td className="text-end">
                                <div className="aps-row-actions">
                                  <button className="btn btn-sm btn-outline-primary" onClick={() => openEditDevise(d)}>
                                    <i className="fa-solid fa-pen"></i>
                                  </button>
                                  <button className="btn btn-sm btn-light" onClick={() => askDelete('devise', d.id)}>
                                    <i className="fa-solid fa-trash"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
      </main>

      {/* ===================== MODAL PAYS ===================== */}
      <Modal
        id="modalPays"
        title={paysForm.id ? 'Modifier le pays' : 'Nouveau pays'}
        isOpen={paysModalOpen}
        onClose={() => setPaysModalOpen(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setPaysModalOpen(false)}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={savePays}>
              Enregistrer
            </button>
          </>
        }
      >
        <div className="row g-3">
          <div className="col-8">
            <label className="form-label">Nom du pays</label>
            <input
              type="text"
              className="form-control"
              placeholder="Ex. Cameroun"
              value={paysForm.nom}
              onChange={(e) => setPaysForm((f) => ({ ...f, nom: e.target.value }))}
            />
          </div>
          <div className="col-4">
            <label className="form-label">Code ISO2</label>
            <input
              type="text"
              className="form-control text-uppercase"
              maxLength={2}
              placeholder="CM"
              value={paysForm.code}
              onChange={(e) => setPaysForm((f) => ({ ...f, code: e.target.value }))}
            />
            <div className="form-text">2 lettres, unique.</div>
          </div>
          <div className="col-6">
            <label className="form-label">Devise par défaut</label>
            <select
              className="form-select"
              value={paysForm.devise}
              onChange={(e) => setPaysForm((f) => ({ ...f, devise: e.target.value }))}
            >
              <option value="">— Aucune —</option>
              {devises.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.libelle}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label">Langue par défaut</label>
            <select
              className="form-select"
              value={paysForm.langue}
              onChange={(e) => setPaysForm((f) => ({ ...f, langue: e.target.value }))}
            >
              <option value="">— Aucune —</option>
              {langues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12">
            <label className="form-label">Statut d'activation</label>
            <select
              className="form-select"
              value={paysForm.statut}
              onChange={(e) => setPaysForm((f) => ({ ...f, statut: e.target.value }))}
            >
              <option value="pilote">Pilote — déploiement limité</option>
              <option value="actif">Actif — visible sur la plateforme</option>
              <option value="inactif">Inactif — masqué</option>
            </select>
            <div className="form-text">
              Un pays « actif » ou « pilote » doit obligatoirement avoir une devise et une langue renseignées.
            </div>
          </div>
        </div>
      </Modal>

      {/* ===================== MODAL LANGUE ===================== */}
      <Modal
        id="modalLangue"
        title={langueForm.id ? 'Modifier la langue' : 'Nouvelle langue'}
        isOpen={langueModalOpen}
        onClose={() => setLangueModalOpen(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setLangueModalOpen(false)}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={saveLangue}>
              Enregistrer
            </button>
          </>
        }
      >
        <label className="form-label">Nom de la langue</label>
        <input
          type="text"
          className="form-control"
          placeholder="Ex. Français"
          value={langueForm.nom}
          onChange={(e) => setLangueForm((f) => ({ ...f, nom: e.target.value }))}
        />
      </Modal>

      {/* ===================== MODAL DEVISE ===================== */}
      <Modal
        id="modalDevise"
        title={deviseForm.id ? 'Modifier la devise' : 'Nouvelle devise'}
        isOpen={deviseModalOpen}
        onClose={() => setDeviseModalOpen(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setDeviseModalOpen(false)}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={saveDevise}>
              Enregistrer
            </button>
          </>
        }
      >
        <label className="form-label">Libellé de la devise</label>
        <input
          type="text"
          className="form-control"
          placeholder="Ex. Franc CFA (XAF)"
          value={deviseForm.libelle}
          onChange={(e) => setDeviseForm((f) => ({ ...f, libelle: e.target.value }))}
        />
      </Modal>

      {/* ===================== MODAL SUPPRESSION ===================== */}
      <Modal
        id="modalDelete"
        title="Confirmer la suppression"
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setDeleteModalOpen(false)}>
              Annuler
            </button>
            <button className="btn btn-danger" onClick={confirmDelete}>
              Supprimer
            </button>
          </>
        }
      >
        <div className="aps-notice is-danger">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <div>{pendingDelete?.msg || 'Cette action est irréversible.'}</div>
        </div>
      </Modal>
    </>
  );
}