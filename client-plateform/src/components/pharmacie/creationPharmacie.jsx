import React, { useEffect, useState } from 'react';
// Réutilise la feuille de styles générique des formulaires "création
// de compte pro" (form-shell, stepper, upload-box, confirm-card...),
// déjà utilisée par creationMedecin.jsx — ces classes ne sont pas
// spécifiques au médecin, elles portent juste le nom du premier
// formulaire qui les a introduites. Si le projet en extrait un jour
// un fichier commun (ex. creer-compte-pro.css), remplacer l'import
// ci-dessous en conséquence.
import '../../assets/styles/creer-medecin.css';

import { creerPharmacie } from '../../services/pharmacieService';
import { listerPays, listerVilles } from '../../services/geoService';

// ───────────────────────────────────────────────────────────────────
// Ce formulaire suit EXACTEMENT le contrat de POST /pharmacies
// (pharmacie.controller.js, creerPharmacie côté back / creerPharmacie
// de pharmacieService.js côté front) :
//
//   Corps multipart/form-data — champs obligatoires :
//     nom, pays_id, ville_id, telephone, numero_ordre_titulaire,
//     fonction, agent_nom, agent_prenom, agent_email
//   Champs optionnels :
//     agent_telephone, latitude, longitude
//     (statut_verification existe côté back mais est ignoré si
//     l'appelant n'est pas admin/superadmin — on ne l'envoie donc
//     jamais depuis ce formulaire public)
//   Fichiers obligatoires : image_pharmacie, piece_identite,
//     document_agrement
//
// La route crée EN MÊME TEMPS la fiche pharmacie ET le compte de
// l'agent qui en a la charge (pas forcément la même personne que
// celle qui remplit le formulaire) : la réponse contient donc
// { pharmacie, agent: { utilisateur, mot_de_passe_temporaire } }.
// Ce mot de passe temporaire n'est renvoyé qu'une seule fois par le
// serveur — on ne le stocke nulle part, on l'affiche seulement le
// temps de l'écran de confirmation (à charge pour la personne de le
// transmettre à l'agent concerné).
//
// Contrairement à creationMedecin.jsx, il n'y a ici :
//   - ni référentiel "spécialité" à charger,
//   - ni étape "trésorerie" (Mobile Money / Compte bancaire) : ces
//     entités sont rattachées à un medecin_id, pas à une pharmacie ni
//     à un agent_pharmacie ; il n'existe pas d'équivalent ici.

const ETAPES = [
  'Informations',
  'Localisation',
  'Agent responsable',
  'Justificatifs',
  'Confirmation',
];

