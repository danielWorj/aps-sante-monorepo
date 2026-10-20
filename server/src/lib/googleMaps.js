// src/lib/googleMaps.js
//
// Point d'accès UNIQUE aux API Google Maps côté serveur : Geocoding API
// et Routes API (itinéraires). Utilise GOOGLE_MAPS_API_KEY (variable serveur,
// jamais envoyée au client — voir client-plateform pour la clé
// publique séparée VITE_GOOGLE_MAPS_API_KEY, restreinte par referrer
// HTTP, dédiée à Maps JavaScript API).
//
// Pourquoi passer par le backend plutôt que d'appeler Google
// directement depuis le navigateur pour le géocodage :
//   - la clé Geocoding/Routes n'a pas vocation à être publique
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
// Routes API (remplace l'ancienne Directions API, « legacy » et non
// activable sur les nouveaux projets Google Cloud).
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

const DELAI_TIMEOUT_MS = 8000;

/**
 * Erreur côté fournisseur Google (clé absente, API non activée sur le
 * projet, quota dépassé, panne réseau…). Le contrôleur la traduit en
 * 503 avec un message lisible ; `detail` (message brut de Google) part
 * uniquement dans les logs serveur.
 */
export class GoogleMapsError extends Error {
  constructor(message, detail = "") {
    super(message);
    this.name = "GoogleMapsError";
    this.status = 503;
    this.detail = detail;
  }
}

function cleApi() {
  const cle = process.env.GOOGLE_MAPS_API_KEY;
  if (!cle) {
    throw new GoogleMapsError(
      "Service de cartographie non configuré.",
      "GOOGLE_MAPS_API_KEY manquante dans l'environnement serveur."
    );
  }
  return cle;
}

/** fetch avec timeout ; toute panne réseau devient une GoogleMapsError. */
async function fetchGoogle(url, options = {}) {
  const controleur = new AbortController();
  const timeoutId = setTimeout(() => controleur.abort(), DELAI_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controleur.signal });
  } catch (err) {
    throw new GoogleMapsError(
      "Service de cartographie momentanément injoignable.",
      err.name === "AbortError" ? "délai dépassé en contactant Google Maps" : err.message
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Appelle une URL Google Maps « classique » (Geocoding) et lève une
 * GoogleMapsError en cas de statut HTTP ou de statut métier Google non-OK
 * (Google renvoie toujours 200 même en cas d'erreur, avec un champ
 * `status` dans le corps : "OVER_QUERY_LIMIT", "REQUEST_DENIED" — API non
 * activée sur le projet ou clé restreinte —, "INVALID_REQUEST"...).
 */
async function appelerGoogle(url) {
  const reponse = await fetchGoogle(url);
  if (!reponse.ok) {
    throw new GoogleMapsError("Service de cartographie indisponible.", `HTTP ${reponse.status}`);
  }

  const donnees = await reponse.json();

  // ZERO_RESULTS n'est pas une erreur technique : c'est un résultat
  // vide légitime, laissé à l'appelant (geocoderAdresse /
  // reverseGeocoder renvoient alors `null`, pas une exception).
  if (donnees.status !== "OK" && donnees.status !== "ZERO_RESULTS") {
    throw new GoogleMapsError(
      "Service de cartographie indisponible.",
      `statut "${donnees.status}"${donnees.error_message ? ` (${donnees.error_message})` : ""}`
    );
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
 * Routes API (itinéraires)
 * =================================================================== */

// Modes historiques (Directions API) conservés dans le contrat de l'endpoint.
const MODES_ROUTES = { driving: "DRIVE", walking: "WALK", bicycling: "BICYCLE", transit: "TRANSIT" };
const MODES_DEPLACEMENT_VALIDES = new Set(Object.keys(MODES_ROUTES));

const CHAMPS_ROUTES = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.polyline.encodedPolyline",
  "routes.localizedValues",
  "routes.legs.steps.navigationInstruction",
  "routes.legs.steps.localizedValues",
].join(",");

/**
 * Calcule un itinéraire entre deux points via Routes API (computeRoutes).
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
 * } | null>} `null` si aucun itinéraire trouvé.
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

  const point = (latitude, longitude) => ({ location: { latLng: { latitude, longitude } } });
  const reponse = await fetchGoogle(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": cleApi(),
      "X-Goog-FieldMask": CHAMPS_ROUTES,
    },
    body: JSON.stringify({
      origin: point(origineLat, origineLng),
      destination: point(destinationLat, destinationLng),
      travelMode: MODES_ROUTES[mode],
      languageCode: "fr",
      units: "METRIC",
    }),
  });

  const donnees = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    throw new GoogleMapsError(
      "Calcul d'itinéraire indisponible.",
      `Routes API HTTP ${reponse.status}${donnees?.error?.message ? ` (${donnees.error.message})` : ""}`
    );
  }

  // Aucun itinéraire possible : Routes API renvoie un objet vide.
  const route = donnees.routes?.[0];
  if (!route) return null;

  const etapes = (route.legs?.[0]?.steps || []).map((etape) => ({
    instruction: etape.navigationInstruction?.instructions ?? "",
    distanceTexte: etape.localizedValues?.distance?.text ?? null,
    dureeTexte: etape.localizedValues?.staticDuration?.text ?? null,
  }));

  return {
    distanceMetres: route.distanceMeters ?? null,
    distanceTexte: route.localizedValues?.distance?.text ?? null,
    // Routes API exprime les durées en chaîne "1234s".
    dureeSecondes: route.duration ? Number.parseInt(route.duration, 10) : null,
    dureeTexte: route.localizedValues?.duration?.text ?? null,
    polylineEncodee: route.polyline?.encodedPolyline ?? null,
    etapes,
  };
}
