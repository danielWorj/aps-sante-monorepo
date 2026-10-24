// presenceCommun.jsx — composants partagés par les pages des portails
// pharmacie et centre de santé : chargement, erreurs, bandeaux « masqué au
// public » (selon l'abonnement de présence) et « fiche hors ligne ».
// Outils non composants : presenceOutils.js.
import { Link } from 'react-router-dom';
import { ESPACES_PRESENCE } from '../../../services/espacePresenceService';

/** Spinner / erreur avec « Réessayer », sinon les enfants. */
export function EtatChargement({ donnees, erreur, recharger, children }) {
  if (erreur && !donnees) {
    return (
      <div className="alert alert-danger d-flex align-items-center" role="alert">
        <i className="fa-solid fa-circle-exclamation me-2"></i>
        <div className="flex-grow-1">{erreur}</div>
        {recharger && <button type="button" className="btn btn-sm btn-outline-danger" onClick={recharger}>Réessayer</button>}
      </div>
    );
  }
  if (!donnees) return <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /></div>;
  return children;
}

/**
 * Bandeau affiché quand un contenu est conservé mais masqué au public
 * faute d'un abonnement qui l'inclut.
 */
export function BandeauMasque({ type, visible, children }) {
  if (visible) return null;
  return (
    <div className="banner-institutionnel">
      <i className="fa-solid fa-eye-slash" />
      <span>
        {children} <Link to={`${ESPACES_PRESENCE[type].portail}-abonnement`}>Voir les abonnements</Link>
      </span>
    </div>
  );
}

/** Bandeau « fiche pas encore en ligne ». */
export function BandeauFicheHorsLigne({ fiche }) {
  if (fiche.en_ligne) return null;
  return (
    <div className="banner-institutionnel">
      <i className="fa-solid fa-hourglass-half" />
      <span>
        {fiche.statut_verification === 'non_publie'
          ? "Votre fiche n'est pas publiée : elle n'est pas visible du public. Contactez ApSa pour en connaître la raison."
          : "Votre fiche est en cours de vérification par ApSa : elle sera visible du public après validation."}
      </span>
    </div>
  );
}