const CreationPharmacie = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [stepError, setStepError] = useState(null);
  const [pharmacieCreee, setPharmacieCreee] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  // Référentiels chargés depuis le backend
  const [pays, setPays] = useState([]);
  const [villes, setVilles] = useState([]);
  const [chargementReferentiels, setChargementReferentiels] = useState(true);

  const [formData, setFormData] = useState({
    // Étape 1 — informations de la pharmacie
    nom: '',
    telephone: '',
    pays_id: '',
    ville_id: '',
    numero_ordre_titulaire: '',

    // Étape 2 — localisation (facultative)
    latitude: '',
    longitude: '',

    // Étape 3 — agent responsable
    fonction: '',
    agent_nom: '',
    agent_prenom: '',
    agent_email: '',
    agent_telephone: '',

    // Étape 4 — justificatifs
    image_pharmacie: null,
    piece_identite: null,
    document_agrement: null,

    // Étape 5
    acceptCGU: false,
  });

  // Chargement des pays au montage
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const reponsePays = await listerPays();
        if (!annule) setPays(reponsePays.pays || []);
      } catch (err) {
        if (!annule) {
          setSubmitError(
            "Impossible de charger la liste des pays. Rechargez la page."
          );
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
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleFileChange = (e, fieldName) => {
    const file = e.target.files[0] || null;
    setFormData((prev) => ({ ...prev, [fieldName]: file }));
  };

  const handleCopy = (field, value) => {
    navigator.clipboard?.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  // Validation par étape — bloque "Continuer"/l'envoi tant que les
  // champs requis par le backend pour cette étape ne sont pas remplis.
  const validateStep = (step) => {
    switch (step) {
      case 1:
        if (!formData.nom.trim()) return "Le nom de la pharmacie est obligatoire.";
        if (!formData.telephone.trim()) return "Le téléphone est obligatoire.";
        if (!formData.pays_id) return "Le pays est obligatoire.";
        if (!formData.ville_id) return "La ville est obligatoire.";
        if (!formData.numero_ordre_titulaire.trim())
          return "Le numéro d'ordre du titulaire est obligatoire.";
        return null;
      case 2: {
        const latRenseignee = formData.latitude !== '';
        const lngRenseignee = formData.longitude !== '';
        if (latRenseignee !== lngRenseignee) {
          return "Latitude et longitude doivent être renseignées ensemble (ou laissées vides toutes les deux).";
        }
        return null;
      }
      case 3:
        if (!formData.fonction.trim()) return "La fonction de l'agent est obligatoire.";
        if (!formData.agent_nom.trim()) return "Le nom de l'agent est obligatoire.";
        if (!formData.agent_prenom.trim()) return "Le prénom de l'agent est obligatoire.";
        if (!formData.agent_email.trim()) return "L'e-mail de l'agent est obligatoire.";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.agent_email.trim()))
          return "L'e-mail de l'agent n'est pas valide.";
        return null;
      case 4:
        if (!formData.image_pharmacie) return "La photo de la pharmacie est obligatoire.";
        if (!formData.piece_identite)
          return "La pièce d'identité du titulaire/responsable est obligatoire.";
        if (!formData.document_agrement)
          return "Le document d'agrément officiel est obligatoire.";
        return null;
      case 5:
        if (!formData.acceptCGU)
          return "Vous devez accepter les CGU et la politique de confidentialité.";
        return null;
      default:
        return null;
    }
  };

  const nextStep = () => {
    const erreur = validateStep(currentStep);
    if (erreur) {
      setStepError(erreur);
      return;
    }
    setStepError(null);
    if (currentStep < ETAPES.length) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    setStepError(null);
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const erreur = validateStep(ETAPES.length);
    if (erreur) {
      setStepError(erreur);
      return;
    }

    setStepError(null);
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      // Corps exact attendu par POST /pharmacies (creerPharmacie).
      // statut_verification n'est volontairement jamais envoyé : le
      // serveur l'ignore de toute façon pour un appelant non admin.
      const resultat = await creerPharmacie({
        nom: formData.nom.trim(),
        telephone: formData.telephone.trim(),
        pays_id: formData.pays_id,
        ville_id: formData.ville_id,
        numero_ordre_titulaire: formData.numero_ordre_titulaire.trim(),
        latitude: formData.latitude === '' ? undefined : Number(formData.latitude),
        longitude: formData.longitude === '' ? undefined : Number(formData.longitude),
        fonction: formData.fonction.trim(),
        agent_nom: formData.agent_nom.trim(),
        agent_prenom: formData.agent_prenom.trim(),
        agent_email: formData.agent_email.trim(),
        agent_telephone: formData.agent_telephone.trim() || undefined,
        image_pharmacie: formData.image_pharmacie,
        piece_identite: formData.piece_identite,
        document_agrement: formData.document_agrement,
      });

      const { pharmacie, agent } = resultat;

      setPharmacieCreee({
        message: resultat.message,
        pharmacieNom: pharmacie?.nom,
        agentEmail: agent?.utilisateur?.email,
        motDePasseTemporaire: agent?.mot_de_passe_temporaire,
      });
      setIsSubmitted(true);
    } catch (err) {
      setSubmitError(
        err.message || "Une erreur est survenue lors de l'envoi de la demande. Réessayez."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepper = () => (
    <div className="stepper">
      {ETAPES.map((label, index) => {
        const stepNum = index + 1;
        let stepClass = 'step';

        if (stepNum === currentStep) stepClass += ' is-active';
        else if (stepNum < currentStep) stepClass += ' is-done';

        return (
          <React.Fragment key={stepNum}>
            <div className={stepClass}>
              <div className="step-circle">{stepNum}</div>
              <div className="step-label">{label}</div>
            </div>
            {index < ETAPES.length - 1 && <div className="step-line"></div>}
          </React.Fragment>
        );
      })}
    </div>
  );

  if (isSubmitted) {
    return (
      <>
        <main>
          <section style={{ padding: '3.5rem 0' }}>
            <div className="container-aps">
              <div className="confirm-card">
                <div className="confirm-check-wrap">
                  <div className="confirm-check-ring"></div>
                  <div className="confirm-check-ring"></div>
                  <div className="confirm-check-circle">
                    <i className="bi bi-check-lg"></i>
                  </div>
                </div>

                <h3 className="confirm-title">Pharmacie déclarée</h3>
                <p className="confirm-subtitle">
                  {pharmacieCreee?.message ||
                    "Votre demande a bien été envoyée. La fiche sera visible dans l'annuaire après vérification par un administrateur."}
                </p>

                {pharmacieCreee?.agentEmail && (
                  <div className="confirm-credentials">
                    <div className="confirm-credentials-title">
                      <i className="bi bi-shield-lock-fill"></i>
                      Identifiants de l'agent responsable — à conserver précieusement
                    </div>

                    <div className="cred-row">
                      <div className="cred-icon">
                        <i className="bi bi-envelope-fill"></i>
                      </div>
                      <div className="cred-body">
                        <span className="cred-label">Identifiant</span>
                        <span className="cred-value">{pharmacieCreee.agentEmail}</span>
                      </div>
                      <button
                        type="button"
                        className={`cred-copy ${copiedField === 'email' ? 'copied' : ''}`}
                        onClick={() => handleCopy('email', pharmacieCreee.agentEmail)}
                        title="Copier l'identifiant"
                        aria-label="Copier l'identifiant"
                      >
                        <i className={`bi ${copiedField === 'email' ? 'bi-check2' : 'bi-clipboard'}`}></i>
                      </button>
                    </div>

                    {pharmacieCreee.motDePasseTemporaire && (
                      <div className="cred-row">
                        <div className="cred-icon">
                          <i className="bi bi-key-fill"></i>
                        </div>
                        <div className="cred-body">
                          <span className="cred-label">Mot de passe temporaire</span>
                          <span className="cred-value">
                            <code>{pharmacieCreee.motDePasseTemporaire}</code>
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`cred-copy ${copiedField === 'password' ? 'copied' : ''}`}
                          onClick={() => handleCopy('password', pharmacieCreee.motDePasseTemporaire)}
                          title="Copier le mot de passe"
                          aria-label="Copier le mot de passe"
                        >
                          <i className={`bi ${copiedField === 'password' ? 'bi-check2' : 'bi-clipboard'}`}></i>
                        </button>
                      </div>
                    )}

                    <p style={{ marginTop: '.75rem', marginBottom: 0, fontSize: '.85rem' }}>
                      Ce mot de passe ne sera plus jamais affiché : transmettez-le dès
                      maintenant à l'agent responsable par un canal sûr. Il devra le
                      changer à sa première connexion.
                    </p>
                  </div>
                )}

                <a href="#" className="confirm-cta">
                  Voir ma fiche pharmacie
                  <i className="bi bi-arrow-right"></i>
                </a>

                <div className="confirm-hint">
                  <i className="bi bi-envelope-paper-heart-fill"></i>
                  Un e-mail de confirmation vous a été envoyé.
                </div>
              </div>
            </div>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <main>
        <section style={{ padding: '2.5rem 0' }}>
          <div className="container-aps">
            <div className="form-shell">
              <div className="form-shell-grid">
                <aside className="form-side">
                  <h4>Déclarer votre pharmacie en 5 étapes</h4>
                  <p>
                    Quelques minutes suffisent. Votre fiche est mise en ligne dès
                    validation de votre numéro d'ordre et de vos justificatifs par
                    un administrateur.
                  </p>
                  <ul className="form-side-list">
                    <li>
                      <i className="bi bi-shop"></i>
                      <div>
                        <strong>Informations</strong>
                        <span className="form-side-desc">
                          Nom, contact et localisation administrative
                        </span>
                      </div>
                    </li>
                    <li>
                      <i className="bi bi-geo-alt"></i>
                      <div>
                        <strong>Localisation</strong>
                        <span className="form-side-desc">
                          Facultatif — coordonnées GPS pour la carte
                        </span>
                      </div>
                    </li>
                    <li>
                      <i className="bi bi-person-badge"></i>
                      <div>
                        <strong>Agent responsable</strong>
                        <span className="form-side-desc">
                          La personne qui aura la charge de la fiche
                        </span>
                      </div>
                    </li>
                    <li>
                      <i className="bi bi-file-earmark-check"></i>
                      <div>
                        <strong>Justificatifs</strong>
                        <span className="form-side-desc">
                          Pièces à télécharger pour vérification
                        </span>
                      </div>
                    </li>
                    <li>
                      <i className="bi bi-check-circle"></i>
                      <div>
                        <strong>Confirmation</strong>
                        <span className="form-side-desc">
                          Récapitulatif et envoi de votre demande
                        </span>
                      </div>
                    </li>
                  </ul>
                </aside>

                <div className="form-main">
                  <div className="form-header">
                    <span className="eyebrow">Espace professionnel</span>
                    <h1>Déclarer ma pharmacie</h1>
                    <p>
                      Complétez les 5 étapes ci-dessous. Un compte est créé pour
                      l'agent qui aura la charge de la fiche — pas forcément vous.
                    </p>
                  </div>

                  {renderStepper()}

                  {submitError && (
                    <div className="alert alert-danger" role="alert">
                      {submitError}
                    </div>
                  )}

                  <form onSubmit={handleSubmit}>
                    {/* Étape 1 : Informations de la pharmacie */}
                    {currentStep === 1 && (
                      <div className="form-page active">
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Nom de la pharmacie <span className="required-mark">*</span>
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              name="nom"
                              value={formData.nom}
                              onChange={handleChange}
                              placeholder="Ex. Pharmacie du Centre"
                              required
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Téléphone <span className="required-mark">*</span>
                            </label>
                            <input
                              type="tel"
                              className="form-control"
                              name="telephone"
                              value={formData.telephone}
                              onChange={handleChange}
                              placeholder="+237600000000"
                              required
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Pays <span className="required-mark">*</span>
                            </label>
                            <select
                              className="form-select"
                              name="pays_id"
                              value={formData.pays_id}
                              onChange={(e) => {
                                handleChange(e);
                                setFormData((prev) => ({ ...prev, ville_id: '' }));
                              }}
                              required
                              disabled={chargementReferentiels}
                            >
                              <option value="">
                                {chargementReferentiels ? 'Chargement…' : 'Sélectionner…'}
                              </option>
                              {pays.map((p) => (
                                <option key={p.pays_id} value={p.pays_id}>
                                  {p.nom}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Ville <span className="required-mark">*</span>
                            </label>
                            <select
                              className="form-select"
                              name="ville_id"
                              value={formData.ville_id}
                              onChange={handleChange}
                              required
                              disabled={!formData.pays_id}
                            >
                              <option value="">
                                {formData.pays_id ? 'Sélectionner…' : "Choisissez d'abord un pays"}
                              </option>
                              {villes.map((v) => (
                                <option key={v.ville_id} value={v.ville_id}>
                                  {v.nom}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Numéro d'ordre du titulaire <span className="required-mark">*</span>
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              name="numero_ordre_titulaire"
                              value={formData.numero_ordre_titulaire}
                              onChange={handleChange}
                              placeholder="Numéro délivré par l'ordre des pharmaciens"
                              required
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Étape 2 : Localisation (facultative) */}
                    {currentStep === 2 && (
                      <div className="form-page active">
                        <p className="form-hint" style={{ marginBottom: '1rem' }}>
                          Facultatif : renseignez les coordonnées GPS pour que la
                          pharmacie apparaisse précisément sur la carte. Vous
                          pouvez passer cette étape.
                        </p>
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label-aps">Latitude</label>
                            <input
                              type="number"
                              step="any"
                              className="form-control"
                              name="latitude"
                              value={formData.latitude}
                              onChange={handleChange}
                              placeholder="4.0511"
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">Longitude</label>
                            <input
                              type="number"
                              step="any"
                              className="form-control"
                              name="longitude"
                              value={formData.longitude}
                              onChange={handleChange}
                              placeholder="9.7679"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Étape 3 : Agent responsable */}
                    {currentStep === 3 && (
                      <div className="form-page active">
                        <p className="form-hint" style={{ marginBottom: '1rem' }}>
                          Un compte est créé pour la personne qui aura la charge
                          de cette pharmacie (pas forcément vous). Un mot de
                          passe temporaire lui sera communiqué à la fin de cette
                          demande.
                        </p>
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Fonction de l'agent <span className="required-mark">*</span>
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              name="fonction"
                              value={formData.fonction}
                              onChange={handleChange}
                              placeholder="Ex. Titulaire, Pharmacien assistant"
                              required
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Téléphone de l'agent
                            </label>
                            <input
                              type="tel"
                              className="form-control"
                              name="agent_telephone"
                              value={formData.agent_telephone}
                              onChange={handleChange}
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Nom <span className="required-mark">*</span>
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              name="agent_nom"
                              value={formData.agent_nom}
                              onChange={handleChange}
                              required
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Prénom <span className="required-mark">*</span>
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              name="agent_prenom"
                              value={formData.agent_prenom}
                              onChange={handleChange}
                              required
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Adresse e-mail <span className="required-mark">*</span>
                            </label>
                            <input
                              type="email"
                              className="form-control"
                              name="agent_email"
                              value={formData.agent_email}
                              onChange={handleChange}
                              required
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Étape 4 : Justificatifs */}
                    {currentStep === 4 && (
                      <div className="form-page active">
                        <div className="row g-3">
                          <div className="col-md-4">
                            <label className="form-label-aps">
                              Photo de la pharmacie <span className="required-mark">*</span>
                            </label>
                            <div className={`upload-box ${formData.image_pharmacie ? 'has-file' : ''}`}>
                              <input
                                type="file"
                                accept="image/png, image/jpeg"
                                onChange={(e) => handleFileChange(e, 'image_pharmacie')}
                              />
                              <i className="bi bi-cloud-arrow-up"></i>
                              <strong>Glissez le fichier ici</strong>
                              <span className="upload-default-text">JPG, PNG — 5 Mo max</span>
                              <span className="upload-filename">{formData.image_pharmacie?.name}</span>
                              <button
                                type="button"
                                className="upload-remove"
                                onClick={() => setFormData((prev) => ({ ...prev, image_pharmacie: null }))}
                              >
                                <i className="bi bi-x"></i>
                              </button>
                            </div>
                          </div>
                          <div className="col-md-4">
                            <label className="form-label-aps">
                              Pièce d'identité du responsable <span className="required-mark">*</span>
                            </label>
                            <div className={`upload-box ${formData.piece_identite ? 'has-file' : ''}`}>
                              <input
                                type="file"
                                accept=".pdf, image/png, image/jpeg"
                                onChange={(e) => handleFileChange(e, 'piece_identite')}
                              />
                              <i className="bi bi-cloud-arrow-up"></i>
                              <strong>Glissez le fichier ici</strong>
                              <span className="upload-default-text">PDF, JPG — 5 Mo max</span>
                              <span className="upload-filename">{formData.piece_identite?.name}</span>
                              <button
                                type="button"
                                className="upload-remove"
                                onClick={() => setFormData((prev) => ({ ...prev, piece_identite: null }))}
                              >
                                <i className="bi bi-x"></i>
                              </button>
                            </div>
                          </div>
                          <div className="col-md-4">
                            <label className="form-label-aps">
                              Agrément officiel d'exercice <span className="required-mark">*</span>
                            </label>
                            <div className={`upload-box ${formData.document_agrement ? 'has-file' : ''}`}>
                              <input
                                type="file"
                                accept=".pdf, image/png, image/jpeg"
                                onChange={(e) => handleFileChange(e, 'document_agrement')}
                              />
                              <i className="bi bi-cloud-arrow-up"></i>
                              <strong>Glissez le fichier ici</strong>
                              <span className="upload-default-text">PDF, JPG — 5 Mo max</span>
                              <span className="upload-filename">{formData.document_agrement?.name}</span>
                              <button
                                type="button"
                                className="upload-remove"
                                onClick={() => setFormData((prev) => ({ ...prev, document_agrement: null }))}
                              >
                                <i className="bi bi-x"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                        <p className="form-hint mt-3">
                          Les 3 pièces sont obligatoires. Votre fiche restera en
                          attente de vérification tant qu'un administrateur ne
                          l'a pas validée.
                        </p>
                      </div>
                    )}

                    {/* Étape 5 : Confirmation */}
                    {currentStep === 5 && (
                      <div className="form-page active">
                        <div className="form-check mb-4">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            name="acceptCGU"
                            id="acceptCGU"
                            checked={formData.acceptCGU}
                            onChange={handleChange}
                            required
                          />
                          <label className="form-check-label" htmlFor="acceptCGU">
                            J'accepte les <a href="#">Conditions générales d'utilisation</a> et
                            la <a href="#">Politique de confidentialité</a>.
                          </label>
                        </div>
                      </div>
                    )}

                    {stepError && (
                      <div className="alert alert-danger" role="alert">
                        {stepError}
                      </div>
                    )}

                    <div className="form-nav-actions">
                      {currentStep > 1 ? (
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          onClick={prevStep}
                          disabled={isSubmitting}
                        >
                          <i className="bi bi-arrow-left"></i> Retour
                        </button>
                      ) : (
                        <div></div>
                      )}

                      {currentStep < ETAPES.length ? (
                        <button type="button" className="btn btn-primary" onClick={nextStep}>
                          Continuer <i className="bi bi-arrow-right"></i>
                        </button>
                      ) : (
                        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                          {isSubmitting ? 'Envoi en cours…' : (
                            <>Envoyer ma demande <i className="bi bi-send"></i></>
                          )}
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
};

export default CreationPharmacie;