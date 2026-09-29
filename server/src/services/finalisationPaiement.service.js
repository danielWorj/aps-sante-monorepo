// src/services/finalisationPaiement.service.js
// Cœur métier de la finalisation d'un paiement, indépendant du fournisseur
// (Stripe ou CamPay). Extrait de paiement.controller.js pour être appelé par
// le webhook Stripe ET par le code CamPay sans import circulaire.

import prisma from "../lib/prisma.js";
import { creerRemboursement } from "../lib/stripeService.js";

/**
 * Cœur métier commun à `checkout.session.completed` (web) et
 * `payment_intent.succeeded` (mobile natif) : transaction `reussie`,
 * escrow `sequestre`, RDV `cree` → `confirme`. Idempotent : Stripe peut
 * livrer le même événement plusieurs fois.
 *
 * Paiement tardif : si le rendez-vous a été annulé avant que ce paiement
 * n'aboutisse (PaymentSheet déjà validée au moment de l'annulation,
 * PaymentIntent non annulable), on n'encaisse rien : aucun escrow n'est
 * créé et le montant est remboursé intégralement au patient.
 */
export async function finaliserPaiement({ transaction_id, rdv_id, payment_intent_id, campay_reference }) {
  // Référence à écrire sur la transaction selon le fournisseur.
  const referencePaiement = campay_reference
    ? { campay_reference }
    : { stripe_payment_intent_id: payment_intent_id };

  const paiementTardif = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transactionPaiement.findUnique({ where: { transaction_id } });
    if (!transaction) {
      console.warn(`[paiement] transaction ${transaction_id} introuvable — ignorée.`);
      return null;
    }
    // Rejeu d'un événement déjà traité jusqu'au remboursement.
    if (transaction.statut === "remboursee") return null;

    const rdv = await tx.rendezVous.findUnique({ where: { rdv_id }, select: { statut: true } });
    const escrowExistant = await tx.compteEscrow.findUnique({ where: { rdv_id } });

    // Rejeu d'un paiement déjà finalisé (escrow créé pour CETTE
    // transaction, éventuellement remboursé depuis par une annulation) :
    // rien à refaire, et surtout ne pas repasser la transaction à
    // "reussie" ni la rembourser une 2e fois.
    if (escrowExistant?.transaction_id === transaction_id) return null;

    if (rdv?.statut === "annule") {
      // On garde une trace du paiement réellement encaissé par Stripe ;
      // le remboursement (hors transaction SQL) le passera à "remboursee".
      await tx.transactionPaiement.update({
        where: { transaction_id },
        data: { statut: "reussie", ...referencePaiement },
      });
      return transaction;
    }

    await tx.transactionPaiement.update({
      where: { transaction_id },
      data: { statut: "reussie", ...referencePaiement },
    });

    // upsert : Stripe peut livrer le même événement plusieurs fois (et
    // le réessayer après un 5xx). Un simple create() levait une
    // violation d'unicité (rdv_id) au 2e passage -> 500 en boucle.
    const escrow = await tx.compteEscrow.upsert({
      where: { rdv_id },
      create: { rdv_id, transaction_id, montant: transaction.montant, statut: "sequestre" },
      update: {},
    });
    if (escrow.transaction_id !== transaction_id) {
      // Deux paiements réussis pour le même RDV : le 2e n'a pas de séquestre associé.
      // On le consigne en base (remboursement « a_traiter ») pour qu'il ne dépende plus
      // d'une lecture des logs. upsert sur (transaction_id, motif) : idempotent, et sans
      // erreur P2002 qui ferait avorter cette transaction SQL.
      const estCampay = Boolean(campay_reference);
      await tx.remboursementPaiement.upsert({
        where: { transaction_id_motif: { transaction_id, motif: "double_paiement" } },
        create: {
          transaction_id,
          motif: "double_paiement",
          montant: estCampay ? Math.round(Number(transaction.montant)) : Number(transaction.montant),
          statut: "a_traiter",
        },
        update: {},
      });
      console.error(
        `[paiement] DOUBLE PAIEMENT rdv=${rdv_id} : transaction ${transaction_id} ` +
        `(${estCampay ? `campay ${campay_reference}` : `payment_intent ${payment_intent_id}`}) ` +
        `enregistrée en remboursement « a_traiter ».`
      );
    }

    // Ne confirme que depuis "cree" : un RDV annulé entre-temps ne doit
    // pas être ressuscité par un webhook tardif.
    await tx.rendezVous.updateMany({ where: { rdv_id, statut: "cree" }, data: { statut: "confirme" } });
    return null;
  });

  if (paiementTardif) {
    await rembourserPaiementRdvAnnule({ transaction: paiementTardif, rdv_id, payment_intent_id, campay_reference });
  }
}

/**
 * Rembourse intégralement un paiement arrivé APRÈS l'annulation du rendez-vous.
 * Stripe d'abord, base ensuite (même ordre que annulation.service.js) ; la
 * clé d'idempotence garantit qu'un rejeu du webhook ne rembourse jamais deux
 * fois. En cas d'échec Stripe on lève : le webhook répond 500 et Stripe
 * réessaie (la transaction reste "reussie" tant que le remboursement n'a pas
 * abouti, ce qui rend le rejeu possible).
 */
async function rembourserPaiementRdvAnnule({ transaction, rdv_id, payment_intent_id, campay_reference }) {
  if (campay_reference) {
    // Pas de remboursement natif chez CamPay : on enregistre l'intention, un admin
    // l'exécute (Phase 2). La contrainte unique (transaction_id, motif) rend l'appel idempotent.
    try {
      await prisma.remboursementPaiement.create({
        data: {
          transaction_id: transaction.transaction_id,
          motif: "paiement_apres_annulation",
          montant: Math.round(Number(transaction.montant)),
          statut: "a_traiter",
        },
      });
    } catch (err) {
      if (err.code !== "P2002") throw err; // déjà enregistré : rien à faire
    }
    console.warn(`[paiement] CamPay reçu après annulation du rdv ${rdv_id} : remboursement à traiter.`);
    return;
  }
  // ── Stripe (comportement existant, inchangé) ──
  const remboursement = await creerRemboursement({
    payment_intent_id,
    montant: Number(transaction.montant),
    devise: transaction.devise,
    idempotency_key: `refund-rdv-annule:${transaction.transaction_id}`,
    metadata: {
      rdv_id,
      transaction_id: transaction.transaction_id,
      raison: "paiement_apres_annulation",
    },
  });
  if (remboursement.status === "failed" || remboursement.status === "canceled") {
    throw new Error(
      `Remboursement Stripe ${remboursement.id} en échec (statut ${remboursement.status}) ` +
      `pour le paiement tardif du rdv annulé ${rdv_id}.`
    );
  }

  await prisma.transactionPaiement.update({
    where: { transaction_id: transaction.transaction_id },
    data: { statut: "remboursee" },
  });
  console.warn(
    `[paiement] Paiement reçu après annulation du rdv ${rdv_id} : remboursé intégralement ` +
    `(transaction ${transaction.transaction_id}, payment_intent ${payment_intent_id}).`
  );
}