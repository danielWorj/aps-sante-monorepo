// src/services/tarification.service.js
// Phase 0 — Décomposition du montant capturé.
//
// Principe directeur (voir schema.prisma, LigneTarifaire) : aucun
// montant dérivé (commission, taxes, frais d'agrégateur) n'est jamais
// stocké en base. Tout se recalcule à la demande à partir de faits
// constatés : montant_honoraires (figé à la réservation) et les trois
// lignes tarifaires référencées par la transaction (une par
// type_frais). Changer un taux aujourd'hui — ou ajouter une toute
// nouvelle ligne tarifaire — ne modifie donc jamais une transaction
// passée.

import prisma from "../lib/prisma.js";

const TYPES_FRAIS = ["commission", "taxe", "frais_agregateur"];

/**
 * Fonction pure : aucun accès DB, aucun effet de bord.
 * @param {number|string} honoraires
 * @param {{ commission: {taux:number|string}, taxe: {taux:number|string}, frais_agregateur: {taux:number|string} }} lignes
 * @returns {{ honoraires: number, commission: number, taxes: number, fraisAgregateur: number, total: number }}
 */
export function decomposerMontant(honoraires, lignes) {
  const h = Number(honoraires);
  const commission = arrondir(h * Number(lignes.commission.taux));
  const taxes = arrondir(h * Number(lignes.taxe.taux));
  const fraisAgregateur = arrondir(h * Number(lignes.frais_agregateur.taux));
  const total = arrondir(h + commission + taxes + fraisAgregateur);

  return { honoraires: arrondir(h), commission, taxes, fraisAgregateur, total };
}

// Arrondi à 2 décimales (unité monétaire courante des montants en base,
// voir @db.Decimal(12, 2) sur TransactionPaiement.montant) — évite les
// écarts de type 14.999999999999998 issus de l'arithmétique flottante.
function arrondir(valeur) {
  return Math.round(valeur * 100) / 100;
}

/**
 * Lit en base, pour un pays donné, la ligne tarifaire active la plus
 * récente de chacun des 3 types de frais (commission, taxe,
 * frais_agregateur). Lève une erreur explicite si l'un des trois
 * manque : mieux vaut un 500 clair au moment de la capture qu'un
 * paiement accepté avec une décomposition incomplète.
 * @param {string} pays_id
 * @returns {Promise<{ commission: object, taxe: object, frais_agregateur: object }>}
 */
export async function obtenirLignesTarifairesActives(pays_id) {
  const lignes = await prisma.ligneTarifaire.findMany({
    where: { pays_id, actif: true },
    orderBy: { date_debut_validite: "desc" },
  });

  const resultat = {};
  for (const type of TYPES_FRAIS) {
    const ligne = lignes.find((l) => l.type_frais === type);
    if (!ligne) {
      throw new Error(
        `Aucune ligne tarifaire active de type "${type}" pour le pays ${pays_id} : le paiement ne peut pas être capturé.`
      );
    }
    resultat[type] = ligne;
  }

  return resultat;
}