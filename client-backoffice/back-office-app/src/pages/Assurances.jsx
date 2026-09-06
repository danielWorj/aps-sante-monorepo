// src/pages/Assurances.jsx
//
// Composant "annuaire — assurance" (table service_assurance +
// mise_en_relation, diagramme 08_annuaire_assurances). Consomme
// entièrement assuranceService.js — aucun appel réseau direct ici.
//
// Reprend le design system partagé du back-office (aps-content,
// aps-page-header, aps-kpi, aps-card, aps-badge, aps-notice, modales
// Bootstrap pilotées par état React…), déjà utilisé par RendezVous.jsx,
// Medecin.jsx et Pharmacie.jsx — remplace l'ancien système de classes
// "aps-assur-*" propre à cette page, pour que l'annuaire des assurances
// ait le même look & feel que le reste du back-office. La logique
// métier (appels service, règles d'accès, formulaires) est inchangée :
// seule la couche de présentation a été reprise.
//
// Règles d'accès rappelées côté UX (le serveur reste la seule source
// de vérité — voir assuranceService.js) :
//   service_assurance : GET public · POST tout utilisateur authentifié
//     (crée aussi le compte agent) · PUT tout utilisateur authentifié
//     (statut_verification réservé admin/superadmin) · DELETE superadmin
//   mise_en_relation  : POST tout utilisateur authentifié · GET/DELETE
//     réservés à l'agent du service concerné ou à admin/superadmin
//
// ⚠️ Ajustez au besoin les deux chemins d'import ci-dessous
// ('../context/AuthContext' et '../services/assuranceService') selon
// l'emplacement réel de ce fichier dans votre arborescence.

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  listerServicesAssurance,
  obtenirServiceAssurance,
  creerServiceAssurance,
  modifierServiceAssurance,
  supprimerServiceAssurance,
  listerMisesEnRelationAssurance,
  creerMiseEnRelationAssurance,
  supprimerMiseEnRelationAssurance,
  listerActivites,
  creerActivite,
  modifierActivite,
  supprimerActivite,
  listerOptionsActivite,
  creerOptionActivite,
  modifierOptionActivite,
  supprimerOptionActivite,
  listerAgences,
  creerAgence,
  modifierAgence,
  supprimerAgence,
  listerPays,
  listerVilles,
  STATUTS_VERIFICATION_ASSURANCE,
  TYPES_ACTEUR_ASSURANCE,
} from '../services/assuranceService';
import '../assets/style/Assurances.css';

const LIBELLES_STATUT = STATUTS_VERIFICATION_ASSURANCE.reduce((acc, s) => {
  acc[s.valeur] = s.libelle;
  return acc;
}, {});

const LIBELLES_TYPE = TYPES_ACTEUR_ASSURANCE.reduce((acc, t) => {
  acc[t.valeur] = t.libelle;
  return acc;
}, {});

// Couleurs/icônes des badges de statut — même palette aps-badge que
// Pharmacie.jsx / StructureSante.jsx (is-success / is-warning / is-danger).
const STATUT_META = {
  publie: { badge: 'is-success', icone: 'fa-circle-check' },
  en_cours: { badge: 'is-warning', icone: 'fa-hourglass-half' },
  non_publie: { badge: 'is-danger', icone: 'fa-circle-xmark' },
};

const TYPE_META = {
  compagnie: { icone: 'fa-building-shield' },
  courtier: { icone: 'fa-user-tie' },
};

function libelleStatut(valeur) {
  return LIBELLES_STATUT[valeur] || valeur || '—';
}

function libelleType(valeur) {
  return LIBELLES_TYPE[valeur] || valeur || '—';
}

function donneesFormulaireVides() {
  return {
    nom: '',
    type_acteur: '',
    pays_id: '',
    ville_id: '',
    telephone: '',
    email: '',
    agrement: '',
    description: '',
    statut_verification: 'en_cours',
    latitude: '',
    longitude: '',
    image_assurance: null,
    fonction: '',
    agent_nom: '',
    agent_prenom: '',
    agent_email: '',
    agent_telephone: '',
  };
}

function messageErreur(err, repli) {
  return err?.data?.message || err?.message || repli;
}

function formaterDate(valeur) {
  if (!valeur) return '—';
  try {
    return new Date(valeur).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Extraction tolérante du rôle depuis l'objet `user` renvoyé par
 * AuthContext (data.utilisateur côté backend) : on ne connaît pas la
 * forme exacte du champ (chaîne simple 'admin' / objet { nom } / relation
 * imbriquée), donc on essaie plusieurs formes plausibles plutôt que de
 * casser silencieusement les droits d'un admin ou superadmin réel.
 */
function extraireRole(user) {
  if (!user || typeof user !== 'object') return null;
  const candidats = [
    user.role,
    user.role?.nom,
    user.role?.libelle,
    user.role_nom,
    user.roles?.[0],
    user.roles?.[0]?.nom,
  ];
  for (const candidat of candidats) {
    if (typeof candidat === 'string' && candidat.trim()) {
      return candidat.trim().toLowerCase();
    }
  }
  return null;
}

/* ===================================================================
 * Modale générique (patron Bootstrap piloté par état React, identique
 * à RendezVous.jsx / Ordonnance.jsx / Referentiel.jsx).
 * =================================================================== */

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
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" onClick={onClose}></div>
    </>
  );
}

/* ===================================================================
 * Configuration d'un service : activités, options d'activité, agences
 *
 * Popup ouverte depuis le bouton "Configurer" de la carte. Consomme
 * listerActivites / creerActivite / modifierActivite / supprimerActivite,
 * listerOptionsActivite / creerOptionActivite / modifierOptionActivite /
 * supprimerOptionActivite et listerAgences / creerAgence / modifierAgence
 * / supprimerAgence (assuranceService.js), toujours scopés au
 * service_assurance_id de la carte d'origine.
 * =================================================================== */

