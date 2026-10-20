// src/utils/tarif.js
// Libellé unique du tarif de consultation d'un médecin sur le site
// public : « Tarif : 10 000 F ». Espaces insécables pour que le libellé
// ne se coupe jamais en deux lignes sur les cartes.

const ESPACE_INSECABLE = ' ';

/** true si le médecin a renseigné un tarif exploitable. */
export function aUnTarif(montant) {
  return montant !== undefined && montant !== null && montant !== '' && Number.isFinite(Number(montant));
}

/** 10000 → « 10 000 F ». */
export function montantTarif(montant) {
  return Number(montant).toLocaleString('fr-FR') + ESPACE_INSECABLE + 'F';
}

/** 10000 → « Tarif : 10 000 F ». */
export function libelleTarif(montant) {
  return 'Tarif' + ESPACE_INSECABLE + ': ' + montantTarif(montant);
}
