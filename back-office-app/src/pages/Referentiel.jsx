import { useState, useMemo, useEffect, useCallback } from 'react';
import './../assets/style/Referentiel.css';
import * as referentielService from '../services/referentielService';
// Sidebar et Navbar sont déjà rendus par App.jsx (route layout) et
// admin.css est déjà importé globalement dans main.jsx : on ne les
// réimporte pas ici pour éviter la double mise en page.

// ---------------------------------------------------------------------
// Les données proviennent désormais de l'API (voir referentielService.js).
// Formats renvoyés par le backend :
//   langue : { langue_id, nom }
//   devise : { devise_id, libelle }
//   pays   : { pays_id, code_iso2, nom, devise_id, langue_id,
//              statut_activation, devise: {devise_id, libelle},
//              langue: {langue_id, nom} }
// ---------------------------------------------------------------------

const byId = (arr, key, id) => arr.find((x) => x[key] === id);

const STATUT_LABELS = {
  pays: 'Nouveau pays',
  langues: 'Nouvelle langue',
  devises: 'Nouvelle devise',
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
  const [langues, setLangues] = useState([]);
  const [devises, setDevises] = useState([]);
  const [pays, setPays] = useState([]);

  // --- Chargement initial ---
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState(null);

  const chargerDonnees = useCallback(async () => {
    setLoading(true);
    setErreurChargement(null);
    try {
      const [l, d, p] = await Promise.all([
        referentielService.listerLangues(),
        referentielService.listerDevises(),
        referentielService.listerPays(),
      ]);
      setLangues(l);
      setDevises(d);
      setPays(p);
    } catch (err) {
      setErreurChargement(err.message || 'Impossible de charger le référentiel.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    chargerDonnees();
  }, [chargerDonnees]);

  const [activeTab, setActiveTab] = useState('pays');

  const [searchPays, setSearchPays] = useState('');
  const [filterStatutPays, setFilterStatutPays] = useState('');
  const [searchLangues, setSearchLangues] = useState('');
  const [searchDevises, setSearchDevises] = useState('');

  // --- Modale Pays ---
  const [paysModalOpen, setPaysModalOpen] = useState(false);
  const [paysForm, setPaysForm] = useState({
    pays_id: '',
    nom: '',
    code_iso2: '',
    devise_id: '',
    langue_id: '',
    statut_activation: 'pilote',
  });
  const [paysSaving, setPaysSaving] = useState(false);
  const [paysError, setPaysError] = useState(null);

  // --- Modale Langue ---
  const [langueModalOpen, setLangueModalOpen] = useState(false);
  const [langueForm, setLangueForm] = useState({ langue_id: '', nom: '' });
  const [langueSaving, setLangueSaving] = useState(false);
  const [langueError, setLangueError] = useState(null);

  // --- Modale Devise ---
  const [deviseModalOpen, setDeviseModalOpen] = useState(false);
  const [deviseForm, setDeviseForm] = useState({ devise_id: '', libelle: '' });
  const [deviseSaving, setDeviseSaving] = useState(false);
  const [deviseError, setDeviseError] = useState(null);

  // --- Modale Suppression ---
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // --- Modale Villes (configuration des villes d'un pays) ---
  const [villesModalOpen, setVillesModalOpen] = useState(false);
  const [villesPays, setVillesPays] = useState(null); // pays courant
  const [villes, setVilles] = useState([]);
  const [villesLoading, setVillesLoading] = useState(false);
  const [villesError, setVillesError] = useState(null);
  const [searchVilles, setSearchVilles] = useState('');

  const [villeForm, setVilleForm] = useState({ ville_id: '', nom: '', code_postal: '' });
  const [villeSaving, setVilleSaving] = useState(false);
  const [villeFormError, setVilleFormError] = useState(null);

  const [pendingDeleteVille, setPendingDeleteVille] = useState(null);
  const [villeDeleteSaving, setVilleDeleteSaving] = useState(false);
  const [villeDeleteError, setVilleDeleteError] = useState(null);

  // ---------------------------------------------------------------------
  // KPI
  // ---------------------------------------------------------------------
  const kpiPaysTotal = pays.length;
  const kpiPaysActifs = pays.filter((p) => p.statut_activation === 'actif').length;
  const kpiLangues = langues.length;
  const kpiDevises = devises.length;

  // ---------------------------------------------------------------------
  // Listes filtrées
  // ---------------------------------------------------------------------
  const paysRows = useMemo(() => {
    const q = searchPays.toLowerCase();
    return pays.filter(
      (p) =>
        (!filterStatutPays || p.statut_activation === filterStatutPays) &&
        (p.nom.toLowerCase().includes(q) || p.code_iso2.toLowerCase().includes(q))
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

  const villesRows = useMemo(() => {
    const q = searchVilles.toLowerCase();
    return villes.filter(
      (v) => v.nom.toLowerCase().includes(q) || (v.code_postal || '').toLowerCase().includes(q)
    );
  }, [villes, searchVilles]);

  // ---------------------------------------------------------------------
  // Ouverture des modales
  // ---------------------------------------------------------------------
  function openAddPays() {
    setPaysError(null);
    setPaysForm({ pays_id: '', nom: '', code_iso2: '', devise_id: '', langue_id: '', statut_activation: 'pilote' });
    setPaysModalOpen(true);
  }
  function openEditPays(p) {
    setPaysError(null);
    setPaysForm({
      pays_id: p.pays_id,
      nom: p.nom,
      code_iso2: p.code_iso2,
      devise_id: p.devise_id || '',
      langue_id: p.langue_id || '',
      statut_activation: p.statut_activation,
    });
    setPaysModalOpen(true);
  }
  function openAddLangue() {
    setLangueError(null);
    setLangueForm({ langue_id: '', nom: '' });
    setLangueModalOpen(true);
  }
  function openEditLangue(l) {
    setLangueError(null);
    setLangueForm({ langue_id: l.langue_id, nom: l.nom });
    setLangueModalOpen(true);
  }
  function openAddDevise() {
    setDeviseError(null);
    setDeviseForm({ devise_id: '', libelle: '' });
    setDeviseModalOpen(true);
  }
  function openEditDevise(d) {
    setDeviseError(null);
    setDeviseForm({ devise_id: d.devise_id, libelle: d.libelle });
    setDeviseModalOpen(true);
  }

  function openContextualAdd() {
    if (activeTab === 'pays') openAddPays();
    if (activeTab === 'langues') openAddLangue();
    if (activeTab === 'devises') openAddDevise();
  }

  // ---------------------------------------------------------------------
  // Villes — modale de configuration rattachée à un pays
  // ---------------------------------------------------------------------
  const chargerVilles = useCallback(async (pays_id) => {
    setVillesLoading(true);
    setVillesError(null);
    try {
      const v = await referentielService.listerVilles(pays_id);
      setVilles(v);
    } catch (err) {
      setVillesError(err.message || 'Impossible de charger les villes.');
    } finally {
      setVillesLoading(false);
    }
  }, []);

  function resetVilleForm() {
    setVilleFormError(null);
    setVilleForm({ ville_id: '', nom: '', code_postal: '' });
  }

  async function openVillesModal(p) {
    setVillesPays(p);
    setVillesModalOpen(true);
    resetVilleForm();
    setSearchVilles('');
    setPendingDeleteVille(null);
    setVilleDeleteError(null);
    setVilles([]);
    await chargerVilles(p.pays_id);
  }

  function openEditVille(v) {
    setVilleFormError(null);
    setVilleForm({ ville_id: v.ville_id, nom: v.nom, code_postal: v.code_postal || '' });
  }

  async function saveVille() {
    if (!villesPays) return;
    const nom = villeForm.nom.trim();
    const code_postal = villeForm.code_postal.trim();

    if (!nom) {
      setVilleFormError('Merci de renseigner un nom de ville.');
      return;
    }

    setVilleSaving(true);
    setVilleFormError(null);
    try {
      if (villeForm.ville_id) {
        const maj = await referentielService.modifierVille(villeForm.ville_id, {
          pays_id: villesPays.pays_id,
          nom,
          code_postal: code_postal || null,
        });
        setVilles((prev) => prev.map((v) => (v.ville_id === maj.ville_id ? maj : v)));
      } else {
        const nouvelle = await referentielService.creerVille({
          pays_id: villesPays.pays_id,
          nom,
          code_postal: code_postal || null,
        });
        setVilles((prev) => [...prev, nouvelle]);
      }
      resetVilleForm();
    } catch (err) {
      setVilleFormError(err.message || "Erreur lors de l'enregistrement de la ville.");
    } finally {
      setVilleSaving(false);
    }
  }

  function askDeleteVille(v) {
    setVilleDeleteError(null);
    setPendingDeleteVille(v);
  }

  async function confirmDeleteVille() {
    if (!pendingDeleteVille) return;
    setVilleDeleteSaving(true);
    setVilleDeleteError(null);
    try {
      await referentielService.supprimerVille(pendingDeleteVille.ville_id);
      setVilles((prev) => prev.filter((v) => v.ville_id !== pendingDeleteVille.ville_id));
      if (villeForm.ville_id === pendingDeleteVille.ville_id) resetVilleForm();
      setPendingDeleteVille(null);
    } catch (err) {
      // Ex : 409 si des enregistrements métier référencent encore cette ville
      setVilleDeleteError(err.message || 'Erreur lors de la suppression de la ville.');
    } finally {
      setVilleDeleteSaving(false);
    }
  }

  // ---------------------------------------------------------------------
  // Enregistrement (appels API)
  // ---------------------------------------------------------------------
  async function savePays() {
    const nom = paysForm.nom.trim();
    const code_iso2 = paysForm.code_iso2.trim().toUpperCase();
    const devise_id = paysForm.devise_id || '';
    const langue_id = paysForm.langue_id || '';
    const statut_activation = paysForm.statut_activation;

    if (!nom || code_iso2.length !== 2) {
      setPaysError('Merci de renseigner un nom et un code ISO2 à 2 lettres.');
      return;
    }
    if (!devise_id || !langue_id) {
      setPaysError('Un pays doit avoir une devise et une langue par défaut.');
      return;
    }

    setPaysSaving(true);
    setPaysError(null);
    try {
      if (paysForm.pays_id) {
        const maj = await referentielService.modifierPays(paysForm.pays_id, {
          code_iso2,
          nom,
          devise_id,
          langue_id,
          statut_activation,
        });
        setPays((prev) => prev.map((p) => (p.pays_id === maj.pays_id ? maj : p)));
      } else {
        const nouveau = await referentielService.creerPays({
          code_iso2,
          nom,
          devise_id,
          langue_id,
          statut_activation,
        });
        setPays((prev) => [...prev, nouveau]);
      }
      setPaysModalOpen(false);
    } catch (err) {
      setPaysError(err.message || "Erreur lors de l'enregistrement du pays.");
    } finally {
      setPaysSaving(false);
    }
  }

  async function saveLangue() {
    const nom = langueForm.nom.trim();
    if (!nom) {
      setLangueError('Merci de renseigner un nom.');
      return;
    }

    setLangueSaving(true);
    setLangueError(null);
    try {
      if (langueForm.langue_id) {
        const maj = await referentielService.modifierLangue(langueForm.langue_id, { nom });
        setLangues((prev) => prev.map((l) => (l.langue_id === maj.langue_id ? maj : l)));
      } else {
        const nouvelle = await referentielService.creerLangue({ nom });
        setLangues((prev) => [...prev, nouvelle]);
      }
      setLangueModalOpen(false);
    } catch (err) {
      setLangueError(err.message || "Erreur lors de l'enregistrement de la langue.");
    } finally {
      setLangueSaving(false);
    }
  }

  async function saveDevise() {
    const libelle = deviseForm.libelle.trim();
    if (!libelle) {
      setDeviseError('Merci de renseigner un libellé.');
      return;
    }

    setDeviseSaving(true);
    setDeviseError(null);
    try {
      if (deviseForm.devise_id) {
        const maj = await referentielService.modifierDevise(deviseForm.devise_id, { libelle });
        setDevises((prev) => prev.map((d) => (d.devise_id === maj.devise_id ? maj : d)));
      } else {
        const nouvelle = await referentielService.creerDevise({ libelle });
        setDevises((prev) => [...prev, nouvelle]);
      }
      setDeviseModalOpen(false);
    } catch (err) {
      setDeviseError(err.message || "Erreur lors de l'enregistrement de la devise.");
    } finally {
      setDeviseSaving(false);
    }
  }

  // ---------------------------------------------------------------------
  // Suppression
  // ---------------------------------------------------------------------
  function askDelete(type, id) {
    let msg = 'Cette action est irréversible.';
    if (type === 'langue' && pays.some((p) => p.langue_id === id)) {
      msg = 'Cette langue est utilisée par au moins un pays. Le serveur refusera la suppression tant que ce pays y sera rattaché.';
    }
    if (type === 'devise' && pays.some((p) => p.devise_id === id)) {
      msg = 'Cette devise est utilisée par au moins un pays. Le serveur refusera la suppression tant que ce pays y sera rattaché.';
    }
    if (type === 'pays') {
      msg = 'Ce pays sera définitivement retiré du référentiel.';
    }
    setDeleteError(null);
    setPendingDelete({ type, id, msg });
    setDeleteModalOpen(true);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;

    setDeleteSaving(true);
    setDeleteError(null);
    try {
      if (type === 'pays') {
        await referentielService.supprimerPays(id);
        setPays((prev) => prev.filter((p) => p.pays_id !== id));
      }
      if (type === 'langue') {
        await referentielService.supprimerLangue(id);
        setLangues((prev) => prev.filter((l) => l.langue_id !== id));
      }
      if (type === 'devise') {
        await referentielService.supprimerDevise(id);
        setDevises((prev) => prev.filter((d) => d.devise_id !== id));
      }
      setPendingDelete(null);
      setDeleteModalOpen(false);
    } catch (err) {
      // Ex : 409 "Impossible de supprimer : 3 pays référence(nt) encore cette langue."
      setDeleteError(err.message || 'Erreur lors de la suppression.');
    } finally {
      setDeleteSaving(false);
    }
  }

  // ---------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------
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
            <button
              className="btn btn-primary"
              id="btnAddContextual"
              onClick={openContextualAdd}
              disabled={loading}
            >
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

        {erreurChargement && (
          <div className="aps-notice is-danger mb-4">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <div className="flex-grow-1">{erreurChargement}</div>
            <button className="btn btn-sm btn-light" onClick={chargerDonnees}>
              <i className="fa-solid fa-rotate-right me-1"></i>Réessayer
            </button>
          </div>
        )}

        {loading ? (
          <div className="aps-empty-mini py-5 text-center">
            <i className="fa-solid fa-spinner fa-spin d-block mb-2" style={{ fontSize: 22 }}></i>
            Chargement du référentiel…
          </div>
        ) : (
          <>
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
                          paysRows.map((p) => (
                            <tr key={p.pays_id}>
                              <td>
                                <span className="aps-code-chip">{p.code_iso2}</span>
                              </td>
                              <td>
                                <span className="cell-title">{p.nom}</span>
                              </td>
                              <td>
                                {p.devise ? p.devise.libelle : <span className="aps-text-muted">— non définie</span>}
                              </td>
                              <td>
                                {p.langue ? p.langue.nom : <span className="aps-text-muted">— non définie</span>}
                              </td>
                              <td>
                                <StatutBadge statut={p.statut_activation} />
                              </td>
                              <td className="text-end">
                                <div className="aps-row-actions">
                                  <button className="btn btn-sm btn-outline-primary" onClick={() => openEditPays(p)} title="Modifier">
                                    <i className="fa-solid fa-pen"></i>
                                  </button>
                                  <button
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => openVillesModal(p)}
                                    title="Configurer les villes"
                                  >
                                    <i className="fa-solid fa-gear"></i>
                                  </button>
                                  <button className="btn btn-sm btn-light" onClick={() => askDelete('pays', p.pays_id)} title="Supprimer">
                                    <i className="fa-solid fa-trash"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
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
                            const nbPays = pays.filter((p) => p.langue_id === l.langue_id).length;
                            return (
                              <tr key={l.langue_id}>
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
                                    <button
                                      className="btn btn-sm btn-light"
                                      onClick={() => askDelete('langue', l.langue_id)}
                                    >
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
                            const nbPays = pays.filter((p) => p.devise_id === d.devise_id).length;
                            return (
                              <tr key={d.devise_id}>
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
                                    <button
                                      className="btn btn-sm btn-light"
                                      onClick={() => askDelete('devise', d.devise_id)}
                                    >
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
          </>
        )}
      </main>

      {/* ===================== MODAL PAYS ===================== */}
      <Modal
        id="modalPays"
        title={paysForm.pays_id ? 'Modifier le pays' : 'Nouveau pays'}
        isOpen={paysModalOpen}
        onClose={() => setPaysModalOpen(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setPaysModalOpen(false)} disabled={paysSaving}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={savePays} disabled={paysSaving}>
              {paysSaving ? (
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
        {paysError && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <div>{paysError}</div>
          </div>
        )}
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
              value={paysForm.code_iso2}
              onChange={(e) => setPaysForm((f) => ({ ...f, code_iso2: e.target.value }))}
            />
            <div className="form-text">2 lettres, unique.</div>
          </div>
          <div className="col-6">
            <label className="form-label">Devise par défaut</label>
            <select
              className="form-select"
              value={paysForm.devise_id}
              onChange={(e) => setPaysForm((f) => ({ ...f, devise_id: e.target.value }))}
            >
              <option value="">— Sélectionner —</option>
              {devises.map((d) => (
                <option key={d.devise_id} value={d.devise_id}>
                  {d.libelle}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label">Langue par défaut</label>
            <select
              className="form-select"
              value={paysForm.langue_id}
              onChange={(e) => setPaysForm((f) => ({ ...f, langue_id: e.target.value }))}
            >
              <option value="">— Sélectionner —</option>
              {langues.map((l) => (
                <option key={l.langue_id} value={l.langue_id}>
                  {l.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12">
            <label className="form-label">Statut d'activation</label>
            <select
              className="form-select"
              value={paysForm.statut_activation}
              onChange={(e) => setPaysForm((f) => ({ ...f, statut_activation: e.target.value }))}
            >
              <option value="pilote">Pilote — déploiement limité</option>
              <option value="actif">Actif — visible sur la plateforme</option>
              <option value="inactif">Inactif — masqué</option>
            </select>
            <div className="form-text">
              Devise et langue par défaut sont obligatoires (contrainte du backend).
            </div>
          </div>
        </div>
      </Modal>

      {/* ===================== MODAL LANGUE ===================== */}
      <Modal
        id="modalLangue"
        title={langueForm.langue_id ? 'Modifier la langue' : 'Nouvelle langue'}
        isOpen={langueModalOpen}
        onClose={() => setLangueModalOpen(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setLangueModalOpen(false)} disabled={langueSaving}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={saveLangue} disabled={langueSaving}>
              {langueSaving ? (
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
        {langueError && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <div>{langueError}</div>
          </div>
        )}
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
        title={deviseForm.devise_id ? 'Modifier la devise' : 'Nouvelle devise'}
        isOpen={deviseModalOpen}
        onClose={() => setDeviseModalOpen(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setDeviseModalOpen(false)} disabled={deviseSaving}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={saveDevise} disabled={deviseSaving}>
              {deviseSaving ? (
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
        {deviseError && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <div>{deviseError}</div>
          </div>
        )}
        <label className="form-label">Libellé de la devise</label>
        <input
          type="text"
          className="form-control"
          placeholder="Ex. Franc CFA (XAF)"
          value={deviseForm.libelle}
          onChange={(e) => setDeviseForm((f) => ({ ...f, libelle: e.target.value }))}
        />
      </Modal>

      {/* ===================== MODAL VILLES (config. par pays) ===================== */}
      <Modal
        id="modalVilles"
        title={villesPays ? `Villes — ${villesPays.nom} (${villesPays.code_iso2})` : 'Villes'}
        isOpen={villesModalOpen}
        onClose={() => setVillesModalOpen(false)}
        footer={
          <button className="btn btn-light" onClick={() => setVillesModalOpen(false)}>
            Fermer
          </button>
        }
      >
        {/* Card d'ajout / modification d'une ville */}
        <div className="aps-card p-3 mb-3">
          <h6 className="mb-3">{villeForm.ville_id ? 'Modifier la ville' : 'Ajouter une ville'}</h6>
          {villeFormError && (
            <div className="aps-notice is-danger mb-3">
              <i className="fa-solid fa-triangle-exclamation"></i>
              <div>{villeFormError}</div>
            </div>
          )}
          <div className="row g-2 align-items-end">
            <div className="col-7">
              <label className="form-label">Nom de la ville</label>
              <input
                type="text"
                className="form-control"
                placeholder="Ex. Douala"
                value={villeForm.nom}
                onChange={(e) => setVilleForm((f) => ({ ...f, nom: e.target.value }))}
              />
            </div>
            <div className="col-5">
              <label className="form-label">Code postal</label>
              <input
                type="text"
                className="form-control"
                placeholder="Optionnel"
                value={villeForm.code_postal}
                onChange={(e) => setVilleForm((f) => ({ ...f, code_postal: e.target.value }))}
              />
            </div>
            <div className="col-12 d-flex gap-2 justify-content-end mt-2">
              {villeForm.ville_id && (
                <button className="btn btn-sm btn-light" onClick={resetVilleForm} disabled={villeSaving}>
                  Annuler
                </button>
              )}
              <button className="btn btn-sm btn-primary" onClick={saveVille} disabled={villeSaving}>
                {villeSaving ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin me-2"></i>Enregistrement…
                  </>
                ) : villeForm.ville_id ? (
                  'Modifier la ville'
                ) : (
                  'Ajouter la ville'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Confirmation de suppression d'une ville */}
        {pendingDeleteVille && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <div className="flex-grow-1">
              Supprimer définitivement la ville « {pendingDeleteVille.nom} » ?
              {villeDeleteError && <div className="mt-1">{villeDeleteError}</div>}
            </div>
            <div className="d-flex gap-2">
              <button
                className="btn btn-sm btn-light"
                onClick={() => setPendingDeleteVille(null)}
                disabled={villeDeleteSaving}
              >
                Annuler
              </button>
              <button className="btn btn-sm btn-danger" onClick={confirmDeleteVille} disabled={villeDeleteSaving}>
                {villeDeleteSaving ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Supprimer'}
              </button>
            </div>
          </div>
        )}

        {/* Recherche */}
        <div className="aps-search mb-2">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input
            type="text"
            placeholder="Rechercher une ville…"
            value={searchVilles}
            onChange={(e) => setSearchVilles(e.target.value)}
          />
        </div>

        {villesError && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <div className="flex-grow-1">{villesError}</div>
            <button className="btn btn-sm btn-light" onClick={() => chargerVilles(villesPays.pays_id)}>
              <i className="fa-solid fa-rotate-right me-1"></i>Réessayer
            </button>
          </div>
        )}

        {/* Liste des villes du pays */}
        <div className="aps-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="table aps-table">
            <thead>
              <tr>
                <th>Ville</th>
                <th>Code postal</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {villesLoading ? (
                <tr>
                  <td colSpan={3}>
                    <div className="aps-empty-mini py-3 text-center">
                      <i className="fa-solid fa-spinner fa-spin d-block mb-2"></i>
                      Chargement des villes…
                    </div>
                  </td>
                </tr>
              ) : villesRows.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <div className="aps-empty-mini">Aucune ville pour ce pays.</div>
                  </td>
                </tr>
              ) : (
                villesRows.map((v) => (
                  <tr key={v.ville_id}>
                    <td>
                      <span className="cell-title">{v.nom}</span>
                    </td>
                    <td>{v.code_postal || <span className="aps-text-muted">—</span>}</td>
                    <td className="text-end">
                      <div className="aps-row-actions">
                        <button className="btn btn-sm btn-outline-primary" onClick={() => openEditVille(v)}>
                          <i className="fa-solid fa-pen"></i>
                        </button>
                        <button className="btn btn-sm btn-light" onClick={() => askDeleteVille(v)}>
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* ===================== MODAL SUPPRESSION ===================== */}
      <Modal
        id="modalDelete"
        title="Confirmer la suppression"
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        footer={
          <>
            <button className="btn btn-light" onClick={() => setDeleteModalOpen(false)} disabled={deleteSaving}>
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
          <div>{pendingDelete?.msg || 'Cette action est irréversible.'}</div>
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