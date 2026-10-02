// src/components/maps/GoogleMapListe.jsx
//
// Carte Google Maps multi-marqueurs en lecture seule, pour les pages
// annuaire (onglet « Carte » de pages/Medecin.jsx). Un marqueur par
// entrée ; un clic ouvre une InfoWindow (titre, sous-titre, lien vers
// la fiche). Le cadrage est automatique (fitBounds) sur l'ensemble des
// marqueurs et se recalcule à chaque changement de la liste.
//
// Contrat : composant CONTRÔLÉ par le parent, qui fournit la liste déjà
// filtrée (les entrées sans position doivent être exclues AVANT l'appel,
// et le parent affiche le message « N médecin(s) sans localisation »).
// Les entrées dont latitude/longitude ne sont pas des nombres finis sont
// de toute façon ignorées ici par sécurité.
//
// Chargement du script Maps : useGoogleMapsLoader (point d'entrée
// unique, voir lib/googleMapsLoader.js). États chargement / erreur
// alignés sur GoogleMapView.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Marker, InfoWindow } from "@react-google-maps/api";
import { Link } from "react-router-dom";
import { useGoogleMapsLoader } from "../../lib/googleMapsLoader";

const HAUTEUR_PAR_DEFAUT = "420px";

// Même centre par défaut que GoogleMapPicker (Douala), utilisé tant que
// la carte n'a pas de marqueur à cadrer.
const CENTRE_PAR_DEFAUT = { lat: 4.0511, lng: 9.7679 };
const ZOOM_PAR_DEFAUT = 12;
// Évite un zoom excessif quand il n'y a qu'un seul marqueur (ou
// plusieurs marqueurs quasi confondus) après fitBounds.
const ZOOM_MAX_APRES_CADRAGE = 16;

const OPTIONS_CARTE = {
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
};

function coordonneesValides(point) {
  return Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude);
}

/**
 * @param {object} props
 * @param {Array<{
 *   id: string|number,
 *   latitude: number,
 *   longitude: number,
 *   titre: string,
 *   sousTitre?: string,
 *   lien?: string
 * }>} props.points
 * @param {string} [props.hauteur] hauteur CSS de la carte (défaut 420px)
 */
export default function GoogleMapListe({ points = [], hauteur = HAUTEUR_PAR_DEFAUT }) {
  const { isLoaded, loadError } = useGoogleMapsLoader();
  const mapRef = useRef(null);
  const [idSelectionne, setIdSelectionne] = useState(null);

  const pointsValides = useMemo(() => points.filter(coordonneesValides), [points]);
  const pointSelectionne = pointsValides.find((p) => p.id === idSelectionne) || null;

  const cadrer = useCallback(() => {
    const carte = mapRef.current;
    if (!carte || !window.google?.maps || pointsValides.length === 0) return;

    if (pointsValides.length === 1) {
      const [unique] = pointsValides;
      carte.setCenter({ lat: unique.latitude, lng: unique.longitude });
      carte.setZoom(ZOOM_MAX_APRES_CADRAGE);
      return;
    }

    const limites = new window.google.maps.LatLngBounds();
    pointsValides.forEach((p) => limites.extend({ lat: p.latitude, lng: p.longitude }));
    carte.fitBounds(limites, 48);
    // fitBounds peut zoomer très fort si les points sont proches :
    // on plafonne une fois le cadrage terminé (écoute unique).
    window.google.maps.event.addListenerOnce(carte, "idle", () => {
      if (carte.getZoom() > ZOOM_MAX_APRES_CADRAGE) carte.setZoom(ZOOM_MAX_APRES_CADRAGE);
    });
  }, [pointsValides]);

  const onLoadCarte = useCallback(
    (carte) => {
      mapRef.current = carte;
      cadrer();
    },
    [cadrer]
  );

  const onUnmountCarte = useCallback(() => {
    mapRef.current = null;
  }, []);

  // Recadre à chaque changement de liste (nouveau filtre, nouveau rayon…).
  // Pas de reset de l'InfoWindow ici : `pointSelectionne` est dérivé de
  // `pointsValides`, donc elle disparaît d'elle-même si son marqueur n'est
  // plus dans la liste.
  useEffect(() => {
    cadrer();
  }, [cadrer]);

  if (loadError) {
    return (
      <div
        className="d-flex flex-column align-items-center justify-content-center border rounded text-center text-muted p-3"
        style={{ height: hauteur }}
      >
        <i className="fa-solid fa-map-location-dot mb-2" style={{ fontSize: "1.6rem" }} />
        <span>La carte n'a pas pu être chargée.</span>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="d-flex align-items-center justify-content-center border rounded" style={{ height: hauteur }}>
        <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
        Chargement de la carte…
      </div>
    );
  }

  if (pointsValides.length === 0) {
    return (
      <div
        className="d-flex flex-column align-items-center justify-content-center border rounded text-center text-muted p-3"
        style={{ height: hauteur }}
      >
        <i className="fa-solid fa-location-crosshairs mb-2" style={{ fontSize: "1.6rem" }} />
        <span>Aucun résultat avec une localisation à afficher sur la carte.</span>
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: hauteur, borderRadius: "8px" }}
      center={CENTRE_PAR_DEFAUT}
      zoom={ZOOM_PAR_DEFAUT}
      options={OPTIONS_CARTE}
      onLoad={onLoadCarte}
      onUnmount={onUnmountCarte}
      onClick={() => setIdSelectionne(null)}
    >
      {pointsValides.map((p) => (
        <Marker
          key={p.id}
          position={{ lat: p.latitude, lng: p.longitude }}
          title={p.titre}
          onClick={() => setIdSelectionne(p.id)}
        />
      ))}

      {pointSelectionne && (
        <InfoWindow
          position={{ lat: pointSelectionne.latitude, lng: pointSelectionne.longitude }}
          onCloseClick={() => setIdSelectionne(null)}
        >
          <div style={{ maxWidth: 220 }}>
            <strong>{pointSelectionne.titre}</strong>
            {pointSelectionne.sousTitre && (
              <div className="small text-muted">{pointSelectionne.sousTitre}</div>
            )}
            {pointSelectionne.lien && (
              <div className="mt-1">
                <Link to={pointSelectionne.lien}>Voir la fiche</Link>
              </div>
            )}
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}