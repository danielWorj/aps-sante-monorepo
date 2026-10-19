// auteur.js — utilitaires d'affichage de l'auteur d'un avis.

/** Initiales d'un nom affiché (« Aïcha M. » -> « AM ») ; null si anonyme. */
export function initialesAuteur(nom) {
  const parts = String(nom || '').replace(/\./g, '').split(/\s+/).filter(Boolean);
  if (!parts.length || nom === 'Patient vérifié') return null;
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}
