import React, { useEffect, useState } from 'react';
// Réutilise la feuille de styles générique des formulaires "création de
// compte" (form-shell, stepper, form-page, confirm-card...) déjà utilisée
// par creationMedecin.jsx, creationPharmacie.jsx et creationCentreSante.jsx —
// ces classes ne sont pas spécifiques au médecin, elles portent juste le nom
// du premier formulaire qui les a introduites.
import '../../assets/styles/creer-medecin.css';

import { useAuth } from '../../context/AuthContext';
import { inscrirePatient } from '../../services/authService';
import { listerPays } from '../../services/geoService';

// ───────────────────────────────────────────────────────────────────
// Ce formulaire suit EXACTEMENT la logique de création de patient déjà
// utilisée à l'étape 2 de RendezVous.jsx (formulaire "Créez votre compte
// patient" affiché quand personne n'est connecté) : c'est la SEULE voie
// de création d'un compte patient côté backend.
//
//   POST /auth/register (authentification.controller.js, inscrire) :
//     - route publique, ne peut créer QU'un compte de rôle "patient"
//       (imposé côté serveur, jamais un autre rôle) ;
//     - POST /auth/comptes (creerCompteAdministre), utilisé par
//       creationMedecin.jsx/creationPharmacie.jsx pour les comptes pros,
//       exclut explicitement "patient" de ROLES_ADMINISTRABLES côté
//       client ET côté serveur (ROLES_CREABLES_PAR) : impossible de
//       créer un patient par cette route, même en admin.
//
//   Champs obligatoires du corps JSON :
//     nom, prenom, email, mot_de_passe, pays_id, date_naissance
//   Champ optionnel :
//     telephone
//   Aucun fichier à envoyer, aucune spécialité/numéro d'ordre/trésorerie :
//   ces notions n'existent pas sur le modèle Patient (voir
//   patient.controller.js : { patient_id, utilisateur_id, date_naissance,
//   rendez_vous[], ordonnances[] }).
//
// Différence majeure avec creationMedecin.jsx / creationPharmacie.jsx :
// POST /auth/register ne renvoie PAS de mot de passe temporaire généré
// par le serveur — c'est le patient qui choisit son propre mot de passe
// dans ce formulaire (mot_de_passe_min 8 caractères, voir
// authentification.controller.js) — et ne renvoie pas non plus de
// tokens. Exactement comme RendezVous.jsx (confirmerRendezVous), on
// enchaîne donc automatiquement avec connecter(email, mot_de_passe)
// (AuthContext) juste après l'inscription pour ouvrir la session. Un
// échec de cette connexion automatique n'invalide pas la création du
// compte : le patient est simplement redirigé vers /login.

const ETAPES = ['Informations', 'Sécurité', 'Confirmation'];

// Date minimale/maximale sélectionnable pour la date de naissance :
// aujourd'hui, reprise telle quelle de RendezVous.jsx (dateDuJourISO).
function dateDuJourISO() {
  return new Date().toISOString().slice(0, 10);
}

