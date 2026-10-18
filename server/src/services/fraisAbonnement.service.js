// src/services/fraisAbonnement.service.js
// Frais d'agrégateur d'un abonnement (assurance ou présence), payés par le
// souscripteur EN PLUS du prix de l'abonnement — même règle que la prise de
// RDV (facture.service.js) : total débité = abonnement + frais d'envoi.
//
// Les frais se calculent sur le montant de l'abonnement APRÈS remise et
// crédit, avec la ligne FraisAgregateur active de l'agrégateur choisi ; la
// ligne est figée sur la transaction (frais_envoi_id) à sa création.
// Virement : aucun frais.

import { decimalesPourMontant } from "../utils/montants.js";
import { obtenirFraisActifs, calculerFraisEnvoi } from "./fraisAgregateur.service.js";

/** « Abonnement Premium » tel quel ; « Premium » -> « <prefixe> Premium ». */
export function libelleAbonnement(prefixe, niveau) {
  return /^abonnement\b/i.test(niveau.libelle) ? niveau.libelle : `${prefixe} ${niveau.libelle}`;
}

const LIBELLE_AGREGATEUR = { stripe: "carte bancaire", campay: "Mobile Money" };

/**
 * Frais d'envoi de l'agrégateur pour `montant` (devise de l'abonnement).
 * @returns {Promise<{ agregateur: string, ligne: object, montant: number } | null>} null pour un virement.
 */
export async function fraisEnvoiAbonnement(agregateur, montant, devise, client) {
  if (agregateur !== "stripe" && agregateur !== "campay") return null;
  const { envoi } = await obtenirFraisActifs(agregateur, client);
  return { agregateur, ligne: envoi, montant: calculerFraisEnvoi(montant, envoi, decimalesPourMontant({ devise })) };
}

/**
 * Ligne « Frais agrégateur » d'un devis ou d'une facture, au format des
 * lignes de la facture RDV (base × taux + fixe).
 * @param {{ agregateur: string, ligne?: object|null, montant: number }} frais
 * @param {number} base montant de l'abonnement sur lequel portent les frais
 */
export function ligneFraisAbonnement(frais, base) {
  const taux = Number(frais.ligne?.taux ?? 0);
  const fixe = Number(frais.ligne?.montant_fixe ?? 0);
  return {
    code: "frais_agregateur",
    libelle: `Frais agrégateur (${LIBELLE_AGREGATEUR[frais.agregateur] ?? frais.agregateur})`,
    base: taux > 0 ? base : null,
    taux: taux > 0 ? taux : null,
    montant_fixe: fixe > 0 ? fixe : null,
    montant: frais.montant,
  };
}

/**
 * Frais réellement payés sur une transaction d'abonnement aboutie : écart
 * entre le montant débité et le prix de l'abonnement, avec la ligne figée
 * à la création de la transaction. null si aucun (virement, encaissement
 * constaté, transaction antérieure aux frais).
 */
export async function fraisDeLaTransaction(tx, abonnement, transaction) {
  if (!transaction?.frais_envoi_id) return null;
  const decimales = decimalesPourMontant({ devise: abonnement.devise });
  const ecart = Number(transaction.montant) - Number(abonnement.montant_total);
  const montant = Number(ecart.toFixed(decimales));
  if (!(montant > 0)) return null;
  const ligne = await tx.fraisAgregateur.findUnique({ where: { frais_agregateur_id: transaction.frais_envoi_id } });
  return { agregateur: transaction.fournisseur, ligne, montant };
}

/** Montant lisible pour la page Stripe (« 135 000 FCFA »). */
function formaterMontant(montant, devise) {
  const code = String(devise).toUpperCase();
  if (code === "XAF" || code === "XOF") {
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(montant)} FCFA`;
  }
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: code }).format(montant);
}

/**
 * Détail de la page Stripe Checkout d'un abonnement, à partir de son devis :
 *   - lignes : prix sans réduction, puis frais d'agrégateur (jamais négatives) ;
 *   - remise : remise de durée + crédit, appliquée par coupon (Stripe l'affiche
 *     entre le sous-total et le total) ;
 *   - recapitulatif : les quatre montants, au-dessus du bouton « Payer ».
 * Somme des lignes − remise = devis.total (contrôlé par creerSessionCheckout).
 */
export function detailCheckoutAbonnement(devis, { duree_mois }) {
  const f = (m) => formaterMontant(m, devis.devise);
  const abonnement = devis.lignes.find((l) => l.code === "abonnement");
  const reductions = devis.lignes.filter((l) => l.montant < 0);
  const frais = devis.lignes.find((l) => l.code === "frais_agregateur");

  const lignes = [{
    libelle: abonnement.libelle,
    description: `${f(abonnement.base)} / mois × ${duree_mois} mois (prix sans réduction)`,
    montant: abonnement.montant,
  }];
  if (frais) {
    const formule = [
      frais.taux != null
        ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(frais.taux * 100)} % de ${f(frais.base)}`
        : null,
      frais.montant_fixe != null ? `${f(frais.montant_fixe)} fixe` : null,
    ].filter(Boolean).join(" + ");
    lignes.push({ libelle: frais.libelle, description: formule || null, montant: frais.montant });
  }

  const montantRemise = reductions.reduce((t, l) => t - l.montant, 0);
  const remise = montantRemise > 0
    ? {
        // Nom du coupon Stripe (40 caractères au plus) : crédit abrégé s'il s'ajoute à la remise.
        libelle: reductions.map((l) => (l.code === "credit_prorata" && reductions.length > 1 ? "crédit" : l.libelle)).join(" + "),
        montant: montantRemise,
      }
    : null;

  const recapitulatif = [
    `Prix sans réduction : ${f(devis.montant_brut)}`,
    remise ? `Après réduction : ${f(devis.sous_total)}` : null,
    frais ? `Avec frais d'agrégateur : ${f(devis.total)} (dont ${f(frais.montant)} de frais)` : null,
    `Montant total à payer : ${f(devis.total)}`,
  ].filter(Boolean).join(" · ");

  return { lignes, remise, recapitulatif };
}
