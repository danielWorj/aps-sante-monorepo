// src/hooks/useGeolocation.js
//
// Hook partagé pour la géolocalisation navigateur (API native
// `navigator.geolocation`, aucune librairie carto nécessaire).
//
// Utilisé par :
//  - les formulaires de création (creationPharmacie.jsx,
//    creationAssurance.jsx, creationCentreSante.jsx) pour pré-remplir
//    les champs `latitude`/`longitude` de l'étape "Localisation" ;
//  - les pages annuaires (Pharmacie.jsx, Assurance.jsx,
//    StructureSante.jsx) pour construire le filtre `lat`/`lng`/
//    `rayon_km` envoyé aux services (pharmacieService.js,
//    assuranceService.js, structureSanteService.js) qui l'ajoutent à
//    la query string via `versQueryString(filtres)`.
//
// Un seul hook pour toute l'app : ne pas dupliquer cette logique dans
// chaque composant, ni ailleurs.
//
// Ce hook ne fait AUCUN appel réseau lui-même : il expose uniquement
// la position brute renvoyée par le navigateur (ou l'état d'erreur
// correspondant). C'est à l'appelant de s'en servir pour appeler les
// endpoints backend (`?lat=&lng=&rayon_km=`) ou remplir un formulaire.

import { useCallback, useRef, useState } from 'react';

// Options par défaut passées à getCurrentPosition. Le back accepte des
// coordonnées à quelques décimales près (colonne geography(Point,4326)),
// on n'a donc pas besoin de la précision maximale (enableHighAccuracy)
// pour les cas d'usage annuaire/formulaire — elle est laissée
// désactivée par défaut pour ne pas pénaliser la vitesse de réponse ni
// la batterie sur mobile, mais reste surchargeable au besoin.
const OPTIONS_PAR_DEFAUT = {
  enableHighAccuracy: false,
  timeout: 10000,
  maximumAge: 60000, // réutilise une position récente (1 min) si dispo
};

/**
 * @param {Object} [options] Options `getCurrentPosition` (fusionnées avec
 *   OPTIONS_PAR_DEFAUT — voir doc MDN : enableHighAccuracy, timeout,
 *   maximumAge).
 *
 * @returns {{
 *   position: { latitude: number, longitude: number, precision: number } | null,
 *   loading: boolean,
 *   error: string | null,
 *   permissionDenied: boolean,
 *   demanderPosition: () => void,
 * }}
 */
export function useGeolocation(options) {
  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Évite de déclencher plusieurs demandes en parallèle si
  // `demanderPosition` est appelée plusieurs fois avant la réponse
  // (ex. double-clic sur le bouton "Me localiser").
  const enCoursRef = useRef(false);

  const demanderPosition = useCallback(() => {
    if (enCoursRef.current) return;

    // Navigateur sans support de l'API (très rare, mais on gère le cas
    // proprement plutôt que de laisser planter l'appel).
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError("La géolocalisation n'est pas supportée par ce navigateur.");
      setPermissionDenied(false);
      setLoading(false);
      return;
    }

    enCoursRef.current = true;
    setLoading(true);
    setError(null);
    setPermissionDenied(false);

    navigator.geolocation.getCurrentPosition(
      (resultat) => {
        enCoursRef.current = false;
        setLoading(false);
        setPosition({
          latitude: resultat.coords.latitude,
          longitude: resultat.coords.longitude,
          precision: resultat.coords.accuracy,
        });
      },
      (erreur) => {
        enCoursRef.current = false;
        setLoading(false);

        // Codes standards GeolocationPositionError :
        //  1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        if (erreur.code === 1) {
          setPermissionDenied(true);
          setError(
            "Vous avez refusé l'accès à votre position. Vous pouvez saisir vos coordonnées manuellement, ou autoriser la géolocalisation dans les réglages de votre navigateur."
          );
        } else if (erreur.code === 2) {
          setError("Impossible de déterminer votre position actuelle.");
        } else if (erreur.code === 3) {
          setError('La demande de localisation a expiré. Réessayez.');
        } else {
          setError("Une erreur est survenue lors de la géolocalisation.");
        }
      },
      { ...OPTIONS_PAR_DEFAUT, ...options }
    );
  }, [options]);

  return { position, loading, error, permissionDenied, demanderPosition };
}

export default useGeolocation;