import { Link, useLocation, useNavigate } from 'react-router-dom';
import FormulaireConnexion from '../components/auth/FormulaireConnexion';

import med7 from '../assets/img/med7.jpg';
import logoApsa from '../assets/img/logoapsa.jpeg';
import { cheminRetour, destinationApresConnexion } from '../utils/apresConnexion';
import { NOM_MARQUE, RAISON_SOCIALE } from '../lib/marque';

// Connexion par numéro + code PIN (par défaut). La connexion par e-mail
// reste possible via un lien discret (anciens comptes). Toute la logique
// (nouvel appareil, validation dans l'application) est dans
// FormulaireConnexion, partagé avec ConnexionModale.
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const retour = cheminRetour(location.state?.from);

  const apresConnexion = (data, { proposerPin = false } = {}) => {
    const { to, state } = destinationApresConnexion({
      utilisateur: data.utilisateur,
      espaces: data.espaces,
      retour,
      proposerPin,
    });
    navigate(to, { replace: true, state });
  };

  return (
    <section className="connexion26">
      <div className="connexion26-cadre">
          {/* ============================ FORMULAIRE ============================ */}
          <div className="connexion26-form">
            <div className="connexion26-form-int">
              <Link to="/home" className="connexion26-logo" aria-label={`${NOM_MARQUE} — accueil`}>
                <img src={logoApsa} alt={`${NOM_MARQUE} — ${RAISON_SOCIALE}`} />
              </Link>
              <h1 className="connexion26-titre">Bon retour parmi nous</h1>
              <p className="aps-t-s connexion26-sous-titre">
                Connectez-vous avec votre numéro de téléphone et votre code PIN.
              </p>

              {location.state?.message && (
                <div className="alert alert-success" role="status">{location.state.message}</div>
              )}

              <FormulaireConnexion
                // Compte sans PIN (connexion par e-mail) : on propose de le créer.
                onConnecte={(data) => apresConnexion(data, { proposerPin: true })}
                // PIN provisoire (compte créé par un administrateur ou le
                // responsable d'une fiche) : le token restreint ne sert qu'à
                // choisir son PIN.
                onPinProvisoire={(data) => navigate('/creer-mon-pin', {
                  replace: true,
                  state: { mode: 'initial', token: data.token_changement_pin, retour },
                })}
                // Mot de passe temporaire : changement forcé, token transmis
                // par le state de navigation (jamais dans l'URL).
                onMotDePasseTemporaire={(data, email) => navigate('/modifier-mot-de-passe', {
                  replace: true,
                  state: {
                    mode: 'initial',
                    token: data.token_changement_mot_de_passe,
                    tokenExpireLe: data.token_changement_mot_de_passe_expire_le,
                    motDePasseExpireLe: data.mot_de_passe_expire_le,
                    email,
                  },
                })}
              />

              <p className="connexion26-inscription">
                Pas encore de compte ? <Link to="/inscription" className="aps-lnk">Créer un compte</Link>
              </p>

              <p className="connexion26-legal">
                En vous connectant, vous acceptez nos{' '}
                <Link to="/cgu">conditions d&apos;utilisation</Link> et notre{' '}
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
