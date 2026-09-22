// src/lib/googleMaps.js
//
// Point d'accès UNIQUE aux API Google Maps côté serveur : Geocoding API
// et Directions API. Utilise GOOGLE_MAPS_API_KEY (variable serveur,
// jamais envoyée au client — voir client-plateform pour la clé
// publique séparée VITE_GOOGLE_MAPS_API_KEY, restreinte par referrer
// HTTP, dédiée à Maps JavaScript API).
//
// Pourquoi passer par le backend plutôt que d'appeler Google
// directement depuis le navigateur pour le géocodage :
//   - la clé Geocoding/Directions n'a pas vocation à être publique
//     (contrairement à la clé Maps JavaScript, dont la restriction
//     HTTP referrer suffit) ;
//   - permet de logger/limiter la consommation (facturée par Google)
//     avant qu'un usage abusif ne fasse exploser la facture ;
//   - un seul endroit à modifier si Google change son contrat d'API.
//
// Ce module ne fait aucune validation métier (adresse vide, pays
// autorisé, etc.) : c'est au contrôleur appelant de le faire, comme
// pour lib/geo.js (PostGIS) déjà en place dans ce dépôt.

const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";

const DELAI_TIMEOUT_MS = 8000;

function cleApi() {
  const cle = process.env.GOOGLE_MAPS_API_KEY;
  if (!cle) {
    throw new Error(
      "googleMaps.js : GOOGLE_MAPS_API_KEY manquante dans l'environnement serveur."
    );
  }
  return cle;
}

/**
 * Appelle une URL Google Maps avec un timeout, et lève une erreur
 * explicite en cas de statut HTTP ou de statut métier Google non-OK
 * (Google renvoie toujours 200 même en cas d'erreur, avec un champ
 * `status` dans le corps : "ZERO_RESULTS", "OVER_QUERY_LIMIT",
 * "REQUEST_DENIED", "INVALID_REQUEST"...).
 */
