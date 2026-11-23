// src/lib/marque.js
//
// Nom de la marque et raison sociale affichés dans toute l'application.
// Source unique : variables d'environnement lues au build par Vite
//   VITE_NOM_MARQUE      (défaut « ApSa »)
//   VITE_RAISON_SOCIALE  (défaut « AZA PROXI SANTÉ ASSURANCES »)
// En production, docker-compose.yaml les alimente à partir de NOM_MARQUE et
// RAISON_SOCIALE du .env racine (mêmes valeurs que le serveur et le mobile).
// Le titre de l'onglet (index.html) est remplacé au build : voir vite.config.js.

const lire = (valeur, defaut) => (typeof valeur === 'string' && valeur.trim() ? valeur.trim() : defaut);

export const NOM_MARQUE = lire(import.meta.env.VITE_NOM_MARQUE, 'ApSa');

export const RAISON_SOCIALE = lire(import.meta.env.VITE_RAISON_SOCIALE, 'AZA PROXI SANTÉ ASSURANCES');

/** « d'ApSa » devant une voyelle ou un h, « de … » sinon. */
export const DE_MARQUE = /^[aeiouyhàâäéèêëîïôöùûüœæ]/i.test(NOM_MARQUE) ? `d'${NOM_MARQUE}` : `de ${NOM_MARQUE}`;
