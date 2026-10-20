// src/services/sms.service.js
// SMS — POINT UNIQUE d'envoi, à utiliser par tous les services métier
// (jamais lib/twilioSmsService.js directement). Même contrat que
// whatsapp.service.js :
//   - journal : chaque envoi laisse une ligne message_sms (statut, identifiant
//     Twilio, erreur), consultable au back-office ;
//   - idempotence : avec une `cle` (événement + destinataire), un même SMS
//     n'est jamais envoyé deux fois, même si l'appelant est rejoué ;
//   - aucune exception sur un échec d'envoi : le résultat porte
//     `statut: "echec"`. Un SMS ne doit JAMAIS défaire une opération métier
//     déjà validée. Seule une saisie invalide de l'appelant lève ErreurSms ;
//   - relance : les échecs transitoires sont réessayés par le job
//     (relancerMessagesSms), sauf les SMS confidentiels (codes) ;
//   - mode test (SMS_MODE=test, valeur par défaut) : rien n'est envoyé ni
//     facturé, le texte s'affiche dans la console du serveur (statut
//     « simule »). Passer SMS_MODE=reel en production ;
//   - pays autorisés (SMS_PAYS_AUTORISES, défaut CM) : protège la facture
//     contre l'envoi massif vers des numéros surtaxés (« SMS pumping »).
//
// Appeler APRÈS la validation de la transaction métier, jamais dedans.
// Exemple :
//
//   import { envoyerSmsUtilisateur } from "./sms.service.js";
//   await envoyerSmsUtilisateur({
//     utilisateur_id: rdv.patient.utilisateur_id,
//     origine: "rdv_rappel",
//     cle: `rdv_rappel:${rdv.rdv_id}:${rdv.patient.utilisateur_id}`,
//     texte: `APS Santé : rappel de votre RDV demain à ${heure}.`,
//   });

import prisma from "../lib/prisma.js";
import { INDICATIFS_PAYS, normaliserNumeroInternational } from "../lib/telephone.js";
import { envoyerSmsTwilio, messageErreurTwilio, SmsError } from "../lib/twilioSmsService.js";

export class ErreurSms extends Error {
  constructor(message, status = 400, code = "SMS_INVALIDE") {
    super(message);
    this.name = "ErreurSms";
    this.status = status;
    this.code = code;
  }
}

const LONGUEUR_MAX_TEXTE = 1600; // limite Twilio (10 segments)
const LONGUEUR_MAX_ORIGINE = 60;
const LONGUEUR_MAX_CLE = 200;

export const RELANCE_MAX_TENTATIVES = Number(process.env.SMS_RELANCE_MAX_TENTATIVES ?? 3);
export const RELANCE_FENETRE_H = Number(process.env.SMS_RELANCE_FENETRE_H ?? 6);

// SMS dont le texte journalisé est masqué (code de vérification) : ils ne
// peuvent être ni relancés par le job ni renvoyés à la main.
export const ORIGINES_CONFIDENTIELLES = new Set(["code_verification"]);

const CODES_RELANCABLES = new Set(["NON_CONFIGURE"]);

/** "test" (défaut : rien n'est envoyé) ou "reel". */
export function modeSms() {
  return String(process.env.SMS_MODE ?? "test").trim().toLowerCase() === "reel" ? "reel" : "test";
}

/** Pays (ISO2) vers lesquels l'envoi est permis. */
export function paysSmsAutorises() {
  return String(process.env.SMS_PAYS_AUTORISES ?? "CM")
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter((p) => INDICATIFS_PAYS[p]);
}

/** true si le numéro international (sans « + ») appartient à un pays autorisé. */
export function destinationSmsAutorisee(numero) {
  return paysSmsAutorises().some((p) => numero.startsWith(INDICATIFS_PAYS[p]));
}

