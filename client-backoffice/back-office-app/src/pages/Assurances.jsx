// src/pages/Assurances.jsx
//
// Composant "annuaire — assurance" (table service_assurance +
// mise_en_relation, diagramme 08_annuaire_assurances). Consomme
// entièrement assuranceService.js — aucun appel réseau direct ici.
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
 * Sous-composants
 * =================================================================== */

function Modale({ titre, taille = 'moyenne', onFermer, children }) {
  useEffect(() => {
    function surEchap(e) {
      if (e.key === 'Escape') onFermer();
    }
    document.addEventListener('keydown', surEchap);
    return () => document.removeEventListener('keydown', surEchap);
  }, [onFermer]);

  return (
    <div
      className="aps-assur-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div
        className={`aps-assur-modale aps-assur-modale-${taille}`}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
      >
        <div className="aps-assur-modale-entete">
          <h2>{titre}</h2>
          <button
            type="button"
            className="aps-assur-modale-fermer"
            onClick={onFermer}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        <div className="aps-assur-modale-corps">{children}</div>
      </div>
    </div>
  );
}

function EtatChargement({ texte }) {
  return (
    <div className="aps-assur-etat-chargement">
      <span className="aps-assur-spinner" aria-hidden="true"></span>
      <p>{texte}</p>
    </div>
  );
}

function Badge({ type, valeur }) {
  if (!valeur) return null;
  if (type === 'statut') {
    return (
      <span className={`aps-assur-badge aps-assur-badge-${valeur}`}>
        {LIBELLES_STATUT[valeur] || valeur}
      </span>
    );
  }
  return <span className="aps-assur-badge aps-assur-badge-type">{LIBELLES_TYPE[valeur] || valeur}</span>;
}

