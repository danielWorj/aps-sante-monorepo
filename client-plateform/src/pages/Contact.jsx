// src/pages/Contact.jsx
// Page publique « Contactez-nous » : formulaire (enregistré en base, traité
// depuis le back-office > Messages de contact), canaux directs (WhatsApp,
// e-mail, téléphone — affichés seulement s'ils sont configurés côté serveur),
// rappel Urgences et questions fréquentes.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { envoyerMessageContact, obtenirCoordonneesContact } from '../services/contactService';
import '../assets/styles/info-2026.css';

const PROFILS = [
  { cle: 'patient', libelle: 'Patient' },
  { cle: 'professionnel', libelle: 'Professionnel de santé' },
  { cle: 'structure', libelle: 'Structure de santé' },
  { cle: 'pharmacie', libelle: 'Pharmacie' },
  { cle: 'assurance', libelle: 'Assureur / courtier' },
  { cle: 'annonceur', libelle: 'Annonceur' },
  { cle: 'autre', libelle: 'Autre' },
];

const SUJETS = [
  { cle: 'question', libelle: 'Question générale' },
  { cle: 'rendez_vous', libelle: 'Rendez-vous ou téléconsultation' },
  { cle: 'paiement', libelle: 'Paiement ou remboursement' },
  { cle: 'partenariat', libelle: 'Référencement / partenariat' },
  { cle: 'publicite', libelle: 'Publicité' },
  { cle: 'technique', libelle: 'Problème technique' },
  { cle: 'donnees', libelle: 'Données personnelles' },
  { cle: 'autre', libelle: 'Autre' },
];

const FAQ = [
  {
    q: 'Comment annuler un rendez-vous ?',
    r: "Depuis votre espace patient, rubrique « Mes rendez-vous ». L'annulation est gratuite jusqu'à 24 heures avant l'heure prévue ; au-delà, les frais d'annulation fixés par le professionnel peuvent s'appliquer.",
  },
  {
    q: 'Que se passe-t-il si le médecin ne me reçoit pas ?',
    r: "Votre paiement étant conservé en séquestre, vous êtes remboursé intégralement, frais compris, sans aucune démarche de votre part.",
  },
  {
    q: 'Je suis professionnel : comment être référencé ?',
    r: "Créez votre compte puis complétez votre fiche. Elle est publiée après vérification de votre inscription à l'Ordre ou au registre compétent.",
  },
  {
    q: 'Comment exercer mes droits sur mes données ?',
    r: "Choisissez l'objet « Données personnelles » dans le formulaire : accès, rectification, opposition, portabilité ou effacement.",
  },
];

const MESSAGE_MAX = 3000;
const FORMULAIRE_VIDE = { nom: '', email: '', telephone: '', profil: 'patient', sujet: 'question', message: '', site_web: '' };

function formulaireInitial(user) {
  if (!user) return FORMULAIRE_VIDE;
  return {
    ...FORMULAIRE_VIDE,
    nom: [user.prenom, user.nom].filter(Boolean).join(' '),
    email: user.email || '',
    telephone: user.telephone || '',
    profil: user.role === 'medecin' ? 'professionnel' : 'patient',
  };
}

