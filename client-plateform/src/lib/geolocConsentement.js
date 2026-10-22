// src/lib/geolocConsentement.js
//
// Point d'entrée UNIQUE pour lire la position du navigateur. Avant la boîte
// native du navigateur (« Autoriser la localisation ? »), qui n'explique rien,
// on affiche une modale ApSa (GeolocConsentementHote, montée une fois dans
// main.jsx) qui dit pourquoi on en a besoin. Le navigateur n'est sollicité
// qu'après « Activer ma position ».
//
// - permission déjà accordée : aucune modale, appel direct ;
// - permission à demander : modale d'explication puis demande native ;
// - permission bloquée : modale qui explique comment la réactiver dans
//   les réglages du navigateur (aucune demande native possible).
//
// `obtenirPosition` a la même signature que navigator.geolocation
// .getCurrentPosition : ne plus appeler cette API directement ailleurs.

const PERMISSION_DENIED = 1;

let ecouteur = null;
const enAttente = [];

/** Réservé à GeolocConsentementHote : reçoit les demandes de modale. */
export function enregistrerHoteConsentement(fn) {
  ecouteur = fn;
  while (enAttente.length) fn(enAttente.shift());
  return () => { if (ecouteur === fn) ecouteur = null; };
}

function demanderModale(etat) {
  return new Promise((resolve) => {
    const demande = { etat, resolve };
    if (ecouteur) ecouteur(demande);
    else enAttente.push(demande);
  });
}

async function etatPermission() {
  try {
    const statut = await navigator.permissions?.query({ name: 'geolocation' });
    return statut?.state || 'prompt';
  } catch {
    // Safari ancien : l'API Permissions ne connaît pas « geolocation ».
    return 'prompt';
  }
}

function erreurRefus(message) {
  // `reporte` : l'utilisateur a choisi « Plus tard », le navigateur n'a pas été sollicité.
  return { code: PERMISSION_DENIED, PERMISSION_DENIED, message, reporte: true };
}

/**
 * @param {(pos: GeolocationPosition) => void} succes
 * @param {(err: { code: number, message: string }) => void} [echec]
 * @param {PositionOptions} [options]
 */
export async function obtenirPosition(succes, echec, options) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    echec?.({ code: 2, message: "La géolocalisation n'est pas supportée par ce navigateur." });
    return;
  }

  const etat = await etatPermission();
  if (etat !== 'granted') {
    const accepte = await demanderModale(etat === 'denied' ? 'bloquee' : 'demande');
    if (!accepte) {
      echec?.(erreurRefus("Localisation non activée."));
      return;
    }
  }

  navigator.geolocation.getCurrentPosition(succes, (err) => echec?.(err), options);
}
