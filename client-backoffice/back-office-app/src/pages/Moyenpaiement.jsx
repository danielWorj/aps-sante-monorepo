import { useState, useMemo, useEffect, useCallback } from 'react';
import './../assets/style/Referentiel.css';
import * as moyenPaiementService from '../services/moyenPaiementService';
import * as referentielService from '../services/referentielService';
// Service médecin : suppose la même convention que les autres services
// (voir en-tête de moyenPaiementService.js, "calqué sur medecinService.js").
// Adaptez le chemin/les noms de fonctions ci-dessous si votre
// medecinService.js expose une API différente (ex. listerMedecins,
// rechercherMedecins, obtenirMedecin…).
import * as medecinService from '../services/medecinService';
// Sidebar et Navbar sont déjà rendus par App.jsx (route layout) et
// admin.css est déjà importé globalement dans main.jsx : on ne les
// réimporte pas ici pour éviter la double mise en page. On réutilise
// Referentiel.css : c'est la feuille de style générique du back-office
// (cards .aps-*, tableaux, onglets, modales, badges…), déjà utilisée
// par la page Référentiel — rien de spécifique à recréer ici.

// ---------------------------------------------------------------------
// Formats renvoyés par le backend (voir moyenPaiement.controller.js) :
//   typeMobileMoney : { id, pays_id, libelle, pays: {pays_id, nom} }
//   mobileMoney     : { id, type_mobile_money_id, medecin_id, numero,
//                        titulaire, type_mobile_money: {id, libelle, pays} }
//   compteBancaire  : { id, medecin_id, nom_banque, titulaire, iban }
//
// La gestion de MobileMoney/CompteBancaire se fait "par médecin" :
// il faut d'abord sélectionner un médecin (recherche par nom, prénom
// ou numéro d'ordre — jamais par UUID) avant de pouvoir consulter/
// modifier ses moyens de paiement. Cette page s'appuie sur
// `medecinService.rechercherMedecins(terme)`, qui interroge
// GET /api/medecins?recherche=... et filtre en plus le résultat côté
// client par sécurité (voir medecinService.js). Le mode de secours par
// saisie manuelle de l'identifiant médecin (UUID) plus bas ne sert
// donc plus qu'en dernier recours, si jamais ce service venait à
// disparaître.
// ---------------------------------------------------------------------

function nomComplet(medecin) {
  if (!medecin) return '';
  const u = medecin.utilisateur || {};
  const prenom = u.prenom || medecin.prenom || '';
  const nom = u.nom || medecin.nom || '';
  return [prenom, nom].filter(Boolean).join(' ') || medecin.numero_ordre || medecin.medecin_id;
}

// ---------------------------------------------------------------------
// Modale générique (identique à celle de Referentiel.jsx)
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

