import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import loginImg from '../assets/img/login.jpg';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      await login(form.email, form.password);
      // Si l'utilisateur a été redirigé ici par RequireAuth depuis une
      // page précise (ex: /utilisateurs), on l'y renvoie ; sinon on va
      // à la racine de l'espace admin.
      const destination = location.state?.from?.pathname ?? '/';
      navigate(destination, { replace: true });
    } catch (err) {
      // Messages renvoyés par authentification.controller.js#connecter :
      // 401 "Identifiants invalides." / 403 "Compte suspendu."
      setServerError(err.data?.message || 'Impossible de se connecter. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--aps-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        className="row g-0"
        style={{
          maxWidth: 980,
          width: '100%',
          margin: '0 auto',
          borderRadius: 'var(--aps-radius-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--aps-shadow-md)',
          border: '1px solid var(--aps-border)',
          background: 'var(--aps-surface)',
        }}
      >
        {/* ============================ PANNEAU VISUEL ============================ */}
        <div
          className="col-md-5 d-none d-md-flex"
          style={{
            position: 'relative',
            minHeight: 560,
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
        >
          <img
            src={loginImg}
            alt="Espace administrateur APS"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(28,37,48,.15) 0%, rgba(20,26,36,.86) 100%)',
            }}
          />

          <div style={{ position: 'relative', padding: '32px', color: '#fff' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 28,
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 'var(--aps-radius)',
                  background: 'rgba(255,255,255,.14)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                }}
              >
                <i className="fa-solid fa-staff-snake" />
              </span>
              <span style={{ fontWeight: 800, fontSize: 18 }}>
                APS <small style={{ display: 'block', fontSize: 10.5, fontWeight: 600, opacity: .7, textTransform: 'uppercase', letterSpacing: '.06em' }}>Back-office</small>
              </span>
            </div>

            <h1 style={{ color: '#fff', fontSize: '1.7rem', marginBottom: 10 }}>
              Espace d&apos;administration
            </h1>
            <p style={{ color: 'rgba(255,255,255,.78)', maxWidth: 320, fontSize: 14 }}>
              Gérez les professionnels, les structures de santé et les assurances depuis un
              tableau de bord unique et sécurisé.
            </p>

            <ul style={{ listStyle: 'none', margin: '24px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,.85)', fontSize: 13 }}>
                <i className="fa-solid fa-shield-halved" style={{ color: '#6FE0B0' }} />
                Accès réservé aux administrateurs habilités
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,.85)', fontSize: 13 }}>
                <i className="fa-solid fa-user-shield" style={{ color: '#6FE0B0' }} />
                Journal d&apos;activité et double authentification
              </li>
            </ul>
          </div>
        </div>

        {/* ============================ FORMULAIRE ============================ */}
        <div className="col-md-7" style={{ padding: '48px 44px' }}>
          <div style={{ maxWidth: 380, margin: '0 auto' }}>
            <span
              style={{
                display: 'inline-block',
                fontSize: 11.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                color: 'var(--aps-primary-600)',
                background: 'var(--aps-primary-100)',
                borderRadius: 'var(--aps-radius-pill)',
                padding: '4px 12px',
                marginBottom: 12,
              }}
            >
              Connexion
            </span>
            <h2 style={{ fontSize: '1.5rem', margin: '0 0 6px' }}>Connectez-vous au back-office</h2>
            <p style={{ color: 'var(--aps-text-500)', fontSize: 13.5, marginBottom: 24 }}>
              Utilisez vos identifiants administrateur pour accéder au tableau de bord.
            </p>

            {serverError && (
              <div className="aps-notice is-danger" style={{ marginBottom: 18 }}>
                <i className="fa-solid fa-circle-exclamation" />
                <span>{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-3">
                <label className="form-label" htmlFor="login-email">Adresse e-mail</label>
                <div style={{ position: 'relative' }}>
                  <i
                    className="fa-solid fa-envelope"
                    style={{
                      position: 'absolute',
                      left: 14,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--aps-text-400)',
                      fontSize: 13,
                    }}
                  />
                  <input
                    type="email"
                    id="login-email"
                    name="email"
                    className="form-control"
                    placeholder="admin@aps-sante.com"
                    style={{ paddingLeft: 36 }}
                    value={form.email}
                    onChange={handleChange}
                    autoComplete="email"
                  />
                </div>
                {errors.email && (
                  <p className="form-text" style={{ color: 'var(--aps-danger)', marginTop: 6 }}>
                    <i className="fa-solid fa-circle-exclamation" /> {errors.email}
                  </p>
                )}
              </div>

              <div className="mb-3">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <label className="form-label" htmlFor="login-password">Mot de passe</label>
                  <Link to="/mot-de-passe-oublie" style={{ fontSize: 12.5, fontWeight: 600 }}>
                    Mot de passe oublié ?
                  </Link>
                </div>
                <div style={{ position: 'relative' }}>
                  <i
                    className="fa-solid fa-lock"
                    style={{
                      position: 'absolute',
                      left: 14,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--aps-text-400)',
                      fontSize: 13,
                    }}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="login-password"
                    name="password"
                    className="form-control"
                    placeholder="••••••••"
                    style={{ paddingLeft: 36, paddingRight: 40 }}
                    value={form.password}
                    onChange={handleChange}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--aps-text-400)',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: 13,
                    }}
                  >
                    <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
                {errors.password && (
                  <p className="form-text" style={{ color: 'var(--aps-danger)', marginTop: 6 }}>
                    <i className="fa-solid fa-circle-exclamation" /> {errors.password}
                  </p>
                )}
              </div>

              <div
                className="form-check mb-4"
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="login-remember"
                  name="remember"
                  checked={form.remember}
                  onChange={handleChange}
                />
                <label
                  className="form-check-label"
                  htmlFor="login-remember"
                  style={{ fontSize: 13, color: 'var(--aps-text-500)' }}
                >
                  Rester connecté sur cet appareil
                </label>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '11px 16px', fontSize: 14 }}
                disabled={loading}
              >
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

            <p style={{ fontSize: 12, color: 'var(--aps-text-400)', marginTop: 22, textAlign: 'center' }}>
              Accès réservé au personnel autorisé d&apos;APS. En cas de difficulté, contactez
              l&apos;équipe support à{' '}
              <a href="mailto:support@aps-sante.com">support@aps-sante.com</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}