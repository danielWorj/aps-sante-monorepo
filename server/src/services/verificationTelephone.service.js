// src/services/verificationTelephone.service.js
// Vérification de numéro de téléphone par code à usage unique (OTP), par
// SMS (Twilio) ou WhatsApp (modèle d'authentification Meta).
//
// Parcours :
//   1. demanderCodeVerification  -> un code de 6 chiffres est envoyé ;
//   2. verifierCodeVerification  -> le code saisi est contrôlé ; en cas de
//      succès on rend une `preuve` (identifiant opaque) ;
//   3. consommerPreuveTelephone  -> appelé par le service métier
//      (inscription, réinitialisation…) pour s'assurer, UNE seule fois,
//      que le numéro a bien été vérifié pour cet objet.
//
// Protections :
//   - le code n'est jamais stocké en clair (HMAC lié au numéro et à l'objet),
//     ni dans le journal des SMS / WhatsApp (masqué) ;
//   - nouveau code : délai minimal entre deux demandes, plafond par numéro
//     sur 24 h et par adresse IP sur 1 h ; un nouveau code annule le précédent ;
//   - nombre d'essais limité par code ; expiration courte ;
//   - pays autorisés (SMS_PAYS_AUTORISES) : voir sms.service.js.
//
// Paramètres (variables d'environnement, valeurs par défaut entre parenthèses) :
//   VERIFICATION_CODE_SECRET (éphémère)       clé HMAC des codes — à fixer en production
//   VERIFICATION_CODE_LONGUEUR (6)            VERIFICATION_CODE_VALIDITE_MIN (10)
//   VERIFICATION_TENTATIVES_MAX (5)           VERIFICATION_DELAI_RENVOI_S (60)
//   VERIFICATION_MAX_PAR_NUMERO_JOUR (5)      VERIFICATION_MAX_PAR_IP_HEURE (10)
//   VERIFICATION_PREUVE_VALIDITE_MIN (30)     WHATSAPP_MODELE_CODE_VERIFICATION (code_verification)

import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { normaliserNumeroInternational } from "../lib/telephone.js";
import { destinationSmsAutorisee, envoyerSms, ErreurSms } from "./sms.service.js";
import { envoyerWhatsapp } from "./whatsapp.service.js";

export { ErreurSms };

const nombre = (nom, defaut) => {
  const v = Number(process.env[nom]);
  return Number.isFinite(v) && v > 0 ? v : defaut;
};

const LONGUEUR = Math.min(Math.max(nombre("VERIFICATION_CODE_LONGUEUR", 6), 4), 8);
const VALIDITE_MIN = nombre("VERIFICATION_CODE_VALIDITE_MIN", 10);
const TENTATIVES_MAX = nombre("VERIFICATION_TENTATIVES_MAX", 5);
const DELAI_RENVOI_S = nombre("VERIFICATION_DELAI_RENVOI_S", 60);
const MAX_PAR_NUMERO_JOUR = nombre("VERIFICATION_MAX_PAR_NUMERO_JOUR", 5);
const MAX_PAR_IP_HEURE = nombre("VERIFICATION_MAX_PAR_IP_HEURE", 10);
const PREUVE_VALIDITE_MIN = nombre("VERIFICATION_PREUVE_VALIDITE_MIN", 30);
const CONSERVATION_JOURS = 30;

export const OBJETS_VERIFICATION = ["inscription", "connexion", "reinitialisation_mot_de_passe", "changement_telephone"];
export const CANAUX_VERIFICATION = ["sms", "whatsapp"];

// Secret éphémère sans configuration : les codes en cours deviennent
// invalides à chaque redémarrage (l'utilisateur en redemande un), rien de plus.
const SECRET = process.env.VERIFICATION_CODE_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.VERIFICATION_CODE_SECRET && process.env.NODE_ENV === "production") {
  console.warn("[verification] VERIFICATION_CODE_SECRET absent : secret éphémère, les codes en cours sont perdus à chaque redémarrage.");
}

const hacher = (telephone, objet, code) =>
  crypto.createHmac("sha256", SECRET).update(`${telephone}:${objet}:${code}`).digest("hex");

const egaux = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function genererCode() {
  return String(crypto.randomInt(0, 10 ** LONGUEUR)).padStart(LONGUEUR, "0");
}

/** « +2376••••••42 » : numéro reconnaissable sans être lisible en entier. */
export function masquerTelephone(numero) {
  const s = String(numero);
  return `+${s.slice(0, 4)}${"•".repeat(Math.max(s.length - 6, 0))}${s.slice(-2)}`;
}

function normaliser(telephone, pays_iso2) {
  const numero = normaliserNumeroInternational(telephone, pays_iso2);
  if (!numero) throw new ErreurSms("Numéro de téléphone invalide.", 400, "TELEPHONE_INVALIDE");
  return numero;
}

