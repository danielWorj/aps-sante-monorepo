import { obtenirPosition } from "./geolocConsentement";
import { apiFetch } from "./apiClient";

// Une seule détection par session : le contexte Pays (PaysContext.jsx) et
// les écrans d'inscription partagent la même réponse, la modale de
// géolocalisation n'apparaît donc qu'une fois.
let detectionEnCours = null;

/**
 * Demande la position GPS du navigateur puis interroge le serveur
 * pour en déduire le pays APS correspondant.
 * Retourne l'objet `pays` (Prisma) ou `null` si indisponible/refusé —
 * l'appelant doit alors basculer sur une sélection manuelle.
 *
 * @param {{ forcer?: boolean }} [options] forcer : relance une nouvelle
 *   détection (bouton « Me localiser ») au lieu de réutiliser la précédente.
 */
export function detecterPaysUtilisateur({ forcer = false } = {}) {
  if (detectionEnCours && !forcer) return detectionEnCours;
  detectionEnCours = new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);

    obtenirPosition(
      async ({ coords }) => {
        try {
          const { pays } = await apiFetch(
            `/referentiels/pays/detecter?lat=${coords.latitude}&lng=${coords.longitude}`
          );
          resolve(pays);
        } catch {
          resolve(null);
        }
      },
      () => resolve(null), // permission refusée / timeout
      { timeout: 5000 }
    );
  });
  return detectionEnCours;
}
