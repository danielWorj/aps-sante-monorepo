// src/components/maps/GoogleMapView.jsx
//
// Carte Google Maps en lecture seule pour les fiches annuaire
// (FichePharmacie.jsx, FicheStructureSante.jsx, FicheAssurance.jsx),
// remplaçant l'ancienne <iframe src="google.com/maps?...&output=embed">
// (URL non documentée, sans contrôle réel) par la véritable Maps
// JavaScript API.
//
// Ajoute le calcul d'itinéraire réel (Routes API, via le backend —
// voir googleMapsService.calculerItineraire) : distance, durée et tracé
// (polyline renvoyée par le serveur) affichés directement sur la fiche,
// sans quitter la plateforme. Plus de DirectionsService côté navigateur
// (déprécié, et dépendant de l'ancienne Directions API). Le
// lien "Ouvrir dans Google Maps" reste proposé à côté pour la
// navigation turn-by-turn proprement dite (l'appli Google Maps native
// fait ça mieux qu'un widget web).

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import { useGoogleMapsLoader } from "../../lib/googleMapsLoader";
import { decoderPolyline } from "../../lib/polyline";
import { useGeolocation } from "../../hooks/useGeolocation";
import { calculerItineraire } from "../../services/googleMapsService";
import CarteIndisponible from "./CarteIndisponible";

const HAUTEUR_CARTE = "320px";
const ZOOM_PAR_DEFAUT = 15;
const OPTIONS_CARTE = { streetViewControl: false, mapTypeControl: false };
const OPTIONS_TRACE = { strokeColor: "#16996C", strokeOpacity: 0.9, strokeWeight: 5 };

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

  const [itineraire, setItineraire] = useState(null); // { distanceTexte, dureeTexte, trace, origine }
  const [calculEnCours, setCalculEnCours] = useState(false);
  const [erreurItineraire, setErreurItineraire] = useState("");
  const carteRef = useRef(null);
  // `demanderPosition` (useGeolocation) est asynchrone côté navigateur :
  // quand la position n'est pas encore connue, obtenirItineraire() la
  // demande puis pose ce drapeau pour reprendre le calcul dès qu'elle
  // arrive (voir l'effet ci-dessous), plutôt que de forcer l'utilisateur
  // à recliquer une seconde fois sur le bouton.
  const calculEnAttentePositionRef = useRef(false);

  const onLoadCarte = useCallback((carte) => {
    carteRef.current = carte;
  }, []);

  const lancerCalcul = useCallback(async (position) => {
    setCalculEnCours(true);
    try {
      const resume = await calculerItineraire({
        origineLat: position.latitude,
        origineLng: position.longitude,
        destinationLat: latitude,
        destinationLng: longitude,
      });
      const trace = decoderPolyline(resume.polylineEncodee);
      setItineraire({
        distanceTexte: resume.distanceTexte,
        dureeTexte: resume.dureeTexte,
        trace,
        origine: { lat: position.latitude, lng: position.longitude },
      });

      // Cadre la carte sur le trajet complet.
      const carte = carteRef.current;
      if (carte && trace.length > 1 && window.google?.maps) {
        const limites = new window.google.maps.LatLngBounds();
        trace.forEach((p) => limites.extend(p));
        carte.fitBounds(limites, 40);
      }
    } catch (err) {
      setErreurItineraire(
        err?.status === 404
          ? "Aucun itinéraire routier trouvé depuis votre position."
          : "Impossible de calculer l'itinéraire pour le moment. Utilisez « Ouvrir dans Google Maps »."
      );
    } finally {
      setCalculEnCours(false);
    }
  }, [latitude, longitude]);

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

  // Clé absente / refusée : intégration publique (le lieu reste visible)
  // et lien Google Maps pour l'itinéraire.
  if (loadError) {
    return (
      <div>
        <CarteIndisponible latitude={latitude} longitude={longitude} nom={nom} hauteur={HAUTEUR_CARTE} />
        <div className="d-flex flex-wrap gap-2 mt-3">
          <a href={lienGoogleMapsDirection} target="_blank" rel="noreferrer" className="btn btn-outline-primary btn-sm-aps">
            <i className="fa-solid fa-diamond-turn-right" /> Itinéraire dans Google Maps
          </a>
        </div>
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
        <Marker position={{ lat: latitude, lng: longitude }} title={nom} />
        {itineraire?.trace?.length > 1 && (
          <>
            <Polyline path={itineraire.trace} options={OPTIONS_TRACE} />
            <Marker position={itineraire.origine} title="Votre position" label={{ text: "A", color: "#fff" }} />
          </>
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