// src/components/auth/FormulaireConnexion.jsx
//
// Formulaire de connexion commun à la page /login et à la fenêtre
// ConnexionModale (/pricing, demande rapide…) :
//   - par défaut : numéro de téléphone + code PIN (6 chiffres) ;
//   - lien discret « Se connecter avec un e-mail » (anciens comptes) ;
//   - « Valider sur mon téléphone » : connexion sans PIN, confirmée dans
//     l'application ;
//   - appareil inconnu : confirmation (application ou WhatsApp) via
//     ValidationAppareil avant d'ouvrir la session.
//
// L'appelant décide de la suite :
//   onConnecte(data)                session ouverte (data.utilisateur, data.espaces)
//   onPinProvisoire(data)           PIN provisoire à remplacer (token_changement_pin)
//   onMotDePasseTemporaire(data, email)  mot de passe temporaire à remplacer
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import authService from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import { useConfigurationConnexion } from '../../hooks/useConfigurationConnexion';
import ValidationAppareil from './ValidationAppareil';
import { NOM_MARQUE } from '../../lib/marque';
import { enregistrerDernierNumero, lireDernierNumero, oublierDernierNumero } from '../../lib/dernierNumero';

const PAYS_PAR_DEFAUT = 'CM';
const styleErreur = { color: 'var(--urgence-dark)' };

function ErreurChamp({ message }) {
  if (!message) return null;
  return (
    <p className="form-hint" style={styleErreur}>
      <i className="fa-solid fa-circle-exclamation" /> {message}
    </p>
  );
}

