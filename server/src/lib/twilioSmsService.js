// src/lib/twilioSmsService.js
// Seul point d'accès à l'API SMS de Twilio (même convention que
// whatsappService.js / campayService.js). Appels REST directs (fetch), sans
// SDK. Aucun accès base ici : le journal, l'idempotence et les relances sont
// faits par services/sms.service.js, que les services métier doivent utiliser.
//
// Configuration (variables d'environnement, lues à l'appel) :
//   TWILIO_ACCOUNT_SID            identifiant du compte (AC…)
//   TWILIO_AUTH_TOKEN             jeton du compte — SECRET (sert aussi à vérifier la signature des rappels)
//   TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET
//                                 facultatif : clé d'API (SK…) utilisée à la place du jeton pour les appels
//   TWILIO_MESSAGING_SERVICE_SID  expéditeur recommandé (MG…) : Twilio choisit le numéro / l'identifiant
//   TWILIO_FROM                   sinon : numéro Twilio (+1…) ou identifiant alphanumérique (ex. APSSANTE)
//   TWILIO_STATUS_CALLBACK_URL    facultatif : URL publique EXACTE du rappel de statut
//                                 (ex. https://api.exemple.com/api/sms/webhook/statut)

import crypto from "node:crypto";

const API_URL = "https://api.twilio.com/2010-04-01";
const DELAI_APPEL_MS = 15_000;

// Codes Twilio pour lesquels réessayer plus tard a un sens (débit, panne).
// Tout autre refus est définitif. https://www.twilio.com/docs/api/errors
const CODES_TRANSITOIRES = new Set([20429, 20500, 20503, 30001, 30008]);

const MESSAGES = {
  20003: "Identifiants Twilio invalides (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).",
  21211: "Numéro destinataire invalide.",
  21408: "Envoi vers ce pays non autorisé : activez-le dans Twilio (Messaging > Settings > Geo permissions).",
  21606: "Expéditeur (TWILIO_FROM) non valide pour l'envoi de SMS.",
  21608: "Compte Twilio d'essai : ce numéro doit d'abord être vérifié dans la console Twilio.",
  21610: "Le destinataire a refusé les SMS (réponse STOP).",
  21612: "Twilio ne peut pas acheminer de SMS vers ce numéro.",
  21614: "Ce numéro n'est pas un mobile.",
  30003: "Téléphone du destinataire injoignable (éteint ou hors réseau).",
  30005: "Numéro destinataire inconnu de l'opérateur.",
  30006: "Numéro fixe ou opérateur ne recevant pas de SMS.",
  30007: "SMS bloqué par l'opérateur (filtrage).",
};

export class SmsError extends Error {
  // transitoire : l'échec peut disparaître en réessayant plus tard.
  constructor(message, { status = 502, code = null, payload = null, transitoire = false } = {}) {
    super(message);
    this.name = "SmsError";
    this.status = status;
    this.code = code;
    this.payload = payload;
    this.transitoire = transitoire;
  }
}

/** Message lisible pour un code d'erreur Twilio (rappel de statut). */
export function messageErreurTwilio(code) {
  return MESSAGES[Number(code)] ?? null;
}

/** État de la configuration, pour le back-office (jamais les valeurs secrètes). */
export function configurationTwilio() {
  return {
    compte_configure: Boolean(process.env.TWILIO_ACCOUNT_SID && (process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_API_KEY_SECRET)),
    expediteur: process.env.TWILIO_MESSAGING_SERVICE_SID
      ? { type: "messaging_service", valeur: process.env.TWILIO_MESSAGING_SERVICE_SID }
      : process.env.TWILIO_FROM
        ? { type: "from", valeur: process.env.TWILIO_FROM }
        : null,
    rappel_statut: Boolean(process.env.TWILIO_STATUS_CALLBACK_URL),
  };
}

