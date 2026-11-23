// src/services/appareilConfiance.service.js
// Appareils de confiance : une connexion par numéro + PIN (ou email + mot
// de passe) depuis un appareil INCONNU doit être validée :
//   1. depuis l'application déjà connectée sur un autre téléphone
//      (demande « nouvel_appareil », mêmes 3 codes que la connexion web) ;
//   2. sinon, par WhatsApp inversé : l'utilisateur envoie un code à notre
//      numéro WhatsApp (verificationTelephone.service.js, canal whatsapp_inverse).
//
// Identifiant d'appareil :
//   - application mobile : en-tête X-Appareil-Id (tiré au hasard, gardé
//     dans le stockage sécurisé du téléphone) ;
//   - navigateur : cookie httpOnly « appareil_id » posé par le serveur
//     (path /api/auth), jamais lisible en JavaScript.
// Seule l'empreinte SHA-256 est stockée. Cet identifiant est DISTINCT de
// X-Installation-Id (compteur de vues anonyme, jamais lié au compte).
//
// Activation : VALIDATION_NOUVEL_APPAREIL=true. La validation n'est exigée
// que si au moins un moyen est disponible (application connectée ailleurs,
// ou WhatsApp inversé actif) : sans moyen, la connexion passe (et l'appareil
// est enregistré), pour ne jamais bloquer un compte.
// Transition : une session déjà ouverte avant l'activation fait confiance à
// son appareil au premier renouvellement (valide_par « session_existante »).

import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { estClientMobile, genererTokenValidationAppareil } from "../utils/token.utils.js";
import { masquerTelephone, whatsappInverseActif } from "./verificationTelephone.service.js";

// Même liste que pin.service.js (non importée : compte.service.js importe ce
// module, et pin.service.js importe compte.service.js).
const ROLES_SANS_PIN = new Set(["admin", "superadmin"]);

export const ENTETE_APPAREIL = "x-appareil-id";
export const NOM_COOKIE_APPAREIL = "appareil_id";
const FORMAT_IDENTIFIANT = /^[A-Za-z0-9_-]{16,128}$/;
const DUREE_COOKIE_MS = 2 * 365 * 24 * 60 * 60 * 1000;

export function validationAppareilActive() {
  return String(process.env.VALIDATION_NOUVEL_APPAREIL ?? "").trim().toLowerCase() === "true";
}

export function empreinteAppareil(identifiant) {
  return crypto.createHash("sha256").update(String(identifiant)).digest("hex");
}

function optionsCookieAppareil() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: DUREE_COOKIE_MS,
  };
}

/**
 * Empreinte de l'appareil de la requête. Navigateur sans cookie : un
 * identifiant est créé et posé en cookie (si `res` est fourni).
 * @returns {string|null}
 */
export function appareilDeLaRequete(req, res = null) {
  const entete = req?.get?.(ENTETE_APPAREIL) ?? req?.headers?.[ENTETE_APPAREIL];
  if (typeof entete === "string" && FORMAT_IDENTIFIANT.test(entete)) return empreinteAppareil(entete);

  const cookie = req?.cookies?.[NOM_COOKIE_APPAREIL];
  if (typeof cookie === "string" && FORMAT_IDENTIFIANT.test(cookie)) return empreinteAppareil(cookie);

  if (!res || typeof res.cookie !== "function") return null;
  const nouveau = crypto.randomBytes(24).toString("base64url");
  res.cookie(NOM_COOKIE_APPAREIL, nouveau, optionsCookieAppareil());
  // Requêtes suivantes du même traitement : même identifiant.
  if (req.cookies) req.cookies[NOM_COOKIE_APPAREIL] = nouveau;
  else req.cookies = { [NOM_COOKIE_APPAREIL]: nouveau };
  return empreinteAppareil(nouveau);
}

export async function estAppareilDeConfiance(utilisateur_id, empreinte) {
  if (!empreinte) return false;
  const appareil = await prisma.appareilConfiance.findUnique({
    where: { utilisateur_id_empreinte: { utilisateur_id, empreinte } },
    select: { appareil_confiance_id: true },
  });
  return Boolean(appareil);
}

/** Enregistre (ou rafraîchit) un appareil de confiance. Ne lève jamais. */
export async function faireConfianceAppareil({ utilisateur_id, empreinte, mobile = false, libelle = null, valide_par }) {
  if (!utilisateur_id || !empreinte) return;
  try {
    await prisma.appareilConfiance.upsert({
      where: { utilisateur_id_empreinte: { utilisateur_id, empreinte } },
      update: { derniere_utilisation: new Date() },
      create: { utilisateur_id, empreinte, mobile, libelle: libelle?.slice(0, 255) ?? null, valide_par },
    });
  } catch (err) {
    console.error("[appareil] enregistrement impossible :", err?.message ?? err);
  }
}

/** Appareil de la requête : confiance accordée (raccourci pour les contrôleurs). */
export function faireConfianceAppareilRequete(req, res, utilisateur_id, valide_par) {
  return faireConfianceAppareil({
    utilisateur_id,
    empreinte: appareilDeLaRequete(req, res),
    mobile: estClientMobile(req),
    libelle: req.headers?.["user-agent"] ?? null,
    valide_par,
  });
}

/**
 * Une application mobile est-elle connectée sur un AUTRE appareil que
 * celui-ci ? (session active, non expirée)
 */
export async function autreApplicationConnectee(utilisateur_id, empreinte) {
  const n = await prisma.refreshToken.count({
    where: {
      utilisateur_id,
      statut: "actif",
      date_expiration: { gt: new Date() },
      // Sessions antérieures à la colonne « mobile » : User-Agent Dart.
      OR: [{ mobile: true }, { user_agent: { startsWith: "Dart/" } }],
      ...(empreinte && { NOT: { appareil_empreinte: empreinte } }),
    },
  });
  return n > 0;
}

/**
 * À appeler une fois les identifiants vérifiés, juste avant d'ouvrir la
 * session. Rend null si la session peut s'ouvrir, sinon la réponse
 * « appareil à valider » (token restreint + moyens proposés).
 */
export async function controlerAppareil(req, res, utilisateur, { pinVerifie = false } = {}) {
  const empreinte = appareilDeLaRequete(req, res);
  if (!validationAppareilActive()) return null;
  if (ROLES_SANS_PIN.has(utilisateur.role?.libelle)) return null;
  // Sans numéro de connexion (ancien compte email seul) : aucun moyen de
  // validation ; il devra créer son PIN (proposé après connexion).
  if (!utilisateur.telephone_connexion) return null;
  if (await estAppareilDeConfiance(utilisateur.utilisateur_id, empreinte)) return null;

  const methodes = [];
  if (await autreApplicationConnectee(utilisateur.utilisateur_id, empreinte)) methodes.push("application");
  if (await whatsappInverseActif()) methodes.push("whatsapp");
  if (!methodes.length) {
    // Aucun moyen disponible : on ne bloque pas le compte.
    await faireConfianceAppareilRequete(req, res, utilisateur.utilisateur_id, "sans_moyen");
    return null;
  }

  const { token, date_expiration } = genererTokenValidationAppareil(utilisateur, { empreinte, pinVerifie });
  return {
    message: "Nouvel appareil : confirmez que c'est bien vous.",
    appareil_a_valider: true,
    token_validation_appareil: token,
    token_validation_appareil_expire_le: date_expiration,
    methodes,
    telephone_masque: masquerTelephone(utilisateur.telephone_connexion),
  };
}
