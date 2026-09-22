// src/lib/googleMapsLoader.js
//
// Point d'entrée UNIQUE pour charger le script Maps JavaScript API
// côté navigateur. `@react-google-maps/api` dédoublonne déjà en
// interne le tag <script> si plusieurs composants appellent
// useLoadScript avec le même `id` — ce module fixe cet `id` une bonne
// fois pour toutes pour ne jamais dépendre de l'ordre de montage des
// composants (GoogleMapPicker dans les formulaires, GoogleMapView sur
// les fiches).
//
// Clé utilisée : VITE_GOOGLE_MAPS_API_KEY — clé PUBLIQUE, restreinte
// côté Google Cloud Console par HTTP referrer (domaine(s) de
// client-plateform), volontairement différente de GOOGLE_MAPS_API_KEY
// (serveur, Geocoding/Directions — voir server/.env.example). Ne
// JAMAIS réutiliser la clé serveur ici : une clé exposée au navigateur
// doit être restreinte par referrer, pas par IP.

import { useLoadScript } from "@react-google-maps/api";

const ID_SCRIPT_PARTAGE = "aps-google-maps-script";

export function useGoogleMapsLoader() {
  return useLoadScript({
    id: ID_SCRIPT_PARTAGE,
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    language: "fr",
  });
}