// src/services/fraisAgregateur.service.js
// Politique de fonds v2 §1-2 — Frais d'agrégateur (Stripe / CamPay).
//
// Deux parties :
//   1. calculs PURS (aucun accès base) : frais = honoraires × taux
//      + montant_fixe, arrondi selon la devise ;
//   2. lecture des lignes actives / figées en base. Aucune valeur n'est
//      codée en dur ni seedée : une ligne absente lève une erreur
//      explicite (même esprit que obtenirLignesTarifairesActives).
//
// Prisma est importé paresseusement : les fonctions pures restent
// utilisables (et testables) sans client généré ni base.

import { arrondir } from "../utils/montants.js";

const AGREGATEURS = ["stripe", "campay"];
const TYPES = ["envoi", "remboursement"];

/**
 * Frais d'une ligne FraisAgregateur, calculés sur les HONORAIRES.
 * @param {number|string} honoraires
 * @param {{ taux?: number|string, montant_fixe?: number|string }} ligne
 * @param {0|2} decimales
 * @returns {number}
 */
export function calculerFrais(honoraires, ligne, decimales = 2) {
  if (!ligne) {
    throw new Error("Ligne de frais d'agrégateur manquante : calcul impossible.");
  }
  const h = Number(honoraires);
  if (!Number.isFinite(h) || h < 0) {
    throw new Error(`Honoraires invalides (${honoraires}) pour le calcul des frais d'agrégateur.`);
  }
  const taux = Number(ligne.taux ?? 0);
  const fixe = Number(ligne.montant_fixe ?? 0);
  return arrondir(h * taux + fixe, decimales);
}

export const calculerFraisEnvoi = calculerFrais;
export const calculerFraisRemboursement = calculerFrais;

/** Total facturé au patient : honoraires + frais d'envoi (§1). */
export function calculerTotalPatient(honoraires, ligneEnvoi, decimales = 2) {
  const frais = calculerFrais(honoraires, ligneEnvoi, decimales);
  return { honoraires: arrondir(honoraires, decimales), fraisEnvoi: frais, total: arrondir(Number(honoraires) + frais, decimales) };
}

async function clientParDefaut() {
  return (await import("../lib/prisma.js")).default;
}

/**
 * Lignes actives d'un agrégateur (envoi ET remboursement). Erreur
 * explicite si l'une manque : mieux vaut un 500 clair avant la capture
 * qu'un paiement accepté sans barème de remboursement.
 * @param {"stripe"|"campay"} agregateur
 * @param {object} [client] client Prisma (ou tx)
 * @returns {Promise<{ envoi: object, remboursement: object }>}
 */
export async function obtenirFraisActifs(agregateur, client) {
  if (!AGREGATEURS.includes(agregateur)) {
    throw new Error(`Agrégateur inconnu : "${agregateur}".`);
  }
  const db = client ?? (await clientParDefaut());
  const lignes = await db.fraisAgregateur.findMany({
    where: { agregateur, actif: true },
    orderBy: { date_debut_validite: "desc" },
  });
  const resultat = {};
  for (const type of TYPES) {
    const ligne = lignes.find((l) => l.type_frais === type);
    if (!ligne) {
      throw new Error(
        `Aucune ligne de frais d'agrégateur active (agrégateur "${agregateur}", type "${type}") : ` +
        `un administrateur doit la saisir avant toute opération.`
      );
    }
    resultat[type] = ligne;
  }
  return resultat;
}

/**
 * Ligne de frais de remboursement applicable à une transaction :
 * la ligne FIGÉE à la capture si elle existe, sinon (transaction
 * antérieure à la v2, sans ligne figée) la ligne ACTIVE de son
 * agrégateur — les transactions existantes suivent la nouvelle règle
 * (§8, aucune logique de compatibilité avec l'ancien calcul).
 * @param {{ fournisseur: string, frais_remboursement?: object|null }} transaction
 *   (avec la relation frais_remboursement incluse)
 * @param {object} [client]
 */
export async function resoudreFraisRemboursement(transaction, client) {
  if (transaction.frais_remboursement) return transaction.frais_remboursement;
  const { remboursement } = await obtenirFraisActifs(transaction.fournisseur, client);
  return remboursement;
}