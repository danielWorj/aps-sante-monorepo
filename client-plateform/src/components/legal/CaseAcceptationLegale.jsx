// components/legal/CaseAcceptationLegale.jsx
// Case « J'accepte les CGU et la politique de confidentialité » avec liens
// vers /cgu et /confidentialite (nouvel onglet, pour ne pas perdre la
// saisie en cours). Le formulaire envoie ensuite `accepte_cgu` au serveur,
// qui enregistre la version acceptée (server/src/services/documentLegal.service.js).

/** Liens seuls, pour une mention sans case (« En payant, vous acceptez… »). */
export function LiensLegaux() {
  return (
    <>
      <a href="/cgu" target="_blank" rel="noopener noreferrer">Conditions générales d&apos;utilisation</a> et la{' '}
      <a href="/confidentialite" target="_blank" rel="noopener noreferrer">Politique de confidentialité</a>
    </>
  );
}

export default function CaseAcceptationLegale({ id = 'accepte-cgu', checked, onChange, className = 'form-check mt-3' }) {
  return (
    <div className={className}>
      <input
        className="form-check-input"
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required
      />
      <label className="form-check-label" htmlFor={id}>
        J&apos;accepte les <LiensLegaux />.
      </label>
    </div>
  );
}

export const MESSAGE_CGU_REQUISES = 'Vous devez accepter les CGU et la politique de confidentialité.';
