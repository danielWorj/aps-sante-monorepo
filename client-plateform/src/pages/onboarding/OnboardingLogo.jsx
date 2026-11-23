/**
 * Logo ApSa Santé affiché en tête de chaque écran d'onboarding.
 * PNG détouré (fond transparent) : il se fond dans l'arrière-plan
 * au lieu d'afficher le carré blanc de favicon.jpeg.
 * `taille` : "grand" sur l'écran d'accueil, "petit" ailleurs.
 */
import { NOM_MARQUE } from '../../lib/marque';

export default function OnboardingLogo({ taille = 'petit' }) {
  return (
    <img
      src="/logo-transparent.png"
      alt={`Logo ${NOM_MARQUE}`}
      className={`onboarding-logo onboarding-logo-${taille}`}
    />
  );
}
