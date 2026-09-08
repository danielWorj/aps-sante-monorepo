import React, { useEffect, useState } from 'react';
import '../../assets/styles/creationAssurance.css';

import { creerServiceAssurance } from '../../services/assuranceService';
import { listerPays, listerVilles } from '../../services/geoService';
import { connecter } from '../../services/authService';

// ───────────────────────────────────────────────────────────────────
// Ce formulaire suit EXACTEMENT le contrat de POST /services-assurance
// (assurance.controller.js, creerServiceAssurance) :
//
//   Champs obligatoires du corps de la requête (multipart/form-data) :
//     nom, pays_id, ville_id, telephone, email, agrement,
//     type_acteur ('compagnie'|'courtier'),
//     fonction, agent_nom, agent_prenom, agent_email
//   Champs optionnels : description, latitude, longitude, agent_telephone, statut_verification
//   Fichier obligatoire : image_assurance
//
// Étapes du formulaire :
//   Étape 1 : Infos générales (nom, type acteur, image)
//   Étape 2 : Localisation (pays, ville)
//   Étape 3 : Infos de contact (email, téléphone)
//   Étape 4 : Infos supplémentaires (agrément, description, coordonnées GPS)
//   Étape 5 : Agent responsable (fonction, nom, prénom, email, téléphone)
//   Étape 6 : Confirmation