function controlerObjet(objet) {
  if (!OBJETS_VERIFICATION.includes(objet)) {
    throw new ErreurSms(`objet invalide (${OBJETS_VERIFICATION.join(", ")}).`, 400, "OBJET_INVALIDE");
  }
}

function texteCode(code) {
  return `${code} est votre code de vérification APS Santé. Il expire dans ${VALIDITE_MIN} min. Ne le communiquez à personne.`;
}

/** Envoie le code ; rend { message_sms_id?, envoye } sans jamais lever sur un échec d'envoi. */
async function envoyerCode({ canal, numero, code }) {
  if (canal === "sms") {
    const r = await envoyerSms({
      destinataire: `+${numero}`,
      texte: texteCode(code),
      texte_journal: texteCode("•".repeat(LONGUEUR)),
      origine: "code_verification",
    });
    return { message_sms_id: r.message_sms_id, envoye: r.statut !== "echec" };
  }

  // WhatsApp : modèle de catégorie « Authentification » approuvé chez Meta
  // (corps {{1}} = code, bouton « Copier le code » = code).
  const r = await envoyerWhatsapp({
    destinataire: `+${numero}`,
    origine: "code_verification",
    modele: {
      nom: process.env.WHATSAPP_MODELE_CODE_VERIFICATION || "code_verification",
      langue: "fr",
      composants: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
      ],
    },
  });
  // Le journal WhatsApp ne doit pas garder le code (ni le renvoyer en relance).
  await prisma.messageWhatsapp
    .update({
      where: { message_whatsapp_id: r.message_whatsapp_id },
      data: { contenu: { nom: process.env.WHATSAPP_MODELE_CODE_VERIFICATION || "code_verification", masque: true }, relancable: false },
    })
    .catch(() => {});
  return { envoye: r.statut !== "echec" };
}

/**
 * Envoie un code de vérification au numéro.
 *
 * @param {object} p
 * @param {string} p.telephone        numéro saisi (international, ou local avec `pays_iso2`)
 * @param {string} [p.pays_iso2]      ex. "CM"
 * @param {string} p.objet            inscription | connexion | reinitialisation_mot_de_passe | changement_telephone
 * @param {"sms"|"whatsapp"} [p.canal]
 * @param {string} [p.adresse_ip]
 * @returns {Promise<{ telephone_masque: string, canal: string, expire_le: Date, delai_renvoi_s: number }>}
 * @throws {ErreurSms} saisie invalide (400), trop de demandes (429), envoi impossible (502)
 */
export async function demanderCodeVerification({ telephone, pays_iso2 = null, objet, canal = "sms", adresse_ip = null } = {}) {
  controlerObjet(objet);
  if (!CANAUX_VERIFICATION.includes(canal)) throw new ErreurSms("canal invalide (sms ou whatsapp).", 400, "CANAL_INVALIDE");
  const numero = normaliser(telephone, pays_iso2);
  if (!destinationSmsAutorisee(numero)) {
    throw new ErreurSms("La vérification n'est pas encore ouverte pour ce pays.", 400, "PAYS_NON_AUTORISE");
  }

  const maintenant = Date.now();
  const dernier = await prisma.codeVerification.findFirst({
    where: { telephone: numero, objet },
    orderBy: { date_creation: "desc" },
    select: { date_creation: true },
  });
  const ecoule = dernier ? (maintenant - dernier.date_creation.getTime()) / 1000 : Infinity;
  if (ecoule < DELAI_RENVOI_S) {
    const attente = Math.ceil(DELAI_RENVOI_S - ecoule);
    throw Object.assign(new ErreurSms(`Patientez ${attente} s avant de demander un nouveau code.`, 429, "RENVOI_TROP_TOT"), { attente_s: attente });
  }

  const [parNumero, parIp] = await Promise.all([
    prisma.codeVerification.count({ where: { telephone: numero, date_creation: { gte: new Date(maintenant - 86_400_000) } } }),
    adresse_ip
      ? prisma.codeVerification.count({ where: { adresse_ip, date_creation: { gte: new Date(maintenant - 3_600_000) } } })
      : 0,
  ]);
  if (parNumero >= MAX_PAR_NUMERO_JOUR || parIp >= MAX_PAR_IP_HEURE) {
    throw new ErreurSms("Trop de codes demandés. Réessayez plus tard.", 429, "TROP_DE_CODES");
  }

  // Un seul code valable à la fois pour ce numéro et cet objet.
  await prisma.codeVerification.updateMany({
    where: { telephone: numero, objet, verifie_le: null, expire_le: { gt: new Date(maintenant) } },
    data: { expire_le: new Date(maintenant) },
  });

  const code = genererCode();
  const expire_le = new Date(maintenant + VALIDITE_MIN * 60_000);
  const ligne = await prisma.codeVerification.create({
    data: { telephone: numero, objet, canal, code_hache: hacher(numero, objet, code), expire_le, adresse_ip },
  });

  const envoi = await envoyerCode({ canal, numero, code });
  await prisma.codeVerification.update({
    where: { code_verification_id: ligne.code_verification_id },
    data: { ...(envoi.message_sms_id && { message_sms_id: envoi.message_sms_id }), ...(!envoi.envoye && { expire_le: new Date() }) },
  });
  if (!envoi.envoye) {
    throw new ErreurSms(
      canal === "sms"
        ? "Le SMS n'a pas pu être envoyé. Réessayez dans un instant ou choisissez WhatsApp."
        : "Le message WhatsApp n'a pas pu être envoyé. Réessayez ou choisissez le SMS.",
      502,
      "ENVOI_IMPOSSIBLE"
    );
  }

  return { telephone_masque: masquerTelephone(numero), canal, expire_le, delai_renvoi_s: DELAI_RENVOI_S };
}

