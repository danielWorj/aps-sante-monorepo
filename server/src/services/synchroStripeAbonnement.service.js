// src/services/synchroStripeAbonnement.service.js
// Rattrapage d'un paiement Stripe d'abonnement dont le webhook n'est pas
// arrivé (webhook perdu, serveur indisponible, environnement local dont
// Stripe ne connaît pas l'adresse) : on interroge Stripe sur les sessions
// Checkout encore « en_attente » de l'abonnement et on finalise celles qui
// sont payées.
//
// Même finalisation que le webhook (finaliserAbonnement*), idempotente : si
// le webhook arrive ensuite, il ne produit aucun effet.

import prisma from "../lib/prisma.js";
import { stripe } from "../lib/stripeService.js";
import { finaliserAbonnementAssurance } from "./finalisationAbonnementAssurance.service.js";
import { finaliserAbonnementPresence } from "./finalisationAbonnementPresence.service.js";

const CIBLES = {
  assurance: { champ: "abonnement_assurance_id_cible", finaliser: finaliserAbonnementAssurance },
  presence: { champ: "abonnement_presence_id_cible", finaliser: finaliserAbonnementPresence },
};

/**
 * @param {"assurance"|"presence"} nature
 * @param {string} abonnement_id
 * @returns {Promise<number>} nombre de paiements finalisés
 */
export async function synchroniserStripeAbonnement(nature, abonnement_id) {
  const { champ, finaliser } = CIBLES[nature];
  const ouvertes = await prisma.transactionPaiement.findMany({
    where: { [champ]: abonnement_id, fournisseur: "stripe", statut: "en_attente", stripe_checkout_session_id: { not: null } },
    select: { transaction_id: true, stripe_checkout_session_id: true },
  });
  let finalisees = 0;
  for (const t of ouvertes) {
    const session = await stripe.checkout.sessions.retrieve(t.stripe_checkout_session_id);
    if (session.payment_status !== "paid") continue;
    await finaliser({ transaction_id: t.transaction_id, payment_intent_id: session.payment_intent });
    finalisees += 1;
  }
  return finalisees;
}