export default function FormulaireConnexion({
  idPrefixe = 'login',
  libelleBouton = 'Se connecter',
  afficherResterConnecte = true,
  onConnecte,
  onPinProvisoire,
  onMotDePasseTemporaire,
  onEnCours,
}) {
  const { connecter, connecterParPin, ouvrirSession } = useAuth();
  const config = useConfigurationConnexion();
  const [mode, setMode] = useState('pin');
  // Préremplissage avec le dernier numéro connecté dans ce navigateur.
  const [dernierNumero] = useState(lireDernierNumero);
  const [numeroMemorise, setNumeroMemorise] = useState(Boolean(dernierNumero));
  const [form, setForm] = useState({
    email: '',
    password: '',
    remember: true,
    pays_iso2: dernierNumero?.pays_iso2 || PAYS_PAR_DEFAUT,
    telephone: dernierNumero?.telephone || '',
    pin: '',
  });
  const [voirMotDePasse, setVoirMotDePasse] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [aidePin, setAidePin] = useState(false);
  // Connexion sans PIN validée dans l'application : { demande_id, secret, code }
  const [demandeApp, setDemandeApp] = useState(null);
  // Nouvel appareil à confirmer : réponse « appareil_a_valider »
  const [validation, setValidation] = useState(null);
  const rappels = useRef({ onConnecte });
  useEffect(() => { rappels.current = { onConnecte }; });
  const pinOubliePossible = Boolean(config?.pin_oublie ?? config?.verification_telephone);

  useEffect(() => { onEnCours?.(loading); }, [loading, onEnCours]);

  const terminer = (data) => {
    ouvrirSession(data);
    rappels.current.onConnecte?.(data);
  };

  // Sondage de la demande « Valider sur mon téléphone » (toutes les 2 s).
  useEffect(() => {
    if (!demandeApp) return undefined;
    let actif = true;
    let minuteur;
    const sonder = async () => {
      try {
        const r = await authService.sonderConnexionApplication(demandeApp.demande_id, demandeApp.secret);
        if (!actif) return;
        if (r.access_token) {
          enregistrerDernierNumero(demandeApp.telephone, demandeApp.pays_iso2);
          ouvrirSession(r);
          rappels.current.onConnecte?.(r);
          return;
        }
        if (r.statut === 'refusee' || r.statut === 'expiree') {
          setDemandeApp(null);
          setErrors({ general: r.statut === 'refusee' ? 'Connexion refusée depuis le téléphone.' : 'La demande a expiré. Réessayez.' });
          return;
        }
        minuteur = setTimeout(sonder, 2000);
      } catch (err) {
        if (!actif) return;
        setDemandeApp(null);
        setErrors({ general: err?.message || 'Demande interrompue.' });
      }
    };
    minuteur = setTimeout(sonder, 2000);
    return () => { actif = false; clearTimeout(minuteur); };
  }, [demandeApp, ouvrirSession]);

  const validerSurTelephone = async () => {
    setErrors({});
    if (!form.telephone.trim()) {
      setErrors({ telephone: 'Merci de renseigner votre numéro de téléphone.' });
      return;
    }
    try {
      const demande = await authService.demanderConnexionApplication(form.telephone, form.pays_iso2);
      setDemandeApp({ ...demande, telephone: form.telephone, pays_iso2: form.pays_iso2 });
    } catch (err) {
      setErrors({ general: err?.message || 'Demande impossible. Réessayez.' });
    }
  };

  const basculer = (suivant) => {
    setMode(suivant);
    setErrors({});
    setAidePin(false);
  };

  const utiliserAutreNumero = () => {
    oublierDernierNumero();
    setNumeroMemorise(false);
    setForm((f) => ({ ...f, telephone: '', pin: '', pays_iso2: PAYS_PAR_DEFAUT }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const valeur = name === 'pin' ? value.replace(/\D/g, '').slice(0, 6) : value;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : valeur }));
  };

  const validate = () => {
    const next = {};
    if (mode === 'pin') {
      if (!form.telephone.trim()) next.telephone = 'Merci de renseigner votre numéro de téléphone.';
      if (form.pin.length !== 6) next.pin = 'Le code PIN comporte 6 chiffres.';
    } else {
      if (!form.email.trim()) next.email = 'Merci de renseigner votre e-mail.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Adresse e-mail invalide.';
      if (!form.password) next.password = 'Merci de renseigner votre mot de passe.';
    }
    return next;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      const data = mode === 'pin'
        ? await connecterParPin(form.telephone, form.pays_iso2, form.pin)
        : await connecter(form.email.trim(), form.password);

      // Numéro + PIN acceptés (quelle que soit l'étape suivante) : mémorisé
      // pour la prochaine connexion.
      if (mode === 'pin') enregistrerDernierNumero(form.telephone, form.pays_iso2);

      if (data?.appareil_a_valider) {
        setValidation(data);
        return;
      }
      if (data?.pin_a_changer) {
        onPinProvisoire?.(data);
        return;
      }
      if (data?.mot_de_passe_a_changer) {
        onMotDePasseTemporaire?.(data, form.email.trim());
        return;
      }
      rappels.current.onConnecte?.(data);
    } catch (err) {
      let general;
      if (mode === 'pin' && (err?.status === 401 || err?.status === 429)) {
        const restants = err?.data?.essais_restants;
        general = err.message + (restants && restants <= 3 ? ` Il vous reste ${restants} essai${restants > 1 ? 's' : ''}.` : '');
      } else if (err?.status === 401) {
        general = 'E-mail ou mot de passe incorrect.';
      } else {
        general = err?.message || 'Une erreur est survenue. Merci de réessayer.';
      }
      setErrors({ general });
    } finally {
      setLoading(false);
    }
  };

  if (validation) {
    return (
      <ValidationAppareil
        validation={validation}
        onSession={terminer}
        onAnnuler={() => { setValidation(null); setForm((f) => ({ ...f, pin: '', password: '' })); }}
      />
    );
  }

  return (
    <>
      {demandeApp && (
        <div className="info-card text-center" style={{ padding: '1.4rem', marginBottom: '1.2rem' }} role="status">
          <i className="fa-solid fa-mobile-screen" style={{ fontSize: '1.6rem', color: 'var(--primary)' }} />
          <p style={{ margin: '.6rem 0 .3rem', fontWeight: 600 }}>
            Ouvrez l’application {NOM_MARQUE} sur votre téléphone et choisissez ce code :
          </p>
          <div style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '.15em' }}>{demandeApp.code}</div>
          <p className="text-muted-soft" style={{ fontSize: '.82rem' }}>
            <i className="fa-solid fa-spinner fa-spin" /> En attente de votre validation (2 minutes)…
          </p>
          <button type="button" className="btn btn-link btn-sm" onClick={() => setDemandeApp(null)}>Annuler</button>
        </div>
      )}

      {errors.general && (
        <div role="alert" className="alert alert-danger d-flex align-items-center gap-2">
          <i className="fa-solid fa-circle-exclamation" /> {errors.general}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {mode === 'pin' ? (
          <>
            <div className="search-field">
              <label className="form-label-aps" htmlFor={`${idPrefixe}-telephone`}>Numéro de téléphone</label>
              <div className="input-icon">
                <i className="fa-solid fa-phone" />
                <input
                  type="tel"
                  id={`${idPrefixe}-telephone`}
                  name="telephone"
                  className="form-control"
                  placeholder="6XX XX XX XX"
                  value={form.telephone}
                  onChange={handleChange}
                  autoComplete="tel"
                  inputMode="tel"
                  disabled={loading}
                />
              </div>
              <ErreurChamp message={errors.telephone} />
              {numeroMemorise && (
                <div style={{ textAlign: 'right' }}>
                  <button type="button" className="btn btn-link p-0" style={{ fontSize: '.78rem', fontWeight: 600 }}
                    onClick={utiliserAutreNumero} disabled={loading}>
                    Utiliser un autre numéro
                  </button>
                </div>
              )}
            </div>

            <div className="search-field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label className="form-label-aps" htmlFor={`${idPrefixe}-pin`}>Code PIN (6 chiffres)</label>
                {pinOubliePossible ? (
                  <Link to="/pin-oublie" style={{ fontSize: '.78rem', fontWeight: 600 }}>Code PIN oublié ?</Link>
                ) : (
                  <button type="button" className="btn btn-link p-0" style={{ fontSize: '.78rem', fontWeight: 600 }}
                    onClick={() => setAidePin((v) => !v)}>
                    Code PIN oublié ?
                  </button>
                )}
              </div>
              <div className="input-icon">
                <i className="fa-solid fa-key" />
                <input
                  type="password"
                  id={`${idPrefixe}-pin`}
                  name="pin"
                  className="form-control"
                  placeholder="••••••"
                  value={form.pin}
                  onChange={handleChange}
                  inputMode="numeric"
                  autoComplete="current-password"
                  maxLength={6}
                  style={{ letterSpacing: '.4em' }}
                  disabled={loading}
                />
              </div>
              <ErreurChamp message={errors.pin} />
              {aidePin && (
                <p className="form-hint">
                  Contactez le support {NOM_MARQUE} pour retrouver l’accès à votre compte, ou connectez-vous avec votre
                  e-mail (lien ci-dessous) puis choisissez un nouveau code PIN.
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="search-field">
              <label className="form-label-aps" htmlFor={`${idPrefixe}-email`}>Adresse e-mail</label>
              <div className="input-icon">
                <i className="fa-solid fa-envelope" />
                <input
                  type="email"
                  id={`${idPrefixe}-email`}
                  name="email"
                  className="form-control"
                  placeholder="vous@exemple.com"
                  value={form.email}
                  onChange={handleChange}
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
              <ErreurChamp message={errors.email} />
            </div>

            <div className="search-field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label className="form-label-aps" htmlFor={`${idPrefixe}-password`}>Mot de passe</label>
                <Link to="/mot-de-passe-oublie" style={{ fontSize: '.78rem', fontWeight: 600 }}>Mot de passe oublié ?</Link>
              </div>
              <div className="input-icon" style={{ position: 'relative' }}>
                <i className="fa-solid fa-lock" />
                <input
                  type={voirMotDePasse ? 'text' : 'password'}
                  id={`${idPrefixe}-password`}
                  name="password"
                  className="form-control"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="current-password"
                  style={{ paddingRight: '2.6rem' }}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setVoirMotDePasse((s) => !s)}
                  aria-label={voirMotDePasse ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  style={{
                    position: 'absolute', right: '.85rem', top: '50%', transform: 'translateY(-50%)',
                    background: 'transparent', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', padding: 0,
                  }}
                >
                  <i className={`fa-solid ${voirMotDePasse ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
              <ErreurChamp message={errors.password} />
            </div>
          </>
        )}

        {afficherResterConnecte && (
          <div className="form-check mb-3" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <input type="checkbox" className="form-check-input" id={`${idPrefixe}-remember`} name="remember"
              checked={form.remember} onChange={handleChange} disabled={loading} />
            <label className="form-check-label" htmlFor={`${idPrefixe}-remember`} style={{ fontSize: '.86rem', color: 'var(--ink-soft)' }}>
              Rester connecté sur cet appareil
            </label>
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block-aps btn-lg-aps w-100" disabled={loading}>
          {loading
            ? <><i className="fa-solid fa-spinner fa-spin" /> Connexion en cours…</>
            : <><i className="fa-solid fa-right-to-bracket" /> {libelleBouton}</>}
        </button>
      </form>

      {mode === 'pin' && !demandeApp && (
        <button type="button" className="btn btn-outline-primary btn-block-aps w-100 mt-2" onClick={validerSurTelephone} disabled={loading}>
          <i className="fa-solid fa-mobile-screen-button" /> Valider sur mon téléphone (sans code PIN)
        </button>
      )}

      {/* Connexion par e-mail : discrète, pour les anciens comptes. */}
      <p style={{ textAlign: 'center', margin: '.9rem 0 0', fontSize: '.82rem' }}>
        {mode === 'pin' ? (
          <button type="button" className="btn btn-link p-0" style={{ fontSize: '.82rem', color: 'var(--ink-soft)' }}
            onClick={() => basculer('email')} disabled={loading}>
            Se connecter avec un e-mail
          </button>
        ) : (
          <button type="button" className="btn btn-link p-0" style={{ fontSize: '.82rem', fontWeight: 600 }}
            onClick={() => basculer('pin')} disabled={loading}>
            <i className="fa-solid fa-arrow-left" /> Se connecter avec mon numéro de téléphone
          </button>
        )}
      </p>
    </>
  );
}