const CreationAssurance = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [stepError, setStepError] = useState(null);
  const [compteCree, setCompteCree] = useState(null);

  // Référentiels chargés depuis le backend
  const [pays, setPays] = useState([]);
  const [villes, setVilles] = useState([]);
  const [chargementReferentiels, setChargementReferentiels] = useState(true);

  const [formData, setFormData] = useState({
    // Étape 1 — Infos générales
    image_assurance: null,
    nom: '',
    type_acteur: 'compagnie', // 'compagnie' | 'courtier'

    // Étape 2 — Localisation
    pays_id: '',
    ville_id: '',

    // Étape 3 — Contact
    email: '',
    telephone: '',

    // Étape 4 — Infos supplémentaires
    agrement: '',
    description: '',
    latitude: '',
    longitude: '',

    // Étape 5 — Agent responsable
    fonction: '',
    agent_nom: '',
    agent_prenom: '',
    agent_email: '',
    agent_telephone: '',

    // Étape 6 — Confirmation
    acceptCGU: false,
  });

  // Chargement des pays au montage
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const reponsePays = await listerPays();
        if (annule) return;
        setPays(reponsePays.pays || []);
      } catch (err) {
        if (!annule) {
          setSubmitError("Impossible de charger les pays. Rechargez la page.");
        }
      } finally {
        if (!annule) setChargementReferentiels(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  // Chargement des villes dès qu'un pays est choisi
  useEffect(() => {
    if (!formData.pays_id) {
      setVilles([]);
      return;
    }
    let annule = false;
    (async () => {
      try {
        const reponseVilles = await listerVilles(formData.pays_id);
        if (!annule) setVilles(reponseVilles.villes || []);
      } catch (err) {
        if (!annule) setVilles([]);
      }
    })();
    return () => {
      annule = true;
    };
  }, [formData.pays_id]);

  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'file' ? files[0] : value,
    }));
  };

  const handleFileChange = (e, fieldName) => {
    const file = e.target.files[0];
    setFormData((prev) => ({ ...prev, [fieldName]: file }));
  };

  // Validation par étape
  const validateStep = (step) => {
    setStepError(null);
    
    switch (step) {
      case 1:
        if (!formData.nom.trim()) {
          setStepError('Le nom de la compagnie/courtier est requis.');
          return false;
        }
        if (!formData.image_assurance) {
          setStepError('Un logo est obligatoire.');
          return false;
        }
        return true;

      case 2:
        if (!formData.pays_id) {
          setStepError('Veuillez sélectionner un pays.');
          return false;
        }
        if (!formData.ville_id) {
          setStepError('Veuillez sélectionner une ville.');
          return false;
        }
        return true;

      case 3:
        if (!formData.email.trim()) {
          setStepError('Un email est requis.');
          return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          setStepError('Veuillez entrer une adresse email valide.');
          return false;
        }
        if (!formData.telephone.trim()) {
          setStepError('Un numéro de téléphone est requis.');
          return false;
        }
        return true;

      case 4:
        if (!formData.agrement.trim()) {
          setStepError('Un numéro d\'agrément est requis.');
          return false;
        }
        return true;

      case 5:
        if (!formData.fonction.trim()) {
          setStepError('La fonction de l\'agent est requise.');
          return false;
        }
        if (!formData.agent_nom.trim()) {
          setStepError('Le nom de l\'agent est requis.');
          return false;
        }
        if (!formData.agent_prenom.trim()) {
          setStepError('Le prénom de l\'agent est requis.');
          return false;
        }
        if (!formData.agent_email.trim()) {
          setStepError('Un email pour l\'agent est requis.');
          return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.agent_email)) {
          setStepError('Veuillez entrer une adresse email valide pour l\'agent.');
          return false;
        }
        return true;

      case 6:
        if (!formData.acceptCGU) {
          setStepError('Vous devez accepter les conditions générales.');
          return false;
        }
        return true;

      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
      window.scrollTo(0, 0);
    }
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
    window.scrollTo(0, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep(6)) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Préparation des données
      const dataToSend = {
        nom: formData.nom,
        type_acteur: formData.type_acteur,
        pays_id: formData.pays_id,
        ville_id: formData.ville_id,
        email: formData.email,
        telephone: formData.telephone,
        agrement: formData.agrement,
        description: formData.description || undefined,
        latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
        longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
        image_assurance: formData.image_assurance,
        fonction: formData.fonction,
        agent_nom: formData.agent_nom,
        agent_prenom: formData.agent_prenom,
        agent_email: formData.agent_email,
        agent_telephone: formData.agent_telephone || undefined,
        statut_verification: 'en_cours', // Les nouvelles entrées commencent en révision
      };

      const response = await creerServiceAssurance(dataToSend);

      // Le nom exact du champ email dans la réponse de l'API peut varier
      // selon l'implémentation backend. On essaie les variantes les plus
      // probables avant de retomber sur l'email saisi dans le formulaire,
      // pour ne jamais afficher une case vide silencieusement.
      const agentEmail =
        response.agent?.email ??
        response.agent?.agent_email ??
        response.agent_email ??
        formData.agent_email;

      if (!response.agent?.email && !response.agent?.agent_email && !response.agent_email) {
        // Aide au diagnostic : la réponse ne contenait pas le champ email
        // attendu. On garde une trace en console pour identifier le bon
        // nom de champ à utiliser côté API.
        console.warn(
          "creerServiceAssurance: champ email introuvable dans la réponse, utilisation de la valeur du formulaire en secours.",
          response
        );
      }

      setCompteCree({
        nom_compagnie: response.service_assurance?.nom,
        agent_email: agentEmail,
        mot_de_passe_temporaire: response.agent?.mot_de_passe_temporaire,
      });

      setIsSubmitted(true);
    } catch (err) {
      setSubmitError(
        err.data?.message || err.message || 'Une erreur est survenue lors de la création.'
      );
      setIsSubmitting(false);
    }
  };

  if (isSubmitted && compteCree) {
    return (
      <>
        <main className="main-aps">
          <section style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
            <div className="container-aps">
              <div className="success-card">
                <div className="success-icon">
                  <i className="fa-solid fa-circle-check" />
                </div>
                <h2>Compagnie / Courtier enregistré !</h2>
                <p className="mt-2">
                  Votre compagnie <strong>{compteCree.nom_compagnie}</strong> a été créée
                  avec succès. Elle est actuellement en cours de vérification.
                </p>

                <div className="alert alert-info credentials-box mt-4">
                  <strong>Identifiants de connexion :</strong>
                  <p className="mt-2">
                    Email de l'agent : <code>{compteCree.agent_email}</code>
                  </p>
                  <p>
                    Mot de passe temporaire :{' '}
                    <code>{compteCree.mot_de_passe_temporaire}</code>
                  </p>
                  <p className="mt-2 mb-0">
                    <i className="fa-solid fa-triangle-exclamation" /> Conservez précieusement
                    ce mot de passe. Vous pouvez le changer lors de votre première
                    connexion.
                  </p>
                </div>

                <div className="mt-4" style={{ textAlign: 'center' }}>
                  <a href="/" className="btn btn-primary">
                    <i className="fa-solid fa-home" /> Retour à l'accueil
                  </a>
                </div>
              </div>
            </div>
          </section>
        </main>
      </>
    );
  }

  if (chargementReferentiels) {
    return (
      <main className="main-aps">
        <section style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
          <div className="container-aps" style={{ textAlign: 'center' }}>
            <p>Chargement des référentiels…</p>
          </div>
        </section>
      </main>
    );
  }

  const paysLabel = pays.find((p) => p.pays_id === formData.pays_id)?.nom || '';
  const villeLabel = villes.find((v) => v.ville_id === formData.ville_id)?.nom || '';

  return (
    <>
      <main className="main-aps">
        <section style={{ padding: '2.5rem 0' }}>
          <div className="container-aps">
            <div className="row">
              <div className="col-md-4">
                <aside className="form-side">
                  <h4>Votre inscription en 6 étapes</h4>
                  <p>
                    Quelques minutes suffisent. Votre fiche est publiée dans
                    l'annuaire dès validation de votre agrément et de vos
                    justificatifs.
                  </p>
                  <ul className="form-side-list">
                    <li>
                      <i className="fa-solid fa-building"></i>
                      <div>
                        <strong>Infos générales</strong>
                        <span className="form-side-desc">
                          Nom, type d'acteur et logo
                        </span>
                      </div>
                    </li>
                    <li>
                      <i className="fa-solid fa-location-dot"></i>
                      <div>
                        <strong>Localisation</strong>
                        <span className="form-side-desc">
                          Pays et ville où vous exercez
                        </span>
                      </div>
                    </li>
                    <li>
                      <i className="fa-solid fa-envelope"></i>
                      <div>
                        <strong>Contact</strong>
                        <span className="form-side-desc">
                          Email et téléphone de la compagnie
                        </span>
                      </div>
                    </li>
                    <li>
                      <i className="fa-solid fa-file-circle-check"></i>
                      <div>
                        <strong>Infos supplémentaires</strong>
                        <span className="form-side-desc">
                          Agrément, description et coordonnées GPS
                        </span>
                      </div>
                    </li>
                    <li>
                      <i className="fa-solid fa-user-tie"></i>
                      <div>
                        <strong>Agent responsable</strong>
                        <span className="form-side-desc">
                          Le contact qui gérera votre espace
                        </span>
                      </div>
                    </li>
                    <li>
                      <i className="fa-solid fa-circle-check"></i>
                      <div>
                        <strong>Confirmation</strong>
                        <span className="form-side-desc">
                          Récapitulatif et envoi de votre demande
                        </span>
                      </div>
                    </li>
                  </ul>
                </aside>
              </div>

              <div className="col-md-8">
                <div className="form-main">
                  <div className="form-header">
                    <span className="eyebrow">Inscription</span>
                    <h1>Créer un compte — Compagnie d'assurance ou Courtier</h1>
                    <p className="mt-2">
                      Rejoignez l'annuaire APS en tant que compagnie d'assurance
                      santé ou courtier. Remplissez le formulaire ci-dessous
                      pour créer votre fiche.
                    </p>
                  </div>

                  <div className="form-container">
                    <div className="steps-indicator">
                      {[1, 2, 3, 4, 5, 6].map((step) => (
                        <div
                          key={step}
                          className={`step ${currentStep === step ? 'active' : ''} ${
                            currentStep > step ? 'completed' : ''
                          }`}
                        >
                          <span className="step-number">{step}</span>
                          {currentStep > step && <i className="fa-solid fa-check" />}
                        </div>
                      ))}
                    </div>

                    <div className="form-wrapper">
                      <form onSubmit={handleSubmit}>
                        <div className="form-page active">
                          {/* Étape 1 : Infos générales */}
                    {currentStep === 1 && (
                      <div className="form-page active">
                        <h2 className="form-title">
                          Informations générales
                        </h2>

                        <div className="form-group">
                          <label className="form-label-aps" htmlFor="nom">
                            Nom de la compagnie / courtier{' '}
                            <span className="required-mark">*</span>
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            id="nom"
                            name="nom"
                            value={formData.nom}
                            onChange={handleChange}
                            placeholder="Ex: AXA Assurance, Courtier Santé Plus"
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label-aps" htmlFor="type_acteur">
                            Type d'acteur <span className="required-mark">*</span>
                          </label>
                          <select
                            className="form-select"
                            id="type_acteur"
                            name="type_acteur"
                            value={formData.type_acteur}
                            onChange={handleChange}
                            required
                          >
                            <option value="compagnie">Compagnie d'assurance</option>
                            <option value="courtier">Courtier</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label-aps" htmlFor="image_assurance">
                            Logo de la compagnie{' '}
                            <span className="required-mark">*</span>
                          </label>
                          <div className="file-input-wrapper">
                            <input
                              type="file"
                              className="form-control"
                              id="image_assurance"
                              accept="image/*"
                              onChange={(e) => handleFileChange(e, 'image_assurance')}
                              required
                            />
                            <div className="file-preview">
                              {formData.image_assurance ? (
                                <>
                                  <i className="fa-solid fa-check-circle" />
                                  <p>{formData.image_assurance.name}</p>
                                </>
                              ) : (
                                <>
                                  <i className="fa-solid fa-image" />
                                  <p>Cliquez pour ajouter un logo</p>
                                </>
                              )}
                            </div>
                          </div>
                          <p className="form-hint">Format recommandé : JPG, PNG. Taille max : 5 MB</p>
                        </div>
                      </div>
                    )}

                    {/* Étape 2 : Localisation */}
                    {currentStep === 2 && (
                      <div className="form-page active">
                        <h2 className="form-title">
                          Localisation
                        </h2>

                        <div className="form-group">
                          <label className="form-label-aps" htmlFor="pays_id">
                            Pays <span className="required-mark">*</span>
                          </label>
                          <select
                            className="form-select"
                            id="pays_id"
                            name="pays_id"
                            value={formData.pays_id}
                            onChange={handleChange}
                            required
                          >
                            <option value="">Sélectionner un pays…</option>
                            {pays.map((p) => (
                              <option key={p.pays_id} value={p.pays_id}>
                                {p.nom}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label-aps" htmlFor="ville_id">
                            Ville <span className="required-mark">*</span>
                          </label>
                          <select
                            className="form-select"
                            id="ville_id"
                            name="ville_id"
                            value={formData.ville_id}
                            onChange={handleChange}
                            required
                            disabled={!formData.pays_id}
                          >
                            <option value="">Sélectionner une ville…</option>
                            {villes.map((v) => (
                              <option key={v.ville_id} value={v.ville_id}>
                                {v.nom}
                              </option>
                            ))}
                          </select>
                        </div>

                        {formData.pays_id && formData.ville_id && (
                          <div className="form-summary">
                            <i className="fa-solid fa-map-pin" />
                            <span>
                              {villeLabel}, {paysLabel}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Étape 3 : Infos de contact */}
                    {currentStep === 3 && (
                      <div className="form-page active">
                        <h2 className="form-title">
                          Informations de contact
                        </h2>

                        <div className="form-group">
                          <label className="form-label-aps" htmlFor="email">
                            Email de la compagnie{' '}
                            <span className="required-mark">*</span>
                          </label>
                          <input
                            type="email"
                            className="form-control"
                            id="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="contact@exemple.com"
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label-aps" htmlFor="telephone">
                            Numéro de téléphone{' '}
                            <span className="required-mark">*</span>
                          </label>
                          <input
                            type="tel"
                            className="form-control"
                            id="telephone"
                            name="telephone"
                            value={formData.telephone}
                            onChange={handleChange}
                            placeholder="+237 XXX XXX XXX"
                            required
                          />
                        </div>
                      </div>
                    )}

                    {/* Étape 4 : Infos supplémentaires */}
                    {currentStep === 4 && (
                      <div className="form-page active">
                        <h2 className="form-title">
                          Informations supplémentaires
                        </h2>

                        <div className="form-group">
                          <label className="form-label-aps" htmlFor="agrement">
                            Numéro d'agrément{' '}
                            <span className="required-mark">*</span>
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            id="agrement"
                            name="agrement"
                            value={formData.agrement}
                            onChange={handleChange}
                            placeholder="Ex: AG-2024-001"
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label-aps" htmlFor="description">
                            Description de la compagnie
                          </label>
                          <textarea
                            className="form-control"
                            id="description"
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            placeholder="Décrivez brièvement votre compagnie, vos services, etc."
                            rows="4"
                          />
                          <p className="form-hint">Champ optionnel</p>
                        </div>

                        <h3 className="form-subtitle mt-4">Coordonnées GPS (optionnel)</h3>

                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label-aps" htmlFor="latitude">
                              Latitude
                            </label>
                            <input
                              type="number"
                              className="form-control"
                              id="latitude"
                              name="latitude"
                              value={formData.latitude}
                              onChange={handleChange}
                              placeholder="Ex: 3.8667"
                              step="0.0001"
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps" htmlFor="longitude">
                              Longitude
                            </label>
                            <input
                              type="number"
                              className="form-control"
                              id="longitude"
                              name="longitude"
                              value={formData.longitude}
                              onChange={handleChange}
                              placeholder="Ex: 11.5167"
                              step="0.0001"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Étape 5 : Agent responsable */}
                    {currentStep === 5 && (
                      <div className="form-page active">
                        <h2 className="form-title">
                          Agent responsable
                        </h2>

                        <div className="form-group">
                          <label className="form-label-aps" htmlFor="fonction">
                            Fonction de l'agent{' '}
                            <span className="required-mark">*</span>
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            id="fonction"
                            name="fonction"
                            value={formData.fonction}
                            onChange={handleChange}
                            placeholder="Ex: Directeur, Responsable Administratif"
                            required
                          />
                        </div>

                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label-aps" htmlFor="agent_nom">
                              Nom <span className="required-mark">*</span>
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              id="agent_nom"
                              name="agent_nom"
                              value={formData.agent_nom}
                              onChange={handleChange}
                              placeholder="Nom"
                              required
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps" htmlFor="agent_prenom">
                              Prénom <span className="required-mark">*</span>
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              id="agent_prenom"
                              name="agent_prenom"
                              value={formData.agent_prenom}
                              onChange={handleChange}
                              placeholder="Prénom"
                              required
                            />
                          </div>
                        </div>

                        <div className="form-group">
                          <label className="form-label-aps" htmlFor="agent_email">
                            Email de l'agent{' '}
                            <span className="required-mark">*</span>
                          </label>
                          <input
                            type="email"
                            className="form-control"
                            id="agent_email"
                            name="agent_email"
                            value={formData.agent_email}
                            onChange={handleChange}
                            placeholder="agent@exemple.com"
                            required
                          />
                          <p className="form-hint">
                            Cet email servira de login pour accéder à l'espace agent.
                          </p>
                        </div>

                        <div className="form-group">
                          <label className="form-label-aps" htmlFor="agent_telephone">
                            Téléphone de l'agent
                          </label>
                          <input
                            type="tel"
                            className="form-control"
                            id="agent_telephone"
                            name="agent_telephone"
                            value={formData.agent_telephone}
                            onChange={handleChange}
                            placeholder="+237 XXX XXX XXX"
                          />
                          <p className="form-hint">Champ optionnel</p>
                        </div>
                      </div>
                    )}

                    {/* Étape 6 : Confirmation */}
                    {currentStep === 6 && (
                      <div className="form-page active">
                        <h2 className="form-title">
                          Confirmation
                        </h2>

                        <div className="form-summary-card">
                          <h3>Résumé de votre demande</h3>
                          <div className="summary-row">
                            <span className="summary-label">Compagnie / Courtier :</span>
                            <span className="summary-value">{formData.nom}</span>
                          </div>
                          <div className="summary-row">
                            <span className="summary-label">Type :</span>
                            <span className="summary-value">
                              {formData.type_acteur === 'compagnie'
                                ? 'Compagnie d\'assurance'
                                : 'Courtier'}
                            </span>
                          </div>
                          <div className="summary-row">
                            <span className="summary-label">Localisation :</span>
                            <span className="summary-value">
                              {villeLabel}, {paysLabel}
                            </span>
                          </div>
                          <div className="summary-row">
                            <span className="summary-label">Email :</span>
                            <span className="summary-value">{formData.email}</span>
                          </div>
                          <div className="summary-row">
                            <span className="summary-label">Agent responsable :</span>
                            <span className="summary-value">
                              {formData.agent_prenom} {formData.agent_nom}
                            </span>
                          </div>
                        </div>

                        <div className="form-group mt-4">
                          <div className="form-check">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id="acceptCGU"
                              name="acceptCGU"
                              checked={formData.acceptCGU}
                              onChange={handleChange}
                              required
                            />
                            <label className="form-check-label" htmlFor="acceptCGU">
                              J'accepte les{' '}
                              <a href="#">Conditions générales d'utilisation</a> et la{' '}
                              <a href="#">Politique de confidentialité</a>.
                            </label>
                          </div>
                        </div>

                        <div className="banner-info mt-4">
                          <i className="fa-solid fa-circle-info" />
                          <span>
                            Votre fiche sera examinée par notre équipe avant publication
                            dans l'annuaire.
                          </span>
                        </div>
                      </div>
                    )}

                    {stepError && (
                      <div className="alert alert-danger mt-3" role="alert">
                        <i className="fa-solid fa-triangle-exclamation" /> {stepError}
                      </div>
                    )}

                    {submitError && (
                      <div className="alert alert-danger mt-3" role="alert">
                        <i className="fa-solid fa-triangle-exclamation" /> {submitError}
                      </div>
                    )}

                    <div className="form-nav-actions mt-4">
                      {currentStep > 1 ? (
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          onClick={prevStep}
                          disabled={isSubmitting}
                        >
                          <i className="fa-solid fa-arrow-left"></i> Retour
                        </button>
                      ) : (
                        <div></div>
                      )}

                      {currentStep < 6 ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={nextStep}
                        >
                          Continuer <i className="fa-solid fa-arrow-right"></i>
                        </button>
                      ) : (
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? (
                            'Envoi en cours…'
                          ) : (
                            <>
                              Envoyer ma demande{' '}
                              <i className="fa-solid fa-paper-plane"></i>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </section>
      </main>
    </>
  );
};

export default CreationAssurance;