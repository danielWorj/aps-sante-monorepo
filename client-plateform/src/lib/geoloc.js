import { apiFetch } from "./apiClient";

/**
 * Demande la position GPS du navigateur puis interroge le serveur
 * pour en déduire le pays APS correspondant.
 * Retourne l'objet `pays` (Prisma) ou `null` si indisponible/refusé —
 * l'appelant doit alors basculer sur une sélection manuelle.
 */
export function detecterPaysUtilisateur() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);

    navigator.geolocation.getCurrentPosition(
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
}