/**
 * Contrôle le code saisi.
 * @returns {Promise<{ preuve: string, telephone: string, preuve_expire_le: Date }>}
 * @throws {ErreurSms} code expiré (400), incorrect (400), trop d'essais (429)
 */
export async function verifierCodeVerification({ telephone, pays_iso2 = null, objet, code } = {}) {
  controlerObjet(objet);
  const numero = normaliser(telephone, pays_iso2);
  const saisi = String(code ?? "").replace(/\D/g, "");
  if (saisi.length !== LONGUEUR) throw new ErreurSms(`Le code comporte ${LONGUEUR} chiffres.`, 400, "CODE_INVALIDE");

  const ligne = await prisma.codeVerification.findFirst({
    where: { telephone: numero, objet, verifie_le: null, expire_le: { gt: new Date() } },
    orderBy: { date_creation: "desc" },
  });
  if (!ligne) throw new ErreurSms("Ce code a expiré. Demandez-en un nouveau.", 400, "CODE_EXPIRE");

  // Essai compté AVANT la comparaison, de façon atomique (essais parallèles).
  const essaisAvant = ligne.tentatives;
  const { count } = await prisma.codeVerification.updateMany({
    where: { code_verification_id: ligne.code_verification_id, tentatives: { lt: TENTATIVES_MAX }, verifie_le: null },
    data: { tentatives: { increment: 1 } },
  });
  if (count === 0) {
    throw new ErreurSms("Trop d'essais. Demandez un nouveau code.", 429, "TROP_DE_TENTATIVES");
  }

  if (!egaux(hacher(numero, objet, saisi), ligne.code_hache)) {
    const restants = TENTATIVES_MAX - essaisAvant - 1;
    throw Object.assign(
      new ErreurSms(restants > 0 ? `Code incorrect. ${restants} essai(s) restant(s).` : "Code incorrect. Demandez un nouveau code.", 400, "CODE_INCORRECT"),
      { tentatives_restantes: Math.max(restants, 0) }
    );
  }

  const verifie_le = new Date();
  await prisma.codeVerification.update({ where: { code_verification_id: ligne.code_verification_id }, data: { verifie_le } });
  return {
    preuve: ligne.code_verification_id,
    telephone: numero,
    preuve_expire_le: new Date(verifie_le.getTime() + PREUVE_VALIDITE_MIN * 60_000),
  };
}

/**
 * À appeler par le service métier : vérifie et CONSOMME la preuve (usage
 * unique). À faire dans la même transaction que l'opération métier si
 * possible (passer `client` = tx).
 * @returns {Promise<string>} le numéro vérifié (international sans « + »)
 * @throws {ErreurSms} preuve invalide, expirée, déjà utilisée ou pour un autre numéro (400)
 */
export async function consommerPreuveTelephone({ preuve, objet, telephone = null, pays_iso2 = null, client = prisma } = {}) {
  controlerObjet(objet);
  const invalide = new ErreurSms("La vérification du numéro a expiré. Recommencez.", 400, "PREUVE_INVALIDE");
  if (typeof preuve !== "string" || !/^[0-9a-f-]{36}$/i.test(preuve)) throw invalide;

  const ligne = await client.codeVerification.findUnique({ where: { code_verification_id: preuve } });
  if (!ligne || ligne.objet !== objet || !ligne.verifie_le) throw invalide;
  if (telephone !== null && normaliserNumeroInternational(telephone, pays_iso2) !== ligne.telephone) throw invalide;

  const { count } = await client.codeVerification.updateMany({
    where: {
      code_verification_id: preuve,
      consomme_le: null,
      verifie_le: { gte: new Date(Date.now() - PREUVE_VALIDITE_MIN * 60_000) },
    },
    data: { consomme_le: new Date() },
  });
  if (count !== 1) throw invalide;
  return ligne.telephone;
}

/** Job : supprime les codes de plus de 30 jours. */
export async function purgerCodesVerification() {
  const { count } = await prisma.codeVerification.deleteMany({
    where: { date_creation: { lt: new Date(Date.now() - CONSERVATION_JOURS * 86_400_000) } },
  });
  return count;
}
