import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY manquant dans l'environnement.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Devises "zéro-décimale" chez Stripe (montant transmis SANS x100) —
// XAF/XOF concernent directement l'Afrique centrale/de l'ouest.
const DEVISES_ZERO_DECIMALE = new Set([
  "bif","clp","djf","gnf","jpy","kmf","krw","mga","pyg",
  "rwf","ugx","vnd","vuv","xaf","xof","xpf",
]);

export function versUniteStripe(montant, devise) {
  const valeur = Number(montant);
  return DEVISES_ZERO_DECIMALE.has(devise.toLowerCase())
    ? Math.round(valeur)
    : Math.round(valeur * 100);
}

// Opération inverse de versUniteStripe : convertit un montant renvoyé
// par Stripe (unité mineure, ou unité entière pour une devise
// zéro-décimale) vers l'unité monétaire utilisée en base
// (Decimal(12, 2)). Sert à enregistrer le montant RÉELLEMENT remboursé
// par Stripe (un fait constaté) plutôt que celui qu'on avait demandé.
export function depuisUniteStripe(montantStripe, devise) {
  const valeur = Number(montantStripe);
  return DEVISES_ZERO_DECIMALE.has(devise.toLowerCase())
    ? valeur
    : Math.round(valeur) / 100;
}

export async function creerSessionCheckout({
  montant, devise, transaction_id, rdv_id, libelle,
  email_client, url_succes, url_annulation,
}) {
  return stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: email_client,
    client_reference_id: transaction_id,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: devise.toLowerCase(),
        unit_amount: versUniteStripe(montant, devise),
        product_data: { name: libelle },
      },
    }],
    metadata: { transaction_id, rdv_id },
    success_url: url_succes,
    cancel_url: url_annulation,
  });
}

export function verifierSignatureWebhook(corpsBrut, signature) {
  return stripe.webhooks.constructEvent(
    corpsBrut, signature, process.env.STRIPE_WEBHOOK_SECRET
  );
}

/**
 * Phase 3 — Rembourse (totalement ou partiellement) un paiement déjà
 * capturé (politique de gestion des fonds §3-4). Le remboursement se
 * fait toujours dans la devise d'origine du paiement : Stripe rembourse
 * sur le PaymentIntent initial, on transmet donc la devise stockée sur
 * la transaction pour la conversion d'unité, jamais une autre.
 *
 * `idempotency_key` (écart volontaire à la signature du plan, requis
 * par le §6 de la politique : "les opérations critiques sont
 * idempotentes") : sans elle, deux appels concurrents ou un rejeu après
 * une erreur réseau enverraient DEUX remboursements partiels distincts
 * chez Stripe. Avec elle, Stripe renvoie le remboursement déjà créé.
 * Le contrôle d'unicité en base (stripe_refund_id) ne suffirait pas :
 * il intervient trop tard, une fois l'argent déjà rendu.
 *
 * @param {{ payment_intent_id: string, montant: number|string, devise: string, idempotency_key?: string, metadata?: Record<string,string> }} params
 * @returns {Promise<import("stripe").Stripe.Refund>} l'objet refund Stripe (son `id` devient stripe_refund_id)
 */
export async function creerRemboursement({
  payment_intent_id, montant, devise, idempotency_key, metadata,
}) {
  return stripe.refunds.create(
    {
      payment_intent: payment_intent_id,
      amount: versUniteStripe(montant, devise),
      ...(metadata ? { metadata } : {}),
    },
    idempotency_key ? { idempotencyKey: idempotency_key } : undefined
  );
}

// Phase 4 — Défaillance du professionnel (politique de gestion des
// fonds §3 : "le coût de transaction est imputé au portefeuille du
// professionnel"). Fichier non listé par le plan pour la Phase 4, mais
// c'est le seul endroit du code qui encapsule les appels bruts au SDK
// Stripe (voir creerSessionCheckout/creerRemboursement ci-dessus) :
// ajouter cette fonction ici plutôt que d'appeler `stripe` directement
// depuis defaillancePro.service.js maintient cette convention. Écart
// à signaler, sans quoi le SDK Stripe fuiterait hors de ce fichier.
//
// Le frais Stripe (`balance_transaction.fee`) est un FAIT rapporté par
// Stripe sur la charge d'ORIGINE (jamais recalculé par nous) — il ne
// change pas quand on rembourse ensuite le patient : Stripe garde sa
// commission de traitement même si l'argent est rendu, d'où
// l'imputation de ce coût au médecin défaillant (§3/§5).
//
// @param {string} payment_intent_id
// @returns {Promise<{ fee: number, devise: string } | null>} le frais
//   dans l'unité mineure Stripe (à convertir via depuisUniteStripe), ou
//   `null` si la charge n'a pas encore de balance_transaction réglée
//   (cas limite : l'appelant doit alors réessayer plus tard plutôt que
//   de deviner un montant).
export async function obtenirFraisTransactionPaymentIntent(payment_intent_id) {
  const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id, {
    expand: ["latest_charge.balance_transaction"],
  });

  const balanceTransaction = paymentIntent.latest_charge?.balance_transaction;
  if (!balanceTransaction || typeof balanceTransaction.fee !== "number") {
    return null;
  }

  return { fee: balanceTransaction.fee, devise: balanceTransaction.currency };
}