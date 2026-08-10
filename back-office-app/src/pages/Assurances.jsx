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

function CarteService({ service, peutModifier, peutSupprimer, onVoir, onModifier, onSupprimer }) {
  return (
    <article className="aps-assur-carte">
      <div className="aps-assur-carte-image">
        {service.image_url ? (
          <img src={service.image_url} alt={service.nom} loading="lazy" />
        ) : (
          <div className="aps-assur-carte-image-vide" aria-hidden="true">
            🛡️
          </div>
        )}
        <div className="aps-assur-carte-badge-statut">
          <Badge type="statut" valeur={service.statut_verification} />
        </div>
      </div>
      <div className="aps-assur-carte-corps">
        <h3 className="aps-assur-carte-nom">{service.nom}</h3>
        <Badge type="acteur" valeur={service.type_acteur} />
        <p className="aps-assur-carte-meta">
          <span aria-hidden="true">📍</span> {service.ville?.nom || '—'}, {service.pays?.nom || '—'}
        </p>
        <p className="aps-assur-carte-meta">
          <span aria-hidden="true">📞</span> {service.telephone || '—'}
        </p>
      </div>
      <div className="aps-assur-carte-actions">
        <button type="button" className="aps-assur-btn aps-assur-btn-secondary aps-assur-btn-sm" onClick={onVoir}>
          Voir la fiche
        </button>
        {peutModifier && (
          <button type="button" className="aps-assur-btn aps-assur-btn-ghost aps-assur-btn-sm" onClick={onModifier}>
            Modifier
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
          <div className="aps-assur-grille">
            {services.map((service) => (
              <CarteService
                key={service.service_assurance_id}
                service={service}
                peutModifier={estConnecte}
                peutSupprimer={estSuperadmin}
                onVoir={() => ouvrirDetail(service.service_assurance_id)}
                onModifier={() => ouvrirEdition(service)}
                onSupprimer={() => demanderSuppression(service)}
              />
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