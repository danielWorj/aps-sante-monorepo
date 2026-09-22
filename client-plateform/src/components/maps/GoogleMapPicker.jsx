// src/components/maps/GoogleMapPicker.jsx
//
// Composant partagé pour positionner une fiche (pharmacie, centre de
// santé, assurance/agence) sur une carte Google Maps interactive.
// Remplace la saisie manuelle de latitude/longitude dans les
// formulaires de création (voir creationPharmacie.jsx,
// creationCentreSante.jsx, creationAssurance.jsx).
//
// Contrat : composant CONTRÔLÉ. `latitude`/`longitude` (nombres ou
// null) et `onPositionChange(latitude, longitude)` sont fournis par le
// formulaire parent, qui reste seul propriétaire de son state
// (formData.latitude / formData.longitude) — ce composant ne fait que
// le piloter. Trois façons de positionner le marqueur :
//   1. recherche d'une adresse texte (géocodée via le backend —
//      /api/google-maps/geocodage, voir googleMapsService.js) ;
//   2. clic direct sur la carte ;
//   3. glisser-déposer du marqueur.
// Dans tous les cas c'est la même callback `onPositionChange` qui est
// invoquée : au formulaire de décider s'il affiche encore des champs
// latitude/longitude en lecture seule à côté (recommandé, pour la
// transparence) ou plus du tout.

import { useCallback, useRef, useState } from "react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMapsLoader } from "../../lib/googleMapsLoader";
import { geocoderAdresse } from "../../services/googleMapsService";

const HAUTEUR_PAR_DEFAUT = "320px";

// Centre par défaut si aucune position n'est encore connue (Douala,
// Cameroun — pays d'origine de la plateforme) : évite d'ouvrir la
// carte sur (0,0), au milieu de l'océan Atlantique, avant toute saisie.
const CENTRE_PAR_DEFAUT = { lat: 4.0511, lng: 9.7679 };
const ZOOM_PAR_DEFAUT = 12;
const ZOOM_POSITION_CONNUE = 16;

const OPTIONS_CARTE = {
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
};

/**
 * @param {object} props
 * @param {number|null} props.latitude
 * @param {number|null} props.longitude
 * @param {(latitude: number, longitude: number) => void} props.onPositionChange
 * @param {string} [props.region] biais régional pour le géocodage (ex. "cm")
 * @param {string} [props.hauteur]
 */
export default function GoogleMapPicker({ latitude, longitude, onPositionChange, region, hauteur }) {
  const { isLoaded, loadError } = useGoogleMapsLoader();
  const mapRef = useRef(null);

  const [texteRecherche, setTexteRecherche] = useState("");
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [erreurRecherche, setErreurRecherche] = useState("");

  const positionConnue = typeof latitude === "number" && typeof longitude === "number";
  const centre = positionConnue ? { lat: latitude, lng: longitude } : CENTRE_PAR_DEFAUT;

  const onLoadCarte = useCallback((map) => {
    mapRef.current = map;
  }, []);

  function recentrer(lat, lng) {
    if (mapRef.current) {
      mapRef.current.panTo({ lat, lng });
      mapRef.current.setZoom(ZOOM_POSITION_CONNUE);
    }
  }

  function gererClicCarte(evenement) {
    const lat = evenement.latLng.lat();
    const lng = evenement.latLng.lng();
    onPositionChange(lat, lng);
  }

  function gererFinGlisser(evenement) {
    const lat = evenement.latLng.lat();
    const lng = evenement.latLng.lng();
    onPositionChange(lat, lng);
  }

  async function gererRecherche(e) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (!texteRecherche.trim() || rechercheEnCours) return;

    setRechercheEnCours(true);
    setErreurRecherche("");
    try {
      const resultat = await geocoderAdresse(texteRecherche.trim(), region);
      onPositionChange(resultat.latitude, resultat.longitude);
      recentrer(resultat.latitude, resultat.longitude);
    } catch (err) {
      setErreurRecherche(
        err.status === 404
          ? "Aucune adresse correspondante trouvée. Essayez une formulation plus précise, ou placez le marqueur manuellement."
          : "Recherche d'adresse indisponible pour le moment. Vous pouvez placer le marqueur manuellement."
      );
    } finally {
      setRechercheEnCours(false);
    }
  }

  if (loadError) {
    return (
      <div className="alert alert-warning mb-0">
        La carte Google Maps n'a pas pu être chargée. Vous pouvez tout de même indiquer manuellement la
        localisation en cliquant ci-dessous une fois la page rechargée, ou contacter le support si le
        problème persiste.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="d-flex align-items-center justify-content-center border rounded" style={{ height: hauteur || HAUTEUR_PAR_DEFAUT }}>
        <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
        Chargement de la carte…
      </div>
    );
  }

  return (
    <div>
      {/*
        Pas de <form> ici : ce composant est monté à l'intérieur du <form>
        principal des pages de création (ex. creationAssurance.jsx), et le
        HTML interdit d'imbriquer un <form> dans un autre <form>. On
        reproduit le comportement "Entrée = rechercher" avec onKeyDown
        plutôt qu'avec onSubmit.
      */}
      <div className="d-flex gap-2 mb-2">
        <input
          type="text"
          className="form-control"
          placeholder="Rechercher une adresse (ex. Rue de la Joie, Akwa, Douala)"
          value={texteRecherche}
          onChange={(e) => setTexteRecherche(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              gererRecherche(e);
            }
          }}
        />
        <button type="button" className="btn btn-outline-primary" onClick={gererRecherche} disabled={rechercheEnCours}>
          {rechercheEnCours ? "Recherche…" : "Rechercher"}
        </button>
      </div>
      {erreurRecherche && <p className="text-danger small mb-2">{erreurRecherche}</p>}

      <GoogleMap
        mapContainerStyle={{ width: "100%", height: hauteur || HAUTEUR_PAR_DEFAUT, borderRadius: "8px" }}
        center={centre}
        zoom={positionConnue ? ZOOM_POSITION_CONNUE : ZOOM_PAR_DEFAUT}
        options={OPTIONS_CARTE}
        onLoad={onLoadCarte}
        onClick={gererClicCarte}
      >
        {positionConnue && (
          <Marker position={{ lat: latitude, lng: longitude }} draggable onDragEnd={gererFinGlisser} />
        )}
      </GoogleMap>

      <p className="minimal-note mt-2 mb-0">
        <i className="fa-solid fa-circle-info" /> Cliquez sur la carte ou glissez le marqueur pour ajuster
        précisément l'emplacement.
        {positionConnue && (
          <>
            {" "}
            Position actuelle : {latitude.toFixed(5)}, {longitude.toFixed(5)}.
          </>
        )}
      </p>
    </div>
  );
}