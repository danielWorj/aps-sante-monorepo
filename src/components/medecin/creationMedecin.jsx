import React, { useEffect, useState } from 'react';
import '../../assets/styles/creer-medecin.css';

import { creerMedecin, listerSpecialites, verifierAppartenanceOrdre } from '../../services/medecinService';
import { listerPays, listerVilles } from '../../services/geoService';
import { connecter } from '../../services/authService';
import { creerMobileMoney, creerCompteBancaire, listerTypesMobileMoney } from '../../services/moyenPaiementService';

// ───────────────────────────────────────────────────────────────────
// Ce formulaire suit EXACTEMENT le contrat de POST /medecins
// (medecin.controller.js, creerMedecin) :
//
//   Champs obligatoires du corps de la requête (multipart/form-data) :
//     nom, prenom, email, pays_id, specialite_id, numero_ordre,
//     pays_exercice_id, ville_exercice_id, teleconsultation_activee,
//     tarif_indicatif, biographie (non vide)
//   Champ optionnel : telephone
//   Fichiers obligatoires : cni, attestation — optionnel : photo
//
// Deux simplifications volontaires par rapport au schéma brut :
//   - specialite n'est PAS un texte libre : c'est un specialite_id
//     (référentiel /specialites) — le formulaire propose donc un
//     select alimenté par listerSpecialites().
//   - pays_id (compte utilisateur) et pays_exercice_id (fiche médecin)
//     sont deux colonnes distinctes côté backend, mais on ne demande
//     qu'un seul "Pays" au médecin (son pays de résidence = son pays
//     d'exercice) et on l'envoie dans les deux champs. C'est une
//     hypothèse produit assumée, pas une contrainte du backend.
//
// Champs retirés par rapport à la maquette initiale car ABSENTS du
// modèle Medecin / du handler creerMedecin, donc jamais persistés si
// on les envoyait quand même :
//   - anneesExperience, typeConsultation (remplacé par le vrai champ
//     booléen teleconsultation_activee)
//   - structure / nomCentre / adresseCentre (aucune notion de
//     structure de rattachement sur Medecin à la création)
//   - codeSwift (CompteBancaire n'a que nom_banque, titulaire, iban)
//
// Étape 5 "Trésorerie" : POST /medecins ne connaît pas Mobile Money /
// Compte bancaire (ce sont des entités séparées, MobileMoney /
// CompteBancaire, rattachées par medecin_id et réservées au médecin
// propriétaire authentifié). Cette étape reste donc optionnelle et,
// si elle est renseignée, est envoyée APRÈS la création du médecin :
// on se connecte avec le mot de passe temporaire renvoyé une seule
// fois par le serveur, puis on crée le MobileMoney/CompteBancaire
// avec le medecin_id obtenu. Un échec à cette étape n'invalide pas la
// création du compte médecin.

