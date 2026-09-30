// src/services/remboursementCampay.service.js
// Politique de fonds v2 §2 — Remboursements CamPay (pas de remboursement
// natif). La ligne naît « a_traiter » (portant le montant BRUT) ; un admin
// exécute un retrait Mobile Money vers le payeur, puis CLÔTURE la ligne en
// saisissant les frais RÉELS du retrait. Le patient reçoit brut − frais
// réels (plancher 0).
//
// Faits stockés : `statut` = « traite » et `frais_reels`. Le net versé
// (netRembourseCampay) et l'estimation affichée avant clôture se
// recalculent, ils ne sont jamais stockés.

import prisma from "../lib/prisma.js";
import { calculerFrais, resoudreFraisRemboursement } from "./fraisAgregateur.service.js";
import { netRembourseCampay } from "./politiqueFonds.service.js";

const STATUTS = ["a_traiter", "traite", "effectue"];

/**
 * Liste les remboursements CamPay (par défaut ceux à traiter) avec, pour
 * affichage, l'ESTIMATION du net d'après les frais de remboursement CamPay
 * configurés. L'estimation est indicative : le net définitif dépend des
 * frais réels saisis à la clôture.
 * @param {{ statut?: string }} [filtres]
 */
export async function listerRemboursementsCampay({ statut = "a_traiter" } = {}) {
  if (!STATUTS.includes(statut)) throw new Error(`Statut invalide : \"${statut}\".`);
  const lignes = await prisma.remboursementPaiement.findMany({
    where: { statut, transaction: { fournisseur: "campay" } },
    include: { transaction: { include: { frais_remboursement: true } } },
    orderBy: { date_creation: "asc" },
  });

  const resultat = [];
  for (const r of lignes) {
    const t = r.transaction;
    let estimation = null;
    let estimation_erreur = null;
    if (statut === "a_traiter") {
      try {
        const ligneFrais = await resoudreFraisRemboursement(t);
        const frais = calculerFrais(t.montant_honoraires, ligneFrais, 0);
        estimation = { frais_estimes: frais, net_estime: netRembourseCampay(r.montant, frais, 0) };
      } catch (err) {
        estimation_erreur = err.message; // ex. ligne de frais absente : l'admin est prévenu
      }
    }
    resultat.push({
      remboursement_id: r.remboursement_id,
      transaction_id: r.transaction_id,
      motif: r.motif,
      statut: r.statut,
      montant_brut: Number(r.montant),
      devise: t.devise,
      numero_payeur: t.numero_payeur,
      frais_reels: r.frais_reels == null ? null : Number(r.frais_reels),
      net_verse: r.frais_reels == null ? null : netRembourseCampay(r.montant, r.frais_reels, 0),
      date_creation: r.date_creation,
      estimation,
      estimation_erreur,
    });
  }
  return resultat;
}

/**
 * Clôture un remboursement CamPay : « a_traiter » -> « traite », en
 * enregistrant les frais réels du retrait. Idempotent : un rejeu avec les
 * MÊMES frais renvoie la clôture existante ; des frais différents sur une
 * ligne déjà clôturée sont refusés (409) — on ne réécrit pas un fait.
 *
 * @param {{ remboursement_id: string, frais_reels: number }} p  frais_reels : XAF entiers ≥ 0
 * @returns {Promise<{ erreur: {status:number, message:string} } | { remboursement_id:string,
 *   statut:string, montant_brut:number, frais_reels:number, net_verse:number, deja_cloture:boolean }>}
 */
export async function cloturerRemboursementCampay({ remboursement_id, frais_reels }) {
  if (!Number.isInteger(frais_reels) || frais_reels < 0) {
    return { erreur: { status: 400, message: "frais_reels doit être un entier positif ou nul (XAF, sans décimales)." } };
  }

  const lire = () =>
    prisma.remboursementPaiement.findUnique({
      where: { remboursement_id },
      include: { transaction: { select: { fournisseur: true } } },
    });
  const r = await lire();
  if (!r) return { erreur: { status: 404, message: "Remboursement introuvable." } };
  if (r.transaction.fournisseur !== "campay") {
    return { erreur: { status: 409, message: "Ce remboursement n'est pas un remboursement CamPay." } };
  }

  const reponse = (ligne, deja_cloture) => ({
    remboursement_id,
    statut: ligne.statut,
    montant_brut: Number(ligne.montant),
    frais_reels: Number(ligne.frais_reels),
    net_verse: netRembourseCampay(ligne.montant, ligne.frais_reels, 0),
    deja_cloture,
  });
  const dejaClotureMemesFrais = (ligne) =>
    ligne.statut === "traite" && Number(ligne.frais_reels) === frais_reels;

  if (r.statut === "traite") {
    return dejaClotureMemesFrais(r)
      ? reponse(r, true)
      : { erreur: { status: 409, message: `Ce remboursement est déjà clôturé avec des frais réels de ${Number(r.frais_reels)}.` } };
  }
  if (r.statut !== "a_traiter") {
    return { erreur: { status: 409, message: `Ce remboursement n'est pas à traiter (statut : \"${r.statut}\").` } };
  }

  // Réservation atomique : un seul appel concurrent clôture.
  const { count } = await prisma.remboursementPaiement.updateMany({
    where: { remboursement_id, statut: "a_traiter" },
    data: { statut: "traite", frais_reels },
  });
  const apres = await lire();
  if (count === 0) {
    return dejaClotureMemesFrais(apres)
      ? reponse(apres, true)
      : { erreur: { status: 409, message: "Ce remboursement vient d'être clôturé par une autre requête." } };
  }
  return reponse(apres, false);
}