export default function MoyenPaiement() {
  // =====================================================================
  // Données globales (référentiel)
  // =====================================================================
  const [pays, setPays] = useState([]);
  const [typesMobileMoney, setTypesMobileMoney] = useState([]);

  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState(null);

  const chargerDonnees = useCallback(async () => {
    setLoading(true);
    setErreurChargement(null);
    try {
      const [p, t] = await Promise.all([
        referentielService.listerPays(),
        moyenPaiementService.listerTypesMobileMoney(),
      ]);
      setPays(p);
      setTypesMobileMoney(t);
    } catch (err) {
      setErreurChargement(err.message || 'Impossible de charger les moyens de paiement.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    chargerDonnees();
  }, [chargerDonnees]);

  const [activeTab, setActiveTab] = useState('operateurs'); // 'operateurs' | 'medecin'

  // =====================================================================
  // Onglet « Opérateurs Mobile Money » (référentiel TypeMobileMoney)
  // =====================================================================
  const [searchOperateurs, setSearchOperateurs] = useState('');
  const [filterPaysOperateurs, setFilterPaysOperateurs] = useState('');

  const operateursRows = useMemo(() => {
    const q = searchOperateurs.toLowerCase();
    return typesMobileMoney.filter(
      (t) =>
        (!filterPaysOperateurs || t.pays_id === filterPaysOperateurs) &&
        t.libelle.toLowerCase().includes(q)
    );
  }, [typesMobileMoney, searchOperateurs, filterPaysOperateurs]);

  const [operateurModalOpen, setOperateurModalOpen] = useState(false);
  const [operateurForm, setOperateurForm] = useState({ id: '', pays_id: '', libelle: '' });
  const [operateurSaving, setOperateurSaving] = useState(false);
  const [operateurError, setOperateurError] = useState(null);

  function openAddOperateur() {
    setOperateurError(null);
    setOperateurForm({ id: '', pays_id: '', libelle: '' });
    setOperateurModalOpen(true);
  }
  function openEditOperateur(t) {
    setOperateurError(null);
    setOperateurForm({ id: t.id, pays_id: t.pays_id, libelle: t.libelle });
    setOperateurModalOpen(true);
  }

  async function saveOperateur() {
    const libelle = operateurForm.libelle.trim();
    const pays_id = operateurForm.pays_id;

    if (!libelle) {
      setOperateurError('Merci de renseigner un libellé (ex. Orange Money, MTN MoMo…).');
      return;
    }
    if (!pays_id) {
      setOperateurError('Merci de sélectionner le pays de cet opérateur.');
      return;
    }

    setOperateurSaving(true);
    setOperateurError(null);
    try {
      if (operateurForm.id) {
        const maj = await moyenPaiementService.modifierTypeMobileMoney(operateurForm.id, {
          pays_id,
          libelle,
        });
        setTypesMobileMoney((prev) => prev.map((t) => (t.id === maj.id ? maj : t)));
      } else {
        const nouveau = await moyenPaiementService.creerTypeMobileMoney({ pays_id, libelle });
        setTypesMobileMoney((prev) => [...prev, nouveau]);
      }
      setOperateurModalOpen(false);
    } catch (err) {
      setOperateurError(err.message || "Erreur lors de l'enregistrement de l'opérateur.");
    } finally {
      setOperateurSaving(false);
    }
  }

  const [pendingDeleteOperateur, setPendingDeleteOperateur] = useState(null);
  const [deleteOperateurSaving, setDeleteOperateurSaving] = useState(false);
  const [deleteOperateurError, setDeleteOperateurError] = useState(null);

  function askDeleteOperateur(t) {
    setDeleteOperateurError(null);
    setPendingDeleteOperateur(t);
  }

  async function confirmDeleteOperateur() {
    if (!pendingDeleteOperateur) return;
    setDeleteOperateurSaving(true);
    setDeleteOperateurError(null);
    try {
      await moyenPaiementService.supprimerTypeMobileMoney(pendingDeleteOperateur.id);
      setTypesMobileMoney((prev) => prev.filter((t) => t.id !== pendingDeleteOperateur.id));
      setPendingDeleteOperateur(null);
    } catch (err) {
      // 409 si des MobileMoney référencent encore ce type (contrainte FK)
      setDeleteOperateurError(err.message || "Erreur lors de la suppression de l'opérateur.");
    } finally {
      setDeleteOperateurSaving(false);
    }
  }

  // =====================================================================
  // Onglet « Moyens de paiement d'un médecin »
  // =====================================================================

  // --- Recherche / sélection du médecin ---
  const [rechercheMedecin, setRechercheMedecin] = useState('');
  const [resultatsMedecins, setResultatsMedecins] = useState([]);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [rechercheErreur, setRechercheErreur] = useState(null);
  const [medecinIdManuel, setMedecinIdManuel] = useState('');

  const [medecinSelectionne, setMedecinSelectionne] = useState(null);

  useEffect(() => {
    if (!medecinService?.rechercherMedecins || rechercheMedecin.trim().length < 2) {
      setResultatsMedecins([]);
      return;
    }
    let annule = false;
    const timer = setTimeout(async () => {
      setRechercheEnCours(true);
      setRechercheErreur(null);
      try {
        const res = await medecinService.rechercherMedecins(rechercheMedecin.trim());
        if (!annule) setResultatsMedecins(res?.medecins ?? res ?? []);
      } catch (err) {
        if (!annule) setRechercheErreur(err.message || 'Recherche indisponible.');
      } finally {
        if (!annule) setRechercheEnCours(false);
      }
    }, 350);
    return () => {
      annule = true;
      clearTimeout(timer);
    };
  }, [rechercheMedecin]);

  function choisirMedecin(m) {
    setMedecinSelectionne(m);
    setResultatsMedecins([]);
    setRechercheMedecin('');
  }

  async function chargerMedecinParId(id) {
    if (!id) return;
    setRechercheErreur(null);
    try {
      if (medecinService?.obtenirMedecin) {
        const m = await medecinService.obtenirMedecin(id);
        setMedecinSelectionne(m);
      } else {
        // Mode de secours : pas de fiche médecin disponible, on garde
        // simplement l'identifiant saisi pour interroger les moyens de
        // paiement (les listes fonctionneront quand même).
        setMedecinSelectionne({ medecin_id: id, utilisateur: null, __manuel: true });
      }
    } catch (err) {
      setRechercheErreur(err.message || 'Médecin introuvable.');
    }
  }

  function changerDeMedecin() {
    setMedecinSelectionne(null);
    setMobileMoneys([]);
    setComptesBancaires([]);
    resetMobileMoneyForm();
    resetCompteForm();
    setPendingDeleteMM(null);
    setPendingDeleteCB(null);
  }

  // --- Mobile Money du médecin sélectionné ---
  const [mobileMoneys, setMobileMoneys] = useState([]);
  const [mmLoading, setMmLoading] = useState(false);
  const [mmError, setMmError] = useState(null);

  const [mmForm, setMmForm] = useState({ id: '', type_mobile_money_id: '', numero: '', titulaire: '' });
  const [mmSaving, setMmSaving] = useState(false);
  const [mmFormError, setMmFormError] = useState(null);

  const [pendingDeleteMM, setPendingDeleteMM] = useState(null);
  const [mmDeleteSaving, setMmDeleteSaving] = useState(false);
  const [mmDeleteError, setMmDeleteError] = useState(null);

  // --- Comptes bancaires du médecin sélectionné ---
  const [comptesBancaires, setComptesBancaires] = useState([]);
  const [cbLoading, setCbLoading] = useState(false);
  const [cbError, setCbError] = useState(null);

  const [cbForm, setCbForm] = useState({ id: '', nom_banque: '', titulaire: '', iban: '' });
  const [cbSaving, setCbSaving] = useState(false);
  const [cbFormError, setCbFormError] = useState(null);

  const [pendingDeleteCB, setPendingDeleteCB] = useState(null);
  const [cbDeleteSaving, setCbDeleteSaving] = useState(false);
  const [cbDeleteError, setCbDeleteError] = useState(null);

  const chargerMoyensPaiementMedecin = useCallback(async (medecinId) => {
    setMmLoading(true);
    setCbLoading(true);
    setMmError(null);
    setCbError(null);
    try {
      const [mm, cb] = await Promise.all([
        moyenPaiementService.listerMobileMoneyMedecin(medecinId),
        moyenPaiementService.listerComptesBancairesMedecin(medecinId),
      ]);
      setMobileMoneys(mm);
      setComptesBancaires(cb);
    } catch (err) {
      setMmError(err.message || 'Impossible de charger les Mobile Money.');
      setCbError(err.message || 'Impossible de charger les comptes bancaires.');
    } finally {
      setMmLoading(false);
      setCbLoading(false);
    }
  }, []);

  useEffect(() => {
    if (medecinSelectionne?.medecin_id) {
      resetMobileMoneyForm();
      resetCompteForm();
      chargerMoyensPaiementMedecin(medecinSelectionne.medecin_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medecinSelectionne?.medecin_id, chargerMoyensPaiementMedecin]);

  function resetMobileMoneyForm() {
    setMmFormError(null);
    setMmForm({ id: '', type_mobile_money_id: '', numero: '', titulaire: '' });
  }
  function openEditMobileMoney(mm) {
    setMmFormError(null);
    setMmForm({
      id: mm.id,
      type_mobile_money_id: mm.type_mobile_money_id,
      numero: mm.numero,
      titulaire: mm.titulaire,
    });
  }

  async function saveMobileMoney() {
    if (!medecinSelectionne?.medecin_id) return;
    const numero = mmForm.numero.trim();
    const titulaire = mmForm.titulaire.trim();
    const type_mobile_money_id = mmForm.type_mobile_money_id;

    if (!type_mobile_money_id || !numero || !titulaire) {
      setMmFormError('Merci de renseigner un opérateur, un numéro et un titulaire.');
      return;
    }

    setMmSaving(true);
    setMmFormError(null);
    try {
      if (mmForm.id) {
        const maj = await moyenPaiementService.modifierMobileMoney(mmForm.id, {
          type_mobile_money_id,
          numero,
          titulaire,
        });
        setMobileMoneys((prev) => prev.map((m) => (m.id === maj.id ? { ...m, ...maj } : m)));
      } else {
        const nouveau = await moyenPaiementService.creerMobileMoney({
          medecin_id: medecinSelectionne.medecin_id,
          type_mobile_money_id,
          numero,
          titulaire,
        });
        setMobileMoneys((prev) => [...prev, nouveau]);
      }
      resetMobileMoneyForm();
      // Les libellés d'opérateur / pays affichés dans la liste viennent
      // de l'include serveur ; on recharge pour rester cohérent après
      // un changement d'opérateur.
      chargerMoyensPaiementMedecin(medecinSelectionne.medecin_id);
    } catch (err) {
      setMmFormError(err.message || "Erreur lors de l'enregistrement du Mobile Money.");
    } finally {
      setMmSaving(false);
    }
  }

  function askDeleteMobileMoney(mm) {
    setMmDeleteError(null);
    setPendingDeleteMM(mm);
  }

  async function confirmDeleteMobileMoney() {
    if (!pendingDeleteMM) return;
    setMmDeleteSaving(true);
    setMmDeleteError(null);
    try {
      await moyenPaiementService.supprimerMobileMoney(pendingDeleteMM.id);
      setMobileMoneys((prev) => prev.filter((m) => m.id !== pendingDeleteMM.id));
      if (mmForm.id === pendingDeleteMM.id) resetMobileMoneyForm();
      setPendingDeleteMM(null);
    } catch (err) {
      setMmDeleteError(err.message || 'Erreur lors de la suppression du Mobile Money.');
    } finally {
      setMmDeleteSaving(false);
    }
  }

  function resetCompteForm() {
    setCbFormError(null);
    setCbForm({ id: '', nom_banque: '', titulaire: '', iban: '' });
  }
  function openEditCompte(cb) {
    setCbFormError(null);
    setCbForm({ id: cb.id, nom_banque: cb.nom_banque, titulaire: cb.titulaire, iban: cb.iban });
  }

  async function saveCompteBancaire() {
    if (!medecinSelectionne?.medecin_id) return;
    const nom_banque = cbForm.nom_banque.trim();
    const titulaire = cbForm.titulaire.trim();
    const iban = cbForm.iban.trim();

    if (!nom_banque || !titulaire || !iban) {
      setCbFormError('Merci de renseigner la banque, le titulaire et l’IBAN.');
      return;
    }

    setCbSaving(true);
    setCbFormError(null);
    try {
      if (cbForm.id) {
        const maj = await moyenPaiementService.modifierCompteBancaire(cbForm.id, {
          nom_banque,
          titulaire,
          iban,
        });
        setComptesBancaires((prev) => prev.map((c) => (c.id === maj.id ? maj : c)));
      } else {
        const nouveau = await moyenPaiementService.creerCompteBancaire({
          medecin_id: medecinSelectionne.medecin_id,
          nom_banque,
          titulaire,
          iban,
        });
        setComptesBancaires((prev) => [...prev, nouveau]);
      }
      resetCompteForm();
    } catch (err) {
      setCbFormError(err.message || "Erreur lors de l'enregistrement du compte bancaire.");
    } finally {
      setCbSaving(false);
    }
  }

  function askDeleteCompte(cb) {
    setCbDeleteError(null);
    setPendingDeleteCB(cb);
  }

  async function confirmDeleteCompte() {
    if (!pendingDeleteCB) return;
    setCbDeleteSaving(true);
    setCbDeleteError(null);
    try {
      await moyenPaiementService.supprimerCompteBancaire(pendingDeleteCB.id);
      setComptesBancaires((prev) => prev.filter((c) => c.id !== pendingDeleteCB.id));
      if (cbForm.id === pendingDeleteCB.id) resetCompteForm();
      setPendingDeleteCB(null);
    } catch (err) {
      setCbDeleteError(err.message || 'Erreur lors de la suppression du compte bancaire.');
    } finally {
      setCbDeleteSaving(false);
    }
  }

  // Opérateurs Mobile Money filtrés sur le pays d'exercice du médecin
  // sélectionné, quand cette info est disponible — sinon liste complète.
  const operateursPourMedecin = useMemo(() => {
    const paysExercice = medecinSelectionne?.pays_exercice_id;
    if (!paysExercice) return typesMobileMoney;
    const filtres = typesMobileMoney.filter((t) => t.pays_id === paysExercice);
    return filtres.length ? filtres : typesMobileMoney;
  }, [typesMobileMoney, medecinSelectionne]);

  // =====================================================================
  // KPI
  // =====================================================================
  const kpiOperateurs = typesMobileMoney.length;
  const kpiPaysCouverts = useMemo(
    () => new Set(typesMobileMoney.map((t) => t.pays_id)).size,
    [typesMobileMoney]
  );
  const kpiMobileMoneyMedecin = mobileMoneys.length;
  const kpiComptesMedecin = comptesBancaires.length;

  // =====================================================================
  // Rendu
  // =====================================================================
  return (
    <>
      <main className="aps-content">
        <div className="aps-page-header">
          <div>
            <div className="aps-breadcrumb">
              Back-office <span className="sep">/</span> Finance <span className="sep">/</span> Moyens de paiement
            </div>
            <h1>Moyens de paiement</h1>
          </div>
          {activeTab === 'operateurs' && (
            <div className="d-flex gap-2">
              <button className="btn btn-primary" onClick={openAddOperateur} disabled={loading}>
                <i className="fa-solid fa-plus me-2"></i>Nouvel opérateur
              </button>
            </div>
          )}
        </div>

        <div className="aps-notice is-info mb-4">
          <i className="fa-solid fa-circle-info"></i>
          <div>
            Le référentiel des opérateurs Mobile Money (par pays) alimente le choix proposé aux médecins lors de
            l'enregistrement de leurs coordonnées Mobile Money. Les coordonnées de paiement (Mobile Money et comptes
            bancaires) sont propres à chaque médecin : sélectionnez un médecin dans l'onglet dédié pour les consulter
            ou les modifier.
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
            Chargement des moyens de paiement…
          </div>
        ) : (
          <>
            {/* KPI */}
            <div className="row g-3 mb-4">
              <div className="col-6 col-lg-3">
                <div className="aps-kpi">
                  <div className="aps-kpi__top">
                    <div className="aps-kpi__icon is-primary">
                      <i className="fa-solid fa-mobile-screen-button"></i>
                    </div>
                  </div>
                  <div className="aps-kpi__label">Opérateurs Mobile Money</div>
                  <div className="aps-kpi__value">{kpiOperateurs}</div>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="aps-kpi">
                  <div className="aps-kpi__top">
                    <div className="aps-kpi__icon is-warning">
                      <i className="fa-solid fa-earth-africa"></i>
                    </div>
                  </div>
                  <div className="aps-kpi__label">Pays couverts</div>
                  <div className="aps-kpi__value">{kpiPaysCouverts}</div>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="aps-kpi">
                  <div className="aps-kpi__top">
                    <div className="aps-kpi__icon is-success">
                      <i className="fa-solid fa-wallet"></i>
                    </div>
                  </div>
                  <div className="aps-kpi__label">Mobile Money du médecin sélectionné</div>
                  <div className="aps-kpi__value">{medecinSelectionne ? kpiMobileMoneyMedecin : '—'}</div>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="aps-kpi">
                  <div className="aps-kpi__top">
                    <div className="aps-kpi__icon is-danger">
                      <i className="fa-solid fa-building-columns"></i>
                    </div>
                  </div>
                  <div className="aps-kpi__label">Comptes bancaires du médecin sélectionné</div>
                  <div className="aps-kpi__value">{medecinSelectionne ? kpiComptesMedecin : '—'}</div>
                </div>
              </div>
            </div>

            {/* Onglets */}
            <div className="aps-card">
              <div className="aps-tabs px-2 pt-1">
                <button
                  className={activeTab === 'operateurs' ? 'is-active' : ''}
                  onClick={() => setActiveTab('operateurs')}
                >
                  <i className="fa-solid fa-mobile-screen-button"></i>Opérateurs Mobile Money
                </button>
                <button
                  className={activeTab === 'medecin' ? 'is-active' : ''}
                  onClick={() => setActiveTab('medecin')}
                >
                  <i className="fa-solid fa-user-doctor"></i>Moyens de paiement d'un médecin
                </button>
              </div>

              {/* ===================== OPÉRATEURS MOBILE MONEY ===================== */}
              {activeTab === 'operateurs' && (
                <div className="aps-tab-pane is-active">
                  <div className="aps-toolbar">
                    <div className="aps-search">
                      <i className="fa-solid fa-magnifying-glass"></i>
                      <input
                        type="text"
                        placeholder="Rechercher un opérateur…"
                        value={searchOperateurs}
                        onChange={(e) => setSearchOperateurs(e.target.value)}
                      />
                    </div>
                    <select
                      className="form-select form-select-sm"
                      style={{ maxWidth: 200 }}
                      value={filterPaysOperateurs}
                      onChange={(e) => setFilterPaysOperateurs(e.target.value)}
                    >
                      <option value="">Tous les pays</option>
                      {pays.map((p) => (
                        <option key={p.pays_id} value={p.pays_id}>
                          {p.nom}
                        </option>
                      ))}
                    </select>
                    <div className="ms-auto"></div>
                    <button className="btn btn-sm btn-primary" onClick={openAddOperateur}>
                      <i className="fa-solid fa-plus me-1"></i>Nouvel opérateur
                    </button>
                  </div>

                  {pendingDeleteOperateur && (
                    <div className="aps-notice is-danger mx-3 mb-3">
                      <i className="fa-solid fa-triangle-exclamation"></i>
                      <div className="flex-grow-1">
                        Supprimer définitivement l'opérateur « {pendingDeleteOperateur.libelle} » ?
                        {deleteOperateurError && <div className="mt-1">{deleteOperateurError}</div>}
                      </div>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-sm btn-light"
                          onClick={() => setPendingDeleteOperateur(null)}
                          disabled={deleteOperateurSaving}
                        >
                          Annuler
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={confirmDeleteOperateur}
                          disabled={deleteOperateurSaving}
                        >
                          {deleteOperateurSaving ? (
                            <i className="fa-solid fa-spinner fa-spin"></i>
                          ) : (
                            'Supprimer'
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="aps-table-wrap">
                    <table className="table aps-table">
                      <thead>
                        <tr>
                          <th>Opérateur</th>
                          <th>Pays</th>
                          <th className="text-end">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operateursRows.length === 0 ? (
                          <tr>
                            <td colSpan={3}>
                              <div className="aps-empty-mini">
                                <i
                                  className="fa-solid fa-mobile-screen-button d-block mb-2"
                                  style={{ fontSize: 22 }}
                                ></i>
                                Aucun opérateur ne correspond à votre recherche.
                              </div>
                            </td>
                          </tr>
                        ) : (
                          operateursRows.map((t) => (
                            <tr key={t.id}>
                              <td>
                                <span className="cell-title">{t.libelle}</span>
                              </td>
                              <td>{t.pays ? t.pays.nom : <span className="aps-text-muted">—</span>}</td>
                              <td className="text-end">
                                <div className="aps-row-actions">
                                  <button
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={() => openEditOperateur(t)}
                                    title="Modifier"
                                  >
                                    <i className="fa-solid fa-pen"></i>
                                  </button>
                                  <button
                                    className="btn btn-sm btn-light"
                                    onClick={() => askDeleteOperateur(t)}
                                    title="Supprimer"
                                  >
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

              {/* ===================== MOYENS DE PAIEMENT D'UN MÉDECIN ===================== */}
              {activeTab === 'medecin' && (
                <div className="aps-tab-pane is-active p-3">
                  {!medecinSelectionne ? (
                    <div className="aps-card p-3">
                      <h6 className="mb-3">Sélectionner un médecin</h6>

                      {medecinService?.rechercherMedecins ? (
                        <div className="position-relative">
                          <div className="aps-search mb-2">
                            <i className="fa-solid fa-magnifying-glass"></i>
                            <input
                              type="text"
                              placeholder="Nom, prénom ou numéro d'ordre du médecin…"
                              value={rechercheMedecin}
                              onChange={(e) => setRechercheMedecin(e.target.value)}
                            />
                          </div>
                          {rechercheEnCours && (
                            <div className="aps-text-muted mb-2">
                              <i className="fa-solid fa-spinner fa-spin me-2"></i>Recherche…
                            </div>
                          )}
                          {rechercheErreur && (
                            <div className="aps-notice is-danger mb-2">
                              <i className="fa-solid fa-triangle-exclamation"></i>
                              <div>{rechercheErreur}</div>
                            </div>
                          )}
                          {resultatsMedecins.length > 0 && (
                            <div className="aps-table-wrap mb-2" style={{ maxHeight: 260, overflowY: 'auto' }}>
                              <table className="table aps-table">
                                <tbody>
                                  {resultatsMedecins.map((m) => (
                                    <tr
                                      key={m.medecin_id}
                                      style={{ cursor: 'pointer' }}
                                      onClick={() => choisirMedecin(m)}
                                    >
                                      <td>
                                        <span className="cell-title">{nomComplet(m)}</span>
                                      </td>
                                      <td>
                                        {m.numero_ordre ? (
                                          <span className="aps-code-chip">{m.numero_ordre}</span>
                                        ) : (
                                          <span className="aps-text-muted">—</span>
                                        )}
                                      </td>
                                      <td className="text-end">
                                        <button className="btn btn-sm btn-outline-primary">
                                          Sélectionner
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="aps-notice is-warning mb-3">
                            <i className="fa-solid fa-triangle-exclamation"></i>
                            <div>
                              Le service de recherche de médecins n'est pas disponible depuis cette page. Saisissez
                              directement l'identifiant (medecin_id) du médecin dont vous souhaitez gérer les moyens
                              de paiement.
                            </div>
                          </div>
                          <div className="d-flex gap-2">
                            <input
                              type="text"
                              className="form-control"
                              placeholder="medecin_id (UUID)"
                              value={medecinIdManuel}
                              onChange={(e) => setMedecinIdManuel(e.target.value)}
                            />
                            <button
                              className="btn btn-primary text-nowrap"
                              onClick={() => chargerMedecinParId(medecinIdManuel.trim())}
                              disabled={!medecinIdManuel.trim()}
                            >
                              Charger
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Bandeau médecin sélectionné */}
                      <div className="aps-card p-3 mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <div>
                          <div className="aps-text-muted" style={{ fontSize: 12 }}>
                            Médecin sélectionné
                          </div>
                          <div className="cell-title" style={{ fontSize: 16 }}>
                            {medecinSelectionne.__manuel
                              ? medecinSelectionne.medecin_id
                              : nomComplet(medecinSelectionne)}
                          </div>
                          {medecinSelectionne.numero_ordre && (
                            <span className="aps-code-chip">{medecinSelectionne.numero_ordre}</span>
                          )}
                        </div>
                        <button className="btn btn-light" onClick={changerDeMedecin}>
                          <i className="fa-solid fa-rotate-left me-2"></i>Changer de médecin
                        </button>
                      </div>

                      <div className="row g-3">
                        {/* -------- Mobile Money -------- */}
                        <div className="col-12 col-xl-6">
                          <div className="aps-card p-3 h-100">
                            <h6 className="mb-3">
                              <i className="fa-solid fa-mobile-screen-button me-2"></i>Mobile Money
                            </h6>

                            <div className="aps-card p-3 mb-3" style={{ background: 'var(--aps-bg-subtle, #f8f9fb)' }}>
                              <h6 className="mb-3">
                                {mmForm.id ? 'Modifier le Mobile Money' : 'Ajouter un Mobile Money'}
                              </h6>
                              {mmFormError && (
                                <div className="aps-notice is-danger mb-3">
                                  <i className="fa-solid fa-triangle-exclamation"></i>
                                  <div>{mmFormError}</div>
                                </div>
                              )}
                              <div className="row g-2">
                                <div className="col-12">
                                  <label className="form-label">Opérateur</label>
                                  <select
                                    className="form-select"
                                    value={mmForm.type_mobile_money_id}
                                    onChange={(e) =>
                                      setMmForm((f) => ({ ...f, type_mobile_money_id: e.target.value }))
                                    }
                                  >
                                    <option value="">— Sélectionner —</option>
                                    {operateursPourMedecin.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.libelle}
                                        {t.pays ? ` (${t.pays.nom})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="col-6">
                                  <label className="form-label">Numéro</label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Ex. 6XX XXX XXX"
                                    value={mmForm.numero}
                                    onChange={(e) => setMmForm((f) => ({ ...f, numero: e.target.value }))}
                                  />
                                </div>
                                <div className="col-6">
                                  <label className="form-label">Titulaire</label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Nom du titulaire"
                                    value={mmForm.titulaire}
                                    onChange={(e) => setMmForm((f) => ({ ...f, titulaire: e.target.value }))}
                                  />
                                </div>
                                <div className="col-12 d-flex gap-2 justify-content-end mt-2">
                                  {mmForm.id && (
                                    <button
                                      className="btn btn-sm btn-light"
                                      onClick={resetMobileMoneyForm}
                                      disabled={mmSaving}
                                    >
                                      Annuler
                                    </button>
                                  )}
                                  <button
                                    className="btn btn-sm btn-primary"
                                    onClick={saveMobileMoney}
                                    disabled={mmSaving}
                                  >
                                    {mmSaving ? (
                                      <>
                                        <i className="fa-solid fa-spinner fa-spin me-2"></i>Enregistrement…
                                      </>
                                    ) : mmForm.id ? (
                                      'Modifier'
                                    ) : (
                                      'Ajouter'
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {pendingDeleteMM && (
                              <div className="aps-notice is-danger mb-3">
                                <i className="fa-solid fa-triangle-exclamation"></i>
                                <div className="flex-grow-1">
                                  Supprimer le Mobile Money « {pendingDeleteMM.numero} » ?
                                  {mmDeleteError && <div className="mt-1">{mmDeleteError}</div>}
                                </div>
                                <div className="d-flex gap-2">
                                  <button
                                    className="btn btn-sm btn-light"
                                    onClick={() => setPendingDeleteMM(null)}
                                    disabled={mmDeleteSaving}
                                  >
                                    Annuler
                                  </button>
                                  <button
                                    className="btn btn-sm btn-danger"
                                    onClick={confirmDeleteMobileMoney}
                                    disabled={mmDeleteSaving}
                                  >
                                    {mmDeleteSaving ? (
                                      <i className="fa-solid fa-spinner fa-spin"></i>
                                    ) : (
                                      'Supprimer'
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}

                            {mmError && (
                              <div className="aps-notice is-danger mb-3">
                                <i className="fa-solid fa-triangle-exclamation"></i>
                                <div className="flex-grow-1">{mmError}</div>
                                <button
                                  className="btn btn-sm btn-light"
                                  onClick={() => chargerMoyensPaiementMedecin(medecinSelectionne.medecin_id)}
                                >
                                  <i className="fa-solid fa-rotate-right me-1"></i>Réessayer
                                </button>
                              </div>
                            )}

                            <div className="aps-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
                              <table className="table aps-table">
                                <thead>
                                  <tr>
                                    <th>Opérateur</th>
                                    <th>Numéro</th>
                                    <th>Titulaire</th>
                                    <th className="text-end">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {mmLoading ? (
                                    <tr>
                                      <td colSpan={4}>
                                        <div className="aps-empty-mini py-3 text-center">
                                          <i className="fa-solid fa-spinner fa-spin d-block mb-2"></i>
                                          Chargement…
                                        </div>
                                      </td>
                                    </tr>
                                  ) : mobileMoneys.length === 0 ? (
                                    <tr>
                                      <td colSpan={4}>
                                        <div className="aps-empty-mini">Aucun Mobile Money enregistré.</div>
                                      </td>
                                    </tr>
                                  ) : (
                                    mobileMoneys.map((m) => (
                                      <tr key={m.id}>
                                        <td>
                                          <span className="cell-title">
                                            {m.type_mobile_money?.libelle || '—'}
                                          </span>
                                          {m.type_mobile_money?.pays?.nom && (
                                            <div className="aps-text-muted" style={{ fontSize: 12 }}>
                                              {m.type_mobile_money.pays.nom}
                                            </div>
                                          )}
                                        </td>
                                        <td>{m.numero}</td>
                                        <td>{m.titulaire}</td>
                                        <td className="text-end">
                                          <div className="aps-row-actions">
                                            <button
                                              className="btn btn-sm btn-outline-primary"
                                              onClick={() => openEditMobileMoney(m)}
                                            >
                                              <i className="fa-solid fa-pen"></i>
                                            </button>
                                            <button
                                              className="btn btn-sm btn-light"
                                              onClick={() => askDeleteMobileMoney(m)}
                                            >
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
                        </div>

                        {/* -------- Compte bancaire -------- */}
                        <div className="col-12 col-xl-6">
                          <div className="aps-card p-3 h-100">
                            <h6 className="mb-3">
                              <i className="fa-solid fa-building-columns me-2"></i>Comptes bancaires
                            </h6>

                            <div className="aps-card p-3 mb-3" style={{ background: 'var(--aps-bg-subtle, #f8f9fb)' }}>
                              <h6 className="mb-3">
                                {cbForm.id ? 'Modifier le compte bancaire' : 'Ajouter un compte bancaire'}
                              </h6>
                              {cbFormError && (
                                <div className="aps-notice is-danger mb-3">
                                  <i className="fa-solid fa-triangle-exclamation"></i>
                                  <div>{cbFormError}</div>
                                </div>
                              )}
                              <div className="row g-2">
                                <div className="col-12">
                                  <label className="form-label">Banque</label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Ex. Afriland First Bank"
                                    value={cbForm.nom_banque}
                                    onChange={(e) => setCbForm((f) => ({ ...f, nom_banque: e.target.value }))}
                                  />
                                </div>
                                <div className="col-6">
                                  <label className="form-label">Titulaire</label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Nom du titulaire"
                                    value={cbForm.titulaire}
                                    onChange={(e) => setCbForm((f) => ({ ...f, titulaire: e.target.value }))}
                                  />
                                </div>
                                <div className="col-6">
                                  <label className="form-label">IBAN</label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    placeholder="IBAN"
                                    value={cbForm.iban}
                                    onChange={(e) => setCbForm((f) => ({ ...f, iban: e.target.value }))}
                                  />
                                </div>
                                <div className="col-12 d-flex gap-2 justify-content-end mt-2">
                                  {cbForm.id && (
                                    <button
                                      className="btn btn-sm btn-light"
                                      onClick={resetCompteForm}
                                      disabled={cbSaving}
                                    >
                                      Annuler
                                    </button>
                                  )}
                                  <button
                                    className="btn btn-sm btn-primary"
                                    onClick={saveCompteBancaire}
                                    disabled={cbSaving}
                                  >
                                    {cbSaving ? (
                                      <>
                                        <i className="fa-solid fa-spinner fa-spin me-2"></i>Enregistrement…
                                      </>
                                    ) : cbForm.id ? (
                                      'Modifier'
                                    ) : (
                                      'Ajouter'
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {pendingDeleteCB && (
                              <div className="aps-notice is-danger mb-3">
                                <i className="fa-solid fa-triangle-exclamation"></i>
                                <div className="flex-grow-1">
                                  Supprimer le compte « {pendingDeleteCB.nom_banque} » ?
                                  {cbDeleteError && <div className="mt-1">{cbDeleteError}</div>}
                                </div>
                                <div className="d-flex gap-2">
                                  <button
                                    className="btn btn-sm btn-light"
                                    onClick={() => setPendingDeleteCB(null)}
                                    disabled={cbDeleteSaving}
                                  >
                                    Annuler
                                  </button>
                                  <button
                                    className="btn btn-sm btn-danger"
                                    onClick={confirmDeleteCompte}
                                    disabled={cbDeleteSaving}
                                  >
                                    {cbDeleteSaving ? (
                                      <i className="fa-solid fa-spinner fa-spin"></i>
                                    ) : (
                                      'Supprimer'
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}

                            {cbError && (
                              <div className="aps-notice is-danger mb-3">
                                <i className="fa-solid fa-triangle-exclamation"></i>
                                <div className="flex-grow-1">{cbError}</div>
                                <button
                                  className="btn btn-sm btn-light"
                                  onClick={() => chargerMoyensPaiementMedecin(medecinSelectionne.medecin_id)}
                                >
                                  <i className="fa-solid fa-rotate-right me-1"></i>Réessayer
                                </button>
                              </div>
                            )}

                            <div className="aps-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
                              <table className="table aps-table">
                                <thead>
                                  <tr>
                                    <th>Banque</th>
                                    <th>Titulaire</th>
                                    <th>IBAN</th>
                                    <th className="text-end">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cbLoading ? (
                                    <tr>
                                      <td colSpan={4}>
                                        <div className="aps-empty-mini py-3 text-center">
                                          <i className="fa-solid fa-spinner fa-spin d-block mb-2"></i>
                                          Chargement…
                                        </div>
                                      </td>
                                    </tr>
                                  ) : comptesBancaires.length === 0 ? (
                                    <tr>
                                      <td colSpan={4}>
                                        <div className="aps-empty-mini">Aucun compte bancaire enregistré.</div>
                                      </td>
                                    </tr>
                                  ) : (
                                    comptesBancaires.map((c) => (
                                      <tr key={c.id}>
                                        <td>
                                          <span className="cell-title">{c.nom_banque}</span>
                                        </td>
                                        <td>{c.titulaire}</td>
                                        <td>
                                          <span className="aps-code-chip">{c.iban}</span>
                                        </td>
                                        <td className="text-end">
                                          <div className="aps-row-actions">
                                            <button
                                              className="btn btn-sm btn-outline-primary"
                                              onClick={() => openEditCompte(c)}
                                            >
                                              <i className="fa-solid fa-pen"></i>
                                            </button>
                                            <button
                                              className="btn btn-sm btn-light"
                                              onClick={() => askDeleteCompte(c)}
                                            >
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
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* ===================== MODAL OPÉRATEUR MOBILE MONEY ===================== */}
      <Modal
        id="modalOperateur"
        title={operateurForm.id ? "Modifier l'opérateur" : 'Nouvel opérateur Mobile Money'}
        isOpen={operateurModalOpen}
        onClose={() => setOperateurModalOpen(false)}
        footer={
          <>
            <button
              className="btn btn-light"
              onClick={() => setOperateurModalOpen(false)}
              disabled={operateurSaving}
            >
              Annuler
            </button>
            <button className="btn btn-primary" onClick={saveOperateur} disabled={operateurSaving}>
              {operateurSaving ? (
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
        {operateurError && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <div>{operateurError}</div>
          </div>
        )}
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label">Libellé de l'opérateur</label>
            <input
              type="text"
              className="form-control"
              placeholder="Ex. Orange Money, MTN MoMo…"
              value={operateurForm.libelle}
              onChange={(e) => setOperateurForm((f) => ({ ...f, libelle: e.target.value }))}
            />
          </div>
          <div className="col-12">
            <label className="form-label">Pays</label>
            <select
              className="form-select"
              value={operateurForm.pays_id}
              onChange={(e) => setOperateurForm((f) => ({ ...f, pays_id: e.target.value }))}
            >
              <option value="">— Sélectionner —</option>
              {pays.map((p) => (
                <option key={p.pays_id} value={p.pays_id}>
                  {p.nom}
                </option>
              ))}
            </select>
            <div className="form-text">
              Cet opérateur ne sera proposé qu'aux médecins exerçant dans ce pays.
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}