function resultat(message, deja_traite = false) {
  return {
    message_sms_id: message.message_sms_id,
    statut: message.statut,
    identifiant_fournisseur: message.identifiant_fournisseur ?? null,
    erreur_code: message.erreur_code ?? null,
    erreur: message.erreur ?? null,
    deja_traite,
  };
}

/**
 * Appelle Twilio (ou simule) pour un message journalisé en_attente et
 * enregistre l'issue. Ne lève jamais d'exception sur un échec d'envoi.
 * @param {object} message   ligne message_sms
 * @param {string} texte     texte réellement envoyé (peut différer du texte journalisé)
 */
async function tenterEnvoi(message, texte = message.texte) {
  const confidentiel = ORIGINES_CONFIDENTIELLES.has(message.origine);
  let maj;
  if (modeSms() === "test") {
    console.info(`[sms] (SMS_MODE=test, non envoyé) à +${message.destinataire} : ${texte}`);
    maj = { statut: "simule", erreur_code: null, erreur: null, relancable: false, date_envoi: new Date() };
  } else {
    try {
      const envoi = await envoyerSmsTwilio({ destinataire: message.destinataire, texte });
      maj = {
        statut: "envoye", identifiant_fournisseur: envoi.identifiant, segments: envoi.segments,
        erreur_code: null, erreur: null, relancable: false, date_envoi: new Date(),
      };
    } catch (err) {
      const connue = err instanceof SmsError;
      if (!connue) console.error("[sms] Erreur inattendue à l'envoi :", err);
      maj = {
        statut: "echec",
        erreur_code: connue ? err.code : "INTERNE",
        erreur: connue ? err.message : "Erreur interne lors de l'envoi.",
        relancable: !confidentiel && (connue ? err.transitoire || CODES_RELANCABLES.has(err.code) : true),
      };
    }
  }

  return prisma.messageSms.update({
    where: { message_sms_id: message.message_sms_id },
    data: { ...maj, tentatives: { increment: 1 } },
  });
}

/** Passage atomique echec -> en_attente : un seul processus renvoie le message. */
async function reprendreMessageEnEchec(message_sms_id) {
  const { count } = await prisma.messageSms.updateMany({
    where: { message_sms_id, statut: "echec" },
    data: { statut: "en_attente" },
  });
  return count === 1 ? prisma.messageSms.findUnique({ where: { message_sms_id } }) : null;
}

/**
 * Envoie un SMS à un numéro.
 *
 * @param {object} p
 * @param {string} p.destinataire     numéro (international, ou local avec `pays_iso2`)
 * @param {string} [p.pays_iso2]      pays servant à compléter un numéro local (ex. "CM")
 * @param {string} p.texte            texte envoyé (1600 caractères maximum)
 * @param {string} [p.texte_journal]  texte enregistré à la place (ex. code masqué)
 * @param {string} p.origine          service émetteur, pour le journal (ex. "rdv_rappel")
 * @param {string} [p.cle]            clé d'idempotence (événement + destinataire)
 * @param {string} [p.utilisateur_id] destinataire connu, pour le journal
 * @returns {Promise<{ message_sms_id: string, statut: "envoye"|"simule"|"echec"|"en_attente"|"delivre",
 *   identifiant_fournisseur: string|null, erreur_code: string|null, erreur: string|null, deja_traite: boolean }>}
 * @throws {ErreurSms} uniquement si les paramètres sont invalides ou la destination interdite
 */
