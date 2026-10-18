// src/components/auth/ConnexionModale.jsx
//
// Connexion sans quitter la page (ex. « Choisir cette formule » sur
// /pricing) : même appel que pages/Login.jsx (AuthContext.connecter), puis
// onConnecte() — l'appelant reprend là où le visiteur s'était arrêté.
//
// Mot de passe temporaire (mot_de_passe_a_changer) : aucune session n'est
// ouverte ; on bascule sur l'écran de changement forcé, comme Login.jsx,
// avec `from` pour revenir ensuite à la page d'origine.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * @param {{ titre?: string, sousTitre?: React.ReactNode, onFermer: () => void, onConnecte?: (data) => void }} props
 */
export default function ConnexionModale({ titre = 'Connectez-vous pour continuer', sousTitre, onFermer, onConnecte }) {
  const { connecter } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [voirMotDePasse, setVoirMotDePasse] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const retour = `${location.pathname}${location.search}`;

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape' && !envoi) onFermer?.(); };
    document.addEventListener('keydown', onKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [onFermer, envoi]);

  const changer = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const soumettre = async (e) => {
    e.preventDefault();
    if (envoi) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setErreur('Adresse e-mail invalide.');
      return;
    }
    if (!form.password) {
      setErreur('Merci de renseigner votre mot de passe.');
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const data = await connecter(form.email.trim(), form.password);
      if (data?.mot_de_passe_a_changer) {
        navigate('/modifier-mot-de-passe', {
          state: {
            mode: 'initial',
            token: data.token_changement_mot_de_passe,
            tokenExpireLe: data.token_changement_mot_de_passe_expire_le,
            motDePasseExpireLe: data.mot_de_passe_expire_le,
            email: form.email.trim(),
            from: retour,
          },
        });
        return;
      }
      onConnecte?.(data);
    } catch (err) {
      setErreur(err?.status === 401 ? 'E-mail ou mot de passe incorrect.' : err?.message || 'Une erreur est survenue. Merci de réessayer.');
    } finally {
      setEnvoi(false);
    }
  };

  return createPortal(
    <div className="rdv-modal-overlay" onClick={envoi ? undefined : onFermer}>
      <div
        className="rdv-modal connexion-modale"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connexion-modale-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="rdv-modal-close" onClick={onFermer} aria-label="Fermer" disabled={envoi}>
          <i className="fa-solid fa-xmark" />
        </button>

        <div className="connexion-modale-head">
          <span className="connexion-modale-mark"><i className="fa-solid fa-user-lock" /></span>
          <h3 id="connexion-modale-titre">{titre}</h3>
          {sousTitre && <div className="connexion-modale-sub">{sousTitre}</div>}
        </div>

        {erreur && (
          <p className="status-card-error" role="alert">
            <i className="fa-solid fa-circle-exclamation" /> {erreur}
          </p>
        )}

        <form onSubmit={soumettre} noValidate>
          <div className="search-field">
            <label className="form-label-aps" htmlFor="cm-email">Adresse e-mail</label>
            <div className="input-icon">
              <i className="fa-solid fa-envelope" />
              <input
                type="email"
                id="cm-email"
                name="email"
                className="form-control"
                placeholder="vous@exemple.com"
                value={form.email}
                onChange={changer}
                autoComplete="email"
                autoFocus
                disabled={envoi}
              />
            </div>
          </div>

          <div className="search-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label className="form-label-aps" htmlFor="cm-password">Mot de passe</label>
              <Link to="/mot-de-passe-oublie" style={{ fontSize: '.78rem', fontWeight: 600 }}>Mot de passe oublié ?</Link>
            </div>
            <div className="input-icon" style={{ position: 'relative' }}>
              <i className="fa-solid fa-lock" />
              <input
                type={voirMotDePasse ? 'text' : 'password'}
                id="cm-password"
                name="password"
                className="form-control"
                placeholder="••••••••"
                value={form.password}
                onChange={changer}
                autoComplete="current-password"
                style={{ paddingRight: '2.6rem' }}
                disabled={envoi}
              />
              <button
                type="button"
                className="connexion-modale-oeil"
                onClick={() => setVoirMotDePasse((v) => !v)}
                aria-label={voirMotDePasse ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                <i className={`fa-solid ${voirMotDePasse ? 'fa-eye-slash' : 'fa-eye'}`} />
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block-aps w-100" disabled={envoi}>
            {envoi
              ? <><i className="fa-solid fa-spinner fa-spin" /> Connexion en cours…</>
              : <><i className="fa-solid fa-right-to-bracket" /> Se connecter et continuer</>}
          </button>
        </form>

        <p className="connexion-modale-foot">
          Pas encore de compte ?{' '}
          <Link to="/inscription" state={{ from: retour }} style={{ fontWeight: 700 }}>Créez-en un gratuitement</Link>
        </p>
      </div>
    </div>,
    document.body
  );
}
