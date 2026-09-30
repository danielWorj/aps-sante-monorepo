// src/services/tarification.service.js
// Politique de fonds v2 — Décomposition du montant capturé.
//
// Principe directeur (voir schema.prisma, LigneTarifaire et
// FraisAgregateur) : aucun montant dérivé (commission, frais) n'est
// jamais stocké en base. Tout se recalcule à la demande à partir de
// faits constatés : montant_honoraires (figé à la réservation) et les
// lignes référencées par la transaction (commission APS, frais d'envoi
// de l'agrégateur). Changer un taux aujourd'hui ne modifie donc jamais
// une transaction passée.
//
// v2 : le patient paie HONORAIRES + FRAIS D'ENVOI de l'agrégateur.
// Plus de taxe, plus de commission à sa charge : la commission APS est
// prélevée à la libération vers le médecin (voir liberationEscrow).

import { arrondir } from "../utils/montants.js";
import { calculerFrais } from "./fraisAgregateur.service.js";

/**
 * Fonction pure : aucun accès DB, aucun effet de bord.
 *
 * @param {number|string} honoraires
 * @param {{ commission: {taux:number|string}, frais_envoi: {taux?:number|string, montant_fixe?:number|string} }} lignes
 * @param {0|2} [decimales=2]  0 pour CamPay / devises zéro-décimale
 * @returns {{
 *   honoraires: number,   // ce que le médecin facture
 *   fraisEnvoi: number,   // frais de l'agrégateur, à la charge du patient
 *   total: number,        // honoraires + fraisEnvoi = montant débité au patient
 *   commission: number,   // commission APS — INFORMATIVE : prélevée sur le médecin à la libération
 *   netMedecin: number,   // honoraires − commission (avant amendes éventuelles)
 * }}
 */
export function decomposerMontant(honoraires, lignes, decimales = 2) {
  if (!lignes?.commission || lignes.commission.taux == null) {
    throw new Error("Ligne de commission manquante : décomposition impossible.");
  }
  const h = arrondir(honoraires, decimales);
  const fraisEnvoi = calculerFrais(honoraires, lignes.frais_envoi, decimales);
  const commission = Math.min(h, arrondir(Number(honoraires) * Number(lignes.commission.taux), decimales));

  return {
    honoraires: h,
    fraisEnvoi,
    total: arrondir(h + fraisEnvoi, decimales),
    commission,
    netMedecin: arrondir(h - commission, decimales),
  };
}

/**
 * Lit en base, pour un pays donné, la ligne tarifaire active la plus
 * récente de type `commission`. Lève une erreur explicite si elle
 * manque : mieux vaut un 500 clair au moment de la capture qu'un
 * paiement accepté sans barème de commission.
 * (Les frais d'agrégateur, eux, sont lus par fraisAgregateur.service.js.)
 * @param {string} pays_id
 * @param {object} [client] client Prisma (ou tx) ; défaut : client global
 * @returns {Promise<{ commission: object }>}
 */
export async function obtenirLignesTarifairesActives(pays_id, client) {
  const db = client ?? (await import("../lib/prisma.js")).default;
  const ligne = await db.ligneTarifaire.findFirst({
    where: { pays_id, type_frais: "commission", actif: true },
    orderBy: { date_debut_validite: "desc" },
  });
  if (!ligne) {
    throw new Error(
      `Aucune ligne tarifaire active de type "commission" pour le pays ${pays_id} : le paiement ne peut pas être capturé.`
    );
  }
  return { commission: ligne };
}