export async function envoyerSms({ destinataire, pays_iso2 = null, texte, texte_journal, origine, cle = null, utilisateur_id = null } = {}) {
  if (typeof origine !== "string" || !origine.trim() || origine.length > LONGUEUR_MAX_ORIGINE) {
    throw new ErreurSms(`origine requise (${LONGUEUR_MAX_ORIGINE} caractères maximum).`);
  }
  if (cle !== null && (typeof cle !== "string" || !cle || cle.length > LONGUEUR_MAX_CLE)) {
    throw new ErreurSms(`cle invalide (${LONGUEUR_MAX_CLE} caractères maximum).`);
  }
  if (typeof texte !== "string" || !texte.trim()) throw new ErreurSms("Le texte du SMS est vide.");
  if (texte.length > LONGUEUR_MAX_TEXTE) throw new ErreurSms(`Texte trop long (${LONGUEUR_MAX_TEXTE} caractères maximum).`);

  const numero = normaliserNumeroInternational(destinataire, pays_iso2);
  if (!numero) throw new ErreurSms("Numéro destinataire invalide.", 400, "DESTINATAIRE_INVALIDE");
  if (!destinationSmsAutorisee(numero)) {
    throw new ErreurSms("L'envoi de SMS vers ce pays n'est pas ouvert.", 400, "PAYS_NON_AUTORISE");
  }

  if (cle) {
    const existant = await prisma.messageSms.findUnique({ where: { cle } });
    if (existant) return renvoyerSiEchec(existant);
  }

  let message;
  try {
    message = await prisma.messageSms.create({
      data: { cle, origine: origine.trim(), destinataire: numero, utilisateur_id, texte: texte_journal ?? texte, statut: "en_attente" },
    });
  } catch (err) {
    // Deux appels simultanés avec la même clé : l'autre a gagné.
    if (err?.code === "P2002" && cle) {
      return resultat(await prisma.messageSms.findUnique({ where: { cle } }), true);
    }
    throw err;
  }

  return resultat(await tenterEnvoi(message, texte));
}

async function renvoyerSiEchec(existant) {
  if (existant.statut !== "echec" || ORIGINES_CONFIDENTIELLES.has(existant.origine)) return resultat(existant, true);
  const repris = await reprendreMessageEnEchec(existant.message_sms_id);
  if (!repris) return resultat(await prisma.messageSms.findUnique({ where: { message_sms_id: existant.message_sms_id } }), true);
  return resultat(await tenterEnvoi(repris));
}

/**
 * Envoie un SMS à un utilisateur de la plateforme (utilisateur.telephone,
 * complété avec l'indicatif de son pays). Sans téléphone exploitable ou vers
 * un pays non ouvert, rien n'est envoyé ni journalisé.
 * @returns {Promise<object>} résultat de envoyerSms, ou { statut: "ignore", raison }
 */
export async function envoyerSmsUtilisateur({ utilisateur_id, ...reste } = {}) {
  if (!utilisateur_id) throw new ErreurSms("utilisateur_id requis.");
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { utilisateur_id },
    select: { telephone: true, pays: { select: { code_iso2: true } } },
  });
  if (!utilisateur) return { statut: "ignore", raison: "UTILISATEUR_INTROUVABLE" };

  const numero = normaliserNumeroInternational(utilisateur.telephone, utilisateur.pays?.code_iso2);
  if (!numero) return { statut: "ignore", raison: utilisateur.telephone ? "TELEPHONE_INVALIDE" : "SANS_TELEPHONE" };
  if (!destinationSmsAutorisee(numero)) return { statut: "ignore", raison: "PAYS_NON_AUTORISE" };

  return envoyerSms({ ...reste, destinataire: `+${numero}`, pays_iso2: null, utilisateur_id });
}

/**
 * Job : réessaie les échecs relançables récents.
 * @returns {Promise<{ envoyes: number, echecs: number }>}
 */
export async function relancerMessagesSms({ limite = 50 } = {}) {
  const depuis = new Date(Date.now() - RELANCE_FENETRE_H * 3_600_000);
  const candidats = await prisma.messageSms.findMany({
    where: { statut: "echec", relancable: true, tentatives: { lt: RELANCE_MAX_TENTATIVES }, date_creation: { gte: depuis } },
    orderBy: { date_creation: "asc" },
    take: limite,
    select: { message_sms_id: true },
  });

  let envoyes = 0;
  let echecs = 0;
  for (const { message_sms_id } of candidats) {
    try {
      const repris = await reprendreMessageEnEchec(message_sms_id);
      if (!repris) continue;
      const fin = await tenterEnvoi(repris);
      if (fin.statut === "echec") echecs += 1;
      else envoyes += 1;
    } catch (err) {
      echecs += 1;
      console.error(`[sms] Relance impossible du message ${message_sms_id} :`, err);
    }
  }
  return { envoyes, echecs };
}

