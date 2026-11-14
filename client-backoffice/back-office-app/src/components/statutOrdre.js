// src/components/statutOrdre.js
// Statuts « Tableau de l'Ordre » (ONMC) d'une fiche médecin — partagés par
// BadgeOrdre et les filtres de liste.

export const STATUTS_ORDRE = [
  { valeur: 'inscrit', libelle: "Appartient à l'Ordre", badge: 'is-success', icone: 'fa-shield-halved' },
  { valeur: 'non_inscrit', libelle: "N'est pas dans l'Ordre", badge: 'is-danger', icone: 'fa-circle-xmark' },
  { valeur: 'non_verifie', libelle: 'Non vérifié', badge: 'is-neutral', icone: 'fa-circle-question' },
];
export const PAR_VALEUR = Object.fromEntries(STATUTS_ORDRE.map((s) => [s.valeur, s]));

const DIACRITIQUES = /[̀-ͯ]/g;

/** Mots du nom (sans accents, 2 lettres ou plus) retrouvés dans le nom au tableau. */
export function nomCorrespond(nom, prenom, nomTableau) {
  const normaliser = (v) =>
    String(v || '').normalize('NFD').replace(DIACRITIQUES, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const mots = normaliser(`${nom || ''} ${prenom || ''}`).split(' ').filter((m) => m.length >= 2);
  if (!mots.length || !nomTableau) return true;
  const tableau = new Set(normaliser(nomTableau).split(' '));
  return mots.filter((m) => tableau.has(m)).length / mots.length >= 0.5;
}
