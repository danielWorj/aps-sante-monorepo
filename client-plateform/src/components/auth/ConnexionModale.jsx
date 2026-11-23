// src/components/auth/ConnexionModale.jsx
//
// Connexion sans quitter la page (ex. « Choisir cette formule » sur
// /pricing, demande rapide) : même formulaire que pages/Login.jsx
// (FormulaireConnexion : numéro + code PIN par défaut, e-mail en lien
// discret, confirmation d'un nouvel appareil), puis onConnecte() —
// l'appelant reprend là où le visiteur s'était arrêté.
//
// PIN provisoire / mot de passe temporaire : aucune session n'est ouverte ;
// on bascule sur l'écran de changement, avec le retour vers la page d'origine.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import FormulaireConnexion from './FormulaireConnexion';

/**
 * @param {{ titre?: string, sousTitre?: React.ReactNode, onFermer: () => void, onConnecte?: (data) => void }} props
 */
export default function ConnexionModale({ titre = 'Connectez-vous pour continuer', sousTitre, onFermer, onConnecte }) {
  const navigate = useNavigate();
  const location = useLocation();
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

        <FormulaireConnexion
          idPrefixe="cm"
          libelleBouton="Se connecter et continuer"
          afficherResterConnecte={false}
          onEnCours={setEnvoi}
          onConnecte={(data) => onConnecte?.(data)}
          onPinProvisoire={(data) => navigate('/creer-mon-pin', {
            state: { mode: 'initial', token: data.token_changement_pin, retour },
          })}
          onMotDePasseTemporaire={(data, email) => navigate('/modifier-mot-de-passe', {
            state: {
              mode: 'initial',
              token: data.token_changement_mot_de_passe,
              tokenExpireLe: data.token_changement_mot_de_passe_expire_le,
              motDePasseExpireLe: data.mot_de_passe_expire_le,
              email,
              from: retour,
            },
          })}
        />

        <p className="connexion-modale-foot">
          Pas encore de compte ?{' '}
          <Link to="/inscription" state={{ from: retour }} style={{ fontWeight: 700 }}>Créez-en un gratuitement</Link>
        </p>
      </div>
    </div>,
    document.body
  );
}