function CarteService({ service, peutModifier, peutSupprimer, onVoir, onModifier, onSupprimer, onConfigurer }) {
  return (
    <article className={`aps-assur-carte aps-assur-carte-statut-${service.statut_verification || 'defaut'}`}>
      <div className="aps-assur-carte-image">
        {service.image_url ? (
          <img src={service.image_url} alt={service.nom} loading="lazy" />
        ) : (
          <div className="aps-assur-carte-image-vide" aria-hidden="true">
            🛡️
          </div>
        )}
        <div className="aps-assur-carte-image-degrade" aria-hidden="true"></div>
        <div className="aps-assur-carte-badge-statut">
          <Badge type="statut" valeur={service.statut_verification} />
        </div>
        <div className="aps-assur-carte-logo" aria-hidden="true">
          🛡️
        </div>
      </div>
      <div className="aps-assur-carte-corps">
        <div className="aps-assur-carte-entete">
          <h3 className="aps-assur-carte-nom">{service.nom}</h3>
          <Badge type="acteur" valeur={service.type_acteur} />
        </div>
        <ul className="aps-assur-carte-infos">
          <li className="aps-assur-carte-meta">
            <span className="aps-assur-carte-icone" aria-hidden="true">📍</span>
            <span>
              {service.ville?.nom || '—'}, {service.pays?.nom || '—'}
            </span>
          </li>
          <li className="aps-assur-carte-meta">
            <span className="aps-assur-carte-icone" aria-hidden="true">📞</span>
            <span>{service.telephone || '—'}</span>
          </li>
        </ul>
      </div>
      <div className="aps-assur-carte-actions">
        <button
          type="button"
          className="aps-assur-btn aps-assur-btn-primary aps-assur-btn-sm"
          onClick={onVoir}
        >
          Voir la fiche
        </button>
        {peutModifier && (
          <button type="button" className="aps-assur-btn aps-assur-btn-ghost aps-assur-btn-sm" onClick={onModifier}>
            Modifier
          </button>
        )}
        {peutModifier && (
          <button
            type="button"
            className="aps-assur-btn aps-assur-btn-secondary aps-assur-btn-sm"
            onClick={onConfigurer}
          >
            ⚙️ Configurer
          </button>
        )}
        {peutSupprimer && (
          <button type="button" className="aps-assur-btn aps-assur-btn-danger aps-assur-btn-sm" onClick={onSupprimer}>
            Supprimer
          </button>
        )}
      </div>
    </article>
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

  async function soumettreActivite(e) {
    e.preventDefault();
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

  async function soumettreOption(e) {
    e.preventDefault();
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

  async function soumettreAgence(e) {
    e.preventDefault();
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
    <Modale titre={`Configurer « ${service.nom} »`} taille="grande" onFermer={onFermer}>
      <div className="aps-assur-onglets">
        <button
          type="button"
          className={`aps-assur-onglet${onglet === 'activites' ? ' aps-assur-onglet-actif' : ''}`}
          onClick={() => setOnglet('activites')}
        >
          Activités{activites.length ? ` (${activites.length})` : ''}
        </button>
        <button
          type="button"
          className={`aps-assur-onglet${onglet === 'agences' ? ' aps-assur-onglet-actif' : ''}`}
          onClick={() => setOnglet('agences')}
        >
          Agences{agences.length ? ` (${agences.length})` : ''}
        </button>
      </div>

      {/* ---------------------------- Onglet Activités ---------------------------- */}
      {onglet === 'activites' && (
        <div className="aps-assur-config-panneau">
          <div className="aps-assur-config-entete">
            <p className="aps-assur-info">Catalogue des activités proposées par ce service et de leurs options.</p>
            <button
              type="button"
              className="aps-assur-btn aps-assur-btn-primary aps-assur-btn-sm"
              onClick={ouvrirCreationActivite}
            >
              + Nouvelle activité
            </button>
          </div>

          {chargementActivites && <EtatChargement texte="Chargement des activités..." />}

          {!chargementActivites && erreurActivites && (
            <div className="aps-assur-alerte aps-assur-alerte-erreur" role="alert">
              <p>{erreurActivites}</p>
            </div>
          )}

          {!chargementActivites && !erreurActivites && activites.length === 0 && (
            <div className="aps-assur-etat-vide">Aucune activité pour le moment.</div>
          )}

          {!chargementActivites && !erreurActivites && activites.length > 0 && (
            <ul className="aps-assur-config-liste">
              {activites.map((a) => (
                <li key={a.activite_id} className="aps-assur-config-item">
                  <div className="aps-assur-config-item-entete">
                    <div>
                      <strong>{a.titre}</strong>
                      {a.public_cible && <span className="aps-assur-config-meta"> — {a.public_cible}</span>}
                      {a.description && <p className="aps-assur-config-desc">{a.description}</p>}
                    </div>
                    <div className="aps-assur-config-actions">
                      <button
                        type="button"
                        className="aps-assur-btn aps-assur-btn-ghost aps-assur-btn-sm"
                        onClick={() => basculerOptions(a.activite_id)}
                      >
                        {activiteOuverte === a.activite_id ? 'Masquer les options' : 'Options'}
                      </button>
                      <button
                        type="button"
                        className="aps-assur-btn aps-assur-btn-ghost aps-assur-btn-sm"
                        onClick={() => ouvrirEditionActivite(a)}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="aps-assur-btn aps-assur-btn-danger aps-assur-btn-sm"
                        onClick={() => supprimerActiviteHandler(a)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>

                  {activiteOuverte === a.activite_id && (
                    <div className="aps-assur-config-sous-liste">
                      <div className="aps-assur-config-entete">
                        <h5 className="aps-assur-section-titre">Options de l'activité</h5>
                        <button
                          type="button"
                          className="aps-assur-btn aps-assur-btn-secondary aps-assur-btn-sm"
                          onClick={() => ouvrirCreationOption(a.activite_id)}
                        >
                          + Option
                        </button>
                      </div>

                      {chargementOptions[a.activite_id] && <EtatChargement texte="Chargement des options..." />}

                      {erreurOptions[a.activite_id] && (
                        <div className="aps-assur-alerte aps-assur-alerte-erreur" role="alert">
                          <p>{erreurOptions[a.activite_id]}</p>
                        </div>
                      )}

                      {!chargementOptions[a.activite_id] &&
                        !erreurOptions[a.activite_id] &&
                        (optionsParActivite[a.activite_id]?.length ?? 0) === 0 && (
                          <p className="aps-assur-etat-vide">Aucune option pour cette activité.</p>
                        )}

                      {(optionsParActivite[a.activite_id]?.length ?? 0) > 0 && (
                        <ul className="aps-assur-config-liste">
                          {optionsParActivite[a.activite_id].map((o) => (
                            <li key={o.option_activite_id} className="aps-assur-config-item aps-assur-config-item-sm">
                              <div>
                                <strong>{o.libelle}</strong>
                                {o.description && <p className="aps-assur-config-desc">{o.description}</p>}
                              </div>
                              <div className="aps-assur-config-actions">
                                <button
                                  type="button"
                                  className="aps-assur-btn aps-assur-btn-ghost aps-assur-btn-sm"
                                  onClick={() => ouvrirEditionOption(a.activite_id, o)}
                                >
                                  Modifier
                                </button>
                                <button
                                  type="button"
                                  className="aps-assur-btn aps-assur-btn-danger aps-assur-btn-sm"
                                  onClick={() => supprimerOptionHandler(a.activite_id, o)}
                                >
                                  Supprimer
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ---------------------------- Onglet Agences ---------------------------- */}
      {onglet === 'agences' && (
        <div className="aps-assur-config-panneau">
          <div className="aps-assur-config-entete">
            <p className="aps-assur-info">Agences (implantations physiques) rattachées à ce service.</p>
            <button
              type="button"
              className="aps-assur-btn aps-assur-btn-primary aps-assur-btn-sm"
              onClick={ouvrirCreationAgence}
            >
              + Nouvelle agence
            </button>
          </div>

          {chargementAgences && <EtatChargement texte="Chargement des agences..." />}

          {!chargementAgences && erreurAgences && (
            <div className="aps-assur-alerte aps-assur-alerte-erreur" role="alert">
              <p>{erreurAgences}</p>
            </div>
          )}

          {!chargementAgences && !erreurAgences && agences.length === 0 && (
            <div className="aps-assur-etat-vide">Aucune agence pour le moment.</div>
          )}

          {!chargementAgences && !erreurAgences && agences.length > 0 && (
            <ul className="aps-assur-config-liste">
              {agences.map((a) => (
                <li key={a.agence_id} className="aps-assur-config-item">
                  <div>
                    <strong>{a.libelle}</strong>
                    <p className="aps-assur-config-desc">{a.localisation}</p>
                    {a.contact && <p className="aps-assur-config-meta">📞 {a.contact}</p>}
                    {(a.latitude ?? a.gps?.latitude) != null && (
                      <p className="aps-assur-config-meta">
                        📍 {a.latitude ?? a.gps?.latitude}, {a.longitude ?? a.gps?.longitude}
                      </p>
                    )}
                  </div>
                  <div className="aps-assur-config-actions">
                    <button
                      type="button"
                      className="aps-assur-btn aps-assur-btn-ghost aps-assur-btn-sm"
                      onClick={() => ouvrirEditionAgence(a)}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="aps-assur-btn aps-assur-btn-danger aps-assur-btn-sm"
                      onClick={() => supprimerAgenceHandler(a)}
                    >
                      Supprimer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ---------------------------- Sous-modale : formulaire activité ---------------------------- */}
      {activiteEnEdition && (
        <Modale
          titre={activiteEnEdition.activite_id ? "Modifier l'activité" : 'Nouvelle activité'}
          taille="petite"
          onFermer={fermerFormActivite}
        >
          <form className="aps-assur-form" onSubmit={soumettreActivite}>
            {erreurFormActivite && (
              <div className="aps-assur-alerte aps-assur-alerte-erreur" role="alert">
                <p>{erreurFormActivite}</p>
              </div>
            )}
            <div className="aps-assur-form-groupe aps-assur-form-groupe-pleine">
              <label className="aps-assur-label" htmlFor="fa-titre">
                Titre *
              </label>
              <input
                id="fa-titre"
                className="aps-assur-input"
                type="text"
                name="titre"
                value={formActivite.titre}
                onChange={handleFormActiviteChange}
                required
              />
            </div>
            <div className="aps-assur-form-groupe aps-assur-form-groupe-pleine">
              <label className="aps-assur-label" htmlFor="fa-public">
                Public cible
              </label>
              <input
                id="fa-public"
                className="aps-assur-input"
                type="text"
                name="public_cible"
                value={formActivite.public_cible}
                onChange={handleFormActiviteChange}
                placeholder="Optionnel"
              />
            </div>
            <div className="aps-assur-form-groupe aps-assur-form-groupe-pleine">
              <label className="aps-assur-label" htmlFor="fa-description">
                Description
              </label>
              <textarea
                id="fa-description"
                className="aps-assur-input"
                name="description"
                rows="3"
                value={formActivite.description}
                onChange={handleFormActiviteChange}
                placeholder="Optionnel"
              ></textarea>
            </div>
            <div className="aps-assur-modale-actions">
              <button
                type="button"
                className="aps-assur-btn aps-assur-btn-ghost"
                onClick={fermerFormActivite}
                disabled={envoiActivite}
              >
                Annuler
              </button>
              <button type="submit" className="aps-assur-btn aps-assur-btn-primary" disabled={envoiActivite}>
                {envoiActivite ? 'Enregistrement...' : activiteEnEdition.activite_id ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </form>
        </Modale>
      )}

      {/* ---------------------------- Sous-modale : formulaire option ---------------------------- */}
      {optionEnEdition && (
        <Modale
          titre={optionEnEdition.option_activite_id ? "Modifier l'option" : 'Nouvelle option'}
          taille="petite"
          onFermer={fermerFormOption}
        >
          <form className="aps-assur-form" onSubmit={soumettreOption}>
            {erreurFormOption && (
              <div className="aps-assur-alerte aps-assur-alerte-erreur" role="alert">
                <p>{erreurFormOption}</p>
              </div>
            )}
            <div className="aps-assur-form-groupe aps-assur-form-groupe-pleine">
              <label className="aps-assur-label" htmlFor="fo-libelle">
                Libellé *
              </label>
              <input
                id="fo-libelle"
                className="aps-assur-input"
                type="text"
                name="libelle"
                value={formOption.libelle}
                onChange={handleFormOptionChange}
                required
              />
            </div>
            <div className="aps-assur-form-groupe aps-assur-form-groupe-pleine">
              <label className="aps-assur-label" htmlFor="fo-description">
                Description
              </label>
              <textarea
                id="fo-description"
                className="aps-assur-input"
                name="description"
                rows="3"
                value={formOption.description}
                onChange={handleFormOptionChange}
                placeholder="Optionnel"
              ></textarea>
            </div>
            <div className="aps-assur-modale-actions">
              <button
                type="button"
                className="aps-assur-btn aps-assur-btn-ghost"
                onClick={fermerFormOption}
                disabled={envoiOption}
              >
                Annuler
              </button>
              <button type="submit" className="aps-assur-btn aps-assur-btn-primary" disabled={envoiOption}>
                {envoiOption ? 'Enregistrement...' : optionEnEdition.option_activite_id ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </form>
        </Modale>
      )}

      {/* ---------------------------- Sous-modale : formulaire agence ---------------------------- */}
      {agenceEnEdition && (
        <Modale
          titre={agenceEnEdition.agence_id ? "Modifier l'agence" : 'Nouvelle agence'}
          taille="petite"
          onFermer={fermerFormAgence}
        >
          <form className="aps-assur-form" onSubmit={soumettreAgence}>
            {erreurFormAgence && (
              <div className="aps-assur-alerte aps-assur-alerte-erreur" role="alert">
                <p>{erreurFormAgence}</p>
              </div>
            )}
            <div className="aps-assur-form-groupe aps-assur-form-groupe-pleine">
              <label className="aps-assur-label" htmlFor="fg-libelle">
                Libellé *
              </label>
              <input
                id="fg-libelle"
                className="aps-assur-input"
                type="text"
                name="libelle"
                value={formAgence.libelle}
                onChange={handleFormAgenceChange}
                required
              />
            </div>
            <div className="aps-assur-form-groupe aps-assur-form-groupe-pleine">
              <label className="aps-assur-label" htmlFor="fg-localisation">
                Localisation *
              </label>
              <input
                id="fg-localisation"
                className="aps-assur-input"
                type="text"
                name="localisation"
                value={formAgence.localisation}
                onChange={handleFormAgenceChange}
                required
              />
            </div>
            <div className="aps-assur-form-groupe aps-assur-form-groupe-pleine">
              <label className="aps-assur-label" htmlFor="fg-contact">
                Contact *
              </label>
              <input
                id="fg-contact"
                className="aps-assur-input"
                type="text"
                name="contact"
                value={formAgence.contact}
                onChange={handleFormAgenceChange}
                required
              />
            </div>
            <div className="aps-assur-form-groupe">
              <label className="aps-assur-label" htmlFor="fg-latitude">
                Latitude
              </label>
              <input
                id="fg-latitude"
                className="aps-assur-input"
                type="text"
                name="latitude"
                value={formAgence.latitude}
                onChange={handleFormAgenceChange}
                placeholder="Optionnel"
              />
            </div>
            <div className="aps-assur-form-groupe">
              <label className="aps-assur-label" htmlFor="fg-longitude">
                Longitude
              </label>
              <input
                id="fg-longitude"
                className="aps-assur-input"
                type="text"
                name="longitude"
                value={formAgence.longitude}
                onChange={handleFormAgenceChange}
                placeholder="Optionnel"
              />
            </div>
            <div className="aps-assur-modale-actions">
              <button
                type="button"
                className="aps-assur-btn aps-assur-btn-ghost"
                onClick={fermerFormAgence}
                disabled={envoiAgence}
              >
                Annuler
              </button>
              <button type="submit" className="aps-assur-btn aps-assur-btn-primary" disabled={envoiAgence}>
                {envoiAgence ? 'Enregistrement...' : agenceEnEdition.agence_id ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </form>
        </Modale>
      )}
    </Modale>
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
    <div className="aps-assur-page">
      <header className="aps-assur-header">
        <div>
          <h1 className="aps-assur-titre">Annuaire des assurances</h1>
          <p className="aps-assur-soustitre">Compagnies et courtiers d'assurance référencés dans l'annuaire.</p>
        </div>
        {estConnecte && (
          <button type="button" className="aps-assur-btn aps-assur-btn-primary" onClick={ouvrirCreation}>
            + Nouveau service
          </button>
        )}
      </header>

      <section className="aps-assur-filtres" aria-label="Filtres de recherche">
        <div className="aps-assur-champ">
          <label htmlFor="assur-recherche" className="aps-assur-label">
            Recherche
          </label>
          <input
            id="assur-recherche"
            type="text"
            name="recherche"
            className="aps-assur-input"
            placeholder="Nom du service..."
            value={filtres.recherche}
            onChange={handleFiltreChange}
          />
        </div>
        <div className="aps-assur-champ">
          <label htmlFor="assur-pays" className="aps-assur-label">
            Pays
          </label>
          <select
            id="assur-pays"
            name="pays_id"
            className="aps-assur-input"
            value={filtres.pays_id}
            onChange={handleFiltreChange}
          >
            <option value="">Tous les pays</option>
            {paysListe.map((p) => (
              <option key={p.pays_id} value={p.pays_id}>
                {p.nom}
              </option>
            ))}
          </select>
        </div>
        <div className="aps-assur-champ">
          <label htmlFor="assur-ville" className="aps-assur-label">
            Ville
          </label>
          <select
            id="assur-ville"
            name="ville_id"
            className="aps-assur-input"
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
        <div className="aps-assur-champ">
          <label htmlFor="assur-type" className="aps-assur-label">
            Type d'acteur
          </label>
          <select
            id="assur-type"
            name="type_acteur"
            className="aps-assur-input"
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
        <div className="aps-assur-champ">
          <label htmlFor="assur-statut" className="aps-assur-label">
            Statut
          </label>
          <select
            id="assur-statut"
            name="statut_verification"
            className="aps-assur-input"
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
        <button type="button" className="aps-assur-btn aps-assur-btn-ghost" onClick={reinitialiserFiltres}>
          Réinitialiser
        </button>
      </section>

      <section className="aps-assur-contenu">
        {chargementListe && <EtatChargement texte="Chargement des services d'assurance..." />}

        {!chargementListe && erreurListe && (
          <div className="aps-assur-alerte aps-assur-alerte-erreur" role="alert">
            <p>{erreurListe}</p>
            <button
              type="button"
              className="aps-assur-btn aps-assur-btn-secondary aps-assur-btn-sm"
              onClick={() => setRecharger((n) => n + 1)}
            >
              Réessayer
            </button>
          </div>
        )}

        {!chargementListe && !erreurListe && services.length === 0 && (
          <div className="aps-assur-etat-vide">Aucun service d'assurance ne correspond à ces critères.</div>
        )}

        {!chargementListe && !erreurListe && services.length > 0 && (
          <div className="row g-4 aps-assur-grille">
            {services.map((service) => (
              <div className="col-md-4" key={service.service_assurance_id}>
                <CarteService
                  service={service}
                  peutModifier={estConnecte}
                  peutSupprimer={estSuperadmin}
                  onVoir={() => ouvrirDetail(service.service_assurance_id)}
                  onModifier={() => ouvrirEdition(service)}
                  onSupprimer={() => demanderSuppression(service)}
                  onConfigurer={() => ouvrirConfiguration(service)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------- Fiche détail ---------------------------- */}
      {detailOuvert && (
        <Modale titre="Fiche du service d'assurance" taille="grande" onFermer={fermerDetail}>
          {chargementDetail && <EtatChargement texte="Chargement de la fiche..." />}

          {!chargementDetail && erreurDetail && (
            <div className="aps-assur-alerte aps-assur-alerte-erreur" role="alert">
              <p>{erreurDetail}</p>
            </div>
          )}

          {!chargementDetail && !erreurDetail && serviceDetail && (
            <>
              <div className="aps-assur-detail-entete">
                {serviceDetail.image_url ? (
                  <img className="aps-assur-detail-image" src={serviceDetail.image_url} alt={serviceDetail.nom} />
                ) : (
                  <div className="aps-assur-detail-image aps-assur-detail-image-vide" aria-hidden="true">
                    🛡️
                  </div>
                )}
                <div>
                  <h3>{serviceDetail.nom}</h3>
                  <div className="aps-assur-detail-badges">
                    <Badge type="acteur" valeur={serviceDetail.type_acteur} />
                    <Badge type="statut" valeur={serviceDetail.statut_verification} />
                  </div>
                </div>
              </div>

              <div className="aps-assur-detail-grille">
                <div className="aps-assur-detail-item">
                  <span className="aps-assur-detail-label">Téléphone</span>
                  <span className="aps-assur-detail-valeur">{serviceDetail.telephone || '—'}</span>
                </div>
                <div className="aps-assur-detail-item">
                  <span className="aps-assur-detail-label">Email</span>
                  <span className="aps-assur-detail-valeur">{serviceDetail.email || '—'}</span>
                </div>
                <div className="aps-assur-detail-item">
                  <span className="aps-assur-detail-label">N° d'agrément</span>
                  <span className="aps-assur-detail-valeur">{serviceDetail.agrement || '—'}</span>
                </div>
                <div className="aps-assur-detail-item">
                  <span className="aps-assur-detail-label">Pays</span>
                  <span className="aps-assur-detail-valeur">{serviceDetail.pays?.nom || '—'}</span>
                </div>
                <div className="aps-assur-detail-item">
                  <span className="aps-assur-detail-label">Ville</span>
                  <span className="aps-assur-detail-valeur">{serviceDetail.ville?.nom || '—'}</span>
                </div>
                {(serviceDetail.latitude ?? serviceDetail.geolocalisation?.latitude) != null && (
                  <div className="aps-assur-detail-item">
                    <span className="aps-assur-detail-label">Localisation</span>
                    <span className="aps-assur-detail-valeur">
                      {serviceDetail.latitude ?? serviceDetail.geolocalisation?.latitude},{' '}
                      {serviceDetail.longitude ?? serviceDetail.geolocalisation?.longitude}
                    </span>
                  </div>
                )}
              </div>

              {serviceDetail.description && (
                <div className="aps-assur-section">
                  <h4 className="aps-assur-section-titre">Description</h4>
                  <p>{serviceDetail.description}</p>
                </div>
              )}

              <div className="aps-assur-modale-actions">
                <button
                  type="button"
                  className="aps-assur-btn aps-assur-btn-secondary"
                  onClick={() => ouvrirEdition(serviceDetail)}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  className="aps-assur-btn aps-assur-btn-secondary"
                  onClick={() => ouvrirConfiguration(serviceDetail)}
                >
                  ⚙️ Configurer
                </button>
                {estSuperadmin && (
                  <button
                    type="button"
                    className="aps-assur-btn aps-assur-btn-danger"
                    onClick={() => demanderSuppression(serviceDetail)}
                  >
                    Supprimer
                  </button>
                )}
              </div>

              <div className="aps-assur-section">
                <h4 className="aps-assur-section-titre">Demander une mise en relation</h4>
                {!estConnecte && !chargementSession && (
                  <p className="aps-assur-info">Connectez-vous pour contacter ce service.</p>
                )}
                {estConnecte && (
                  <form className="aps-assur-mise-form" onSubmit={envoyerMessage}>
                    <textarea
                      className="aps-assur-input"
                      rows="3"
                      placeholder="Votre message..."
                      value={nouveauMessage}
                      onChange={(e) => setNouveauMessage(e.target.value)}
                      required
                    ></textarea>
                    {erreurEnvoiMessage && <p className="aps-assur-erreur-champ">{erreurEnvoiMessage}</p>}
                    {succesEnvoiMessage && (
                      <p className="aps-assur-alerte aps-assur-alerte-succes">Votre demande a été envoyée.</p>
                    )}
                    <button type="submit" className="aps-assur-btn aps-assur-btn-primary" disabled={envoiMessage}>
                      {envoiMessage ? 'Envoi...' : 'Envoyer la demande'}
                    </button>
                  </form>
                )}
              </div>

              <div className="aps-assur-section">
                <h4 className="aps-assur-section-titre">Mises en relation reçues</h4>
                <p className="aps-assur-info">
                  Réservé à l'agent en charge de ce service ou à un administrateur.
                </p>
                {!misesChargees && (
                  <button
                    type="button"
                    className="aps-assur-btn aps-assur-btn-secondary aps-assur-btn-sm"
                    onClick={chargerMises}
                    disabled={chargementMises}
                  >
                    {chargementMises ? 'Chargement...' : 'Charger les demandes'}
                  </button>
                )}
                {chargementMises && misesChargees && <EtatChargement texte="Chargement..." />}
                {erreurMises && (
                  <div className="aps-assur-alerte aps-assur-alerte-erreur" role="alert">
                    <p>{erreurMises}</p>
                  </div>
                )}
                {misesChargees &&
                  !erreurMises &&
                  !chargementMises &&
                  (misesEnRelation.length === 0 ? (
                    <p className="aps-assur-etat-vide">Aucune demande pour le moment.</p>
                  ) : (
                    <ul className="aps-assur-mise-liste">
                      {misesEnRelation.map((m) => (
                        <li key={m.mise_en_relation_id} className="aps-assur-mise-item">
                          <div>
                            <strong>
                              {m.utilisateur?.prenom} {m.utilisateur?.nom}
                            </strong>
                            <span className="aps-assur-mise-date">
                              {formaterDate(m.date_creation || m.createdAt)}
                            </span>
                            <p>{m.message}</p>
                          </div>
                          <button
                            type="button"
                            className="aps-assur-btn aps-assur-btn-ghost aps-assur-btn-sm"
                            onClick={() => supprimerMise(m.mise_en_relation_id)}
                          >
                            Supprimer
                          </button>
                        </li>
                      ))}
                    </ul>
                  ))}
              </div>
            </>
          )}
        </Modale>
      )}

      {/* ---------------------------- Formulaire ---------------------------- */}
      {formOuvert && (
        <Modale
          titre={modeForm === 'creation' ? "Nouveau service d'assurance" : "Modifier le service d'assurance"}
          taille="grande"
          onFermer={fermerForm}
        >
          <form className="aps-assur-form" onSubmit={handleFormSubmit}>
            {formErreur && (
              <div className="aps-assur-alerte aps-assur-alerte-erreur" role="alert">
                <p>{formErreur}</p>
              </div>
            )}

            <div className="aps-assur-form-grille">
              <div className="aps-assur-form-groupe">
                <label className="aps-assur-label" htmlFor="f-nom">
                  Nom du service *
                </label>
                <input
                  id="f-nom"
                  className="aps-assur-input"
                  type="text"
                  name="nom"
                  value={formDonnees.nom}
                  onChange={handleFormChange}
                  required
                />
              </div>
              <div className="aps-assur-form-groupe">
                <label className="aps-assur-label" htmlFor="f-type">
                  Type d'acteur *
                </label>
                <select
                  id="f-type"
                  className="aps-assur-input"
                  name="type_acteur"
                  value={formDonnees.type_acteur}
                  onChange={handleFormChange}
                  required
                >
                  <option value="">Sélectionner...</option>
                  {TYPES_ACTEUR_ASSURANCE.map((t) => (
                    <option key={t.valeur} value={t.valeur}>
                      {t.libelle}
                    </option>
                  ))}
                </select>
              </div>
              <div className="aps-assur-form-groupe">
                <label className="aps-assur-label" htmlFor="f-pays">
                  Pays *
                </label>
                <select
                  id="f-pays"
                  className="aps-assur-input"
                  name="pays_id"
                  value={formDonnees.pays_id}
                  onChange={handleFormChange}
                  required
                >
                  <option value="">Sélectionner...</option>
                  {paysListe.map((p) => (
                    <option key={p.pays_id} value={p.pays_id}>
                      {p.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div className="aps-assur-form-groupe">
                <label className="aps-assur-label" htmlFor="f-ville">
                  Ville *
                </label>
                <select
                  id="f-ville"
                  className="aps-assur-input"
                  name="ville_id"
                  value={formDonnees.ville_id}
                  onChange={handleFormChange}
                  required
                  disabled={!formDonnees.pays_id}
                >
                  <option value="">Sélectionner...</option>
                  {villesFormulaire.map((v) => (
                    <option key={v.ville_id} value={v.ville_id}>
                      {v.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div className="aps-assur-form-groupe">
                <label className="aps-assur-label" htmlFor="f-telephone">
                  Téléphone *
                </label>
                <input
                  id="f-telephone"
                  className="aps-assur-input"
                  type="tel"
                  name="telephone"
                  value={formDonnees.telephone}
                  onChange={handleFormChange}
                  required
                />
              </div>
              <div className="aps-assur-form-groupe">
                <label className="aps-assur-label" htmlFor="f-email">
                  Email *
                </label>
                <input
                  id="f-email"
                  className="aps-assur-input"
                  type="email"
                  name="email"
                  value={formDonnees.email}
                  onChange={handleFormChange}
                  required
                />
              </div>
              <div className="aps-assur-form-groupe">
                <label className="aps-assur-label" htmlFor="f-agrement">
                  N° d'agrément *
                </label>
                <input
                  id="f-agrement"
                  className="aps-assur-input"
                  type="text"
                  name="agrement"
                  value={formDonnees.agrement}
                  onChange={handleFormChange}
                  required
                />
              </div>

              {estAdmin ? (
                <div className="aps-assur-form-groupe">
                  <label className="aps-assur-label" htmlFor="f-statut">
                    Statut de vérification
                  </label>
                  <select
                    id="f-statut"
                    className="aps-assur-input"
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
                <div className="aps-assur-form-groupe">
                  <span className="aps-assur-label">Statut de vérification</span>
                  <p className="aps-assur-info">
                    La fiche sera placée « En cours de vérification » jusqu'à validation par un administrateur.
                  </p>
                </div>
              )}

              <div className="aps-assur-form-groupe">
                <label className="aps-assur-label" htmlFor="f-latitude">
                  Latitude
                </label>
                <input
                  id="f-latitude"
                  className="aps-assur-input"
                  type="text"
                  name="latitude"
                  value={formDonnees.latitude}
                  onChange={handleFormChange}
                  placeholder="Optionnel"
                />
              </div>
              <div className="aps-assur-form-groupe">
                <label className="aps-assur-label" htmlFor="f-longitude">
                  Longitude
                </label>
                <input
                  id="f-longitude"
                  className="aps-assur-input"
                  type="text"
                  name="longitude"
                  value={formDonnees.longitude}
                  onChange={handleFormChange}
                  placeholder="Optionnel"
                />
              </div>

              <div className="aps-assur-form-groupe aps-assur-form-groupe-pleine">
                <label className="aps-assur-label" htmlFor="f-description">
                  Description
                </label>
                <textarea
                  id="f-description"
                  className="aps-assur-input"
                  name="description"
                  rows="3"
                  value={formDonnees.description}
                  onChange={handleFormChange}
                  placeholder="Optionnel"
                ></textarea>
              </div>

              <div className="aps-assur-form-groupe aps-assur-form-groupe-pleine">
                <label className="aps-assur-label" htmlFor="f-image">
                  Photo / logo {modeForm === 'creation' ? '*' : "(optionnel — laisser vide pour conserver l'actuel)"}
                </label>
                <input
                  id="f-image"
                  className="aps-assur-input"
                  type="file"
                  accept="image/*"
                  onChange={handleFormFichier}
                  required={modeForm === 'creation'}
                />
                {formImageApercu && <img className="aps-assur-image-apercu" src={formImageApercu} alt="Aperçu" />}
              </div>
            </div>

            {modeForm === 'creation' && (
              <div className="aps-assur-section">
                <h4 className="aps-assur-section-titre">Compte de l'agent responsable</h4>
                <p className="aps-assur-info">
                  Un compte utilisateur est créé pour l'agent en charge de ce service. Un mot de passe temporaire
                  vous sera communiqué une seule fois, juste après la création.
                </p>
                <div className="aps-assur-form-grille">
                  <div className="aps-assur-form-groupe">
                    <label className="aps-assur-label" htmlFor="f-fonction">
                      Fonction *
                    </label>
                    <input
                      id="f-fonction"
                      className="aps-assur-input"
                      type="text"
                      name="fonction"
                      value={formDonnees.fonction}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                  <div className="aps-assur-form-groupe">
                    <label className="aps-assur-label" htmlFor="f-agent-nom">
                      Nom de l'agent *
                    </label>
                    <input
                      id="f-agent-nom"
                      className="aps-assur-input"
                      type="text"
                      name="agent_nom"
                      value={formDonnees.agent_nom}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                  <div className="aps-assur-form-groupe">
                    <label className="aps-assur-label" htmlFor="f-agent-prenom">
                      Prénom de l'agent *
                    </label>
                    <input
                      id="f-agent-prenom"
                      className="aps-assur-input"
                      type="text"
                      name="agent_prenom"
                      value={formDonnees.agent_prenom}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                  <div className="aps-assur-form-groupe">
                    <label className="aps-assur-label" htmlFor="f-agent-email">
                      Email de l'agent *
                    </label>
                    <input
                      id="f-agent-email"
                      className="aps-assur-input"
                      type="email"
                      name="agent_email"
                      value={formDonnees.agent_email}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                  <div className="aps-assur-form-groupe">
                    <label className="aps-assur-label" htmlFor="f-agent-telephone">
                      Téléphone de l'agent
                    </label>
                    <input
                      id="f-agent-telephone"
                      className="aps-assur-input"
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

            <div className="aps-assur-modale-actions">
              <button
                type="button"
                className="aps-assur-btn aps-assur-btn-ghost"
                onClick={fermerForm}
                disabled={formEnvoi}
              >
                Annuler
              </button>
              <button type="submit" className="aps-assur-btn aps-assur-btn-primary" disabled={formEnvoi}>
                {formEnvoi ? 'Enregistrement...' : modeForm === 'creation' ? 'Créer le service' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </Modale>
      )}

      {/* ---------------------------- Confirmation suppression ---------------------------- */}
      {suppressionCible && (
        <Modale titre="Confirmer la suppression" taille="petite" onFermer={annulerSuppression}>
          <p>
            Voulez-vous vraiment supprimer le service « {suppressionCible.nom} » ? Cette action est définitive.
          </p>
          {suppressionErreur && (
            <div className="aps-assur-alerte aps-assur-alerte-erreur" role="alert">
              <p>{suppressionErreur}</p>
            </div>
          )}
          <div className="aps-assur-modale-actions">
            <button
              type="button"
              className="aps-assur-btn aps-assur-btn-ghost"
              onClick={annulerSuppression}
              disabled={suppressionEnCours}
            >
              Annuler
            </button>
            <button
              type="button"
              className="aps-assur-btn aps-assur-btn-danger"
              onClick={confirmerSuppression}
              disabled={suppressionEnCours}
            >
              {suppressionEnCours ? 'Suppression...' : 'Supprimer définitivement'}
            </button>
          </div>
        </Modale>
      )}

      {/* ---------------------------- Configuration (activités / options / agences) ---------------------------- */}
      {configurationCible && (
        <ConfigurationModale service={configurationCible} onFermer={fermerConfiguration} />
      )}

      {/* ---------------------------- Compte agent créé ---------------------------- */}
      {agentCree && (
        <Modale titre="Compte agent créé" taille="moyenne" onFermer={() => setAgentCree(null)}>
          <div className="aps-assur-alerte aps-assur-alerte-avertissement">
            <p>Ce mot de passe temporaire ne sera plus jamais affiché. Communiquez-le à l'agent dès maintenant.</p>
          </div>
          <div className="aps-assur-agent-recap">
            <p>
              <strong>
                {agentCree.utilisateur?.prenom} {agentCree.utilisateur?.nom}
              </strong>{' '}
              — {agentCree.fonction}
            </p>
            <p>{agentCree.utilisateur?.email}</p>
            <div className="aps-assur-mot-de-passe">
              <code>{agentCree.mot_de_passe_temporaire}</code>
              <button
                type="button"
                className="aps-assur-btn aps-assur-btn-secondary aps-assur-btn-sm"
                onClick={copierMotDePasse}
              >
                {motDePasseCopie ? 'Copié !' : 'Copier'}
              </button>
            </div>
          </div>
          <div className="aps-assur-modale-actions">
            <button type="button" className="aps-assur-btn aps-assur-btn-primary" onClick={() => setAgentCree(null)}>
              J'ai noté le mot de passe
            </button>
          </div>
        </Modale>
      )}
    </div>
  );
}