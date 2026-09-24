// src/lib/jitsiWebhookService.js
//
// Vérifie la signature du webhook envoyé par le module Prosody
// custom mod_muc_events_webhook.lua (jitsi-host/prosody/rootfs/
// prosody-plugins/) à la destruction d'une room de téléconsultation —
// c'est-à-dire, en pratique, à la fin de la session (dernier
// participant parti). Même principe que la vérification de signature
// Stripe (stripeService.js, verifierSignatureWebhook) : HMAC-SHA256
// sur le corps brut EXACT de la requête, comparée en temps constant,
// avec un secret partagé — mais ici c'est nous qui définissons le
// format (Jitsi/Prosody n'a pas de webhook signé natif), voir le
// module Lua pour le détail de la génération côté émetteur.

import crypto from "crypto";

const JITSI_WEBHOOK_SECRET = process.env.JITSI_WEBHOOK_SECRET;

/**
 * @param {Buffer} corpsBrut le corps EXACT reçu (express.raw), pas du JSON re-sérialisé
 * @param {string|undefined} signatureRecue valeur de l'en-tête X-Aps-Signature (hex)
 * @returns {boolean}
 */
export function verifierSignatureWebhookVisio(corpsBrut, signatureRecue) {
  if (!JITSI_WEBHOOK_SECRET) {
    throw new Error(
      "JITSI_WEBHOOK_SECRET manquant dans les variables d'environnement : impossible de vérifier le webhook de fin de session visio."
    );
  }
  if (!signatureRecue) return false;

  const signatureAttendue = crypto
    .createHmac("sha256", JITSI_WEBHOOK_SECRET)
    .update(corpsBrut)
    .digest("hex");

  const bufAttendue = Buffer.from(signatureAttendue, "hex");
  const bufRecue = Buffer.from(String(signatureRecue), "hex");
  if (bufAttendue.length !== bufRecue.length) return false;

  return crypto.timingSafeEqual(bufAttendue, bufRecue);
}