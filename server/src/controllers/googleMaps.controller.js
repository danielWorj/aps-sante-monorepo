// src/controllers/googleMaps.controller.js
//
// Expose lib/googleMaps.js (Geocoding API, Directions API) au reste de
// la plateforme (formulaires de création/édition, fiches annuaire).
//
// Ces endpoints sont volontairement PUBLICS (au même titre que
// /referentiels/pays/detecter) : la recherche d'adresse et le calcul
// d'itinéraire sont utiles à un visiteur non connecté consultant une
// fiche pharmacie/centre de santé/assurance. Le rate-limiting
// (googleMaps.routes.js) est la protection principale contre l'abus,
// chaque appel étant facturé par Google.

import { geocoderAdresse, reverseGeocoder, calculerItineraire } from "../lib/googleMaps.js";

/**
 * GET /api/google-maps/geocodage?adresse=...&region=cm
 * Convertit une adresse texte en coordonnées. Utilisé par les
 * formulaires de création (recherche d'adresse sur la carte) : le
 * frontend positionne ensuite un marqueur déplaçable sur le point
 * renvoyé, l'utilisateur affine si besoin, et ce sont les
 * latitude/longitude finales (pas cette réponse brute) qui sont
 * envoyées à la création de la fiche.
 */
export async function geocoder(req, res, next) {
  try {
    const { adresse, region } = req.query;

    if (!adresse || !String(adresse).trim()) {
      return res.status(400).json({ message: "Paramètre 'adresse' requis." });
    }

    const resultat = await geocoderAdresse(String(adresse), {
      region: region ? String(region) : undefined,
    });

    if (!resultat) {
      return res.status(404).json({ message: "Aucune adresse correspondante trouvée." });
    }

    return res.status(200).json(resultat);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/google-maps/geocodage-inverse?lat=...&lng=...
 * Convertit des coordonnées en adresse lisible. Utilisé sur les
 * fiches annuaire pour afficher une adresse humaine à partir du point
 * PostGIS déjà enregistré (lib/geo.js), sans dupliquer cette adresse
 * en base.
 */
export async function geocoderInverse(req, res, next) {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ message: "Paramètres 'lat'/'lng' invalides." });
    }

    const resultat = await reverseGeocoder(lat, lng);
    if (!resultat) {
      return res.status(404).json({ message: "Aucune adresse trouvée à ces coordonnées." });
    }

    return res.status(200).json(resultat);
  } catch (err) {
    next(err);
  }
}

const MODES_DEPLACEMENT_VALIDES = new Set(["driving", "walking", "bicycling", "transit"]);

/**
 * GET /api/google-maps/itineraire
 *   ?origine_lat=&origine_lng=&destination_lat=&destination_lng=&mode=driving
 * Calcule distance/durée/étapes réels entre la position du visiteur
 * (origine, généralement obtenue via useGeolocation côté front) et une
 * fiche annuaire (destination). Le lien "Ouvrir dans Google Maps"
 * (navigation turn-by-turn) reste construit côté client : cet
 * endpoint sert à AFFICHER un résumé (distance_km / durée) avant de
 * quitter la plateforme, pas à remplacer l'appli Google Maps native.
 */
export async function itineraire(req, res, next) {
  try {
    const origineLat = Number(req.query.origine_lat);
    const origineLng = Number(req.query.origine_lng);
    const destinationLat = Number(req.query.destination_lat);
    const destinationLng = Number(req.query.destination_lng);
    const mode = req.query.mode ? String(req.query.mode) : "driving";

    for (const [nom, valeur] of Object.entries({ origineLat, origineLng, destinationLat, destinationLng })) {
      if (Number.isNaN(valeur)) {
        return res.status(400).json({ message: `Paramètre '${nom}' invalide.` });
      }
    }
    if (!MODES_DEPLACEMENT_VALIDES.has(mode)) {
      return res.status(400).json({
        message: `Paramètre 'mode' invalide. Valeurs acceptées : ${[...MODES_DEPLACEMENT_VALIDES].join(", ")}.`,
      });
    }

    const resultat = await calculerItineraire({ origineLat, origineLng, destinationLat, destinationLng, mode });
    if (!resultat) {
      return res.status(404).json({ message: "Aucun itinéraire trouvé entre ces deux points." });
    }

    return res.status(200).json(resultat);
  } catch (err) {
    next(err);
  }
}