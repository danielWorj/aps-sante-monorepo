// src/services/finalisationPaiement.service.js
// Cœur métier de la finalisation d'un paiement, indépendant du fournisseur
// (Stripe ou CamPay). Extrait de paiement.controller.js pour être appelé par
// le webhook Stripe ET par le code CamPay sans import circulaire.

import prisma from "../lib/prisma.js";
import { creerRemboursement, depuisUniteStripe } from "../lib/stripeService.js";
import { decimalesPourMontant } from "../utils/montants.js";
import { EVENEMENTS, decider } from "./politiqueFonds.service.js";
import { resoudreFraisRemboursement } from "./fraisAgregateur.service.js";

/**
 * Cœur métier commun à `checkout.session.completed` (web) et
 * `payment_intent.succeeded` (mobile natif) : transaction `reussie`,
 * escrow `sequestre`, RDV `cree` → `confirme`. Idempotent : Stripe peut
 * livrer le même événement plusieurs fois.
 *
 * Paiement tardif : si le rendez-vous a été annulé avant que ce paiement
 * n'aboutisse (PaymentSheet déjà validée au moment de l'annulation,
 * PaymentIntent non annulable), on n'encaisse rien : aucun escrow n'est
 * créé et le montant est remboursé selon §6 (honoraires − frais de
 * remboursement de l'agrégateur, jamais négatif).
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
 * Politique de fonds v2 §6 — Rembourse un paiement arrivé APRÈS l'annulation
 * du rendez-vous : honoraires − frais de remboursement de l'agrégateur
 * (mêmes règles que §2 ; les frais d'envoi ne sont pas rendus). Pas
 * d'escrow, ni commission, ni amende. Le calcul est celui de `decider`
 * (événement PAIEMENT_TARDIF), sur les lignes FIGÉES de la transaction.
 *
 * Stripe d'abord, base ensuite ; la clé d'idempotence garantit qu'un rejeu
 * du webhook ne rembourse jamais deux fois. En cas d'échec Stripe on lève :
 * le webhook répond 500 et Stripe réessaie (la transaction reste « reussie »
 * tant que le remboursement n'a pas abouti, ce qui rend le rejeu possible).
 * CamPay : ligne « a_traiter » portant le brut (honoraires) ; le net
 * définitif est fixé à la clôture par un admin (frais réels du retrait).
 */
async function rembourserPaiementRdvAnnule({ transaction, rdv_id, payment_intent_id, campay_reference }) {
  // Relecture avec les lignes figées (la transaction reçue n'en porte pas).
  const t = await prisma.transactionPaiement.findUnique({
    where: { transaction_id: transaction.transaction_id },
    include: { ligne_commission: true, frais_remboursement: true },
  });
  if (t.montant_honoraires == null || !t.ligne_commission) {
    throw new Error(
      `Transaction ${t.transaction_id} sans honoraires ou sans ligne de commission figée : ` +
      `remboursement du paiement tardif (rdv ${rdv_id}) impossible.`
    );
  }
  const decimales = decimalesPourMontant({ fournisseur: t.fournisseur, devise: t.devise });
  const fraisRemboursement = await resoudreFraisRemboursement(t);
  const { remboursement: rem } = decider({
    evenement: EVENEMENTS.PAIEMENT_TARDIF,
    honoraires: t.montant_honoraires,
    commission: t.ligne_commission,
    fraisRemboursement,
    decimales,
  });

  if (campay_reference) {
    // Pas de remboursement natif chez CamPay : on enregistre l'intention, un admin
    // l'exécute. La contrainte unique (transaction_id, motif) rend l'appel idempotent.
    if (rem.creerLigne) {
      try {
        await prisma.remboursementPaiement.create({
          data: {
            transaction_id: t.transaction_id,
            motif: rem.motif,
            montant: rem.brut,
            statut: "a_traiter",
          },
        });
      } catch (err) {
        if (err.code !== "P2002") throw err; // déjà enregistré : rien à faire
      }
    }
    console.warn(`[paiement] CamPay reçu après annulation du rdv ${rdv_id} : remboursement à traiter.`);
    return;
  }

  // ── Stripe ──
  if (!rem.creerLigne) {
    // Frais de remboursement ≥ honoraires : rien à rendre (plancher à 0, §2).
    console.warn(
      `[paiement] Paiement reçu après annulation du rdv ${rdv_id} (transaction ${t.transaction_id}) : ` +
      `remboursement nul (frais ≥ honoraires), aucun remboursement effectué.`
    );
    return;
  }
  const remboursement = await creerRemboursement({
    payment_intent_id,
    montant: rem.net,
    devise: t.devise,
    idempotency_key: `refund-rdv-annule:${t.transaction_id}`,
    metadata: {
      rdv_id,
      transaction_id: t.transaction_id,
      raison: "paiement_apres_annulation",
    },
  });
  if (remboursement.status === "failed" || remboursement.status === "canceled") {
    throw new Error(
      `Remboursement Stripe ${remboursement.id} en échec (statut ${remboursement.status}) ` +
      `pour le paiement tardif du rdv annulé ${rdv_id}.`
    );
  }

  // Le montant enregistré est celui que Stripe a RÉELLEMENT remboursé (un
  // fait) : il n'est plus égal au montant payé, il doit donc être consigné.
  await prisma.$transaction([
    prisma.remboursementPaiement.upsert({
      where: { transaction_id_motif: { transaction_id: t.transaction_id, motif: rem.motif } },
      create: {
        transaction_id: t.transaction_id,
        motif: rem.motif,
        montant: depuisUniteStripe(remboursement.amount, t.devise),
        stripe_refund_id: remboursement.id,
      },
      update: {},
    }),
    prisma.transactionPaiement.update({
      where: { transaction_id: t.transaction_id },
      data: { statut: "remboursee" },
    }),
  ]);
  console.warn(
    `[paiement] Paiement reçu après annulation du rdv ${rdv_id} : remboursé (honoraires − frais de remboursement) ` +
    `(transaction ${t.transaction_id}, payment_intent ${payment_intent_id}).`
  );
}