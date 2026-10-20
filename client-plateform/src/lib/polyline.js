// src/lib/polyline.js
// Décodage du format « Encoded Polyline » de Google (renvoyé par
// /google-maps/itineraire → polylineEncodee) en liste de points
// { lat, lng } directement utilisable par <Polyline path={...} />.
// Évite de charger la bibliothèque « geometry » de Maps JavaScript API.

export function decoderPolyline(encodee) {
  if (typeof encodee !== "string" || !encodee) return [];
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const lireValeur = () => {
    let resultat = 0;
    let decalage = 0;
    let octet;
    do {
      octet = encodee.charCodeAt(index++) - 63;
      resultat |= (octet & 0x1f) << decalage;
      decalage += 5;
    } while (octet >= 0x20 && index < encodee.length);
    return resultat & 1 ? ~(resultat >> 1) : resultat >> 1;
  };

  while (index < encodee.length) {
    lat += lireValeur();
    lng += lireValeur();
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}