/**
 * Renvoi manuel depuis le back-office d'un SMS en échec.
 * @throws {ErreurSms} introuvable (404), pas en échec ou confidentiel (409)
 */
export async function renvoyerMessageSms(message_sms_id) {
  const message = await prisma.messageSms.findUnique({ where: { message_sms_id } });
  if (!message) throw new ErreurSms("SMS introuvable.", 404, "MESSAGE_SMS_INTROUVABLE");
  if (ORIGINES_CONFIDENTIELLES.has(message.origine)) {
    throw new ErreurSms("Un code de vérification ne se renvoie pas : l'utilisateur doit en demander un nouveau.", 409, "MESSAGE_SMS_CONFIDENTIEL");
  }
  if (message.statut !== "echec") throw new ErreurSms("Seul un SMS en échec peut être renvoyé.", 409, "MESSAGE_SMS_NON_ECHOUE");
  const repris = await reprendreMessageEnEchec(message_sms_id);
  if (!repris) throw new ErreurSms("Ce SMS est déjà en cours de renvoi.", 409, "MESSAGE_SMS_EN_COURS");
  return resultat(await tenterEnvoi(repris));
}

// Statuts Twilio -> statut du journal. queued/accepted/sending/sent : déjà « envoye ».
const STATUTS_FINAUX = { delivered: "delivre", undelivered: "echec", failed: "echec" };

/**
 * Rappel de statut Twilio (webhook) : remise confirmée ou échec de remise.
 * Ne fait jamais régresser un SMS déjà délivré. Message inconnu : ignoré.
 * @param {{ MessageSid?: string, MessageStatus?: string, ErrorCode?: string }} p
 * @returns {Promise<boolean>} true si le journal a été mis à jour
 */
export async function traiterStatutSmsTwilio({ MessageSid, MessageStatus, ErrorCode } = {}) {
  const statut = STATUTS_FINAUX[String(MessageStatus ?? "").toLowerCase()];
  if (!MessageSid || !statut) return false;
  const code = ErrorCode ? String(ErrorCode) : null;
  const { count } = await prisma.messageSms.updateMany({
    where: { identifiant_fournisseur: String(MessageSid), statut: { in: ["envoye", "en_attente"] } },
    data: {
      statut,
      date_statut: new Date(),
      ...(statut === "echec" && {
        erreur_code: code ?? "NON_DELIVRE",
        erreur: messageErreurTwilio(code) ?? "SMS non délivré par l'opérateur.",
        relancable: false,
      }),
    },
  });
  return count > 0;
}

/**
 * Journal des envois, du plus récent au plus ancien, paginé.
 * @param {{ statut?: string, origine?: string, recherche?: string, page?: number, taille?: number }} filtres
 */
export async function listerMessagesSms({ statut, origine, recherche, page = 1, taille = 50 } = {}) {
  const where = {
    ...(statut && { statut }),
    ...(origine && { origine }),
    ...(recherche && { destinataire: { contains: String(recherche).replace(/\D/g, "") } }),
  };
  const [total, messages] = await Promise.all([
    prisma.messageSms.count({ where }),
    prisma.messageSms.findMany({
      where,
      orderBy: { date_creation: "desc" },
      skip: (page - 1) * taille,
      take: taille,
      include: { utilisateur: { select: { utilisateur_id: true, nom: true, prenom: true } } },
    }),
  ]);
  return { total, page, taille, messages };
}
