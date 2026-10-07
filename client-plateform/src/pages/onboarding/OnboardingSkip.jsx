import { Link } from 'react-router-dom';

/**
 * Bouton "Passer" commun à toutes les pages d'onboarding : permet de
 * quitter le parcours guidé et de rejoindre directement /home.
 */
export default function OnboardingSkip() {
  return (
    <Link to="/home" className="onboarding-skip" style={{ marginTop: '1.5rem' }}>
      Passer <i className="fa-solid fa-arrow-right" />
    </Link>
  );
}