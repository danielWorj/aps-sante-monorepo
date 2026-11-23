// Outils du haut de fiche commun (FicheHero.jsx).

/** Initiales d'un nom (repli sans image). */
export function initiales(nom) {
  return String(nom || '')
    .replace(/^Dr\.?\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/** Liste d'URL dédoublonnée, sans valeurs vides. */
export function imagesUniques(...listes) {
  const vues = new Set();
  return listes.flat().filter((u) => {
    if (!u || typeof u !== 'string' || vues.has(u)) return false;
    vues.add(u);
    return true;
  });
}

/**
 * Partage le lien de la fiche (feuille de partage du téléphone, sinon copie
 * dans le presse-papiers). `toast` : hook useToast() de la page.
 */
export async function partagerFiche(titre, toast) {
  const url = window.location.href.split('?')[0];
  try {
    if (navigator.share) await navigator.share({ title: titre, url });
    else {
      await navigator.clipboard.writeText(url);
      toast?.succes('Lien de la fiche copié.');
    }
  } catch { /* partage annulé par l'utilisateur */ }
}