export default function Contact() {
  const { user } = useAuth();
  // Identité préremplie pour un visiteur connecté.
  const [form, setForm] = useState(() => formulaireInitial(user));
  const [erreurs, setErreurs] = useState({});
  const [erreurGlobale, setErreurGlobale] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(null); // { reference }
  const [coordonnees, setCoordonnees] = useState(null);

  // Lien direct /contact#faq (pied de page).
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  useEffect(() => {
    obtenirCoordonneesContact().then(setCoordonnees).catch(() => setCoordonnees(null));
  }, []);

  const maj = (champ) => (e) => {
    setForm((f) => ({ ...f, [champ]: e.target.value }));
    setErreurs((er) => ({ ...er, [champ]: undefined }));
  };

  function valider() {
    const er = {};
    if (form.nom.trim().length < 2) er.nom = 'Indiquez votre nom.';
    if (!form.email.trim() && !form.telephone.trim()) er.email = 'Indiquez au moins un e-mail ou un téléphone.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) er.email = 'Adresse e-mail invalide.';
    if (form.telephone.trim() && !/^\+?[\d\s.-]{8,20}$/.test(form.telephone.trim())) er.telephone = 'Numéro invalide.';
    if (form.message.trim().length < 10) er.message = 'Votre message doit contenir au moins 10 caractères.';
    return er;
  }

  async function soumettre(e) {
    e.preventDefault();
    if (envoi) return;
    const er = valider();
    setErreurs(er);
    setErreurGlobale('');
    if (Object.keys(er).length) return;

    setEnvoi(true);
    try {
      const reponse = await envoyerMessageContact({
        ...form,
        nom: form.nom.trim(),
        email: form.email.trim(),
        telephone: form.telephone.trim(),
        message: form.message.trim(),
      });
      setEnvoye({ reference: reponse?.reference, message: reponse?.message });
      setForm(formulaireInitial(user));
    } catch (err) {
      if (err?.data?.erreurs) setErreurs(err.data.erreurs);
      setErreurGlobale(err?.message || "L'envoi a échoué. Réessayez dans un instant.");
    } finally {
      setEnvoi(false);
    }
  }

  const whatsapp = coordonnees?.whatsapp;
  const canaux = [
    whatsapp && {
      icone: 'fa-brands fa-whatsapp', ton: '', titre: 'WhatsApp', valeur: `+${whatsapp}`,
      href: `https://wa.me/${whatsapp}`, externe: true,
    },
    coordonnees?.email && {
      icone: 'fa-regular fa-envelope', ton: 'is-sky', titre: 'E-mail', valeur: coordonnees.email,
      href: `mailto:${coordonnees.email}`,
    },
    coordonnees?.telephone && {
      icone: 'fa-solid fa-phone', ton: 'is-violet', titre: 'Téléphone', valeur: coordonnees.telephone,
      href: `tel:${coordonnees.telephone.replace(/\s/g, '')}`,
    },
    coordonnees?.adresse && {
      icone: 'fa-solid fa-location-dot', ton: 'is-amber', titre: 'Adresse', valeur: coordonnees.adresse,
    },
  ].filter(Boolean);

  return (
    <div className="info26">
      <section className="info26-hero">
        <div className="container-aps">
          <div className="info26-hero-bloc">
          <nav className="info26-fil" aria-label="Fil d'Ariane">
            <Link to="/home">Accueil</Link>
            <i className="fa-solid fa-chevron-right" />
            <span>Contact</span>
          </nav>
          <span className="aps-over">Contactez-nous</span>
          <h1 className="aps-h1 info26-titre">Une question ? <span className="info26-accent">Parlons-en.</span></h1>
          <p className="aps-t-s info26-lead">
            Patients, professionnels, établissements, assureurs ou annonceurs : écrivez-nous, l&apos;équipe ApSa
            vous répond sous 48 heures ouvrées.
          </p>
          </div>
        </div>
      </section>

      <section className="info26-sec info26-sec-fin">
        <div className="container-aps info26-contact">
          {/* ─────────── Formulaire ─────────── */}
          <div className="aps-card info26-form-carte">
            {envoye ? (
              <div className="info26-succes" role="status">
                <span className="info26-succes-ic"><i className="fa-solid fa-check" /></span>
                <h2 className="aps-h3">Message envoyé</h2>
                <p className="aps-t-s">{envoye.message || "Nous vous répondons très vite."}</p>
                {envoye.reference && (
                  <p className="info26-reference">Référence : <strong>{envoye.reference}</strong></p>
                )}
                <button type="button" className="btn btn-outline-primary" onClick={() => setEnvoye(null)}>
                  <i className="fa-solid fa-pen" /> Écrire un autre message
                </button>
              </div>
            ) : (
              <form onSubmit={soumettre} noValidate>
                <h2 className="aps-h3">Envoyer un message</h2>
                <p className="aps-t-s mt-1">Les champs marqués * sont obligatoires.</p>

                <fieldset className="mt-3">
                  <legend className="form-label-aps">Vous êtes *</legend>
                  <div className="info26-profils">
                    {PROFILS.map((p) => (
                      <label key={p.cle} className={`aps-chip is-sm ${form.profil === p.cle ? 'is-on' : ''}`}>
                        <input
                          type="radio"
                          name="profil"
                          value={p.cle}
                          checked={form.profil === p.cle}
                          onChange={maj('profil')}
                          className="visually-hidden"
                        />
                        {p.libelle}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="row g-3 mt-1">
                  <div className="col-12">
                    <label className="form-label-aps" htmlFor="c-nom">Nom complet *</label>
                    <input id="c-nom" className={`form-control ${erreurs.nom ? 'is-invalid' : ''}`} autoComplete="name"
                      value={form.nom} onChange={maj('nom')} maxLength={150} />
                    {erreurs.nom && <div className="invalid-feedback">{erreurs.nom}</div>}
                  </div>
                  <div className="col-md-6">
                    <label className="form-label-aps" htmlFor="c-email">E-mail</label>
                    <input id="c-email" type="email" className={`form-control ${erreurs.email ? 'is-invalid' : ''}`}
                      autoComplete="email" value={form.email} onChange={maj('email')} maxLength={255} />
                    {erreurs.email && <div className="invalid-feedback">{erreurs.email}</div>}
                  </div>
                  <div className="col-md-6">
                    <label className="form-label-aps" htmlFor="c-tel">Téléphone / WhatsApp</label>
                    <input id="c-tel" type="tel" inputMode="tel" className={`form-control ${erreurs.telephone ? 'is-invalid' : ''}`}
                      autoComplete="tel" placeholder="ex. +237 6 99 12 34 56" value={form.telephone} onChange={maj('telephone')} />
                    {erreurs.telephone && <div className="invalid-feedback">{erreurs.telephone}</div>}
                  </div>
                  <div className="col-12">
                    <label className="form-label-aps" htmlFor="c-sujet">Objet *</label>
                    <select id="c-sujet" className="form-select" value={form.sujet} onChange={maj('sujet')}>
                      {SUJETS.map((s) => <option key={s.cle} value={s.cle}>{s.libelle}</option>)}
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label-aps" htmlFor="c-message">Votre message *</label>
                    <textarea id="c-message" rows={6} className={`form-control ${erreurs.message ? 'is-invalid' : ''}`}
                      value={form.message} onChange={maj('message')} maxLength={MESSAGE_MAX}
                      placeholder="Décrivez votre demande. N'indiquez pas d'informations médicales détaillées." />
                    <div className="d-flex justify-content-between mt-1">
                      {erreurs.message ? <div className="invalid-feedback d-block">{erreurs.message}</div> : <span />}
                      <span className="aps-t-xs">{form.message.length} / {MESSAGE_MAX}</span>
                    </div>
                  </div>
                  {/* Champ piège anti-robot, invisible pour les humains. */}
                  <div className="info26-piege" aria-hidden="true">
                    <label htmlFor="c-site">Site web</label>
                    <input id="c-site" tabIndex={-1} autoComplete="off" value={form.site_web} onChange={maj('site_web')} />
                  </div>
                </div>

                {erreurGlobale && (
                  <div className="alert alert-danger mt-3 mb-0" role="alert">
                    <i className="fa-solid fa-circle-exclamation me-2" />{erreurGlobale}
                  </div>
                )}

                <div className="info26-form-pied">
                  <p className="aps-t-xs mb-0">
                    <i className="fa-solid fa-lock" /> Vos coordonnées servent uniquement à vous répondre.
                  </p>
                  <button type="submit" className="btn btn-primary btn-lg-aps" disabled={envoi}>
                    {envoi ? (
                      <><span className="spinner-border spinner-border-sm me-2" role="status" />Envoi…</>
                    ) : (
                      <><i className="fa-solid fa-paper-plane" /> Envoyer</>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* ─────────── Colonne latérale ─────────── */}
          <aside className="info26-cote">
            <Link to="/urgences" className="info26-urgence">
              <span className="aps-ic is-red"><i className="fa-solid fa-truck-medical" /></span>
              <div>
                <strong>Une urgence médicale ?</strong>
                <span>N&apos;utilisez pas ce formulaire : appelez les numéros officiels de votre pays.</span>
              </div>
              <i className="fa-solid fa-arrow-right" />
            </Link>

            {canaux.length > 0 && (
              <div className="aps-card">
                <h2 className="aps-h4">Nous joindre directement</h2>
                <ul className="info26-canaux">
                  {canaux.map((c) => {
                    const contenu = (
                      <>
                        <span className={`aps-ic is-sm ${c.ton}`}><i className={c.icone} /></span>
                        <span className="info26-canal-txt">
                          <span className="aps-t-xs">{c.titre}</span>
                          <strong>{c.valeur}</strong>
                        </span>
                      </>
                    );
                    return (
                      <li key={c.titre}>
                        {c.href ? (
                          <a href={c.href} {...(c.externe ? { target: '_blank', rel: 'noreferrer' } : {})}>{contenu}</a>
                        ) : (
                          <div>{contenu}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="aps-card" id="faq">
              <h2 className="aps-h4">Questions fréquentes</h2>
              <div className="info26-faq">
                {FAQ.map((f) => (
                  <details key={f.q}>
                    <summary>{f.q}</summary>
                    <p className="aps-t-s mb-0">{f.r}</p>
                  </details>
                ))}
              </div>
              <Link to="/a-propos" className="aps-lnk mt-3">En savoir plus sur ApSa <i className="fa-solid fa-arrow-right" /></Link>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
