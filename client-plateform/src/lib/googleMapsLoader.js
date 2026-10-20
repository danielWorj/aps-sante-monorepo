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
// (serveur, Geocoding/Routes — voir server/.env.example). Ne
// JAMAIS réutiliser la clé serveur ici : une clé exposée au navigateur
// doit être restreinte par referrer, pas par IP.
//
// Deux pannes sont transformées en `loadError` pour que les composants
// affichent leur repli au lieu de la boîte grise « Impossible de charger
// Google Maps correctement » posée par Google sur la carte :
//   - clé absente du build (variable non transmise au `docker build`) :
//     le script n'est même pas chargé ;
//   - clé refusée par Google (API non activée sur le projet, referrer non
//     autorisé, facturation absente) : Google appelle window.gm_authFailure.

import { useSyncExternalStore } from "react";
import { useLoadScript } from "@react-google-maps/api";

const ID_SCRIPT_PARTAGE = "aps-google-maps-script";
const CLE_MAPS = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();

export const ERREUR_CLE_ABSENTE = new Error("Clé Google Maps absente du build (VITE_GOOGLE_MAPS_API_KEY).");
const ERREUR_AUTH = new Error("Clé Google Maps refusée par Google (voir la console du navigateur).");

// ─── Échec d'authentification signalé par Google ─────────────────────
let echecAuth = false;
const abonnes = new Set();

if (typeof window !== "undefined" && CLE_MAPS) {
  const precedent = window.gm_authFailure;
  window.gm_authFailure = () => {
    echecAuth = true;
    console.error(
      "[Google Maps] Clé refusée : vérifier dans Google Cloud Console que « Maps JavaScript API » est activée, " +
        "que la facturation est active et que le domaine courant figure dans les referrers autorisés de la clé."
    );
    abonnes.forEach((notifier) => notifier());
    if (typeof precedent === "function") precedent();
  };
}

function sAbonner(notifier) {
  abonnes.add(notifier);
  return () => abonnes.delete(notifier);
}
const lireEchecAuth = () => echecAuth;

function useEchecAuth() {
  return useSyncExternalStore(sAbonner, lireEchecAuth, lireEchecAuth);
}

// ─── Hooks ───────────────────────────────────────────────────────────
// Le choix entre les deux implémentations dépend d'une constante de build :
// l'ordre des hooks reste donc stable d'un rendu à l'autre.

function useChargeurAvecCle() {
  const { isLoaded, loadError } = useLoadScript({
    id: ID_SCRIPT_PARTAGE,
    googleMapsApiKey: CLE_MAPS,
    language: "fr",
    region: "CM",
  });
  const refus = useEchecAuth();
  return { isLoaded: isLoaded && !refus, loadError: loadError || (refus ? ERREUR_AUTH : undefined) };
}

function useChargeurSansCle() {
  return { isLoaded: false, loadError: ERREUR_CLE_ABSENTE };
}

export const useGoogleMapsLoader = CLE_MAPS ? useChargeurAvecCle : useChargeurSansCle;

/** true quand l'API JS est chargée ET acceptée (géocodage navigateur possible). */
export function googleMapsUtilisable() {
  return Boolean(CLE_MAPS && !echecAuth && typeof window !== "undefined" && window.google?.maps);
}