const CreationMedecin = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [stepError, setStepError] = useState(null);
  const [compteCree, setCompteCree] = useState(null);

  // Référentiels chargés depuis le backend
  const [pays, setPays] = useState([]);
  const [villes, setVilles] = useState([]);
  const [specialites, setSpecialites] = useState([]);
  const [typesMobileMoney, setTypesMobileMoney] = useState([]);
  const [chargementReferentiels, setChargementReferentiels] = useState(true);

  // Vérification du numéro d'inscription à l'Ordre (informative,
  // non bloquante pour la soumission)
  const [ordreVerification, setOrdreVerification] = useState({ statut: 'idle' });

  const [formData, setFormData] = useState({
    // Étape 1 — compte + exercice
    photo: null,
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    pays_id: '',
    ville_exercice_id: '',

    // Étape 2 — spécialité & ordre
    specialite_id: '',
    numero_ordre: '',
    teleconsultation_activee: false,
    tarif_indicatif: '',

    // Étape 3 — biographie
    biographie: '',

    // Étape 4 — justificatifs
    cni: null,
    attestation: null,

    // Étape 5 — trésorerie (optionnelle)
    tresorerie: '', // '' | 'Mobile Money' | 'Compte bancaire'
    type_mobile_money_id: '',
    numero_paiement: '',
    titulaire: '',
    nom_banque: '',
    iban: '',

    // Étape 6
    acceptCGU: false,
  });

  // Chargement des pays + spécialités au montage
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const [reponsePays, listeSpecialites] = await Promise.all([
          listerPays(),
          listerSpecialites(),
        ]);
        if (annule) return;
        setPays(reponsePays.pays || []);
        setSpecialites(listeSpecialites || []);
      } catch (err) {
        if (!annule) {
          setSubmitError(
            "Impossible de charger les référentiels (pays, spécialités). Rechargez la page."
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

  // Chargement des opérateurs Mobile Money dès que "Mobile Money" est
  // choisi comme mode de trésorerie (filtré sur le pays sélectionné)
  useEffect(() => {
    if (formData.tresorerie !== 'Mobile Money') return;
    let annule = false;
    (async () => {
      try {
        const liste = await listerTypesMobileMoney(
          formData.pays_id ? { pays_id: formData.pays_id } : {}
        );
        if (!annule) setTypesMobileMoney(liste || []);
      } catch (err) {
        if (!annule) setTypesMobileMoney([]);
      }
    })();
    return () => {
      annule = true;
    };
  }, [formData.tresorerie, formData.pays_id]);

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

  const handleVerifierOrdre = async () => {
    const numero = formData.numero_ordre.trim();
    if (!numero) return;
    setOrdreVerification({ statut: 'loading' });
    try {
      const resultat = await verifierAppartenanceOrdre(numero);
      if (resultat.appartient_ordre) {
        setOrdreVerification({ statut: 'trouve', nomComplet: resultat.nom_complet });
      } else {
        setOrdreVerification({ statut: 'introuvable' });
      }
    } catch (err) {
      setOrdreVerification({
        statut: 'erreur',
        message: err.message || "Vérification impossible pour le moment.",
      });
    }
  };

  // Validation par étape — bloque "Continuer"/l'envoi tant que les
  // champs requis par le backend pour cette étape ne sont pas remplis.
  const validateStep = (step) => {
    switch (step) {
      case 1:
        if (!formData.nom.trim()) return "Le nom est obligatoire.";
        if (!formData.prenom.trim()) return "Le prénom est obligatoire.";
        if (!formData.email.trim()) return "L'adresse e-mail est obligatoire.";
        if (!formData.pays_id) return "Le pays est obligatoire.";
        if (!formData.ville_exercice_id) return "La ville d'exercice est obligatoire.";
        return null;
      case 2:
        if (!formData.specialite_id) return "La spécialité est obligatoire.";
        if (!formData.numero_ordre.trim()) return "Le numéro d'inscription à l'Ordre est obligatoire.";
        if (formData.tarif_indicatif === '' || Number(formData.tarif_indicatif) < 0)
          return "Le tarif indicatif est obligatoire.";
        return null;
      case 3:
        if (!formData.biographie.trim()) return "La présentation (biographie) est obligatoire.";
        return null;
      case 4:
        if (!formData.cni) return "La pièce d'identité (CNI) est obligatoire.";
        if (!formData.attestation) return "L'attestation d'inscription à l'Ordre est obligatoire.";
        return null;
      case 5:
        if (formData.tresorerie === 'Mobile Money') {
          if (!formData.type_mobile_money_id) return "L'opérateur Mobile Money est obligatoire.";
          if (!formData.numero_paiement.trim()) return "Le numéro Mobile Money est obligatoire.";
          if (!formData.titulaire.trim()) return "Le nom du titulaire est obligatoire.";
        } else if (formData.tresorerie === 'Compte bancaire') {
          if (!formData.nom_banque.trim()) return "Le nom de la banque est obligatoire.";
          if (!formData.titulaire.trim()) return "Le titulaire du compte est obligatoire.";
          if (!formData.iban.trim()) return "Le numéro de compte / IBAN est obligatoire.";
        }
        return null;
      case 6:
        if (!formData.acceptCGU) return "Vous devez accepter les CGU et la politique de confidentialité.";
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
    if (currentStep < 6) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    setStepError(null);
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const erreur = validateStep(6);
    if (erreur) {
      setStepError(erreur);
      return;
    }

    setStepError(null);
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      // Corps exact attendu par POST /medecins (creerMedecin)
      const donneesMedecin = {
        nom: formData.nom.trim(),
        prenom: formData.prenom.trim(),
        email: formData.email.trim(),
        telephone: formData.telephone.trim() || undefined,
        pays_id: formData.pays_id,
        specialite_id: formData.specialite_id,
        numero_ordre: formData.numero_ordre.trim(),
        pays_exercice_id: formData.pays_id,
        ville_exercice_id: formData.ville_exercice_id,
        teleconsultation_activee: formData.teleconsultation_activee,
        tarif_indicatif: Number(formData.tarif_indicatif),
        biographie: formData.biographie.trim(),
      };

      const fichiers = {
        cni: formData.cni,
        attestation: formData.attestation,
        photo: formData.photo || undefined,
      };

      const resultat = await creerMedecin(donneesMedecin, fichiers);
      const { medecin, utilisateur } = resultat;

      // Étape 5 optionnelle : n'est envoyée qu'APRÈS la création du
      // médecin, et seulement si un mode de trésorerie a été choisi.
      // Nécessite une session (medecin propriétaire authentifié) —
      // obtenue ici via le mot de passe temporaire tout juste généré.
      let erreurTresorerie = null;
      if (formData.tresorerie === 'Mobile Money' || formData.tresorerie === 'Compte bancaire') {
        try {
          await connecter(utilisateur.email, utilisateur.mot_de_passe_temporaire);

          if (formData.tresorerie === 'Mobile Money') {
            await creerMobileMoney({
              medecin_id: medecin.medecin_id,
              type_mobile_money_id: formData.type_mobile_money_id,
              numero: formData.numero_paiement.trim(),
              titulaire: formData.titulaire.trim(),
            });
          } else {
            await creerCompteBancaire({
              medecin_id: medecin.medecin_id,
              nom_banque: formData.nom_banque.trim(),
              titulaire: formData.titulaire.trim(),
              iban: formData.iban.trim(),
            });
          }
        } catch (errTresorerie) {
          erreurTresorerie =
            errTresorerie.message ||
            "Votre compte a bien été créé, mais l'enregistrement du moyen de paiement a échoué. Vous pourrez le configurer depuis votre espace médecin.";
        }
      }

      // utilisateur.mot_de_passe_temporaire n'est renvoyé qu'une seule
      // fois par le serveur : on ne le restocke nulle part, on
      // l'affiche seulement le temps de cet écran de confirmation.
      setCompteCree({
        email: utilisateur.email,
        motDePasseTemporaire: utilisateur.mot_de_passe_temporaire,
        erreurTresorerie,
      });
      setIsSubmitted(true);
    } catch (err) {
      setSubmitError(
        err.message || "Une erreur est survenue lors de la création de votre compte. Réessayez."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepper = () => {
    const steps = [
      'Informations',
      'Spécialité & Ordre',
      'Biographie',
      'Justificatifs',
      'Trésorerie',
      'Confirmation',
    ];

    return (
      <div className="stepper">
        {steps.map((label, index) => {
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
              {index < steps.length - 1 && <div className="step-line"></div>}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

if (isSubmitted) {
  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text);
  };
  const [copiedField, setCopiedField] = useState(null);
  const handleCopy = (field, value) => {
    copyToClipboard(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  return (
    <>
      <main>
        <section style={{ padding: '3.5rem 0' }}>
          <div className="container-aps">
            <div className="confirm-card">
              {/* Checkmark animé */}
              <div className="confirm-check-wrap">
                <div className="confirm-check-ring"></div>
                <div className="confirm-check-ring"></div>
                <div className="confirm-check-circle">
                  <i className="bi bi-check-lg"></i>
                </div>
              </div>

              <h3 className="confirm-title">Demande envoyée</h3>
              <p className="confirm-subtitle">
                Votre numéro d'inscription à l'Ordre et vos justificatifs sont
                en cours de vérification. Vous recevrez un e-mail dès la mise
                en ligne de votre fiche.
              </p>

              {/* Bloc identifiants */}
              {compteCree && (
                <div className="confirm-credentials">
                  <div className="confirm-credentials-title">
                    <i className="bi bi-shield-lock-fill"></i>
                    Identifiants à conserver précieusement
                  </div>

                  <div className="cred-row">
                    <div className="cred-icon">
                      <i className="bi bi-envelope-fill"></i>
                    </div>
                    <div className="cred-body">
                      <span className="cred-label">Identifiant</span>
                      <span className="cred-value">{compteCree.email}</span>
                    </div>
                    <button
                      type="button"
                      className={`cred-copy ${copiedField === 'email' ? 'copied' : ''}`}
                      onClick={() => handleCopy('email', compteCree.email)}
                      title="Copier l'identifiant"
                      aria-label="Copier l'identifiant"
                    >
                      <i className={`bi ${copiedField === 'email' ? 'bi-check2' : 'bi-clipboard'}`}></i>
                    </button>
                  </div>

                  <div className="cred-row">
                    <div className="cred-icon">
                      <i className="bi bi-key-fill"></i>
                    </div>
                    <div className="cred-body">
                      <span className="cred-label">Mot de passe temporaire</span>
                      <span className="cred-value">
                        <code>{compteCree.motDePasseTemporaire}</code>
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`cred-copy ${copiedField === 'password' ? 'copied' : ''}`}
                      onClick={() => handleCopy('password', compteCree.motDePasseTemporaire)}
                      title="Copier le mot de passe"
                      aria-label="Copier le mot de passe"
                    >
                      <i className={`bi ${copiedField === 'password' ? 'bi-check2' : 'bi-clipboard'}`}></i>
                    </button>
                  </div>
                </div>
              )}

              {/* Avertissement trésorerie */}
              {compteCree?.erreurTresorerie && (
                <div className="confirm-warning" role="alert">
                  <i className="bi bi-exclamation-triangle-fill"></i>
                  <span>{compteCree.erreurTresorerie}</span>
                </div>
              )}

              {/* CTA principal */}
              <a href="#" className="confirm-cta">
                Suivre l'état de ma demande
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
                  <h4>Votre inscription en 6 étapes</h4>
                  <p>
                    Quelques minutes suffisent. Votre fiche est mise en ligne dès
                    validation de votre inscription à l'Ordre et de vos
                    justificatifs.
                  </p>
                  <ul className="form-side-list">
                    <li>
                      <i className="bi bi-person"></i>
                      <div>
                        <strong>Informations</strong>
                        <span className="form-side-desc">
                          Vos coordonnées et votre pays/ville d'exercice
                        </span>
                      </div>
                    </li>
                    <li>
                      <i className="bi bi-stethoscope"></i>
                      <div>
                        <strong>Spécialité & Ordre</strong>
                        <span className="form-side-desc">
                          Domaine d'exercice et numéro d'inscription
                        </span>
                      </div>
                    </li>
                    <li>
                      <i className="bi bi-journal-text"></i>
                      <div>
                        <strong>Biographie</strong>
                        <span className="form-side-desc">Présentation visible sur votre fiche</span>
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
                      <i className="bi bi-wallet2"></i>
                      <div>
                        <strong>Trésorerie</strong>
                        <span className="form-side-desc">
                          Facultatif — configurable aussi plus tard
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
                    <h1>Créer mon compte médecin</h1>
                    <p>
                      Complétez les 6 étapes ci-dessous. Votre fiche est mise en
                      ligne dès validation de votre inscription à l'Ordre et de
                      vos justificatifs.
                    </p>
                  </div>

                  {renderStepper()}

                  {submitError && (
                    <div className="alert alert-danger" role="alert">
                      {submitError}
                    </div>
                  )}

                  <form onSubmit={handleSubmit}>
                    {/* Étape 1 : Informations */}
                    {currentStep === 1 && (
                      <div className="form-page active">
                        <div className="avatar-upload-row">
                          <label
                            className={`avatar-upload ${
                              formData.photo ? 'has-file' : ''
                            }`}
                          >
                            <input
                              type="file"
                              accept="image/png, image/jpeg"
                              onChange={(e) => handleFileChange(e, 'photo')}
                            />
                            {formData.photo ? (
                              <img
                                src={URL.createObjectURL(formData.photo)}
                                alt="Aperçu"
                              />
                            ) : (
                              <i className="bi bi-camera upload-placeholder-icon"></i>
                            )}
                            <div className="avatar-upload-badge">
                              <i className="bi bi-pencil"></i>
                            </div>
                          </label>
                          <div className="avatar-upload-info">
                            <strong>Photo de profil</strong>
                            <span className="upload-default-text">
                              JPG, PNG — visage bien visible, fond neutre (facultatif).
                            </span>
                            <span className="upload-filename">
                              {formData.photo?.name}
                            </span>
                          </div>
                        </div>

                        <div className="row g-3">
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
                              Adresse e-mail professionnelle{' '}
                              <span className="required-mark">*</span>
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
                                setFormData((prev) => ({ ...prev, ville_exercice_id: '' }));
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
                            <p className="form-hint">
                              Votre pays de résidence et d'exercice.
                            </p>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Ville d'exercice{' '}
                              <span className="required-mark">*</span>
                            </label>
                            <select
                              className="form-select"
                              name="ville_exercice_id"
                              value={formData.ville_exercice_id}
                              onChange={handleChange}
                              required
                              disabled={!formData.pays_id}
                            >
                              <option value="">
                                {formData.pays_id ? 'Sélectionner…' : 'Choisissez d\'abord un pays'}
                              </option>
                              {villes.map((v) => (
                                <option key={v.ville_id} value={v.ville_id}>
                                  {v.nom}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Étape 2 : Spécialité & Ordre */}
                    {currentStep === 2 && (
                      <div className="form-page active">
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Spécialité <span className="required-mark">*</span>
                            </label>
                            <select
                              className="form-select"
                              name="specialite_id"
                              value={formData.specialite_id}
                              onChange={handleChange}
                              required
                              disabled={chargementReferentiels}
                            >
                              <option value="">
                                {chargementReferentiels ? 'Chargement…' : 'Sélectionner…'}
                              </option>
                              {specialites.map((s) => (
                                <option key={s.specialite_id} value={s.specialite_id}>
                                  {s.nom}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Numéro d'inscription à l'Ordre{' '}
                              <span className="required-mark">*</span>
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              name="numero_ordre"
                              value={formData.numero_ordre}
                              onChange={(e) => {
                                handleChange(e);
                                setOrdreVerification({ statut: 'idle' });
                              }}
                              onBlur={handleVerifierOrdre}
                              required
                            />
                            {ordreVerification.statut === 'loading' && (
                              <p className="form-hint">Vérification auprès du Tableau de l'Ordre…</p>
                            )}
                            {ordreVerification.statut === 'trouve' && (
                              <p className="form-hint text-success">
                                <i className="bi bi-check-circle"></i> Inscription confirmée
                                {ordreVerification.nomComplet ? ` (${ordreVerification.nomComplet})` : ''}.
                              </p>
                            )}
                            {ordreVerification.statut === 'introuvable' && (
                              <p className="form-hint text-danger">
                                Ce numéro n'a pas été retrouvé au Tableau de l'Ordre. Vérifiez la
                                saisie — votre dossier sera de toute façon revérifié manuellement.
                              </p>
                            )}
                            {ordreVerification.statut === 'erreur' && (
                              <p className="form-hint">
                                Vérification indisponible pour le moment ({ordreVerification.message}) —
                                votre dossier sera vérifié manuellement.
                              </p>
                            )}
                            {ordreVerification.statut === 'idle' && (
                              <p className="form-hint">
                                Vérifié automatiquement auprès de la source officielle de votre pays.
                              </p>
                            )}
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Tarif de consultation indicatif (FCFA){' '}
                              <span className="required-mark">*</span>
                            </label>
                            <input
                              type="number"
                              min="0"
                              className="form-control"
                              name="tarif_indicatif"
                              value={formData.tarif_indicatif}
                              onChange={handleChange}
                              required
                            />
                          </div>
                          <div className="col-md-6 d-flex align-items-end">
                            <div className="form-check">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                name="teleconsultation_activee"
                                id="teleconsultation_activee"
                                checked={formData.teleconsultation_activee}
                                onChange={handleChange}
                              />
                              <label
                                className="form-check-label"
                                htmlFor="teleconsultation_activee"
                              >
                                J'active la téléconsultation
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Étape 3 : Biographie */}
                    {currentStep === 3 && (
                      <div className="form-page active">
                        <div className="mb-3">
                          <label className="form-label-aps">
                            Présentation
                            <span className="required-mark">*</span>
                          </label>
                          <textarea
                            className="form-control"
                            name="biographie"
                            rows="4"
                            value={formData.biographie}
                            onChange={handleChange}
                            required
                          ></textarea>
                          <p className="form-hint">
                            Visible sur votre fiche publique — 600 caractères
                            maximum recommandés.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Étape 4 : Justificatifs */}
                    {currentStep === 4 && (
                      <div className="form-page active">
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Pièce d'identité (CNI){' '}
                              <span className="required-mark">*</span>
                            </label>
                            <div
                              className={`upload-box ${
                                formData.cni ? 'has-file' : ''
                              }`}
                            >
                              <input
                                type="file"
                                accept=".pdf, image/png, image/jpeg"
                                onChange={(e) => handleFileChange(e, 'cni')}
                              />
                              <i className="bi bi-cloud-arrow-up"></i>
                              <strong>Glissez le fichier ici</strong>
                              <span className="upload-default-text">
                                PDF, JPG — 5 Mo max
                              </span>
                              <span className="upload-filename">
                                {formData.cni?.name}
                              </span>
                              <button
                                type="button"
                                className="upload-remove"
                                onClick={() =>
                                  setFormData((prev) => ({ ...prev, cni: null }))
                                }
                              >
                                <i className="bi bi-x"></i>
                              </button>
                            </div>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label-aps">
                              Attestation d'inscription à l'Ordre{' '}
                              <span className="required-mark">*</span>
                            </label>
                            <div
                              className={`upload-box ${
                                formData.attestation ? 'has-file' : ''
                              }`}
                            >
                              <input
                                type="file"
                                accept=".pdf, image/png, image/jpeg"
                                onChange={(e) => handleFileChange(e, 'attestation')}
                              />
                              <i className="bi bi-cloud-arrow-up"></i>
                              <strong>Glissez le fichier ici</strong>
                              <span className="upload-default-text">
                                PDF, JPG — 5 Mo max
                              </span>
                              <span className="upload-filename">
                                {formData.attestation?.name}
                              </span>
                              <button
                                type="button"
                                className="upload-remove"
                                onClick={() =>
                                  setFormData((prev) => ({ ...prev, attestation: null }))
                                }
                              >
                                <i className="bi bi-x"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Étape 5 : Trésorerie (facultative) */}
                    {currentStep === 5 && (
                      <div className="form-page active">
                        <label className="form-label-aps">
                          Comment souhaitez-vous recevoir vos paiements ?{' '}
                          <span className="text-muted-soft">(facultatif — configurable plus tard)</span>
                        </label>
                        <div
                          className="service-type-grid"
                          style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
                        >
                          <label className="service-type-opt">
                            <input
                              type="radio"
                              name="tresorerie"
                              value=""
                              checked={formData.tresorerie === ''}
                              onChange={handleChange}
                            />
                            <div className="opt-card">
                              <i className="bi bi-dash-circle"></i>
                              Plus tard
                            </div>
                          </label>
                          <label className="service-type-opt">
                            <input
                              type="radio"
                              name="tresorerie"
                              value="Mobile Money"
                              checked={formData.tresorerie === 'Mobile Money'}
                              onChange={handleChange}
                            />
                            <div className="opt-card">
                              <i className="bi bi-phone"></i>
                              Mobile Money
                            </div>
                          </label>
                          <label className="service-type-opt">
                            <input
                              type="radio"
                              name="tresorerie"
                              value="Compte bancaire"
                              checked={formData.tresorerie === 'Compte bancaire'}
                              onChange={handleChange}
                            />
                            <div className="opt-card">
                              <i className="bi bi-bank"></i>
                              Compte bancaire
                            </div>
                          </label>
                        </div>

                        {formData.tresorerie === 'Mobile Money' && (
                          <div className="dynamic-fields active">
                            <div className="row g-3">
                              <div className="col-md-4">
                                <label className="form-label-aps">
                                  Opérateur mobile money{' '}
                                  <span className="required-mark">*</span>
                                </label>
                                <select
                                  className="form-select"
                                  name="type_mobile_money_id"
                                  value={formData.type_mobile_money_id}
                                  onChange={handleChange}
                                  required
                                >
                                  <option value="">Sélectionner…</option>
                                  {typesMobileMoney.map((t) => (
                                    <option
                                      key={t.type_mobile_money_id}
                                      value={t.type_mobile_money_id}
                                    >
                                      {t.libelle}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="col-md-4">
                                <label className="form-label-aps">
                                  Numéro mobile money{' '}
                                  <span className="required-mark">*</span>
                                </label>
                                <input
                                  type="tel"
                                  className="form-control"
                                  name="numero_paiement"
                                  value={formData.numero_paiement}
                                  onChange={handleChange}
                                  required
                                />
                              </div>
                              <div className="col-md-4">
                                <label className="form-label-aps">
                                  Nom du titulaire du compte{' '}
                                  <span className="required-mark">*</span>
                                </label>
                                <input
                                  type="text"
                                  className="form-control"
                                  name="titulaire"
                                  value={formData.titulaire}
                                  onChange={handleChange}
                                  required
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {formData.tresorerie === 'Compte bancaire' && (
                          <div className="dynamic-fields active">
                            <div className="row g-3">
                              <div className="col-md-6">
                                <label className="form-label-aps">
                                  Nom de la banque{' '}
                                  <span className="required-mark">*</span>
                                </label>
                                <input
                                  type="text"
                                  className="form-control"
                                  name="nom_banque"
                                  value={formData.nom_banque}
                                  onChange={handleChange}
                                  required
                                />
                              </div>
                              <div className="col-md-6">
                                <label className="form-label-aps">
                                  Titulaire du compte{' '}
                                  <span className="required-mark">*</span>
                                </label>
                                <input
                                  type="text"
                                  className="form-control"
                                  name="titulaire"
                                  value={formData.titulaire}
                                  onChange={handleChange}
                                  required
                                />
                              </div>
                              <div className="col-md-6">
                                <label className="form-label-aps">
                                  Numéro de compte / IBAN{' '}
                                  <span className="required-mark">*</span>
                                </label>
                                <input
                                  type="text"
                                  className="form-control"
                                  name="iban"
                                  value={formData.iban}
                                  onChange={handleChange}
                                  required
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        <p className="form-hint mt-3">
                          Vos informations de trésorerie sont chiffrées et servent
                          uniquement au versement de vos revenus après chaque
                          consultation. Vous pouvez aussi les renseigner plus tard
                          depuis votre espace médecin.
                        </p>
                      </div>
                    )}

                    {/* Étape 6 : Confirmation */}
                    {currentStep === 6 && (
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
                          <label
                            className="form-check-label"
                            htmlFor="acceptCGU"
                          >
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
                          <i className="bi bi-arrow-left"></i> Retour
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

export default CreationMedecin;