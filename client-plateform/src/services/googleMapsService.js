// src/services/googleMapsService.js
//
// Consomme les routes publiques /api/google-maps/* (voir
// server/src/routes/googleMaps.routes.js). Ces endpoints passent par
// le backend (clé Geocoding/Directions non exposée au navigateur) —
// voir server/src/lib/googleMaps.js pour le détail.
//
// La clé VITE_GOOGLE_MAPS_API_KEY (Maps JavaScript API, restreinte par
// HTTP referrer) est, elle, utilisée directement côté client par
// components/maps/googleMapsLoader.js — elle ne sert qu'à afficher la
// carte, jamais à appeler Geocoding/Directions depuis le navigateur.

import { apiFetch } from "../lib/apiClient";

/**
 * GET /google-maps/geocodage?adresse=...
 * @param {string} adresse
 * @param {string} [region] code pays ISO 3166-1 alpha-2 en minuscules (ex. "cm")
 * @returns {Promise<{ latitude, longitude, adresseFormatee, placeId, typeResultat, partiel }>}
 */
export function geocoderAdresse(adresse, region) {
  const params = new URLSearchParams({ adresse });
  if (region) params.set("region", region);
  return apiFetch(`/google-maps/geocodage?${params.toString()}`);
}

/**
 * GET /google-maps/geocodage-inverse?lat=...&lng=...
 * @returns {Promise<{ adresseFormatee, placeId }>}
 */
export function geocoderInverse(latitude, longitude) {
  const params = new URLSearchParams({ lat: latitude, lng: longitude });
  return apiFetch(`/google-maps/geocodage-inverse?${params.toString()}`);
}

/**
 * GET /google-maps/itineraire?origine_lat=&origine_lng=&destination_lat=&destination_lng=&mode=
 * @returns {Promise<{ distanceMetres, distanceTexte, dureeSecondes, dureeTexte, polylineEncodee, etapes }>}
 */
export function calculerItineraire({ origineLat, origineLng, destinationLat, destinationLng, mode = "driving" }) {
  const params = new URLSearchParams({
    origine_lat: origineLat,
    origine_lng: origineLng,
    destination_lat: destinationLat,
    destination_lng: destinationLng,
    mode,
  });
  return apiFetch(`/google-maps/itineraire?${params.toString()}`);
}