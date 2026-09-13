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