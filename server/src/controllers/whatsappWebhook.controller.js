// src/controllers/whatsappWebhook.controller.js
// Webhook Meta (WhatsApp Cloud API) : messages ENTRANTS.
// Sert à la vérification inversée (l'utilisateur envoie son code à notre
// numéro, voir verificationTelephone.service.js).
//
// Configuration chez Meta (App > WhatsApp > Configuration > Webhook) :
//   URL de rappel : https://<api>/api/whatsapp/webhook
//   Jeton de vérification : WHATSAPP_WEBHOOK_VERIFY_TOKEN
//   Champ abonné : « messages »
// Signature : chaque POST porte X-Hub-Signature-256 = HMAC-SHA256 du corps
// brut avec la clé secrète de l'application (WHATSAPP_APP_SECRET). Sans
// cette clé, le webhook est refusé en production.

import crypto from "node:crypto";
import { traiterMessageEntrantVerification } from "../services/verificationTelephone.service.js";
import { envoyerWhatsapp } from "../services/whatsapp.service.js";
import { NOM_MARQUE } from "../lib/marque.js";

/** GET /api/whatsapp/webhook — vérification de l'URL par Meta. */
export function verifierWebhookWhatsapp(req, res) {
  const attendu = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const jeton = req.query["hub.verify_token"];
  if (attendu && mode === "subscribe" && jeton === attendu) {
    return res.status(200).type("text/plain").send(String(req.query["hub.challenge"] ?? ""));
  }
  return res.sendStatus(403);
}

function signatureValide(req) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const recue = String(req.get("x-hub-signature-256") ?? "");
  if (!recue.startsWith("sha256=") || !Buffer.isBuffer(req.body)) return false;
  const calculee = `sha256=${crypto.createHmac("sha256", secret).update(req.body).digest("hex")}`;
  return recue.length === calculee.length && crypto.timingSafeEqual(Buffer.from(recue), Buffer.from(calculee));
}

/** Texte d'un message entrant (texte simple, ou bouton). */
function texteMessage(message) {
  if (message?.type === "text") return message.text?.body ?? null;
  if (message?.type === "button") return message.button?.text ?? null;
  if (message?.type === "interactive") return message.interactive?.button_reply?.title ?? null;
  return null;
}

/** Traite un message entrant ; rend true si une vérification a été validée. */
export async function traiterMessageEntrant({ de, texte }) {
  const ligne = await traiterMessageEntrantVerification({ de, texte });
  if (!ligne) return false;
  // Accusé de réception (message libre : autorisé, l'utilisateur vient
  // d'écrire). Sans effet sur la vérification si l'envoi échoue.
  envoyerWhatsapp({
    destinataire: `+${ligne.telephone}`,
    origine: "verification_inverse",
    texte: `Merci, votre numéro est confirmé. Retournez dans ${NOM_MARQUE} pour continuer.`,
  }).catch(() => {});
  return true;
}

/** POST /api/whatsapp/webhook — corps brut (express.raw), voir index.js. */
export async function recevoirWebhookWhatsapp(req, res) {
  if (!signatureValide(req)) return res.sendStatus(401);
  // Meta attend une réponse rapide : on accuse réception, puis on traite.
  res.sendStatus(200);

  let corps;
  try {
    corps = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? ""));
  } catch {
    return;
  }
  for (const entree of corps?.entry ?? []) {
    for (const changement of entree?.changes ?? []) {
      for (const message of changement?.value?.messages ?? []) {
        const texte = texteMessage(message);
        if (!message?.from || !texte) continue;
        try {
          await traiterMessageEntrant({ de: message.from, texte });
        } catch (err) {
          console.error("[whatsapp webhook] message entrant non traité :", err?.message ?? err);
        }
      }
    }
  }
}
