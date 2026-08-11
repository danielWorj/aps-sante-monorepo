import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import med7 from '../assets/img/med7.jpg';

export default function Login() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const validate = () => {
    const next = {};
    if (!form.email.trim()) next.email = 'Merci de renseigner votre e-mail.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Adresse e-mail invalide.';
    if (!form.password) next.password = 'Merci de renseigner votre mot de passe.';
    return next;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    // TODO: brancher sur l'API d'authentification réelle
    setTimeout(() => {
      setLoading(false);
      navigate('/tableau-de-bord');
    }, 900);
  };

  return (
    <section style={{ padding: '3rem 0' }}>
      <div className="container-aps">
        <div
          className="row g-0"
          style={{
            maxWidth: 1040,
            margin: '0 auto',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--line)',
          }}
        >
          {/* ============================ PANNEAU DE MARQUE ============================ */}
          <div
            className="col-md-5 d-none d-md-flex"
            style={{
              backgroundColor: 'var(--primary-dark)',
              backgroundImage: `linear-gradient(160deg, rgba(58,124,100,.92), rgba(47,165,127,.88)), url(${med7})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              color: '#fff',
              padding: '3rem 2.4rem',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div className="aps-logo" style={{ color: '#fff', marginBottom: '2.5rem' }}>
                <span
                  className="mark"
                  style={{ background: 'rgba(255,255,255,.16)', boxShadow: 'none' }}
                >
                  <i className="fa-solid fa-staff-snake" />
                </span>
                APS
              </div>

              <span
                className="eyebrow"
                style={{ background: 'rgba(255,255,255,.16)', color: '#8FE8C6' }}
              >
                Espace patient
              </span>
              <h1 style={{ color: '#fff', fontSize: '2rem', marginTop: '.7rem' }}>
                Content de vous revoir.
              </h1>
              <p style={{ color: 'rgba(255,255,255,.85)', maxWidth: 340 }}>
                Connectez-vous pour retrouver vos rendez-vous, vos professionnels favoris et votre
                dossier santé, en toute sécurité.
              </p>
            </div>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
              <li className="trust-item" style={{ color: 'rgba(255,255,255,.9)' }}>
                <i className="fa-solid fa-shield-halved" style={{ color: '#6FE0B0' }} />
                Données médicales chiffrées et protégées
              </li>
              <li className="trust-item" style={{ color: 'rgba(255,255,255,.9)' }}>
                <i className="fa-solid fa-user-doctor" style={{ color: '#6FE0B0' }} />
                Plus de 1 200 professionnels vérifiés
              </li>
              <li className="trust-item" style={{ color: 'rgba(255,255,255,.9)' }}>
                <i className="fa-solid fa-calendar-check" style={{ color: '#6FE0B0' }} />
                Rendez-vous confirmés en quelques clics
              </li>
            </ul>
          </div>

          {/* ============================ FORMULAIRE ============================ */}
          <div className="col-md-7" style={{ background: 'var(--surface)', padding: '3rem 2.6rem' }}>
            <div style={{ maxWidth: 380, margin: '0 auto' }}>
              <span className="eyebrow">Connexion</span>
              <h2 style={{ marginTop: '.6rem', fontSize: '1.6rem' }}>Se connecter à mon compte</h2>
              <p className="text-muted-soft" style={{ marginBottom: '1.8rem' }}>
                Pas encore de compte ?{' '}
                <Link to="/inscription" style={{ fontWeight: 700 }}>
                  Créez-en un gratuitement
                </Link>
              </p>

              <form onSubmit={handleSubmit} noValidate>
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
                    />
                  </div>
                  {errors.email && (
                    <p className="form-hint" style={{ color: 'var(--urgence-dark)' }}>
                      <i className="fa-solid fa-circle-exclamation" /> {errors.email}
                    </p>
                  )}
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
                  {errors.password && (
                    <p className="form-hint" style={{ color: 'var(--urgence-dark)' }}>
                      <i className="fa-solid fa-circle-exclamation" /> {errors.password}
                    </p>
                  )}
                </div>

                <div className="form-check mb-3" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="login-remember"
                    name="remember"
                    checked={form.remember}
                    onChange={handleChange}
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

              <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', margin: '1.6rem 0' }}>
                <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                <span className="text-faint" style={{ fontSize: '.78rem' }}>ou continuer avec</span>
                <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              </div>

              <div className="d-flex gap-2">
                <button type="button" className="btn btn-outline-primary btn-block-aps">
                  <i className="fa-brands fa-google" /> Google
                </button>
                <button type="button" className="btn btn-outline-primary btn-block-aps">
                  <i className="fa-brands fa-apple" /> Apple
                </button>
              </div>

              <p className="text-faint" style={{ fontSize: '.76rem', marginTop: '1.8rem', textAlign: 'center' }}>
                En vous connectant, vous acceptez nos{' '}
                <Link to="/conditions">conditions d&apos;utilisation</Link> et notre{' '}
                <Link to="/confidentialite">politique de confidentialité</Link>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}