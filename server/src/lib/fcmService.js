// src/lib/fcmService.js
// Seul point d'accès à Firebase Cloud Messaging (API HTTP v1) — même
// convention que twilioSmsService.js / whatsappService.js : appels REST
// directs (fetch), sans SDK. Aucun accès base ici : le choix des
// destinataires, l'idempotence et le nettoyage des jetons invalides sont
// faits par services/push.service.js.
//
// Configuration (variables d'environnement, lues à l'appel) — au choix :
//   FCM_SERVICE_ACCOUNT_JSON   contenu JSON du compte de service Firebase
//                              (brut ou encodé en base64) — SECRET
//   ou bien les trois champs séparés :
//   FCM_PROJECT_ID             identifiant du projet Firebase
//   FCM_CLIENT_EMAIL           e-mail du compte de service
//   FCM_PRIVATE_KEY            clé privée PEM (les « \n » littéraux sont acceptés) — SECRET
//
// Sans configuration, le push est simplement désactivé (estConfigure()).

import jwt from "jsonwebtoken";

const URL_JETON_OAUTH = "https://oauth2.googleapis.com/token";
const PORTEE = "https://www.googleapis.com/auth/firebase.messaging";
const DELAI_APPEL_MS = 10_000;

export class FcmError extends Error {
  // jetonInvalide : l'appareil n'existe plus (désinstallation, jeton périmé) → à supprimer.
  constructor(message, { status = 502, code = null, jetonInvalide = false } = {}) {
    super(message);
    this.name = "FcmError";
    this.status = status;
    this.code = code;
    this.jetonInvalide = jetonInvalide;
  }
}

let compteEnCache = null;
let cleCompteEnCache = null;

/** Compte de service lu depuis l'environnement, ou null si non configuré. */
function lireCompteService() {
  const brut = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  const cle = brut || `${process.env.FCM_PROJECT_ID}|${process.env.FCM_CLIENT_EMAIL}|${process.env.FCM_PRIVATE_KEY?.length}`;
  if (cle === cleCompteEnCache) return compteEnCache;

  let compte = null;
  if (brut) {
    try {
      const json = brut.startsWith("{") ? brut : Buffer.from(brut, "base64").toString("utf8");
      const c = JSON.parse(json);
      compte = { projectId: c.project_id, clientEmail: c.client_email, privateKey: c.private_key };
    } catch {
      console.error("[fcm] FCM_SERVICE_ACCOUNT_JSON illisible (JSON brut ou base64 attendu) : push désactivé.");
    }
  } else if (process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY) {
    compte = {
      projectId: process.env.FCM_PROJECT_ID,
      clientEmail: process.env.FCM_CLIENT_EMAIL,
      privateKey: process.env.FCM_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }
  if (compte && !(compte.projectId && compte.clientEmail && compte.privateKey)) compte = null;

  cleCompteEnCache = cle;
  compteEnCache = compte;
  return compte;
}

export function estConfigure() {
  return lireCompteService() !== null;
}

// Jeton d'accès OAuth2 (valable 1 h) : mis en cache et renouvelé 5 min avant expiration.
let jetonAcces = null;
let jetonAccesExpireA = 0;

async function obtenirJetonAcces(compte) {
  if (jetonAcces && Date.now() < jetonAccesExpireA - 5 * 60_000) return jetonAcces;

  const maintenant = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: compte.clientEmail, scope: PORTEE, aud: URL_JETON_OAUTH, iat: maintenant, exp: maintenant + 3600 },
    compte.privateKey,
    { algorithm: "RS256" }
  );

  const reponse = await fetch(URL_JETON_OAUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(DELAI_APPEL_MS),
  });
  const corps = await reponse.json().catch(() => ({}));
  if (!reponse.ok || !corps.access_token) {
    throw new FcmError(`Authentification Firebase refusée : ${corps.error_description || corps.error || reponse.status}`, {
      status: reponse.status,
    });
  }
  jetonAcces = corps.access_token;
  jetonAccesExpireA = Date.now() + Number(corps.expires_in || 3600) * 1000;
  return jetonAcces;
}

/**
 * Envoie un message à UN appareil.
 * @param {string} jeton jeton FCM de l'appareil
 * @param {{ titre: string, corps: string, donnees?: Record<string,string>, canal?: string }} message
 *   `donnees` : valeurs CHAÎNES uniquement (contrainte FCM).
 * @returns {Promise<{ id: string }>}
 */
export async function envoyerMessage(jeton, { titre, corps, donnees = {}, canal = "aps_rdv" }) {
  const compte = lireCompteService();
  if (!compte) throw new FcmError("Push mobile non configuré (FCM_*).", { status: 503, code: "NON_CONFIGURE" });

  const acces = await obtenirJetonAcces(compte);
  const reponse = await fetch(`https://fcm.googleapis.com/v1/projects/${compte.projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${acces}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: jeton,
        notification: { title: titre, body: corps },
        data: donnees,
        android: {
          priority: "high",
          notification: { channel_id: canal, sound: "default", click_action: "FLUTTER_NOTIFICATION_CLICK" },
        },
        apns: { payload: { aps: { sound: "default" } } },
      },
    }),
    signal: AbortSignal.timeout(DELAI_APPEL_MS),
  });

  if (reponse.ok) {
    const corpsOk = await reponse.json().catch(() => ({}));
    return { id: corpsOk.name };
  }

  const corpsErreur = await reponse.json().catch(() => ({}));
  const codeFcm = corpsErreur?.error?.details?.find((d) => d.errorCode)?.errorCode || corpsErreur?.error?.status;
  if (reponse.status === 401) jetonAcces = null; // jeton OAuth révoqué : on le redemandera.
  throw new FcmError(corpsErreur?.error?.message || `Envoi FCM refusé (${reponse.status}).`, {
    status: reponse.status,
    code: codeFcm,
    // UNREGISTERED (404) : application désinstallée / jeton périmé.
    // INVALID_ARGUMENT (400) sur un message par ailleurs valide : jeton mal formé.
    jetonInvalide: codeFcm === "UNREGISTERED" || (reponse.status === 400 && codeFcm === "INVALID_ARGUMENT"),
  });
}