// Lu à l'appel (et non à l'import) : une configuration absente ne doit pas
// empêcher le serveur de démarrer, seulement les envois d'échouer proprement.
function identifiants() {
  const compte = process.env.TWILIO_ACCOUNT_SID;
  const cle = process.env.TWILIO_API_KEY_SID;
  const secret = cle ? process.env.TWILIO_API_KEY_SECRET : process.env.TWILIO_AUTH_TOKEN;
  if (!compte || !secret) {
    throw new SmsError("Twilio n'est pas configuré (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN manquants).", {
      status: 503, code: "NON_CONFIGURE",
    });
  }
  const expediteur = process.env.TWILIO_MESSAGING_SERVICE_SID
    ? { MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID }
    : process.env.TWILIO_FROM
      ? { From: process.env.TWILIO_FROM }
      : null;
  if (!expediteur) {
    throw new SmsError("Expéditeur SMS non configuré (TWILIO_MESSAGING_SERVICE_SID ou TWILIO_FROM).", {
      status: 503, code: "NON_CONFIGURE",
    });
  }
  return { compte, utilisateur: cle || compte, secret, expediteur };
}

/**
 * Envoie un SMS.
 * @param {{ destinataire: string, texte: string }} p  destinataire au format international sans « + »
 * @returns {Promise<{ identifiant: string, statut: string, segments: number|null }>} identifiant = SM…
 * @throws {SmsError}
 */
export async function envoyerSmsTwilio({ destinataire, texte }) {
  const { compte, utilisateur, secret, expediteur } = identifiants();
  const corps = new URLSearchParams({
    To: `+${destinataire}`,
    Body: texte,
    ...expediteur,
    ...(process.env.TWILIO_STATUS_CALLBACK_URL && { StatusCallback: process.env.TWILIO_STATUS_CALLBACK_URL }),
  });

  let res;
  try {
    res = await fetch(`${API_URL}/Accounts/${encodeURIComponent(compte)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${utilisateur}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: corps,
      signal: AbortSignal.timeout(DELAI_APPEL_MS),
    });
  } catch (err) {
    throw new SmsError("Twilio est momentanément injoignable.", {
      code: "INJOIGNABLE", payload: String(err), transitoire: true,
    });
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Corps illisible : traité comme une panne côté Twilio.
  }

  if (!res.ok) {
    const code = data?.code ?? res.status;
    throw new SmsError(MESSAGES[code] || data?.message || `Erreur Twilio (HTTP ${res.status}).`, {
      status: res.status >= 500 ? 502 : res.status === 401 ? 503 : res.status,
      code: String(code),
      payload: data,
      transitoire: res.status >= 500 || res.status === 429 || CODES_TRANSITOIRES.has(Number(code)),
    });
  }
  if (!data?.sid) {
    throw new SmsError("Réponse Twilio inattendue (identifiant du message absent).", {
      code: "REPONSE_INATTENDUE", payload: data,
    });
  }
  return { identifiant: data.sid, statut: data.status, segments: data.num_segments ? Number(data.num_segments) : null };
}

/**
 * Vérifie la signature X-Twilio-Signature d'un rappel (HMAC-SHA1 de l'URL
 * exacte suivie des paramètres POST triés, clé = TWILIO_AUTH_TOKEN).
 * https://www.twilio.com/docs/usage/security#validating-requests
 * @param {{ signature: string|undefined, url: string, parametres: Record<string,string> }} p
 */
export function signatureTwilioValide({ signature, url, parametres }) {
  const jeton = process.env.TWILIO_AUTH_TOKEN;
  if (!jeton || !signature || !url) return false;
  const donnees = Object.keys(parametres ?? {})
    .sort()
    .reduce((acc, cle) => acc + cle + (parametres[cle] ?? ""), url);
  const attendue = crypto.createHmac("sha1", jeton).update(Buffer.from(donnees, "utf-8")).digest("base64");
  const a = Buffer.from(attendue);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
