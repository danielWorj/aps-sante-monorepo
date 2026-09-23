// src/services/tarification.service.js
// Phase 0 — Décomposition du montant capturé.
//
// Principe directeur (voir schema.prisma, ConfigurationTarifaire) :
// aucun montant dérivé (commission, taxes, frais d'agrégateur) n'est
// jamais stocké en base. Tout se recalcule à la demande à partir de
// deux faits constatés : montant_honoraires (figé à la réservation) et
// la configuration_tarifaire_id référencée par la transaction. Changer
// un taux aujourd'hui ne modifie donc jamais une transaction passée.

import prisma from "../lib/prisma.js";

/**
 * Fonction pure : aucun accès DB, aucun effet de bord.
 * @param {number|string|import("@prisma/client").Prisma.Decimal} honoraires
 * @param {{ taux_commission: number|string, taux_taxes: number|string, taux_frais_agregateur: number|string }} config
 * @returns {{ honoraires: number, commission: number, taxes: number, fraisAgregateur: number, total: number }}
 */
export function decomposerMontant(honoraires, config) {
  const h = Number(honoraires);
  const commission = arrondir(h * Number(config.taux_commission));
  const taxes = arrondir(h * Number(config.taux_taxes));
  const fraisAgregateur = arrondir(h * Number(config.taux_frais_agregateur));
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
 * Lit en base la ConfigurationTarifaire active la plus récente pour un
 * pays donné. Lève une erreur explicite si aucune n'existe : mieux
 * vaut un 500 clair au moment de la capture qu'un paiement accepté
 * sans configuration tarifaire cohérente derrière.
 * @param {string} pays_id
 * @returns {Promise<import("@prisma/client").ConfigurationTarifaire>}
 */
export async function obtenirConfigurationActive(pays_id) {
  const config = await prisma.configurationTarifaire.findFirst({
    where: { pays_id, actif: true },
    orderBy: { date_debut_validite: "desc" },
  });

  if (!config) {
    throw new Error(
      `Aucune ConfigurationTarifaire active pour le pays ${pays_id} : le paiement ne peut pas être capturé.`
    );
  }

  return config;
}