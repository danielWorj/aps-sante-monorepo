/**
 * Barre de progression minimaliste pour le sous-parcours "Médecins et
 * professionnels" (Écran 1.1.1 → Écran 1.1.2). `current` est l'étape
 * active (1-indexée), `total` le nombre total d'étapes du sous-parcours.
 */
export default function OnboardingProgress({ current, total = 2 }) {
  const etapes = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div
      className="onboarding-progress"
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Étape ${current} sur ${total}`}
    >
      {etapes.map((n) => (
        <span key={n} className={n <= current ? 'is-done' : ''} />
      ))}
    </div>
  );
}