function ConfigurationModale({ service, onFermer }) {
  const serviceId = service.service_assurance_id;
  const [onglet, setOnglet] = useState('activites'); // 'activites' | 'agences'

  /* ---------------------------- Activités ---------------------------- */
  const [activites, setActivites] = useState([]);
  const [chargementActivites, setChargementActivites] = useState(true);
  const [erreurActivites, setErreurActivites] = useState(null);
  const [rechargerActivites, setRechargerActivites] = useState(0);

  const [activiteEnEdition, setActiviteEnEdition] = useState(null); // {} = création, {activite_id,...} = édition
  const [formActivite, setFormActivite] = useState({ titre: '', public_cible: '', description: '' });
  const [envoiActivite, setEnvoiActivite] = useState(false);
  const [erreurFormActivite, setErreurFormActivite] = useState(null);

  // Options d'activité, chargées à la demande par activité (accordéon)
  const [activiteOuverte, setActiviteOuverte] = useState(null);
  const [optionsParActivite, setOptionsParActivite] = useState({});
  const [chargementOptions, setChargementOptions] = useState({});
  const [erreurOptions, setErreurOptions] = useState({});

  const [optionEnEdition, setOptionEnEdition] = useState(null); // { activite_id, option_activite_id? }
  const [formOption, setFormOption] = useState({ libelle: '', description: '' });
  const [envoiOption, setEnvoiOption] = useState(false);
  const [erreurFormOption, setErreurFormOption] = useState(null);

  /* ---------------------------- Agences ---------------------------- */
  const [agences, setAgences] = useState([]);
  const [chargementAgences, setChargementAgences] = useState(true);
  const [erreurAgences, setErreurAgences] = useState(null);
  const [rechargerAgences, setRechargerAgences] = useState(0);

  const [agenceEnEdition, setAgenceEnEdition] = useState(null); // {} = création, {agence_id,...} = édition
  const [formAgence, setFormAgence] = useState({
    libelle: '',
    localisation: '',
    contact: '',
    latitude: '',
    longitude: '',
  });
  const [envoiAgence, setEnvoiAgence] = useState(false);
  const [erreurFormAgence, setErreurFormAgence] = useState(null);

  /* ---------------------------- Chargements ---------------------------- */

  useEffect(() => {
    let annule = false;
    setChargementActivites(true);
    setErreurActivites(null);
    listerActivites(serviceId)
      .then((liste) => {
        if (!annule) setActivites(liste);
      })
      .catch((err) => {
        if (!annule) setErreurActivites(messageErreur(err, 'Erreur lors du chargement des activités.'));
      })
      .finally(() => {
        if (!annule) setChargementActivites(false);
      });
    return () => {
      annule = true;
    };
  }, [serviceId, rechargerActivites]);

  useEffect(() => {
    let annule = false;
    setChargementAgences(true);
    setErreurAgences(null);
    listerAgences(serviceId)
      .then((liste) => {
        if (!annule) setAgences(liste);
      })
      .catch((err) => {
        if (!annule) setErreurAgences(messageErreur(err, 'Erreur lors du chargement des agences.'));
      })
      .finally(() => {
        if (!annule) setChargementAgences(false);
      });
    return () => {
      annule = true;
    };
  }, [serviceId, rechargerAgences]);

  /* ---------------------------- Activités : CRUD ---------------------------- */

  function ouvrirCreationActivite() {
    setActiviteEnEdition({});
    setFormActivite({ titre: '', public_cible: '', description: '' });
    setErreurFormActivite(null);
  }

  function ouvrirEditionActivite(a) {
    setActiviteEnEdition(a);
    setFormActivite({
      titre: a.titre || '',
      public_cible: a.public_cible || '',
      description: a.description || '',
    });
    setErreurFormActivite(null);
  }

  function fermerFormActivite() {
    if (envoiActivite) return;
    setActiviteEnEdition(null);
    setErreurFormActivite(null);
  }

  function handleFormActiviteChange(e) {
    const { name, value } = e.target;
    setFormActivite((f) => ({ ...f, [name]: value }));
  }

  async function soumettreActivite() {
    setEnvoiActivite(true);
    setErreurFormActivite(null);
    try {
      if (activiteEnEdition?.activite_id) {
        await modifierActivite(activiteEnEdition.activite_id, formActivite);
      } else {
        await creerActivite({ ...formActivite, service_assurance_id: serviceId });
      }
      setActiviteEnEdition(null);
      setRechargerActivites((n) => n + 1);
    } catch (err) {
      setErreurFormActivite(messageErreur(err, "Erreur lors de l'enregistrement de l'activité."));
    } finally {
      setEnvoiActivite(false);
    }
  }

  async function supprimerActiviteHandler(a) {
    if (!window.confirm(`Supprimer l'activité « ${a.titre} » ?`)) return;
    try {
      await supprimerActivite(a.activite_id);
      setRechargerActivites((n) => n + 1);
      if (activiteOuverte === a.activite_id) setActiviteOuverte(null);
    } catch (err) {
      window.alert(
        messageErreur(
          err,
          "Impossible de supprimer cette activité : vérifiez qu'aucune option n'y est encore rattachée."
        )
      );
    }
  }

  /* ---------------------------- Options d'activité : CRUD ---------------------------- */

  function rechargerOptionsActivite(activiteId) {
    listerOptionsActivite(activiteId)
      .then((liste) => setOptionsParActivite((o) => ({ ...o, [activiteId]: liste })))
      .catch((err) => {
        setErreurOptions((e) => ({
          ...e,
          [activiteId]: messageErreur(err, 'Erreur lors du chargement des options.'),
        }));
      });
  }

  function basculerOptions(activiteId) {
    if (activiteOuverte === activiteId) {
      setActiviteOuverte(null);
      return;
    }
    setActiviteOuverte(activiteId);
    if (optionsParActivite[activiteId]) return;
    setChargementOptions((c) => ({ ...c, [activiteId]: true }));
    setErreurOptions((e) => ({ ...e, [activiteId]: null }));
    listerOptionsActivite(activiteId)
      .then((liste) => setOptionsParActivite((o) => ({ ...o, [activiteId]: liste })))
      .catch((err) => {
        setErreurOptions((e) => ({
          ...e,
          [activiteId]: messageErreur(err, 'Erreur lors du chargement des options.'),
        }));
      })
      .finally(() => {
        setChargementOptions((c) => ({ ...c, [activiteId]: false }));
      });
  }

  function ouvrirCreationOption(activiteId) {
    setOptionEnEdition({ activite_id: activiteId });
    setFormOption({ libelle: '', description: '' });
    setErreurFormOption(null);
  }

  function ouvrirEditionOption(activiteId, o) {
    setOptionEnEdition({ activite_id: activiteId, option_activite_id: o.option_activite_id });
    setFormOption({ libelle: o.libelle || '', description: o.description || '' });
    setErreurFormOption(null);
  }

  function fermerFormOption() {
    if (envoiOption) return;
    setOptionEnEdition(null);
    setErreurFormOption(null);
  }

  function handleFormOptionChange(e) {
    const { name, value } = e.target;
    setFormOption((f) => ({ ...f, [name]: value }));
  }

  async function soumettreOption() {
    setEnvoiOption(true);
    setErreurFormOption(null);
    try {
      if (optionEnEdition.option_activite_id) {
        await modifierOptionActivite(optionEnEdition.option_activite_id, formOption);
      } else {
        await creerOptionActivite({ ...formOption, activite_id: optionEnEdition.activite_id });
      }
      const activiteId = optionEnEdition.activite_id;
      setOptionEnEdition(null);
      rechargerOptionsActivite(activiteId);
    } catch (err) {
      setErreurFormOption(messageErreur(err, "Erreur lors de l'enregistrement de l'option."));
    } finally {
      setEnvoiOption(false);
    }
  }

  async function supprimerOptionHandler(activiteId, o) {
    if (!window.confirm(`Supprimer l'option « ${o.libelle} » ?`)) return;
    try {
      await supprimerOptionActivite(o.option_activite_id);
      rechargerOptionsActivite(activiteId);
    } catch (err) {
      window.alert(messageErreur(err, "Erreur lors de la suppression de l'option."));
    }
  }

  /* ---------------------------- Agences : CRUD ---------------------------- */

  function ouvrirCreationAgence() {
    setAgenceEnEdition({});
    setFormAgence({ libelle: '', localisation: '', contact: '', latitude: '', longitude: '' });
    setErreurFormAgence(null);
  }

  function ouvrirEditionAgence(a) {
    setAgenceEnEdition(a);
    setFormAgence({
      libelle: a.libelle || '',
      localisation: a.localisation || '',
      contact: a.contact || '',
      latitude: a.latitude ?? a.gps?.latitude ?? '',
      longitude: a.longitude ?? a.gps?.longitude ?? '',
    });
    setErreurFormAgence(null);
  }

  function fermerFormAgence() {
    if (envoiAgence) return;
    setAgenceEnEdition(null);
    setErreurFormAgence(null);
  }

  function handleFormAgenceChange(e) {
    const { name, value } = e.target;
    setFormAgence((f) => ({ ...f, [name]: value }));
  }

  async function soumettreAgence() {
    setEnvoiAgence(true);
    setErreurFormAgence(null);
    try {
      if (agenceEnEdition?.agence_id) {
        await modifierAgence(agenceEnEdition.agence_id, formAgence);
      } else {
        await creerAgence({ ...formAgence, service_assurance_id: serviceId });
      }
      setAgenceEnEdition(null);
      setRechargerAgences((n) => n + 1);
    } catch (err) {
      setErreurFormAgence(messageErreur(err, "Erreur lors de l'enregistrement de l'agence."));
    } finally {
      setEnvoiAgence(false);
    }
  }

  async function supprimerAgenceHandler(a) {
    if (!window.confirm(`Supprimer l'agence « ${a.libelle} » ?`)) return;
    try {
      await supprimerAgence(a.agence_id);
      setRechargerAgences((n) => n + 1);
    } catch (err) {
      window.alert(messageErreur(err, "Erreur lors de la suppression de l'agence."));
    }
  }

  /* ---------------------------- Rendu ---------------------------- */

  return (
    <>
      <Modal
        id="modalConfigurationAssurance"
        large
        title={`Configurer « ${service.nom} »`}
        isOpen
        onClose={onFermer}
      >
        <ul className="nav nav-tabs mb-3">
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link${onglet === 'activites' ? ' active' : ''}`}
              onClick={() => setOnglet('activites')}
            >
              Activités{activites.length ? ` (${activites.length})` : ''}
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link${onglet === 'agences' ? ' active' : ''}`}
              onClick={() => setOnglet('agences')}
            >
              Agences{agences.length ? ` (${agences.length})` : ''}
            </button>
          </li>
        </ul>

        {/* ---------------------------- Onglet Activités ---------------------------- */}
        {onglet === 'activites' && (
          <div>
            <div className="d-flex align-items-center justify-content-between mb-3">
              <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
                Catalogue des activités proposées par ce service et de leurs options.
              </p>
              <button type="button" className="btn btn-sm btn-primary" onClick={ouvrirCreationActivite}>
                <i className="fa-solid fa-plus me-1"></i>Nouvelle activité
              </button>
            </div>

            {chargementActivites && (
              <div className="text-center py-4">
                <i className="fa-solid fa-spinner fa-spin"></i>
              </div>
            )}

            {!chargementActivites && erreurActivites && (
              <div className="aps-notice is-danger mb-3">
                <i className="fa-solid fa-circle-exclamation"></i>
                <div>{erreurActivites}</div>
              </div>
            )}

            {!chargementActivites && !erreurActivites && activites.length === 0 && (
              <div className="text-center aps-text-muted py-4">Aucune activité pour le moment.</div>
            )}

            {!chargementActivites && !erreurActivites && activites.length > 0 && (
              <div className="d-flex flex-column gap-2">
                {activites.map((a) => (
                  <div className="aps-card" key={a.activite_id}>
                    <div className="aps-card__body">
                      <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap">
                        <div>
                          <strong>{a.titre}</strong>
                          {a.public_cible && <span className="aps-text-muted"> — {a.public_cible}</span>}
                          {a.description && (
                            <p className="aps-text-muted mb-0 mt-1" style={{ fontSize: 13 }}>
                              {a.description}
                            </p>
                          )}
                        </div>
                        <div className="d-flex gap-1">
                          <button
                            className="btn btn-sm btn-light"
                            title="Options de l'activité"
                            onClick={() => basculerOptions(a.activite_id)}
                          >
                            <i className={`fa-solid ${activiteOuverte === a.activite_id ? 'fa-chevron-up' : 'fa-list'}`}></i>
                          </button>
                          <button className="btn btn-sm btn-light" title="Modifier" onClick={() => ouvrirEditionActivite(a)}>
                            <i className="fa-solid fa-pen"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-light"
                            title="Supprimer"
                            onClick={() => supprimerActiviteHandler(a)}
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </div>
                      </div>

                      {activiteOuverte === a.activite_id && (
                        <div className="assur-sous-liste mt-3 pt-3">
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <h6 className="mb-0" style={{ fontSize: 13 }}>
                              Options de l'activité
                            </h6>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => ouvrirCreationOption(a.activite_id)}
                            >
                              <i className="fa-solid fa-plus me-1"></i>Option
                            </button>
                          </div>

                          {chargementOptions[a.activite_id] && (
                            <div className="text-center py-3">
                              <i className="fa-solid fa-spinner fa-spin"></i>
                            </div>
                          )}

                          {erreurOptions[a.activite_id] && (
                            <div className="aps-notice is-danger mb-2">
                              <i className="fa-solid fa-circle-exclamation"></i>
                              <div>{erreurOptions[a.activite_id]}</div>
                            </div>
                          )}

                          {!chargementOptions[a.activite_id] &&
                            !erreurOptions[a.activite_id] &&
                            (optionsParActivite[a.activite_id]?.length ?? 0) === 0 && (
                              <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
                                Aucune option pour cette activité.
                              </p>
                            )}

                          {(optionsParActivite[a.activite_id]?.length ?? 0) > 0 && (
                            <div className="d-flex flex-column gap-2">
                              {optionsParActivite[a.activite_id].map((o) => (
                                <div className="assur-option-item" key={o.option_activite_id}>
                                  <div>
                                    <strong style={{ fontSize: 13 }}>{o.libelle}</strong>
                                    {o.description && (
                                      <p className="aps-text-muted mb-0" style={{ fontSize: 12 }}>
                                        {o.description}
                                      </p>
                                    )}
                                  </div>
                                  <div className="d-flex gap-1">
                                    <button
                                      className="btn btn-sm btn-light"
                                      title="Modifier"
                                      onClick={() => ouvrirEditionOption(a.activite_id, o)}
                                    >
                                      <i className="fa-solid fa-pen"></i>
                                    </button>
                                    <button
                                      className="btn btn-sm btn-light"
                                      title="Supprimer"
                                      onClick={() => supprimerOptionHandler(a.activite_id, o)}
                                    >
                                      <i className="fa-solid fa-trash"></i>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------------------------- Onglet Agences ---------------------------- */}
        {onglet === 'agences' && (
          <div>
            <div className="d-flex align-items-center justify-content-between mb-3">
              <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
                Agences (implantations physiques) rattachées à ce service.
              </p>
              <button type="button" className="btn btn-sm btn-primary" onClick={ouvrirCreationAgence}>
                <i className="fa-solid fa-plus me-1"></i>Nouvelle agence
              </button>
            </div>

            {chargementAgences && (
              <div className="text-center py-4">
                <i className="fa-solid fa-spinner fa-spin"></i>
              </div>
            )}

            {!chargementAgences && erreurAgences && (
              <div className="aps-notice is-danger mb-3">
                <i className="fa-solid fa-circle-exclamation"></i>
                <div>{erreurAgences}</div>
              </div>
            )}

            {!chargementAgences && !erreurAgences && agences.length === 0 && (
              <div className="text-center aps-text-muted py-4">Aucune agence pour le moment.</div>
            )}

            {!chargementAgences && !erreurAgences && agences.length > 0 && (
              <div className="d-flex flex-column gap-2">
                {agences.map((a) => (
                  <div className="aps-card" key={a.agence_id}>
                    <div className="aps-card__body d-flex align-items-start justify-content-between gap-2 flex-wrap">
                      <div>
                        <strong>{a.libelle}</strong>
                        <p className="aps-text-muted mb-0 mt-1" style={{ fontSize: 13 }}>
                          {a.localisation}
                        </p>
                        {a.contact && (
                          <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
                            <i className="fa-solid fa-phone me-1"></i>
                            {a.contact}
                          </p>
                        )}
                        {(a.latitude ?? a.gps?.latitude) != null && (
                          <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
                            <i className="fa-solid fa-location-dot me-1"></i>
                            {a.latitude ?? a.gps?.latitude}, {a.longitude ?? a.gps?.longitude}
                          </p>
                        )}
                      </div>
                      <div className="d-flex gap-1">
                        <button className="btn btn-sm btn-light" title="Modifier" onClick={() => ouvrirEditionAgence(a)}>
                          <i className="fa-solid fa-pen"></i>
                        </button>
                        <button
                          className="btn btn-sm btn-light"
                          title="Supprimer"
                          onClick={() => supprimerAgenceHandler(a)}
                        >
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ---------------------------- Sous-modale : formulaire activité ---------------------------- */}
      <Modal
        id="modalFormActivite"
        title={activiteEnEdition?.activite_id ? "Modifier l'activité" : 'Nouvelle activité'}
        isOpen={!!activiteEnEdition}
        onClose={fermerFormActivite}
        footer={
          <>
            <button className="btn btn-light" onClick={fermerFormActivite} disabled={envoiActivite}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={soumettreActivite} disabled={envoiActivite}>
              {envoiActivite ? 'Enregistrement…' : activiteEnEdition?.activite_id ? 'Enregistrer' : 'Créer'}
            </button>
          </>
        }
      >
        {erreurFormActivite && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div>{erreurFormActivite}</div>
          </div>
        )}
        <div className="mb-3">
          <label className="form-label">
            Titre <span className="text-danger">*</span>
          </label>
          <input
            className="form-control"
            type="text"
            name="titre"
            value={formActivite.titre}
            onChange={handleFormActiviteChange}
            required
          />
        </div>
        <div className="mb-3">
          <label className="form-label">Public cible</label>
          <input
            className="form-control"
            type="text"
            name="public_cible"
            value={formActivite.public_cible}
            onChange={handleFormActiviteChange}
            placeholder="Optionnel"
          />
        </div>
        <div className="mb-1">
          <label className="form-label">Description</label>
          <textarea
            className="form-control"
            name="description"
            rows={3}
            value={formActivite.description}
            onChange={handleFormActiviteChange}
            placeholder="Optionnel"
          ></textarea>
        </div>
      </Modal>

      {/* ---------------------------- Sous-modale : formulaire option ---------------------------- */}
      <Modal
        id="modalFormOption"
        title={optionEnEdition?.option_activite_id ? "Modifier l'option" : 'Nouvelle option'}
        isOpen={!!optionEnEdition}
        onClose={fermerFormOption}
        footer={
          <>
            <button className="btn btn-light" onClick={fermerFormOption} disabled={envoiOption}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={soumettreOption} disabled={envoiOption}>
              {envoiOption ? 'Enregistrement…' : optionEnEdition?.option_activite_id ? 'Enregistrer' : 'Créer'}
            </button>
          </>
        }
      >
        {erreurFormOption && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div>{erreurFormOption}</div>
          </div>
        )}
        <div className="mb-3">
          <label className="form-label">
            Libellé <span className="text-danger">*</span>
          </label>
          <input
            className="form-control"
            type="text"
            name="libelle"
            value={formOption.libelle}
            onChange={handleFormOptionChange}
            required
          />
        </div>
        <div className="mb-1">
          <label className="form-label">Description</label>
          <textarea
            className="form-control"
            name="description"
            rows={3}
            value={formOption.description}
            onChange={handleFormOptionChange}
            placeholder="Optionnel"
          ></textarea>
        </div>
      </Modal>

      {/* ---------------------------- Sous-modale : formulaire agence ---------------------------- */}
      <Modal
        id="modalFormAgence"
        title={agenceEnEdition?.agence_id ? "Modifier l'agence" : 'Nouvelle agence'}
        isOpen={!!agenceEnEdition}
        onClose={fermerFormAgence}
        footer={
          <>
            <button className="btn btn-light" onClick={fermerFormAgence} disabled={envoiAgence}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={soumettreAgence} disabled={envoiAgence}>
              {envoiAgence ? 'Enregistrement…' : agenceEnEdition?.agence_id ? 'Enregistrer' : 'Créer'}
            </button>
          </>
        }
      >
        {erreurFormAgence && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div>{erreurFormAgence}</div>
          </div>
        )}
        <div className="mb-3">
          <label className="form-label">
            Libellé <span className="text-danger">*</span>
          </label>
          <input
            className="form-control"
            type="text"
            name="libelle"
            value={formAgence.libelle}
            onChange={handleFormAgenceChange}
            required
          />
        </div>
        <div className="mb-3">
          <label className="form-label">
            Localisation <span className="text-danger">*</span>
          </label>
          <input
            className="form-control"
            type="text"
            name="localisation"
            value={formAgence.localisation}
            onChange={handleFormAgenceChange}
            required
          />
        </div>
        <div className="mb-3">
          <label className="form-label">
            Contact <span className="text-danger">*</span>
          </label>
          <input
            className="form-control"
            type="text"
            name="contact"
            value={formAgence.contact}
            onChange={handleFormAgenceChange}
            required
          />
        </div>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Latitude</label>
            <input
              className="form-control"
              type="text"
              name="latitude"
              value={formAgence.latitude}
              onChange={handleFormAgenceChange}
              placeholder="Optionnel"
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">Longitude</label>
            <input
              className="form-control"
              type="text"
              name="longitude"
              value={formAgence.longitude}
              onChange={handleFormAgenceChange}
              placeholder="Optionnel"
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

/* ===================================================================
 * Composant principal
 * =================================================================== */

export default function Assurances() {
  const { user, isAuthenticated, status } = useAuth();
  // `status === 'loading'` le temps que AuthContext restaure la session
  // (montage / rechargement de page) : on traite ça comme "pas encore
  // connecté" pour l'affichage plutôt que de rediriger ou de figer l'UI —
  // isAuthenticated repasse à true tout seul dès que la session est
  // confirmée, ce qui réaffiche alors les actions réservées aux connectés.
  const estConnecte = isAuthenticated;
  const chargementSession = status === 'loading';
  const role = extraireRole(user);
  const estAdmin = role === 'admin' || role === 'superadmin';
  const estSuperadmin = role === 'superadmin';

  // Liste + filtres
  const [services, setServices] = useState([]);
  const [chargementListe, setChargementListe] = useState(true);
  const [erreurListe, setErreurListe] = useState(null);
  const [recharger, setRecharger] = useState(0);
  const [filtres, setFiltres] = useState({
    pays_id: '',
    ville_id: '',
    type_acteur: '',
    statut_verification: '',
    recherche: '',
  });

  // Référentiels géographiques
  const [paysListe, setPaysListe] = useState([]);
  const [villesFiltre, setVillesFiltre] = useState([]);
  const [villesFormulaire, setVillesFormulaire] = useState([]);

  // Fiche détail
  const [detailOuvert, setDetailOuvert] = useState(false);
  const [serviceDetail, setServiceDetail] = useState(null);
  const [chargementDetail, setChargementDetail] = useState(false);
  const [erreurDetail, setErreurDetail] = useState(null);

  // Formulaire création / édition
  const [formOuvert, setFormOuvert] = useState(false);
  const [modeForm, setModeForm] = useState('creation'); // 'creation' | 'edition'
  const [serviceEnEdition, setServiceEnEdition] = useState(null);
  const [formDonnees, setFormDonnees] = useState(donneesFormulaireVides());
  const [formImageApercu, setFormImageApercu] = useState(null);
  const [formEnvoi, setFormEnvoi] = useState(false);
  const [formErreur, setFormErreur] = useState(null);

  // Suppression
  const [suppressionCible, setSuppressionCible] = useState(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [suppressionErreur, setSuppressionErreur] = useState(null);

  // Compte agent créé (mot de passe temporaire affiché une seule fois)
  const [agentCree, setAgentCree] = useState(null);
  const [motDePasseCopie, setMotDePasseCopie] = useState(false);

  // Configuration (activités / options / agences) d'un service
  const [configurationCible, setConfigurationCible] = useState(null);

  // Mises en relation (panneau dans la fiche détail)
  const [misesEnRelation, setMisesEnRelation] = useState([]);
  const [misesChargees, setMisesChargees] = useState(false);
  const [chargementMises, setChargementMises] = useState(false);
  const [erreurMises, setErreurMises] = useState(null);
  const [nouveauMessage, setNouveauMessage] = useState('');
  const [envoiMessage, setEnvoiMessage] = useState(false);
  const [erreurEnvoiMessage, setErreurEnvoiMessage] = useState(null);
  const [succesEnvoiMessage, setSuccesEnvoiMessage] = useState(false);

  /* ---------------------------- Chargements ---------------------------- */

  useEffect(() => {
    listerPays()
      .then(setPaysListe)
      .catch(() => setPaysListe([]));
  }, []);

  useEffect(() => {
    if (!filtres.pays_id) {
      setVillesFiltre([]);
      return undefined;
    }
    let annule = false;
    listerVilles(filtres.pays_id)
      .then((v) => {
        if (!annule) setVillesFiltre(v);
      })
      .catch(() => {
        if (!annule) setVillesFiltre([]);
      });
    return () => {
      annule = true;
    };
  }, [filtres.pays_id]);

  useEffect(() => {
    if (!formDonnees.pays_id) {
      setVillesFormulaire([]);
      return undefined;
    }
    let annule = false;
    listerVilles(formDonnees.pays_id)
      .then((v) => {
        if (!annule) setVillesFormulaire(v);
      })
      .catch(() => {
        if (!annule) setVillesFormulaire([]);
      });
    return () => {
      annule = true;
    };
  }, [formDonnees.pays_id]);

  useEffect(() => {
    let annule = false;
    setChargementListe(true);
    setErreurListe(null);
    const minuteur = setTimeout(() => {
      listerServicesAssurance(filtres)
        .then((liste) => {
          if (!annule) setServices(liste);
        })
        .catch((err) => {
          if (!annule) setErreurListe(messageErreur(err, 'Erreur lors du chargement des services.'));
        })
        .finally(() => {
          if (!annule) setChargementListe(false);
        });
    }, 300);
    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
  }, [filtres, recharger]);

  useEffect(() => {
    return () => {
      if (formImageApercu && formImageApercu.startsWith('blob:')) {
        URL.revokeObjectURL(formImageApercu);
      }
    };
  }, [formImageApercu]);

  // Compteurs pour les KPI d'en-tête — calculés depuis les services
  // réellement chargés (le service ne renvoie pas de compteur global).
  const compteurs = services.reduce(
    (acc, s) => {
      acc.total += 1;
      if (s.statut_verification === 'publie') acc.publies += 1;
      else if (s.statut_verification === 'en_cours') acc.enCours += 1;
      else if (s.statut_verification === 'non_publie') acc.nonPublies += 1;
      return acc;
    },
    { total: 0, publies: 0, enCours: 0, nonPublies: 0 }
  );

  /* ---------------------------- Filtres ---------------------------- */

  function handleFiltreChange(e) {
    const { name, value } = e.target;
    setFiltres((f) => {
      const suivant = { ...f, [name]: value };
      if (name === 'pays_id') suivant.ville_id = '';
      return suivant;
    });
  }

  function reinitialiserFiltres() {
    setFiltres({ pays_id: '', ville_id: '', type_acteur: '', statut_verification: '', recherche: '' });
  }

  /* ---------------------------- Fiche détail ---------------------------- */

  async function ouvrirDetail(id) {
    setDetailOuvert(true);
    setChargementDetail(true);
    setErreurDetail(null);
    setServiceDetail(null);
    setMisesEnRelation([]);
    setMisesChargees(false);
    setErreurMises(null);
    setNouveauMessage('');
    setSuccesEnvoiMessage(false);
    setErreurEnvoiMessage(null);
    try {
      const service = await obtenirServiceAssurance(id);
      setServiceDetail(service);
    } catch (err) {
      setErreurDetail(messageErreur(err, 'Impossible de charger cette fiche.'));
    } finally {
      setChargementDetail(false);
    }
  }

  function fermerDetail() {
    setDetailOuvert(false);
    setServiceDetail(null);
  }

  /* ---------------------------- Formulaire ---------------------------- */

  function ouvrirCreation() {
    setModeForm('creation');
    setServiceEnEdition(null);
    setFormDonnees(donneesFormulaireVides());
    setFormImageApercu(null);
    setFormErreur(null);
    setFormOuvert(true);
  }

  function ouvrirEdition(service) {
    setModeForm('edition');
    setServiceEnEdition(service);
    setFormDonnees({
      nom: service.nom || '',
      type_acteur: service.type_acteur || '',
      pays_id: service.pays_id || service.pays?.pays_id || '',
      ville_id: service.ville_id || service.ville?.ville_id || '',
      telephone: service.telephone || '',
      email: service.email || '',
      agrement: service.agrement || '',
      description: service.description || '',
      statut_verification: service.statut_verification || 'en_cours',
      latitude: service.latitude ?? service.geolocalisation?.latitude ?? '',
      longitude: service.longitude ?? service.geolocalisation?.longitude ?? '',
      image_assurance: null,
      fonction: '',
      agent_nom: '',
      agent_prenom: '',
      agent_email: '',
      agent_telephone: '',
    });
    setFormImageApercu(service.image_url || null);
    setFormErreur(null);
    setFormOuvert(true);
  }

  function fermerForm() {
    if (formEnvoi) return;
    setFormOuvert(false);
    setServiceEnEdition(null);
    setFormErreur(null);
  }

  function handleFormChange(e) {
    const { name, value } = e.target;
    setFormDonnees((d) => {
      const suivant = { ...d, [name]: value };
      if (name === 'pays_id') suivant.ville_id = '';
      return suivant;
    });
  }

  function handleFormFichier(e) {
    const fichier = e.target.files && e.target.files[0];
    if (!fichier) return;
    setFormDonnees((d) => ({ ...d, image_assurance: fichier }));
    setFormImageApercu(URL.createObjectURL(fichier));
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    setFormEnvoi(true);
    setFormErreur(null);
    try {
      if (modeForm === 'creation') {
        const reponse = await creerServiceAssurance(formDonnees);
        setFormOuvert(false);
        setAgentCree(reponse?.agent || null);
        setRecharger((n) => n + 1);
      } else {
        const maj = await modifierServiceAssurance(serviceEnEdition.service_assurance_id, formDonnees);
        setFormOuvert(false);
        setRecharger((n) => n + 1);
        if (detailOuvert && serviceDetail?.service_assurance_id === maj?.service_assurance_id) {
          setServiceDetail(maj);
        }
      }
    } catch (err) {
      setFormErreur(messageErreur(err, "Une erreur est survenue lors de l'enregistrement."));
    } finally {
      setFormEnvoi(false);
    }
  }

  /* ---------------------------- Configuration ---------------------------- */

  function ouvrirConfiguration(service) {
    setConfigurationCible(service);
  }

  function fermerConfiguration() {
    setConfigurationCible(null);
  }

  /* ---------------------------- Suppression ---------------------------- */

  function demanderSuppression(service) {
    setSuppressionCible(service);
    setSuppressionErreur(null);
  }

  function annulerSuppression() {
    if (suppressionEnCours) return;
    setSuppressionCible(null);
    setSuppressionErreur(null);
  }

  async function confirmerSuppression() {
    if (!suppressionCible) return;
    setSuppressionEnCours(true);
    setSuppressionErreur(null);
    try {
      const idSupprime = suppressionCible.service_assurance_id;
      await supprimerServiceAssurance(idSupprime);
      setSuppressionCible(null);
      setRecharger((n) => n + 1);
      if (detailOuvert && serviceDetail?.service_assurance_id === idSupprime) {
        fermerDetail();
      }
    } catch (err) {
      setSuppressionErreur(messageErreur(err, 'Impossible de supprimer ce service.'));
    } finally {
      setSuppressionEnCours(false);
    }
  }

  /* ---------------------------- Agent créé ---------------------------- */

  function copierMotDePasse() {
    if (!agentCree?.mot_de_passe_temporaire || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(agentCree.mot_de_passe_temporaire)
      .then(() => {
        setMotDePasseCopie(true);
        setTimeout(() => setMotDePasseCopie(false), 2000);
      })
      .catch(() => {});
  }

  /* ---------------------------- Mises en relation ---------------------------- */

  async function chargerMises() {
    if (!serviceDetail) return;
    setChargementMises(true);
    setErreurMises(null);
    try {
      const liste = await listerMisesEnRelationAssurance(serviceDetail.service_assurance_id);
      setMisesEnRelation(liste);
      setMisesChargees(true);
    } catch (err) {
      setMisesChargees(true);
      setErreurMises(
        err?.status === 403
          ? "Réservé à l'agent en charge de ce service ou à un administrateur."
          : messageErreur(err, 'Erreur lors du chargement des demandes.')
      );
    } finally {
      setChargementMises(false);
    }
  }

  async function envoyerMessage(e) {
    e.preventDefault();
    if (!nouveauMessage.trim()) {
      setErreurEnvoiMessage('Le message ne peut pas être vide.');
      return;
    }
    setEnvoiMessage(true);
    setErreurEnvoiMessage(null);
    try {
      await creerMiseEnRelationAssurance({
        service_assurance_id: serviceDetail.service_assurance_id,
        message: nouveauMessage.trim(),
      });
      setNouveauMessage('');
      setSuccesEnvoiMessage(true);
      setTimeout(() => setSuccesEnvoiMessage(false), 4000);
      if (misesChargees) chargerMises();
    } catch (err) {
      setErreurEnvoiMessage(messageErreur(err, "Erreur lors de l'envoi de la demande."));
    } finally {
      setEnvoiMessage(false);
    }
  }

  async function supprimerMise(id) {
    if (!window.confirm('Supprimer cette mise en relation ?')) return;
    try {
      await supprimerMiseEnRelationAssurance(id);
      setMisesEnRelation((liste) => liste.filter((m) => m.mise_en_relation_id !== id));
    } catch (err) {
      window.alert(messageErreur(err, 'Erreur lors de la suppression.'));
    }
  }

  /* ---------------------------- Rendu ---------------------------- */

  return (
    <>
      <main className="aps-content assur-page">
        {/* ===================== EN-TÊTE DE PAGE ===================== */}
        <div className="aps-page-header">
          <div>
            <nav className="aps-breadcrumb">
              <a href="dashboard.html">Tableau de bord</a>
              <span className="sep">/</span>
              <span>Annuaire &amp; Utilisateurs</span>
              <span className="sep">/</span>
              <span>Assurances</span>
            </nav>
            <h1>Annuaire des assurances</h1>
            <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
              Compagnies et courtiers d'assurance référencés dans l'annuaire.
            </p>
          </div>
          {estConnecte && (
            <button type="button" className="btn btn-primary" onClick={ouvrirCreation}>
              <i className="fa-solid fa-plus me-1"></i> Nouveau service
            </button>
          )}
        </div>

        {/* ===================== KPI ===================== */}
        <div className="row g-3 mb-4">
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-primary">
                  <i className="fa-solid fa-shield-halved"></i>
                </div>
              </div>
              <div className="aps-kpi__label">Total</div>
              <div className="aps-kpi__value">{compteurs.total.toLocaleString('fr-FR')}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-success">
                  <i className="fa-solid fa-circle-check"></i>
                </div>
              </div>
              <div className="aps-kpi__label">Publiés</div>
              <div className="aps-kpi__value">{compteurs.publies.toLocaleString('fr-FR')}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-warning">
                  <i className="fa-solid fa-hourglass-half"></i>
                </div>
              </div>
              <div className="aps-kpi__label">En cours de vérification</div>
              <div className="aps-kpi__value">{compteurs.enCours.toLocaleString('fr-FR')}</div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-danger">
                  <i className="fa-solid fa-circle-xmark"></i>
                </div>
              </div>
              <div className="aps-kpi__label">Non publiés</div>
              <div className="aps-kpi__value">{compteurs.nonPublies.toLocaleString('fr-FR')}</div>
            </div>
          </div>
        </div>

        {/* ===================== FILTRES ===================== */}
        <div className="aps-card mb-3">
          <div className="aps-card__body">
            <div className="row g-3 align-items-end">
              <div className="col-md-3">
                <label className="form-label">Recherche</label>
                <div className="aps-search">
                  <i className="fa-solid fa-magnifying-glass"></i>
                  <input
                    type="text"
                    name="recherche"
                    placeholder="Nom du service…"
                    value={filtres.recherche}
                    onChange={handleFiltreChange}
                  />
                </div>
              </div>
              <div className="col-md-2">
                <label className="form-label">Pays</label>
                <select className="form-select" name="pays_id" value={filtres.pays_id} onChange={handleFiltreChange}>
                  <option value="">Tous les pays</option>
                  {paysListe.map((p) => (
                    <option key={p.pays_id} value={p.pays_id}>
                      {p.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label">Ville</label>
                <select
                  className="form-select"
                  name="ville_id"
                  value={filtres.ville_id}
                  onChange={handleFiltreChange}
                  disabled={!filtres.pays_id}
                >
                  <option value="">Toutes les villes</option>
                  {villesFiltre.map((v) => (
                    <option key={v.ville_id} value={v.ville_id}>
                      {v.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label">Type d'acteur</label>
                <select
                  className="form-select"
                  name="type_acteur"
                  value={filtres.type_acteur}
                  onChange={handleFiltreChange}
                >
                  <option value="">Tous les types</option>
                  {TYPES_ACTEUR_ASSURANCE.map((t) => (
                    <option key={t.valeur} value={t.valeur}>
                      {t.libelle}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label">Statut</label>
                <select
                  className="form-select"
                  name="statut_verification"
                  value={filtres.statut_verification}
                  onChange={handleFiltreChange}
                >
                  <option value="">Tous les statuts</option>
                  {STATUTS_VERIFICATION_ASSURANCE.map((s) => (
                    <option key={s.valeur} value={s.valeur}>
                      {s.libelle}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-1">
                <button
                  type="button"
                  className="btn btn-light w-100"
                  title="Réinitialiser les filtres"
                  onClick={reinitialiserFiltres}
                >
                  <i className="fa-solid fa-rotate-left"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        {erreurListe && (
          <div className="aps-notice is-danger mb-3">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div className="flex-grow-1">{erreurListe}</div>
            <button className="btn btn-sm btn-light" onClick={() => setRecharger((n) => n + 1)}>
              <i className="fa-solid fa-rotate-right me-1"></i>Réessayer
            </button>
          </div>
        )}

        {/* ===================== LISTE — CARTES ===================== */}
        {chargementListe ? (
          <div className="aps-card">
            <div className="aps-card__body text-center py-5">
              <i className="fa-solid fa-spinner fa-spin"></i>
            </div>
          </div>
        ) : !erreurListe && services.length === 0 ? (
          <div className="aps-card">
            <div className="aps-card__body text-center aps-text-muted py-5">
              Aucun service d'assurance ne correspond à ces critères.
            </div>
          </div>
        ) : (
          <div className="row g-3">
            {services.map((service) => {
              const statut = STATUT_META[service.statut_verification] || {};
              return (
                <div className="col-md-6 col-xl-4" key={service.service_assurance_id}>
                  <div className="card h-100 shadow-sm">
                    <img
                      src={service.image_url}
                      className="card-img-top"
                      alt={service.nom}
                      style={{ height: 150, objectFit: 'cover', background: 'var(--aps-bg)' }}
                    />
                    <div className="card-body d-flex flex-column">
                      <div className="d-flex align-items-start justify-content-between mb-1 gap-2">
                        <h5 className="card-title mb-0" style={{ fontSize: 16 }}>
                          {service.nom}
                        </h5>
                        <span className={`aps-badge ${statut.badge || 'is-info'}`}>
                          <i className="fa-solid fa-circle"></i> {libelleStatut(service.statut_verification)}
                        </span>
                      </div>
                      <p className="card-text aps-text-muted mb-2" style={{ fontSize: 13 }}>
                        <i className={`fa-solid ${TYPE_META[service.type_acteur]?.icone || 'fa-building'} me-1`}></i>
                        {libelleType(service.type_acteur)}
                      </p>
                      <p className="card-text aps-text-muted mb-2" style={{ fontSize: 13 }}>
                        <i className="fa-solid fa-location-dot me-1"></i>
                        {service.ville?.nom || '—'}
                        {service.ville?.nom && service.pays?.nom ? ', ' : ''}
                        {service.pays?.nom || ''}
                      </p>
                      <p className="card-text mb-3" style={{ fontSize: 13 }}>
                        <i className="fa-solid fa-phone me-1"></i>
                        {service.telephone || '—'}
                      </p>

                      <div className="d-flex flex-wrap gap-2 mt-auto pt-2" style={{ borderTop: '1px solid var(--aps-border)' }}>
                        <button
                          className="btn btn-sm btn-primary flex-grow-1"
                          onClick={() => ouvrirDetail(service.service_assurance_id)}
                        >
                          <i className="fa-solid fa-eye me-1"></i> Voir la fiche
                        </button>
                        {estConnecte && (
                          <>
                            <button className="btn btn-sm btn-light" title="Modifier" onClick={() => ouvrirEdition(service)}>
                              <i className="fa-solid fa-pen"></i>
                            </button>
                            <button
                              className="btn btn-sm btn-light"
                              title="Configurer (activités / agences)"
                              onClick={() => ouvrirConfiguration(service)}
                            >
                              <i className="fa-solid fa-gear"></i>
                            </button>
                          </>
                        )}
                        {estSuperadmin && (
                          <button
                            className="btn btn-sm btn-light"
                            title="Supprimer"
                            onClick={() => demanderSuppression(service)}
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ===================== MODAL FICHE DÉTAIL ===================== */}
      <Modal id="modalDetailAssurance" large title="Fiche du service d'assurance" isOpen={detailOuvert} onClose={fermerDetail}>
        {chargementDetail && (
          <div className="text-center py-5">
            <i className="fa-solid fa-spinner fa-spin"></i>
          </div>
        )}

        {!chargementDetail && erreurDetail && (
          <div className="aps-notice is-danger">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div>{erreurDetail}</div>
          </div>
        )}

        {!chargementDetail && !erreurDetail && serviceDetail && (
          <>
            <div className="d-flex align-items-center gap-3 mb-3">
              {serviceDetail.image_url ? (
                <img
                  src={serviceDetail.image_url}
                  alt={serviceDetail.nom}
                  style={{ width: 84, height: 84, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div
                  className="aps-kpi__icon is-primary"
                  style={{ width: 84, height: 84, borderRadius: 10, fontSize: 30, flexShrink: 0 }}
                >
                  <i className="fa-solid fa-shield-halved"></i>
                </div>
              )}
              <div>
                <h5 className="mb-1">{serviceDetail.nom}</h5>
                <div className="d-flex gap-2 flex-wrap">
                  <span className="aps-badge is-neutral">
                    <i className={`fa-solid ${TYPE_META[serviceDetail.type_acteur]?.icone || 'fa-building'}`}></i>{' '}
                    {libelleType(serviceDetail.type_acteur)}
                  </span>
                  <span className={`aps-badge ${STATUT_META[serviceDetail.statut_verification]?.badge || 'is-info'}`}>
                    <i className={`fa-solid ${STATUT_META[serviceDetail.statut_verification]?.icone || 'fa-circle'}`}></i>{' '}
                    {libelleStatut(serviceDetail.statut_verification)}
                  </span>
                </div>
              </div>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <label className="form-label">Téléphone</label>
                <div className="form-control-plaintext" style={{ fontSize: 14 }}>
                  {serviceDetail.telephone || '—'}
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Email</label>
                <div className="form-control-plaintext" style={{ fontSize: 14 }}>
                  {serviceDetail.email || '—'}
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">N° d'agrément</label>
                <div className="form-control-plaintext" style={{ fontSize: 14 }}>
                  {serviceDetail.agrement || '—'}
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Localisation</label>
                <div className="form-control-plaintext" style={{ fontSize: 14 }}>
                  {serviceDetail.ville?.nom || '—'}
                  {serviceDetail.ville?.nom && serviceDetail.pays?.nom ? ', ' : ''}
                  {serviceDetail.pays?.nom || ''}
                  {(serviceDetail.latitude ?? serviceDetail.geolocalisation?.latitude) != null && (
                    <span className="aps-text-muted">
                      {' '}
                      ({serviceDetail.latitude ?? serviceDetail.geolocalisation?.latitude},{' '}
                      {serviceDetail.longitude ?? serviceDetail.geolocalisation?.longitude})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {serviceDetail.description && (
              <div className="mb-3">
                <label className="form-label">Description</label>
                <div className="aps-card" style={{ padding: 12, fontSize: 14, lineHeight: 1.6 }}>
                  {serviceDetail.description}
                </div>
              </div>
            )}

            <div className="d-flex gap-2 flex-wrap mb-4">
              <button className="btn btn-light" onClick={() => ouvrirEdition(serviceDetail)}>
                <i className="fa-solid fa-pen me-1"></i>Modifier
              </button>
              <button className="btn btn-light" onClick={() => ouvrirConfiguration(serviceDetail)}>
                <i className="fa-solid fa-gear me-1"></i>Configurer
              </button>
              {estSuperadmin && (
                <button className="btn btn-outline-danger" onClick={() => demanderSuppression(serviceDetail)}>
                  <i className="fa-solid fa-trash me-1"></i>Supprimer
                </button>
              )}
            </div>

            <div className="mb-4">
              <h6 className="mb-2">Demander une mise en relation</h6>
              {!estConnecte && !chargementSession && (
                <p className="aps-text-muted" style={{ fontSize: 13 }}>
                  Connectez-vous pour contacter ce service.
                </p>
              )}
              {estConnecte && (
                <form onSubmit={envoyerMessage}>
                  <textarea
                    className="form-control mb-2"
                    rows={3}
                    placeholder="Votre message…"
                    value={nouveauMessage}
                    onChange={(e) => setNouveauMessage(e.target.value)}
                    required
                  ></textarea>
                  {erreurEnvoiMessage && (
                    <div className="aps-notice is-danger mb-2">
                      <i className="fa-solid fa-circle-exclamation"></i>
                      <div>{erreurEnvoiMessage}</div>
                    </div>
                  )}
                  {succesEnvoiMessage && (
                    <div className="aps-notice is-success mb-2">
                      <i className="fa-solid fa-circle-check"></i>
                      <div>Votre demande a été envoyée.</div>
                    </div>
                  )}
                  <button type="submit" className="btn btn-primary" disabled={envoiMessage}>
                    {envoiMessage ? 'Envoi…' : 'Envoyer la demande'}
                  </button>
                </form>
              )}
            </div>

            <div>
              <h6 className="mb-1">Mises en relation reçues</h6>
              <p className="aps-text-muted mb-2" style={{ fontSize: 13 }}>
                Réservé à l'agent en charge de ce service ou à un administrateur.
              </p>
              {!misesChargees && (
                <button className="btn btn-sm btn-light" onClick={chargerMises} disabled={chargementMises}>
                  {chargementMises ? 'Chargement…' : 'Charger les demandes'}
                </button>
              )}
              {chargementMises && misesChargees && (
                <div className="text-center py-3">
                  <i className="fa-solid fa-spinner fa-spin"></i>
                </div>
              )}
              {erreurMises && (
                <div className="aps-notice is-danger mt-2">
                  <i className="fa-solid fa-circle-exclamation"></i>
                  <div>{erreurMises}</div>
                </div>
              )}
              {misesChargees &&
                !erreurMises &&
                !chargementMises &&
                (misesEnRelation.length === 0 ? (
                  <p className="aps-text-muted mt-2" style={{ fontSize: 13 }}>
                    Aucune demande pour le moment.
                  </p>
                ) : (
                  <div className="d-flex flex-column gap-2 mt-2">
                    {misesEnRelation.map((m) => (
                      <div className="assur-mise-item" key={m.mise_en_relation_id}>
                        <div>
                          <strong style={{ fontSize: 13 }}>
                            {m.utilisateur?.prenom} {m.utilisateur?.nom}
                          </strong>
                          <span className="aps-text-muted ms-2" style={{ fontSize: 11 }}>
                            {formaterDate(m.date_creation || m.createdAt)}
                          </span>
                          <p className="mb-0 mt-1" style={{ fontSize: 13 }}>
                            {m.message}
                          </p>
                        </div>
                        <button
                          className="btn btn-sm btn-light"
                          title="Supprimer"
                          onClick={() => supprimerMise(m.mise_en_relation_id)}
                        >
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </>
        )}
      </Modal>

      {/* ===================== MODAL FORMULAIRE (création / édition) ===================== */}
      <Modal
        id="modalFormAssurance"
        large
        title={modeForm === 'creation' ? "Nouveau service d'assurance" : "Modifier le service d'assurance"}
        isOpen={formOuvert}
        onClose={fermerForm}
        footer={
          <>
            <button className="btn btn-light" onClick={fermerForm} disabled={formEnvoi}>
              Annuler
            </button>
            <button type="submit" form="formulaireAssurance" className="btn btn-primary" disabled={formEnvoi}>
              {formEnvoi ? 'Enregistrement…' : modeForm === 'creation' ? 'Créer le service' : 'Enregistrer'}
            </button>
          </>
        }
      >
        <form id="formulaireAssurance" onSubmit={handleFormSubmit}>
          {formErreur && (
            <div className="aps-notice is-danger mb-3">
              <i className="fa-solid fa-circle-exclamation"></i>
              <div>{formErreur}</div>
            </div>
          )}

          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <label className="form-label">
                Nom du service <span className="text-danger">*</span>
              </label>
              <input
                className="form-control"
                type="text"
                name="nom"
                value={formDonnees.nom}
                onChange={handleFormChange}
                required
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">
                Type d'acteur <span className="text-danger">*</span>
              </label>
              <select
                className="form-select"
                name="type_acteur"
                value={formDonnees.type_acteur}
                onChange={handleFormChange}
                required
              >
                <option value="">Sélectionner…</option>
                {TYPES_ACTEUR_ASSURANCE.map((t) => (
                  <option key={t.valeur} value={t.valeur}>
                    {t.libelle}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">
                Pays <span className="text-danger">*</span>
              </label>
              <select
                className="form-select"
                name="pays_id"
                value={formDonnees.pays_id}
                onChange={handleFormChange}
                required
              >
                <option value="">Sélectionner…</option>
                {paysListe.map((p) => (
                  <option key={p.pays_id} value={p.pays_id}>
                    {p.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">
                Ville <span className="text-danger">*</span>
              </label>
              <select
                className="form-select"
                name="ville_id"
                value={formDonnees.ville_id}
                onChange={handleFormChange}
                required
                disabled={!formDonnees.pays_id}
              >
                <option value="">Sélectionner…</option>
                {villesFormulaire.map((v) => (
                  <option key={v.ville_id} value={v.ville_id}>
                    {v.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">
                Téléphone <span className="text-danger">*</span>
              </label>
              <input
                className="form-control"
                type="tel"
                name="telephone"
                value={formDonnees.telephone}
                onChange={handleFormChange}
                required
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">
                Email <span className="text-danger">*</span>
              </label>
              <input
                className="form-control"
                type="email"
                name="email"
                value={formDonnees.email}
                onChange={handleFormChange}
                required
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">
                N° d'agrément <span className="text-danger">*</span>
              </label>
              <input
                className="form-control"
                type="text"
                name="agrement"
                value={formDonnees.agrement}
                onChange={handleFormChange}
                required
              />
            </div>

            {estAdmin ? (
              <div className="col-md-6">
                <label className="form-label">Statut de vérification</label>
                <select
                  className="form-select"
                  name="statut_verification"
                  value={formDonnees.statut_verification}
                  onChange={handleFormChange}
                >
                  {STATUTS_VERIFICATION_ASSURANCE.map((s) => (
                    <option key={s.valeur} value={s.valeur}>
                      {s.libelle}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="col-md-6">
                <div className="aps-notice is-info mb-0">
                  <i className="fa-solid fa-circle-info"></i>
                  <div>La fiche sera placée « En cours de vérification » jusqu'à validation par un administrateur.</div>
                </div>
              </div>
            )}

            <div className="col-md-6">
              <label className="form-label">Latitude</label>
              <input
                className="form-control"
                type="text"
                name="latitude"
                value={formDonnees.latitude}
                onChange={handleFormChange}
                placeholder="Optionnel"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">Longitude</label>
              <input
                className="form-control"
                type="text"
                name="longitude"
                value={formDonnees.longitude}
                onChange={handleFormChange}
                placeholder="Optionnel"
              />
            </div>

            <div className="col-12">
              <label className="form-label">Description</label>
              <textarea
                className="form-control"
                name="description"
                rows={3}
                value={formDonnees.description}
                onChange={handleFormChange}
                placeholder="Optionnel"
              ></textarea>
            </div>

            <div className="col-12">
              <label className="form-label">
                Photo / logo{' '}
                {modeForm === 'creation' ? (
                  <span className="text-danger">*</span>
                ) : (
                  <span className="aps-text-muted" style={{ fontSize: 12 }}>
                    (optionnel — laisser vide pour conserver l'actuel)
                  </span>
                )}
              </label>
              <input
                className="form-control"
                type="file"
                accept="image/*"
                onChange={handleFormFichier}
                required={modeForm === 'creation'}
              />
              {formImageApercu && (
                <img
                  src={formImageApercu}
                  alt="Aperçu"
                  className="mt-2"
                  style={{ width: 140, height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--aps-border)' }}
                />
              )}
            </div>
          </div>

          {modeForm === 'creation' && (
            <div className="mt-2 pt-3" style={{ borderTop: '1px solid var(--aps-border)' }}>
              <h6 className="mb-1">Compte de l'agent responsable</h6>
              <p className="aps-text-muted mb-3" style={{ fontSize: 13 }}>
                Un compte utilisateur est créé pour l'agent en charge de ce service. Un mot de passe temporaire vous
                sera communiqué une seule fois, juste après la création.
              </p>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label">
                    Fonction <span className="text-danger">*</span>
                  </label>
                  <input
                    className="form-control"
                    type="text"
                    name="fonction"
                    value={formDonnees.fonction}
                    onChange={handleFormChange}
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">
                    Nom de l'agent <span className="text-danger">*</span>
                  </label>
                  <input
                    className="form-control"
                    type="text"
                    name="agent_nom"
                    value={formDonnees.agent_nom}
                    onChange={handleFormChange}
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">
                    Prénom de l'agent <span className="text-danger">*</span>
                  </label>
                  <input
                    className="form-control"
                    type="text"
                    name="agent_prenom"
                    value={formDonnees.agent_prenom}
                    onChange={handleFormChange}
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">
                    Email de l'agent <span className="text-danger">*</span>
                  </label>
                  <input
                    className="form-control"
                    type="email"
                    name="agent_email"
                    value={formDonnees.agent_email}
                    onChange={handleFormChange}
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Téléphone de l'agent</label>
                  <input
                    className="form-control"
                    type="tel"
                    name="agent_telephone"
                    value={formDonnees.agent_telephone}
                    onChange={handleFormChange}
                    placeholder="Optionnel"
                  />
                </div>
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* ===================== MODAL SUPPRESSION ===================== */}
      <Modal
        id="modalSuppressionAssurance"
        title="Confirmer la suppression"
        isOpen={!!suppressionCible}
        onClose={annulerSuppression}
        footer={
          <>
            <button className="btn btn-light" onClick={annulerSuppression} disabled={suppressionEnCours}>
              Annuler
            </button>
            <button className="btn btn-danger" onClick={confirmerSuppression} disabled={suppressionEnCours}>
              {suppressionEnCours ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin me-2"></i>Suppression…
                </>
              ) : (
                'Supprimer définitivement'
              )}
            </button>
          </>
        }
      >
        <div className="aps-notice is-danger">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <div>
            Voulez-vous vraiment supprimer le service « {suppressionCible?.nom} » ? Cette action est définitive.
          </div>
        </div>
        {suppressionErreur && (
          <div className="aps-notice is-danger mt-3">
            <i className="fa-solid fa-circle-xmark"></i>
            <div>{suppressionErreur}</div>
          </div>
        )}
      </Modal>

      {/* ===================== CONFIGURATION (activités / agences) ===================== */}
      {configurationCible && <ConfigurationModale service={configurationCible} onFermer={fermerConfiguration} />}

      {/* ===================== COMPTE AGENT CRÉÉ ===================== */}
      <Modal
        id="modalAgentCreeAssurance"
        title="Compte agent créé"
        isOpen={!!agentCree}
        onClose={() => setAgentCree(null)}
        footer={
          <button className="btn btn-primary" onClick={() => setAgentCree(null)}>
            J'ai noté le mot de passe
          </button>
        }
      >
        {agentCree && (
          <>
            <div className="aps-notice is-warning mb-3">
              <i className="fa-solid fa-triangle-exclamation"></i>
              <div>Ce mot de passe temporaire ne sera plus jamais affiché. Communiquez-le à l'agent dès maintenant.</div>
            </div>
            <div className="aps-card">
              <div className="aps-card__body">
                <p className="mb-1">
                  <strong>
                    {agentCree.utilisateur?.prenom} {agentCree.utilisateur?.nom}
                  </strong>{' '}
                  — {agentCree.fonction}
                </p>
                <p className="aps-text-muted mb-3" style={{ fontSize: 13 }}>
                  {agentCree.utilisateur?.email}
                </p>
                <div className="d-flex align-items-center gap-2">
                  <code className="assur-mot-de-passe">{agentCree.mot_de_passe_temporaire}</code>
                  <button type="button" className="btn btn-sm btn-light" onClick={copierMotDePasse}>
                    {motDePasseCopie ? 'Copié !' : 'Copier'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}