const CreerPatient = () => {
  const { connecter } = useAuth();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [stepError, setStepError] = useState(null);
  const [compteCree, setCompteCree] = useState(null);

  // Référentiel Pays chargé depuis le backend
  const [pays, setPays] = useState([]);
  const [chargementReferentiels, setChargementReferentiels] = useState(true);

  const [formData, setFormData] = useState({
    // Étape 1 — informations personnelles
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    date_naissance: '',
    pays_id: '',

    // Étape 2 — sécurité (confirmation_mot_de_passe reste côté client,
    // jamais envoyée au serveur : voir handleSubmit)
    mot_de_passe: '',
    confirmation_mot_de_passe: '',

    // Étape 3
    acceptCGU: false,
  });

  // Chargement des pays au montage — même appel que listerPays() dans
  // RendezVous.jsx : { pays: [{ pays_id, nom, code_iso2 }] }.
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

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Validation par étape — bloque "Continuer"/l'envoi tant que les champs
  // requis par POST /auth/register pour cette étape ne sont pas remplis.
  const validateStep = (step) => {
    switch (step) {
      case 1:
        if (!formData.prenom.trim()) return "Le prénom est obligatoire.";
        if (!formData.nom.trim()) return "Le nom est obligatoire.";
        if (!formData.email.trim()) return "L'adresse e-mail est obligatoire.";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim()))
          return "L'adresse e-mail n'est pas valide.";
        if (!formData.date_naissance) return "La date de naissance est obligatoire.";
        if (!formData.pays_id) return "Le pays est obligatoire.";
        return null;
      case 2:
        if (formData.mot_de_passe.length < 8)
          return "Le mot de passe doit contenir au moins 8 caractères.";
        if (formData.mot_de_passe !== formData.confirmation_mot_de_passe)
          return "Les deux mots de passe ne correspondent pas.";
        return null;
      case 3:
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

    const erreur = validateStep(3);
    if (erreur) {
      setStepError(erreur);
      return;
    }

    setStepError(null);
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      // Corps exact attendu par POST /auth/register (inscrire) :
      // confirmation_mot_de_passe n'existe pas côté backend, elle ne
      // sert qu'à la validation du formulaire et n'est jamais envoyée.
      const donneesPatient = {
        nom: formData.nom.trim(),
        prenom: formData.prenom.trim(),
        email: formData.email.trim(),
        telephone: formData.telephone.trim() || undefined,
        mot_de_passe: formData.mot_de_passe,
        pays_id: formData.pays_id,
        date_naissance: formData.date_naissance,
      };

      await inscrirePatient(donneesPatient);

      // inscrirePatient() ne renvoie ni tokens ni session : on ouvre la
      // session juste après, exactement comme confirmerRendezVous() dans
      // RendezVous.jsx. Un échec ici n'invalide pas la création du
      // compte — le patient pourra toujours se connecter depuis /login.
      let connexionReussie = true;
      try {
        await connecter(donneesPatient.email, donneesPatient.mot_de_passe);
      } catch (errConnexion) {
        connexionReussie = false;
      }

      setCompteCree({ email: donneesPatient.email, connexionReussie });
      setIsSubmitted(true);
    } catch (err) {
      setSubmitError(
        err.message || "Une erreur est survenue lors de la création de votre compte. Réessayez."
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
                    <i className="fa-solid fa-check"></i>
                  </div>
                </div>

                <h3 className="confirm-title">Compte créé</h3>
                <p className="confirm-subtitle">
                  {compteCree?.connexionReussie
                    ? 'Votre compte patient est prêt. Vous êtes maintenant connecté(e).'
                    : "Votre compte patient a bien été créé, mais la connexion automatique a échoué. Connectez-vous depuis la page de connexion."}
                </p>

                {!compteCree?.connexionReussie && compteCree?.email && (
                  <div className="confirm-credentials">
                    <div className="confirm-credentials-title">
                      <i className="fa-solid fa-envelope"></i>
                      Identifiant de connexion
                    </div>
                    <div className="cred-row">
                      <div className="cred-icon">
                        <i className="fa-solid fa-envelope"></i>
                      </div>
                      <div className="cred-body">
                        <span className="cred-label">Identifiant</span>
                        <span className="cred-value">{compteCree.email}</span>
                      </div>
                    </div>
                  </div>
                )}

                <a
                  href={compteCree?.connexionReussie ? '/portail/patient-rdv' : '/login'}
                  className="confirm-cta"
                >
                  {compteCree?.connexionReussie ? 'Accéder à mon espace patient' : 'Me connecter'}
                  <i className="fa-solid fa-arrow-right"></i>
                </a>

                <div className="confirm-hint">
                  <i className="fa-solid fa-envelope-open-text"></i>
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
                  <h4>Votre inscription en 3 étapes</h4>
                  <p>
                    Quelques informations suffisent pour créer votre compte
                    patient et prendre rendez-vous avec nos praticiens.
                  </p>
                  <ul className="form-side-list">
                    <li>
                      <i className="fa-solid fa-user"></i>
                      <div>
                        <strong>Informations</strong>
                        <span className="form-side-desc">
                          Vos coordonnées, votre date de naissance et votre pays
                        </span>
                      </div>
                    </li>
                    <li>
                      <i className="fa-solid fa-lock"></i>
                      <div>
                        <strong>Sécurité</strong>
                        <span className="form-side-desc">
                          Le mot de passe qui protège votre compte
                        </span>
                      </div>
                    </li>
                    <li>
                      <i className="fa-solid fa-circle-check"></i>
                      <div>
                        <strong>Confirmation</strong>
                        <span className="form-side-desc">
                          Acceptation des conditions et envoi
                        </span>
                      </div>
                    </li>
                  </ul>
                </aside>

                <div className="form-main">
                  <div className="form-header">
                    <span className="eyebrow">Espace patient</span>
                    <h1>Créer mon compte patient</h1>
                    <p>
                      Complétez les 3 étapes ci-dessous pour créer votre compte
                      et accéder à votre espace patient.
                    </p>
                  </div>

                  {renderStepper()}

                  {submitError && (
                    <div className="alert alert-danger" role="alert">
                      {submitError}
                    </div>
                  )}

                  <form onSubmit={handleSubmit}>
                    {/* Étape 1 : Informations personnelles */}
                    {currentStep === 1 && (
                      <div className="form-page active">
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Prénom <span className="required-mark">*</span>
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              name="prenom"
                              value={formData.prenom}
                              onChange={handleChange}
                              required
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Nom <span className="required-mark">*</span>
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              name="nom"
                              value={formData.nom}
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
                              name="email"
                              value={formData.email}
                              onChange={handleChange}
                              required
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">Téléphone</label>
                            <input
                              type="tel"
                              className="form-control"
                              name="telephone"
                              value={formData.telephone}
                              onChange={handleChange}
                            />
                            <p className="form-hint">Facultatif.</p>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Date de naissance <span className="required-mark">*</span>
                            </label>
                            <input
                              type="date"
                              className="form-control"
                              name="date_naissance"
                              max={dateDuJourISO()}
                              value={formData.date_naissance}
                              onChange={handleChange}
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
                              onChange={handleChange}
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
                        </div>
                      </div>
                    )}

                    {/* Étape 2 : Sécurité */}
                    {currentStep === 2 && (
                      <div className="form-page active">
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Mot de passe <span className="required-mark">*</span>
                            </label>
                            <input
                              type="password"
                              className="form-control"
                              name="mot_de_passe"
                              minLength={8}
                              value={formData.mot_de_passe}
                              onChange={handleChange}
                              required
                            />
                            <p className="form-hint">8 caractères minimum.</p>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Confirmer le mot de passe{' '}
                              <span className="required-mark">*</span>
                            </label>
                            <input
                              type="password"
                              className="form-control"
                              name="confirmation_mot_de_passe"
                              minLength={8}
                              value={formData.confirmation_mot_de_passe}
                              onChange={handleChange}
                              required
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Étape 3 : Confirmation */}
                    {currentStep === 3 && (
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
                            J'accepte les{' '}
                            <a href="#">Conditions générales d'utilisation</a> et
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
                          <i className="fa-solid fa-arrow-left"></i> Retour
                        </button>
                      ) : (
                        <div></div>
                      )}

                      {currentStep < ETAPES.length ? (
                        <button type="button" className="btn btn-primary" onClick={nextStep}>
                          Continuer <i className="fa-solid fa-arrow-right"></i>
                        </button>
                      ) : (
                        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                          {isSubmitting ? 'Envoi en cours…' : (
                            <>Créer mon compte <i className="fa-solid fa-paper-plane"></i></>
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

export default CreerPatient;