// src/components/maps/GoogleMapView.jsx
//
// Carte Google Maps en lecture seule pour les fiches annuaire
// (FichePharmacie.jsx, FicheStructureSante.jsx, FicheAssurance.jsx),
// remplaçant l'ancienne <iframe src="google.com/maps?...&output=embed">
// (URL non documentée, sans contrôle réel) par la véritable Maps
// JavaScript API.
//
// Ajoute le calcul d'itinéraire réel (Directions API, via le backend —
// voir googleMapsService.calculerItineraire) : distance et durée
// affichées directement sur la fiche, sans quitter la plateforme. Le
// lien "Ouvrir dans Google Maps" reste proposé à côté pour la
// navigation turn-by-turn proprement dite (l'appli Google Maps native
// fait ça mieux qu'un widget web).

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, Marker, DirectionsRenderer } from "@react-google-maps/api";
import { useGoogleMapsLoader } from "../../lib/googleMapsLoader";
import { useGeolocation } from "../../hooks/useGeolocation";
import { calculerItineraire } from "../../services/googleMapsService";

const HAUTEUR_CARTE = "320px";
const ZOOM_PAR_DEFAUT = 15;
const OPTIONS_CARTE = { streetViewControl: false, mapTypeControl: false };

/**
 * @param {object} props
 * @param {number} props.latitude
 * @param {number} props.longitude
 * @param {string} props.nom nom de la fiche, pour le titre du marqueur
 */
export default function GoogleMapView({ latitude, longitude, nom }) {
  const { isLoaded, loadError } = useGoogleMapsLoader();
  const { position: positionUtilisateur, loading: chargementPosition, error: erreurPosition, demanderPosition } =
    useGeolocation();

  const [itineraire, setItineraire] = useState(null); // { distanceTexte, dureeTexte, trajetGoogle }
  const [calculEnCours, setCalculEnCours] = useState(false);
  const [erreurItineraire, setErreurItineraire] = useState("");
  const [directionsService, setDirectionsService] = useState(null);
  // `demanderPosition` (useGeolocation) est asynchrone côté navigateur :
  // quand la position n'est pas encore connue, obtenirItineraire() la
  // demande puis pose ce drapeau pour reprendre le calcul dès qu'elle
  // arrive (voir l'effet ci-dessous), plutôt que de forcer l'utilisateur
  // à recliquer une seconde fois sur le bouton.
  const calculEnAttentePositionRef = useRef(false);

  const onLoadCarte = useCallback(() => {
    // DirectionsService fait partie de la lib "core", toujours
    // disponible dès que window.google.maps existe (isLoaded true) —
    // pas besoin de charger la lib "places" pour ce composant.
    if (window.google?.maps) {
      setDirectionsService(new window.google.maps.DirectionsService());
    }
  }, []);

  const lancerCalcul = useCallback(async (position) => {
    setCalculEnCours(true);
    try {
      // 1) Résumé distance/durée via le backend (clé Directions non
      //    exposée au client — voir server/src/lib/googleMaps.js).
      const resume = await calculerItineraire({
        origineLat: position.latitude,
        origineLng: position.longitude,
        destinationLat: latitude,
        destinationLng: longitude,
      });

      // 2) Tracé affiché sur la carte : DirectionsRenderer a besoin
      //    d'un objet DirectionsResult natif Google (pas juste
      //    distance/durée) — on le redemande directement au navigateur
      //    via DirectionsService (clé Maps JavaScript API, publique,
      //    déjà chargée pour l'affichage de la carte elle-même).
      let trajetGoogle = null;
      if (directionsService) {
        trajetGoogle = await new Promise((resolve) => {
          directionsService.route(
            {
              origin: { lat: position.latitude, lng: position.longitude },
              destination: { lat: latitude, lng: longitude },
              travelMode: window.google.maps.TravelMode.DRIVING,
            },
            (resultat, statut) => resolve(statut === "OK" ? resultat : null)
          );
        });
      }

      setItineraire({ distanceTexte: resume.distanceTexte, dureeTexte: resume.dureeTexte, trajetGoogle });
    } catch {
      setErreurItineraire("Impossible de calculer l'itinéraire pour le moment.");
    } finally {
      setCalculEnCours(false);
    }
  }, [directionsService, latitude, longitude]);

  // Reprend automatiquement le calcul dès que la position navigateur,
  // demandée par obtenirItineraire() ci-dessous, devient disponible.
  useEffect(() => {
    if (positionUtilisateur && calculEnAttentePositionRef.current) {
      calculEnAttentePositionRef.current = false;
      lancerCalcul(positionUtilisateur);
    }
  }, [positionUtilisateur, lancerCalcul]);

  function obtenirItineraire() {
    setErreurItineraire("");
    if (!positionUtilisateur) {
      calculEnAttentePositionRef.current = true;
      demanderPosition();
      return;
    }
    lancerCalcul(positionUtilisateur);
  }

  const lienGoogleMapsDirection = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  if (loadError) {
    return (
      <div className="gmap-empty">
        <i className="fa-solid fa-map-location-dot" />
        <span>La carte n'a pas pu être chargée.</span>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="d-flex align-items-center justify-content-center border rounded" style={{ height: HAUTEUR_CARTE }}>
        <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
        Chargement de la carte…
      </div>
    );
  }

  return (
    <div>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: HAUTEUR_CARTE, borderRadius: "8px" }}
        center={{ lat: latitude, lng: longitude }}
        zoom={ZOOM_PAR_DEFAUT}
        options={OPTIONS_CARTE}
        onLoad={onLoadCarte}
      >
        {itineraire?.trajetGoogle ? (
          <DirectionsRenderer directions={itineraire.trajetGoogle} options={{ suppressMarkers: false }} />
        ) : (
          <Marker position={{ lat: latitude, lng: longitude }} title={nom} />
        )}
      </GoogleMap>

      <div className="d-flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          className="btn btn-outline-primary btn-sm-aps"
          onClick={obtenirItineraire}
          disabled={calculEnCours || chargementPosition}
        >
          <i className="fa-solid fa-route" />{" "}
          {calculEnCours || chargementPosition ? "Calcul en cours…" : "Calculer l'itinéraire depuis ma position"}
        </button>
        <a
          href={lienGoogleMapsDirection}
          target="_blank"
          rel="noreferrer"
          className="btn btn-outline-secondary btn-sm-aps"
        >
          <i className="fa-solid fa-diamond-turn-right" /> Ouvrir dans Google Maps
        </a>
      </div>

      {itineraire && (
        <p className="minimal-note mt-2 mb-0">
          <i className="fa-solid fa-circle-info" /> Environ {itineraire.distanceTexte} ({itineraire.dureeTexte} en
          voiture) depuis votre position actuelle.
        </p>
      )}
      {(erreurItineraire || erreurPosition) && (
        <p className="text-danger small mt-2 mb-0">{erreurItineraire || erreurPosition}</p>
      )}
    </div>
  );
}