async function appelerGoogle(url) {
  const controleur = new AbortController();
  const timeoutId = setTimeout(() => controleur.abort(), DELAI_TIMEOUT_MS);

  let reponse;
  try {
    reponse = await fetch(url, { signal: controleur.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("googleMaps.js : délai dépassé en contactant Google Maps.");
    }
    throw new Error(`googleMaps.js : échec réseau vers Google Maps (${err.message}).`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!reponse.ok) {
    throw new Error(`googleMaps.js : Google Maps a répondu HTTP ${reponse.status}.`);
  }

  const donnees = await reponse.json();

  // ZERO_RESULTS n'est pas une erreur technique : c'est un résultat
  // vide légitime, laissé à l'appelant (geocoderAdresse /
  // reverseGeocoder renvoient alors `null`, pas une exception).
  if (donnees.status !== "OK" && donnees.status !== "ZERO_RESULTS") {
    const detail = donnees.error_message ? ` (${donnees.error_message})` : "";
    throw new Error(`googleMaps.js : statut Google Maps "${donnees.status}"${detail}.`);
  }

  return donnees;
}

/* ===================================================================
 * Geocoding API
 * =================================================================== */

/**
 * Convertit une adresse en coordonnées.
 * @param {string} adresse texte libre ("12 Rue de la Joie, Douala, Cameroun")
 * @param {object} [options]
 * @param {string} [options.region] biais régional ISO 3166-1 alpha-2 en
 *   minuscules (ex. "cm" pour Cameroun) — améliore la pertinence sans
 *   l'imposer strictement (contrairement à un filtre pays strict).
 * @returns {Promise<{
 *   latitude: number,
 *   longitude: number,
 *   adresseFormatee: string,
 *   placeId: string,
 *   typeResultat: string[],
 *   partiel: boolean
 * } | null>} `null` si aucune correspondance (ZERO_RESULTS).
 */
export async function geocoderAdresse(adresse, options = {}) {
  if (typeof adresse !== "string" || !adresse.trim()) {
    throw new Error("geocoderAdresse : adresse manquante ou vide.");
  }

  const params = new URLSearchParams({
    address: adresse.trim(),
    key: cleApi(),
  });
  if (options.region) params.set("region", options.region);

  const donnees = await appelerGoogle(`${GEOCODING_URL}?${params.toString()}`);
  if (donnees.status === "ZERO_RESULTS" || !donnees.results?.length) return null;

  const resultat = donnees.results[0];
  return {
    latitude: resultat.geometry.location.lat,
    longitude: resultat.geometry.location.lng,
    adresseFormatee: resultat.formatted_address,
    placeId: resultat.place_id,
    typeResultat: resultat.types || [],
    partiel: Boolean(resultat.partial_match),
  };
}

/**
 * Convertit des coordonnées en adresse lisible (géocodage inverse).
 * Utile pour afficher une adresse humaine à partir d'un point
 * enregistré via le module PostGIS existant (lib/geo.js), sans avoir
 * à stocker cette adresse en base.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<{ adresseFormatee: string, placeId: string } | null>}
 */
export async function reverseGeocoder(latitude, longitude) {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    throw new Error("reverseGeocoder : latitude/longitude doivent être des nombres.");
  }

  const params = new URLSearchParams({
    latlng: `${latitude},${longitude}`,
    key: cleApi(),
  });

  const donnees = await appelerGoogle(`${GEOCODING_URL}?${params.toString()}`);
  if (donnees.status === "ZERO_RESULTS" || !donnees.results?.length) return null;

  const resultat = donnees.results[0];
  return {
    adresseFormatee: resultat.formatted_address,
    placeId: resultat.place_id,
  };
}

/* ===================================================================
 * Directions API
 * =================================================================== */

const MODES_DEPLACEMENT_VALIDES = new Set(["driving", "walking", "bicycling", "transit"]);

/**
 * Calcule un itinéraire entre deux points via Directions API.
 * @param {object} params
 * @param {number} params.origineLat
 * @param {number} params.origineLng
 * @param {number} params.destinationLat
 * @param {number} params.destinationLng
 * @param {string} [params.mode] "driving" (défaut) | "walking" | "bicycling" | "transit"
 * @returns {Promise<{
 *   distanceMetres: number,
 *   distanceTexte: string,
 *   dureeSecondes: number,
 *   dureeTexte: string,
 *   polylineEncodee: string,
 *   etapes: Array<{ instruction: string, distanceTexte: string, dureeTexte: string }>
 * } | null>} `null` si aucun itinéraire trouvé (ZERO_RESULTS).
 */
export async function calculerItineraire({
  origineLat,
  origineLng,
  destinationLat,
  destinationLng,
  mode = "driving",
}) {
  for (const [nom, valeur] of Object.entries({ origineLat, origineLng, destinationLat, destinationLng })) {
    if (typeof valeur !== "number" || Number.isNaN(valeur)) {
      throw new Error(`calculerItineraire : ${nom} doit être un nombre.`);
    }
  }
  if (!MODES_DEPLACEMENT_VALIDES.has(mode)) {
    throw new Error(
      `calculerItineraire : mode "${mode}" invalide (attendu : ${[...MODES_DEPLACEMENT_VALIDES].join(", ")}).`
    );
  }

  const params = new URLSearchParams({
    origin: `${origineLat},${origineLng}`,
    destination: `${destinationLat},${destinationLng}`,
    mode,
    key: cleApi(),
  });

  const donnees = await appelerGoogle(`${DIRECTIONS_URL}?${params.toString()}`);
  if (donnees.status === "ZERO_RESULTS" || !donnees.routes?.length) return null;

  const route = donnees.routes[0];
  const jambe = route.legs?.[0];
  if (!jambe) return null;

  return {
    distanceMetres: jambe.distance?.value ?? null,
    distanceTexte: jambe.distance?.text ?? null,
    dureeSecondes: jambe.duration?.value ?? null,
    dureeTexte: jambe.duration?.text ?? null,
    polylineEncodee: route.overview_polyline?.points ?? null,
    etapes: (jambe.steps || []).map((etape) => ({
      // html_instructions contient des balises <b>/<div> Google : on
      // les retire pour renvoyer du texte brut exploitable tel quel
      // par n'importe quel client (web ou mobile).
      instruction: (etape.html_instructions || "").replace(/<[^>]+>/g, ""),
      distanceTexte: etape.distance?.text ?? null,
      dureeTexte: etape.duration?.text ?? null,
    })),
  };
}