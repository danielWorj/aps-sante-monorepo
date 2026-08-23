// src/pages/ModifPassword.jsx
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import med7 from '../assets/img/med7.jpg';
import { useAuth } from '../context/AuthContext';

export default function ModifPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const { changerMotDePasseInitial } = useAuth();

  // ─── Mode "changement forcé" (première connexion / mot de passe
  // temporaire) ────────────────────────────────────────────────────
  // Arrivée uniquement via Login.jsx après un connecter() ayant
  // renvoyé mot_de_passe_a_changer: true. Le token restreint est
  // transmis dans le state de navigation (jamais dans l'URL ni un
  // stockage persistant) : voir Login.jsx.
  const navState = location.state || {};
  const isInitialChange = navState.mode === 'initial' && Boolean(navState.token);
  const tokenExpireLe = navState.tokenExpireLe ? new Date(navState.tokenExpireLe) : null;
  const isTokenExpired = tokenExpireLe ? tokenExpireLe.getTime() < Date.now() : false;

  const [show, setShow] = useState({ old: false, next: false, confirm: false });
  const [form, setForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Accès direct à l'écran en mode forcé sans token valable (lien
  // partagé, navigation manuelle, retour arrière après redirection) :
  // on ne peut rien faire ici, retour à la connexion.
  useEffect(() => {
    if (navState.mode === 'initial' && (!navState.token || isTokenExpired)) {
      navigate('/login', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleShow = (field) => {
    setShow((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  // Force du mot de passe : 0 à 4
  const getStrength = (pwd) => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score;
  };

  const strength = getStrength(form.newPassword);
  const strengthLabels = ['Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent'];
  const strengthColors = [
    'var(--urgence)',
    'var(--urgence)',
    'var(--orange-dark)',
    'var(--teal-dark)',
    'var(--primary-dark)',
  ];

  const validate = () => {
    const next = {};
    // L'ancien mot de passe n'existe pas dans le flux "mot de passe
    // temporaire" : l'utilisateur ne le connaît pas forcément (ex.
    // mot de passe généré et transmis par un administrateur).
    if (!isInitialChange && !form.oldPassword) {
      next.oldPassword = 'Merci de renseigner votre ancien mot de passe.';
    }
    if (!form.newPassword) next.newPassword = 'Merci de renseigner votre nouveau mot de passe.';
    else if (form.newPassword.length < 8)
      next.newPassword = 'Le nouveau mot de passe doit contenir au moins 8 caractères.';
    else if (!isInitialChange && form.newPassword === form.oldPassword)
      next.newPassword = 'Le nouveau mot de passe doit être différent de l’ancien.';
    if (!form.confirmPassword)
      next.confirmPassword = 'Merci de confirmer votre nouveau mot de passe.';
    else if (form.confirmPassword !== form.newPassword)
      next.confirmPassword = 'Les deux mots de passe ne correspondent pas.';
    return next;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);

    if (isInitialChange) {
      try {
        // POST /auth/changer-mot-de-passe-initial, avec
        // Authorization: Bearer <token_changement_mot_de_passe> géré par
        // authOverride dans authService.js. En cas de succès, une
        // session complète est ouverte (access_token + utilisateur),
        // stockée par apiClient comme un connecter() classique.
        // AuthContext.changerMotDePasseInitial() appelle le service puis
        // ouvre déjà la session locale (access_token + user + status),
        // exactement comme connecter() — rien à refaire ici.
        await changerMotDePasseInitial(navState.token, form.newPassword);
        setLoading(false);
        setSuccess(true);
        setTimeout(() => navigate('/portail/medecin-agenda', { replace: true }), 1400);
      } catch (err) {
        setLoading(false);
        // Token expiré/déjà utilisé/invalide côté serveur : impossible
        // de continuer ce flux, l'utilisateur doit se reconnecter.
        if (err?.status === 401 || err?.status === 403) {
          setErrors({
            general:
              'Ce lien de changement de mot de passe a expiré ou n’est plus valable. Merci de vous reconnecter.',
          });
        } else {
          setErrors({
            general: err?.message || 'Une erreur est survenue. Merci de réessayer.',
          });
        }
      }
      return;
    }

    // Changement de mot de passe "classique" depuis un compte déjà
    // authentifié : pas de route dédiée exposée pour l'instant côté
    // authService.js (à ajouter séparément, ex. PATCH /auth/mot-de-passe).
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => navigate('/portail/medecin-agenda'), 1400);
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
                {isInitialChange ? 'Première connexion' : 'Sécurité du compte'}
              </span>
              <h1 style={{ color: '#fff', fontSize: '2rem', marginTop: '.7rem' }}>
                {isInitialChange
                  ? 'Choisissez votre mot de passe définitif.'
                  : 'Un mot de passe fort, un compte protégé.'}
              </h1>
              <p style={{ color: 'rgba(255,255,255,.85)', maxWidth: 340 }}>
                {isInitialChange
                  ? 'Pour votre sécurité, le mot de passe temporaire qui vous a été transmis doit être remplacé avant d’accéder à votre espace.'
                  : 'Mettez à jour votre mot de passe en quelques secondes. Vos données médicales restent chiffrées et accessibles uniquement par vous.'}
              </p>
            </div>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '.9rem',
              }}
            >
              <li className="trust-item" style={{ color: 'rgba(255,255,255,.9)' }}>
                <i className="fa-solid fa-shield-halved" style={{ color: '#6FE0B0' }} />
                Données médicales chiffrées et protégées
              </li>
              <li className="trust-item" style={{ color: 'rgba(255,255,255,.9)' }}>
                <i className="fa-solid fa-right-from-bracket" style={{ color: '#6FE0B0' }} />
                Déconnexion automatique des autres appareils
              </li>
              <li className="trust-item" style={{ color: 'rgba(255,255,255,.9)' }}>
                <i className="fa-solid fa-bell" style={{ color: '#6FE0B0' }} />
                Alerte de sécurité envoyée à chaque modification
              </li>
            </ul>
          </div>

          {/* ============================ FORMULAIRE ============================ */}
          <div className="col-md-7" style={{ background: 'var(--surface)', padding: '3rem 2.6rem' }}>
            <div style={{ maxWidth: 400, margin: '0 auto' }}>
              <span className="eyebrow">Mot de passe</span>
              <h2 style={{ marginTop: '.6rem', fontSize: '1.6rem' }}>
                {isInitialChange ? 'Définir mon nouveau mot de passe' : 'Modifier mon mot de passe'}
              </h2>

              {isInitialChange ? (
                <p className="text-muted-soft" style={{ marginBottom: '1.8rem' }}>
                  {navState.email ? (
                    <>
                      Connexion en cours pour <strong>{navState.email}</strong>. Ce mot de passe
                      temporaire ne peut être utilisé qu’une seule fois.
                    </>
                  ) : (
                    'Ce mot de passe temporaire ne peut être utilisé qu’une seule fois.'
                  )}
                </p>
              ) : (
                <p className="text-muted-soft" style={{ marginBottom: '1.8rem' }}>
                  <Link to="/tableau-de-bord" style={{ fontWeight: 700 }}>
                    <i className="fa-solid fa-arrow-left" style={{ fontSize: '.8rem' }} /> Retour au
                    tableau de bord
                  </Link>
                </p>
              )}

              {/* Bandeau d'erreur générale (token expiré, erreur serveur…) */}
              {errors.general && (
                <div
                  style={{
                    background: 'rgba(220,53,69,.08)',
                    border: '1px solid var(--urgence)',
                    color: 'var(--urgence-dark)',
                    padding: '.8rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '.86rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.6rem',
                    marginBottom: '1.2rem',
                  }}
                >
                  <i className="fa-solid fa-circle-exclamation" /> {errors.general}
                  {isInitialChange && (
                    <Link to="/connexion" style={{ marginLeft: 'auto', fontWeight: 700 }}>
                      Se reconnecter
                    </Link>
                  )}
                </div>
              )}

              {/* Bandeau de succès */}
              {success && (
                <div
                  style={{
                    background: 'var(--primary-tint)',
                    border: '1px solid var(--primary)',
                    color: 'var(--primary-dark)',
                    padding: '.8rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '.86rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.6rem',
                    marginBottom: '1.2rem',
                  }}
                >
                  <i className="fa-solid fa-circle-check" /> Mot de passe mis à jour avec succès.
                  Redirection…
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                {/* ------------------ ANCIEN MOT DE PASSE ------------------ */}
                {/* Masqué en mode "première connexion" : l'utilisateur n'a
                    pas à ressaisir le mot de passe temporaire, déjà
                    validé par connecter() juste avant. */}
                {!isInitialChange && (
                  <div className="search-field">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                      }}
                    >
                      <label className="form-label-aps" htmlFor="old-password">
                        Ancien mot de passe
                      </label>
                      <Link
                        to="/mot-de-passe-oublie"
                        style={{ fontSize: '.78rem', fontWeight: 600 }}
                      >
                        Mot de passe oublié ?
                      </Link>
                    </div>
                    <div className="input-icon" style={{ position: 'relative' }}>
                      <i className="fa-solid fa-lock" />
                      <input
                        type={show.old ? 'text' : 'password'}
                        id="old-password"
                        name="oldPassword"
                        className="form-control"
                        placeholder="••••••••"
                        value={form.oldPassword}
                        onChange={handleChange}
                        autoComplete="current-password"
                        style={{ paddingRight: '2.6rem' }}
                      />
                      <button
                        type="button"
                        onClick={() => toggleShow('old')}
                        aria-label={show.old ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
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
                        <i className={`fa-solid ${show.old ? 'fa-eye-slash' : 'fa-eye'}`} />
                      </button>
                    </div>
                    {errors.oldPassword && (
                      <p className="form-hint" style={{ color: 'var(--urgence-dark)' }}>
                        <i className="fa-solid fa-circle-exclamation" /> {errors.oldPassword}
                      </p>
                    )}
                  </div>
                )}

                {/* ------------------ NOUVEAU MOT DE PASSE ------------------ */}
                <div className="search-field">
                  <label className="form-label-aps" htmlFor="new-password">
                    Nouveau mot de passe
                  </label>
                  <div className="input-icon" style={{ position: 'relative' }}>
                    <i className="fa-solid fa-key" />
                    <input
                      type={show.next ? 'text' : 'password'}
                      id="new-password"
                      name="newPassword"
                      className="form-control"
                      placeholder="Au moins 8 caractères"
                      value={form.newPassword}
                      onChange={handleChange}
                      autoComplete="new-password"
                      style={{ paddingRight: '2.6rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => toggleShow('next')}
                      aria-label={
                        show.next ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                      }
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
                      <i className={`fa-solid ${show.next ? 'fa-eye-slash' : 'fa-eye'}`} />
                    </button>
                  </div>

                  {/* Indicateur de force */}
                  {form.newPassword && (
                    <div style={{ marginTop: '.5rem' }}>
                      <div style={{ display: 'flex', gap: '.35rem', marginBottom: '.3rem' }}>
                        {[0, 1, 2, 3].map((i) => (
                          <span
                            key={i}
                            style={{
                              flex: 1,
                              height: 4,
                              borderRadius: 'var(--radius-pill)',
                              background:
                                i < strength ? strengthColors[strength] : 'var(--line-strong)',
                              transition: 'background .2s ease',
                            }}
                          />
                        ))}
                      </div>
                      <p
                        className="form-hint"
                        style={{ margin: 0, color: strengthColors[strength], fontWeight: 600 }}
                      >
                        Force : {strengthLabels[strength]}
                      </p>
                    </div>
                  )}

                  {errors.newPassword && (
                    <p className="form-hint" style={{ color: 'var(--urgence-dark)' }}>
                      <i className="fa-solid fa-circle-exclamation" /> {errors.newPassword}
                    </p>
                  )}
                </div>

                {/* ------------------ CONFIRMATION ------------------ */}
                <div className="search-field">
                  <label className="form-label-aps" htmlFor="confirm-password">
                    Confirmer le nouveau mot de passe
                  </label>
                  <div className="input-icon" style={{ position: 'relative' }}>
                    <i className="fa-solid fa-lock-open" />
                    <input
                      type={show.confirm ? 'text' : 'password'}
                      id="confirm-password"
                      name="confirmPassword"
                      className="form-control"
                      placeholder="••••••••"
                      value={form.confirmPassword}
                      onChange={handleChange}
                      autoComplete="new-password"
                      style={{ paddingRight: '2.6rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => toggleShow('confirm')}
                      aria-label={
                        show.confirm ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                      }
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
                      <i className={`fa-solid ${show.confirm ? 'fa-eye-slash' : 'fa-eye'}`} />
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="form-hint" style={{ color: 'var(--urgence-dark)' }}>
                      <i className="fa-solid fa-circle-exclamation" /> {errors.confirmPassword}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-block-aps btn-lg-aps"
                  disabled={loading}
                  style={{ marginTop: '.5rem' }}
                >
                  {loading ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin" /> Mise à jour en cours…
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-shield-halved" /> Mettre à jour le mot de passe
                    </>
                  )}
                </button>
              </form>

              {/* ------------------ CONSEILS DE SÉCURITÉ ------------------ */}
              <div
                style={{
                  marginTop: '1.8rem',
                  background: 'var(--surface-alt)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.1rem 1.2rem',
                }}
              >
                <p
                  style={{
                    fontSize: '.82rem',
                    fontWeight: 700,
                    color: 'var(--ink)',
                    marginBottom: '.6rem',
                  }}
                >
                  <i className="fa-solid fa-lightbulb" style={{ color: 'var(--gold)' }} /> Pour un
                  mot de passe robuste :
                </p>
                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '.4rem',
                    fontSize: '.8rem',
                    color: 'var(--ink-soft)',
                  }}
                >
                  <li>
                    <i
                      className="fa-solid fa-check"
                      style={{ color: 'var(--primary)', marginRight: '.5rem' }}
                    />
                    Au moins 8 caractères
                  </li>
                  <li>
                    <i
                      className="fa-solid fa-check"
                      style={{ color: 'var(--primary)', marginRight: '.5rem' }}
                    />
                    Une majuscule et une minuscule
                  </li>
                  <li>
                    <i
                      className="fa-solid fa-check"
                      style={{ color: 'var(--primary)', marginRight: '.5rem' }}
                    />
                    Au moins un chiffre
                  </li>
                  <li>
                    <i
                      className="fa-solid fa-check"
                      style={{ color: 'var(--primary)', marginRight: '.5rem' }}
                    />
                    Au moins un caractère spécial (@, #, !…)
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
