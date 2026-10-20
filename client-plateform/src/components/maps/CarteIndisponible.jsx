// src/components/maps/CarteIndisponible.jsx
//
// Repli commun des composants Google Maps quand l'API JavaScript ne peut
// pas être utilisée (clé absente du build, clé refusée par Google…).
// Avec des coordonnées, on affiche l'intégration Google Maps publique
// (iframe sans clé) : le visiteur voit toujours le lieu. Sans
// coordonnées (carte multi-points, sélecteur), simple message.

const HAUTEUR_PAR_DEFAUT = "320px";

export default function CarteIndisponible({ latitude, longitude, nom, hauteur = HAUTEUR_PAR_DEFAUT, message }) {
  const coordonnees = Number.isFinite(latitude) && Number.isFinite(longitude);

  if (coordonnees) {
    const src = `https://maps.google.com/maps?q=${latitude},${longitude}&z=15&hl=fr&output=embed`;
    return (
      <iframe
        title={nom ? `Localisation — ${nom}` : "Localisation"}
        src={src}
        className="aps-carte-iframe"
        style={{ height: hauteur }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    );
  }

  return (
    <div className="aps-carte-indispo" style={{ minHeight: hauteur }}>
      <i className="fa-solid fa-map-location-dot" aria-hidden="true" />
      <span>{message || "La carte n'est pas disponible pour le moment."}</span>
    </div>
  );
}
