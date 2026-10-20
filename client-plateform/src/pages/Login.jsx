import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import authService from '../services/authService';
import { useConfigurationConnexion } from '../hooks/useConfigurationConnexion';

import med7 from '../assets/img/med7.jpg';
import logoApsa from '../assets/img/logoapsa.jpeg';
import { useAuth } from '../context/AuthContext';
import { cheminRetour, destinationApresConnexion } from '../utils/apresConnexion';

// Connexion par numéro + code PIN (par défaut) ou, via le petit bouton de
// bascule, par email + mot de passe (comptes existants, administrateurs).
// Le dernier mode utilisé est retenu sur cet appareil.
const CLE_MODE = 'aps.connexion.mode';
const PAYS_PAR_DEFAUT = 'CM';

function lireMode() {
  try {
    return localStorage.getItem(CLE_MODE) === 'email' ? 'email' : 'pin';
  } catch {
    return 'pin';
  }
}

function retenirMode(mode) {
  try {
    localStorage.setItem(CLE_MODE, mode);
  } catch {
    /* stockage indisponible : simple confort */
  }
}

const styleErreur = { color: 'var(--urgence-dark)' };

function ErreurChamp({ message }) {
  if (!message) return null;
  return (
    <p className="form-hint" style={styleErreur}>
      <i className="fa-solid fa-circle-exclamation" /> {message}
    </p>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { connecter, connecterParPin, ouvrirSession } = useAuth();
  const config = useConfigurationConnexion();
  // Connexion validée depuis l'application : { demande_id, secret, code, expire_le }
  const [demandeApp, setDemandeApp] = useState(null);
  const sondage = useRef(null);
  const [mode, setMode] = useState(lireMode);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', remember: true, pays_iso2: PAYS_PAR_DEFAUT, telephone: '', pin: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [aidePin, setAidePin] = useState(false);

  // Sondage de la demande « Valider sur mon téléphone » (toutes les 2 s).
  useEffect(() => {
    if (!demandeApp) return undefined;
    let actif = true;
    const sonder = async () => {
      try {
        const r = await authService.sonderConnexionApplication(demandeApp.demande_id, demandeApp.secret);
        if (!actif) return;
        if (r.access_token) {
          ouvrirSession(r);
          const { to, state } = destinationApresConnexion({
            utilisateur: r.utilisateur,
            espaces: r.espaces,
            retour: cheminRetour(location.state?.from),
          });
          navigate(to, { replace: true, state });
          return;
        }
        if (r.statut === 'refusee' || r.statut === 'expiree') {
          setDemandeApp(null);
          setErrors({ general: r.statut === 'refusee' ? 'Connexion refusée depuis le téléphone.' : 'La demande a expiré. Réessayez.' });
          return;
        }
        sondage.current = setTimeout(sonder, 2000);
      } catch (err) {
        if (!actif) return;
        setDemandeApp(null);
        setErrors({ general: err?.message || 'Demande interrompue.' });
      }
    };
    sondage.current = setTimeout(sonder, 2000);
    return () => { actif = false; clearTimeout(sondage.current); };
  }, [demandeApp, ouvrirSession, navigate, location.state]);

  const validerSurTelephone = async () => {
    setErrors({});
    if (!form.telephone.trim()) {
      setErrors({ telephone: 'Merci de renseigner votre numéro de téléphone.' });
      return;
    }
    try {
      setDemandeApp(await authService.demanderConnexionApplication(form.telephone, form.pays_iso2));
    } catch (err) {
      setErrors({ general: err?.message || 'Demande impossible. Réessayez.' });
    }
  };

  const basculer = () => {
    const suivant = mode === 'pin' ? 'email' : 'pin';
    setMode(suivant);
    retenirMode(suivant);
    setErrors({});
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
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Adresse e-mail invalide.';
      if (!form.password) next.password = 'Merci de renseigner votre mot de passe.';
    }
    return next;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      if (mode === 'pin') {
        const data = await connecterParPin(form.telephone, form.pays_iso2, form.pin);
        // PIN provisoire (compte créé par un administrateur) : aucune
        // session, le token restreint ne sert qu'à choisir son PIN.
        if (data?.pin_a_changer) {
          navigate('/creer-mon-pin', {
            replace: true,
            state: { mode: 'initial', token: data.token_changement_pin, retour: cheminRetour(location.state?.from) },
          });
          return;
        }
        const { to, state } = destinationApresConnexion({
          utilisateur: data.utilisateur,
          espaces: data.espaces,
          retour: cheminRetour(location.state?.from),
        });
        navigate(to, { replace: true, state });
        return;
      }

      // AuthContext.connecter() ouvre déjà la session (access_token +
      // user + status) quand la réponse est une session normale. Il ne
      // le fait PAS quand mot_de_passe_a_changer=true : la réponse est
      // alors renvoyée telle quelle, sans toucher à l'état
      // d'authentification.
      const data = await connecter(form.email, form.password);

      // Mot de passe temporaire détecté par le serveur : aucune session
      // n'est ouverte. On redirige vers l'écran de changement de mot de
      // passe forcé avec le token restreint, transmis par le state de
      // navigation — jamais dans l'URL ni dans un stockage persistant.
      if (data?.mot_de_passe_a_changer) {
        navigate('/modifier-mot-de-passe', {
          replace: true,
          state: {
            mode: 'initial',
            token: data.token_changement_mot_de_passe,
            tokenExpireLe: data.token_changement_mot_de_passe_expire_le,
            motDePasseExpireLe: data.mot_de_passe_expire_le,
            email: form.email,
          },
        });
        return;
      }

      // Session ouverte : on propose de créer le code PIN s'il n'existe
      // pas encore, puis on aiguille vers l'espace.
      const { to, state } = destinationApresConnexion({
        utilisateur: data.utilisateur,
        espaces: data.espaces,
        retour: cheminRetour(location.state?.from),
        proposerPin: true,
      });
      navigate(to, { replace: true, state });
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

  return (
    <section className="connexion26">
      <div className="connexion26-cadre">
          {/* ============================ FORMULAIRE ============================ */}
          <div className="connexion26-form">
            <div className="connexion26-form-int">
              <Link to="/home" className="connexion26-logo" aria-label="ApSa — accueil">
                <img src={logoApsa} alt="ApSa — AZA Santé Assurances" />
              </Link>
              <h1 className="connexion26-titre">Bon retour parmi nous</h1>
              <p className="aps-t-s connexion26-sous-titre">
                {mode === 'pin'
                  ? 'Connectez-vous avec votre numéro de téléphone et votre code PIN.'
                  : 'Connectez-vous avec votre adresse e-mail et votre mot de passe.'}
              </p>

              {/* Bascule entre les deux modes de connexion */}
              <div className="connexion26-seg" role="tablist" aria-label="Mode de connexion">
                <button type="button" role="tab" aria-selected={mode === 'pin'}
                  className={mode === 'pin' ? 'is-on' : ''}
                  onClick={() => { if (mode !== 'pin') basculer(); }} disabled={loading}>
                  <i className="fa-solid fa-mobile-screen" /> Numéro + PIN
                </button>
                <button type="button" role="tab" aria-selected={mode !== 'pin'}
                  className={mode !== 'pin' ? 'is-on' : ''}
                  onClick={() => { if (mode === 'pin') basculer(); }} disabled={loading}>
                  <i className="fa-solid fa-envelope" /> E-mail
                </button>
              </div>

              {location.state?.message && !errors.general && (
                <div className="alert alert-success" role="status">{location.state.message}</div>
              )}

              {/* Connexion en attente de validation sur le téléphone */}
              {demandeApp && (
                <div className="info-card text-center" style={{ padding: '1.4rem', marginBottom: '1.2rem' }} role="status">
                  <i className="fa-solid fa-mobile-screen" style={{ fontSize: '1.6rem', color: 'var(--primary)' }} />
                  <p style={{ margin: '.6rem 0 .3rem', fontWeight: 600 }}>
                    Ouvrez l’application APS Santé sur votre téléphone et choisissez ce code :
                  </p>
                  <div style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '.15em' }}>{demandeApp.code}</div>
                  <p className="text-muted-soft" style={{ fontSize: '.82rem' }}>
                    <i className="fa-solid fa-spinner fa-spin" /> En attente de votre validation (2 minutes)…
                  </p>
                  <button type="button" className="btn btn-link btn-sm" onClick={() => setDemandeApp(null)}>Annuler</button>
                </div>
              )}

              {/* Bandeau d'erreur générale (identifiants invalides, erreur réseau…) */}
              {errors.general && (
                <div role="alert" className="alert alert-danger d-flex align-items-center gap-2">
                  <i className="fa-solid fa-circle-exclamation" /> {errors.general}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                {mode === 'pin' ? (
                  <>
                    <div className="search-field">
                      <label className="form-label-aps" htmlFor="login-telephone">Numéro de téléphone</label>
                      <div className="input-icon">
                        <i className="fa-solid fa-phone" />
                        <input
                          type="tel"
                          id="login-telephone"
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
                    </div>

                    <div className="search-field">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <label className="form-label-aps" htmlFor="login-pin">Code PIN (6 chiffres)</label>
                        <button
                          type="button"
                          className="btn btn-link p-0"
                          style={{ fontSize: '.78rem', fontWeight: 600 }}
                          onClick={() => (config?.verification_telephone ? navigate('/pin-oublie') : setAidePin((v) => !v))}
                        >
                          Code PIN oublié ?
                        </button>
                      </div>
                      <div className="input-icon">
                        <i className="fa-solid fa-key" />
                        <input
                          type="password"
                          id="login-pin"
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
                          Connectez-vous avec votre email et votre mot de passe (bouton ci-dessous), puis choisissez un
                          nouveau code PIN. Sans email, contactez le support APS Santé.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="search-field">
                      <label className="form-label-aps" htmlFor="login-email">Adresse e-mail</label>
                      <div className="input-icon">
                        <i className="fa-solid fa-envelope" />
                        <input
                          type="email"
                          id="login-email"
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
                        <label className="form-label-aps" htmlFor="login-password">Mot de passe</label>
                        <Link to="/mot-de-passe-oublie" style={{ fontSize: '.78rem', fontWeight: 600 }}>
                          Mot de passe oublié ?
                        </Link>
                      </div>
                      <div className="input-icon" style={{ position: 'relative' }}>
                        <i className="fa-solid fa-lock" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          id="login-password"
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
                          onClick={() => setShowPassword((s) => !s)}
                          aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                          style={{
                            position: 'absolute',
                            right: '.85rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--ink-faint)',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                        </button>
                      </div>
                      <ErreurChamp message={errors.password} />
                    </div>
                  </>
                )}

                <div className="form-check mb-3" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="login-remember"
                    name="remember"
                    checked={form.remember}
                    onChange={handleChange}
                    disabled={loading}
                  />
                  <label className="form-check-label" htmlFor="login-remember" style={{ fontSize: '.86rem', color: 'var(--ink-soft)' }}>
                    Rester connecté sur cet appareil
                  </label>
                </div>

                <button type="submit" className="btn btn-primary btn-block-aps btn-lg-aps" disabled={loading}>
                  {loading ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin" /> Connexion en cours…
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-right-to-bracket" /> Se connecter
                    </>
                  )}
                </button>
              </form>

              {mode === 'pin' && !demandeApp && (
                <button type="button" className="btn btn-outline-primary btn-block-aps mt-2" onClick={validerSurTelephone} disabled={loading}>
                  <i className="fa-solid fa-mobile-screen-button" /> Valider sur mon téléphone (sans code PIN)
                </button>
              )}

              <p className="connexion26-inscription">
                Pas encore de compte ? <Link to="/inscription" className="aps-lnk">Créer un compte</Link>
              </p>

              <p className="connexion26-legal">
                En vous connectant, vous acceptez nos{' '}
                <Link to="/conditions">conditions d&apos;utilisation</Link> et notre{' '}
                <Link to="/confidentialite">politique de confidentialité</Link>.
              </p>
            </div>
          </div>

          {/* ============================ PANNEAU PHOTO ============================ */}
          <div className="connexion26-visuel" aria-hidden="true">
            <div className="connexion26-photo" style={{ backgroundImage: `url(${med7})` }}>
              <div className="connexion26-carte">
                <ul className="connexion26-garanties">
                  <li><span className="aps-ic is-sm"><i className="fa-solid fa-shield-halved" /></span> Données médicales chiffrées et protégées</li>
                  <li><span className="aps-ic is-sm"><i className="fa-solid fa-user-doctor" /></span> Professionnels vérifiés à l&apos;Ordre</li>
                  <li><span className="aps-ic is-sm"><i className="fa-solid fa-lock" /></span> Paiement sous séquestre jusqu&apos;à la consultation</li>
                </ul>
              </div>
            </div>
          </div>
      </div>
    </section>
  );
}
