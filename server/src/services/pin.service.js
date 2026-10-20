// src/services/pin.service.js
// Connexion numéro + code PIN (parcours B de la conception « sécurisation
// de la connexion », révision 3). L'email + mot de passe reste disponible
// à côté (authentification.controller.js).
//
// Règles :
//   - le numéro de connexion (utilisateur.telephone_connexion) est unique,
//     normalisé au format international sans « + » ;
//   - PIN de 6 chiffres, haché (bcrypt), refusé s'il est trop évident ;
//   - 5 erreurs -> blocage du COMPTE (15 min, doublé à chaque blocage
//     successif, 24 h au plus), quel que soit l'appareil ou l'IP ;
//   - réponses génériques : « numéro ou code incorrect », que le numéro
//     existe ou non ;
//   - les administrateurs n'utilisent jamais le PIN (email + mot de passe) ;
//   - un PIN provisoire (compte créé par un administrateur) doit être
//     changé à la première connexion.

import bcrypt from "bcrypt";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { normaliserNumeroInternational } from "../lib/telephone.js";
import { SALT_ROUNDS } from "./compte.service.js";
import { consommerPreuveTelephone } from "./verificationTelephone.service.js";

/* ------------------- Vérification du numéro par code ------------------- */
// Activée par VERIFICATION_TELEPHONE_ACTIVE=true dès qu'un canal d'envoi
// (SMS Twilio et/ou WhatsApp) est ouvert. Tant qu'elle est coupée, les
// numéros restent « non vérifiés » et aucun code n'est demandé.

export function verificationTelephoneActive() {
  return String(process.env.VERIFICATION_TELEPHONE_ACTIVE ?? "").trim().toLowerCase() === "true";
}

/** Canaux proposés pour recevoir le code (VERIFICATION_CANAUX, défaut « sms »). */
export function canauxVerification() {
  const canaux = String(process.env.VERIFICATION_CANAUX ?? "sms").split(",").map((c) => c.trim()).filter((c) => ["sms", "whatsapp"].includes(c));
  return canaux.length ? canaux : ["sms"];
}

/** Consomme la preuve de numéro exigée quand la vérification est active. */
async function exigerPreuve(preuve, objet, numero) {
  if (!preuve) {
    throw new ErreurPin("Confirmez d'abord votre numéro avec le code reçu.", 400, "PREUVE_TELEPHONE_REQUISE");
  }
  await consommerPreuveTelephone({ preuve, objet, telephone: `+${numero}` });
}

export const LONGUEUR_PIN = 6;
export const ESSAIS_PIN_MAX = 5;
const BLOCAGE_BASE_MIN = 15;
const BLOCAGE_MAX_MIN = 24 * 60;
export const ROLES_SANS_PIN = new Set(["admin", "superadmin"]);

// Hachage factice : comparé quand le compte n'existe pas, pour que le temps
// de réponse ne révèle pas si un numéro est inscrit.
const HASH_FACTICE = bcrypt.hashSync(crypto.randomBytes(8).toString("hex"), SALT_ROUNDS);

export class ErreurPin extends Error {
  constructor(message, status = 400, code = "PIN_INVALIDE", extra = {}) {
    super(message);
    this.name = "ErreurPin";
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

const MESSAGE_IDENTIFIANTS = "Numéro ou code PIN incorrect.";

/* ------------------------------ Validation ------------------------------ */

function estSuite(pin) {
  const chiffres = [...pin].map(Number);
  const montant = chiffres.every((c, i) => i === 0 || c === (chiffres[i - 1] + 1) % 10);
  const descendant = chiffres.every((c, i) => i === 0 || c === (chiffres[i - 1] + 9) % 10);
  return montant || descendant;
}

// 111111, 121212, 123123 : motif court répété.
function estRepetition(pin) {
  return [1, 2, 3].some((p) => pin === pin.slice(0, p).repeat(LONGUEUR_PIN / p));
}

function formatsDate(date) {
  if (!date) return [];
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return [];
  const jj = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const aa = String(d.getUTCFullYear()).slice(-2);
  const aaaa = String(d.getUTCFullYear());
  return [`${jj}${mm}${aa}`, `${aa}${mm}${jj}`, `${mm}${jj}${aa}`, `${jj}${mm}${aaaa}`.slice(0, 6), aaaa + mm];
}

/**
 * Contrôle un PIN choisi par l'utilisateur.
 * @returns {string|null} message d'erreur, ou null si le PIN est acceptable
 */
export function controlerPin(pin, { telephone = null, date_naissance = null } = {}) {
  if (typeof pin !== "string" || !new RegExp(`^\\d{${LONGUEUR_PIN}}$`).test(pin)) {
    return `Le code PIN doit comporter exactement ${LONGUEUR_PIN} chiffres.`;
  }
  if (estRepetition(pin) || estSuite(pin)) {
    return "Ce code PIN est trop facile à deviner (suite ou répétition). Choisissez-en un autre.";
  }
  if (telephone && String(telephone).replace(/\D/g, "").endsWith(pin)) {
    return "Le code PIN ne doit pas reprendre la fin de votre numéro de téléphone.";
  }
  if (formatsDate(date_naissance).includes(pin)) {
    return "Le code PIN ne doit pas être votre date de naissance.";
  }
  return null;
}

/** PIN provisoire aléatoire, valide au sens de controlerPin. */
export function genererPinProvisoire() {
  for (;;) {
    const pin = String(crypto.randomInt(0, 10 ** LONGUEUR_PIN)).padStart(LONGUEUR_PIN, "0");
    if (!controlerPin(pin)) return pin;
  }
}

/**
 * Numéro saisi -> format international sans « + ». Un numéro local est
 * complété avec le pays fourni (code ISO2) ou, à défaut, celui du compte.
 */
export async function normaliserTelephoneConnexion(telephone, { pays_iso2 = null, pays_id = null } = {}) {
  let iso2 = pays_iso2;
  if (!iso2 && pays_id) {
    const pays = await prisma.pays.findUnique({ where: { pays_id }, select: { code_iso2: true } });
    iso2 = pays?.code_iso2 ?? null;
  }
  const numero = normaliserNumeroInternational(telephone, iso2);
  if (!numero) throw new ErreurPin("Numéro de téléphone invalide.", 400, "TELEPHONE_INVALIDE");
  return numero;
}

/* ------------------------------ Connexion ------------------------------ */

function dureeBlocageMin(nbBlocages) {
  return Math.min(BLOCAGE_BASE_MIN * 2 ** nbBlocages, BLOCAGE_MAX_MIN);
}

/**
 * Vérifie numéro + PIN. Compte le résultat (échecs, blocage).
 * @returns {Promise<object>} l'utilisateur (avec `role`)
 * @throws {ErreurPin} 400 saisie invalide, 401 identifiants incorrects,
 *   403 compte suspendu, 429 compte bloqué
 */
export async function verifierNumeroEtPin({ telephone, pays_iso2 = null, pin }) {
  if (typeof pin !== "string" || !/^\d+$/.test(pin)) {
    throw new ErreurPin("Saisissez votre code PIN.", 400, "PIN_REQUIS");
  }
  const numero = normaliserNumeroInternational(telephone, pays_iso2);
  if (!numero) throw new ErreurPin("Numéro de téléphone invalide.", 400, "TELEPHONE_INVALIDE");

  const utilisateur = await prisma.utilisateur.findUnique({
    where: { telephone_connexion: numero },
    include: { role: true },
  });

  if (!utilisateur || !utilisateur.pin_hash || ROLES_SANS_PIN.has(utilisateur.role?.libelle)) {
    await bcrypt.compare(pin, HASH_FACTICE);
    throw new ErreurPin(MESSAGE_IDENTIFIANTS, 401, "IDENTIFIANTS_INVALIDES");
  }
  return controlerPinDe(utilisateur, pin, MESSAGE_IDENTIFIANTS);
}

/**
 * Vérifie le PIN d'un compte déjà identifié (session ouverte : choix d'un
 * espace professionnel, action sensible, déverrouillage de l'application).
 * Même limite d'essais que la connexion.
 * @returns {Promise<object>} l'utilisateur (avec `role`)
 */
export async function verifierPinCompte(utilisateur_id, pin) {
  if (typeof pin !== "string" || !/^\d+$/.test(pin)) {
    throw new ErreurPin("Saisissez votre code PIN.", 400, "PIN_REQUIS");
  }
  const utilisateur = await prisma.utilisateur.findUnique({ where: { utilisateur_id }, include: { role: true } });
  if (!utilisateur) throw new ErreurPin("Utilisateur introuvable.", 404, "UTILISATEUR_INTROUVABLE");
  if (!utilisateur.pin_hash) {
    throw new ErreurPin("Créez d'abord votre code PIN.", 409, "PIN_A_CREER");
  }
  return controlerPinDe(utilisateur, pin, "Code PIN incorrect.");
}

/** Blocage, comparaison, compteur d'erreurs : commun à toutes les vérifications. */
async function controlerPinDe(utilisateur, pin, messageErreur) {
  const maintenant = new Date();
  if (utilisateur.pin_bloque_jusqu_au && utilisateur.pin_bloque_jusqu_au > maintenant) {
    const minutes = Math.ceil((utilisateur.pin_bloque_jusqu_au - maintenant) / 60_000);
    throw new ErreurPin(
      `Trop d'essais. Réessayez dans ${minutes} min, ou connectez-vous avec votre email et votre mot de passe.`,
      429,
      "PIN_BLOQUE",
      { minutes_restantes: minutes }
    );
  }

  const valide = await bcrypt.compare(pin, utilisateur.pin_hash);
  if (!valide) {
    // Incrément atomique : des essais parallèles ne contournent pas la limite.
    const maj = await prisma.utilisateur.update({
      where: { utilisateur_id: utilisateur.utilisateur_id },
      data: { pin_echecs: { increment: 1 } },
      select: { pin_echecs: true, pin_nb_blocages: true },
    });
    if (maj.pin_echecs >= ESSAIS_PIN_MAX) {
      const minutes = dureeBlocageMin(maj.pin_nb_blocages);
      await prisma.utilisateur.update({
        where: { utilisateur_id: utilisateur.utilisateur_id },
        data: {
          pin_echecs: 0,
          pin_nb_blocages: { increment: 1 },
          pin_bloque_jusqu_au: new Date(Date.now() + minutes * 60_000),
        },
      });
      throw new ErreurPin(
        `Trop d'essais. Réessayez dans ${minutes} min, ou connectez-vous avec votre email et votre mot de passe.`,
        429,
        "PIN_BLOQUE",
        { minutes_restantes: minutes }
      );
    }
    throw new ErreurPin(messageErreur, 401, "IDENTIFIANTS_INVALIDES", {
      essais_restants: ESSAIS_PIN_MAX - maj.pin_echecs,
    });
  }

  // Le statut n'est révélé qu'une fois le PIN confirmé (pas d'énumération).
  if (utilisateur.statut_compte === "suspendu") {
    throw new ErreurPin("Compte suspendu.", 403, "COMPTE_SUSPENDU");
  }

  if (utilisateur.pin_echecs || utilisateur.pin_nb_blocages || utilisateur.pin_bloque_jusqu_au) {
    return prisma.utilisateur.update({
      where: { utilisateur_id: utilisateur.utilisateur_id },
      data: { pin_echecs: 0, pin_nb_blocages: 0, pin_bloque_jusqu_au: null },
      include: { role: true },
    });
  }
  return utilisateur;
}

/* ---------------------------- Définir / changer ---------------------------- */

async function chargerCompte(utilisateur_id) {
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { utilisateur_id },
    include: { role: true, patient: { select: { date_naissance: true } } },
  });
  if (!utilisateur) throw new ErreurPin("Utilisateur introuvable.", 404, "UTILISATEUR_INTROUVABLE");
  if (ROLES_SANS_PIN.has(utilisateur.role?.libelle)) {
    throw new ErreurPin("Les comptes d'administration se connectent par email et mot de passe.", 403, "PIN_INTERDIT_ADMIN");
  }
  return utilisateur;
}

async function verifierNumeroLibre(numero, utilisateur_id) {
  const titulaire = await prisma.utilisateur.findUnique({
    where: { telephone_connexion: numero },
    select: { utilisateur_id: true },
  });
  if (titulaire && titulaire.utilisateur_id !== utilisateur_id) {
    throw new ErreurPin(
      "Ce numéro sert déjà à la connexion d'un autre compte. Utilisez un autre numéro ou contactez le support.",
      409,
      "TELEPHONE_DEJA_UTILISE"
    );
  }
}

/**
 * Premier PIN d'un compte existant (connecté par email + mot de passe), ou
 * nouveau numéro + nouveau PIN. Si un PIN existe déjà, `ancien_pin` est exigé.
 * @returns {Promise<object>} l'utilisateur mis à jour (avec `role`)
 */
export async function definirPin({ utilisateur_id, telephone, pays_iso2 = null, pin, ancien_pin = null, preuve_telephone = null }) {
  const utilisateur = await chargerCompte(utilisateur_id);

  if (utilisateur.pin_hash && !utilisateur.pin_provisoire) {
    if (typeof ancien_pin !== "string" || !(await bcrypt.compare(ancien_pin, utilisateur.pin_hash))) {
      throw new ErreurPin("Code PIN actuel incorrect.", 401, "ANCIEN_PIN_INCORRECT");
    }
  }

  const numero = await normaliserTelephoneConnexion(telephone ?? utilisateur.telephone_connexion ?? utilisateur.telephone, {
    pays_iso2,
    pays_id: utilisateur.pays_id,
  });
  const erreur = controlerPin(pin, { telephone: numero, date_naissance: utilisateur.patient?.date_naissance });
  if (erreur) throw new ErreurPin(erreur, 400, "PIN_TROP_FAIBLE");
  await verifierNumeroLibre(numero, utilisateur_id);

  const changementNumero = numero !== utilisateur.telephone_connexion;
  // Vérification active : nouveau numéro (ou numéro jamais vérifié) prouvé par code.
  let verifie = !changementNumero && utilisateur.telephone_verifie;
  if (verificationTelephoneActive() && !verifie) {
    await exigerPreuve(preuve_telephone, "changement_telephone", numero);
    verifie = true;
  }
  try {
    return await prisma.utilisateur.update({
      where: { utilisateur_id },
      data: {
        telephone_connexion: numero,
        telephone_verifie: verifie,
        ...(!utilisateur.telephone && { telephone: `+${numero}` }),
        pin_hash: await bcrypt.hash(pin, SALT_ROUNDS),
        pin_provisoire: false,
        pin_echecs: 0,
        pin_nb_blocages: 0,
        pin_bloque_jusqu_au: null,
      },
      include: { role: true },
    });
  } catch (err) {
    if (err?.code === "P2002") {
      throw new ErreurPin("Ce numéro sert déjà à la connexion d'un autre compte.", 409, "TELEPHONE_DEJA_UTILISE");
    }
    throw err;
  }
}

/**
 * Remplace un PIN provisoire (après connexion avec ce PIN provisoire).
 * @returns {Promise<object>} l'utilisateur mis à jour (avec `role`)
 */
export async function remplacerPinProvisoire({ utilisateur_id, pin }) {
  const utilisateur = await chargerCompte(utilisateur_id);
  if (!utilisateur.pin_provisoire) {
    throw new ErreurPin("Le code PIN de ce compte a déjà été choisi.", 409, "PIN_DEJA_DEFINI");
  }
  const erreur = controlerPin(pin, { telephone: utilisateur.telephone_connexion, date_naissance: utilisateur.patient?.date_naissance });
  if (erreur) throw new ErreurPin(erreur, 400, "PIN_TROP_FAIBLE");
  if (await bcrypt.compare(pin, utilisateur.pin_hash)) {
    throw new ErreurPin("Choisissez un code PIN différent du code provisoire.", 400, "PIN_IDENTIQUE");
  }
  return prisma.utilisateur.update({
    where: { utilisateur_id },
    data: { pin_hash: await bcrypt.hash(pin, SALT_ROUNDS), pin_provisoire: false },
    include: { role: true },
  });
}

/**
 * Données PIN à enregistrer pour un compte créé (inscription ou création
 * par un administrateur). Lève ErreurPin si le numéro est pris ou le PIN faible.
 * @returns {Promise<object>} champs Prisma à fusionner dans `data`
 */
export async function donneesPinCreation({ telephone, pays_id, pin, provisoire = false, date_naissance = null, preuve_telephone = null }) {
  const numero = await normaliserTelephoneConnexion(telephone, { pays_id });
  if (!provisoire) {
    const erreur = controlerPin(pin, { telephone: numero, date_naissance });
    if (erreur) throw new ErreurPin(erreur, 400, "PIN_TROP_FAIBLE");
  }
  await verifierNumeroLibre(numero, null);
  // Inscription libre-service : numéro prouvé par code quand la
  // vérification est active (pas pour un compte créé par un administrateur).
  let verifie = false;
  if (!provisoire && verificationTelephoneActive()) {
    await exigerPreuve(preuve_telephone, "inscription", numero);
    verifie = true;
  }
  return {
    telephone_connexion: numero,
    telephone_verifie: verifie,
    pin_hash: await bcrypt.hash(pin, SALT_ROUNDS),
    pin_provisoire: provisoire,
  };
}

/**
 * Code PIN oublié (vérification active) : numéro prouvé par code, puis
 * nouveau PIN. Débloque le compte.
 * @returns {Promise<object>} l'utilisateur mis à jour (avec `role`)
 */
export async function reinitialiserPin({ telephone, pays_iso2 = null, preuve_telephone, nouveau_pin }) {
  if (!verificationTelephoneActive()) {
    throw new ErreurPin("La réinitialisation par code n'est pas encore disponible : connectez-vous avec votre email.", 503, "VERIFICATION_INACTIVE");
  }
  const numero = normaliserNumeroInternational(telephone, pays_iso2);
  if (!numero) throw new ErreurPin("Numéro de téléphone invalide.", 400, "TELEPHONE_INVALIDE");
  await exigerPreuve(preuve_telephone, "reinitialisation_mot_de_passe", numero);

  const utilisateur = await prisma.utilisateur.findUnique({
    where: { telephone_connexion: numero },
    include: { role: true, patient: { select: { date_naissance: true } } },
  });
  if (!utilisateur || ROLES_SANS_PIN.has(utilisateur.role?.libelle)) {
    throw new ErreurPin("Aucun compte ne se connecte avec ce numéro.", 404, "COMPTE_INTROUVABLE");
  }
  const erreur = controlerPin(nouveau_pin, { telephone: numero, date_naissance: utilisateur.patient?.date_naissance });
  if (erreur) throw new ErreurPin(erreur, 400, "PIN_TROP_FAIBLE");
  return prisma.utilisateur.update({
    where: { utilisateur_id: utilisateur.utilisateur_id },
    data: {
      pin_hash: await bcrypt.hash(nouveau_pin, SALT_ROUNDS),
      pin_provisoire: false,
      telephone_verifie: true,
      pin_echecs: 0,
      pin_nb_blocages: 0,
      pin_bloque_jusqu_au: null,
    },
    include: { role: true },
  });
}

/** Vérifier le numéro de connexion d'un compte existant (vérification active). */
export async function verifierTelephoneCompte({ utilisateur_id, preuve_telephone }) {
  const utilisateur = await chargerCompte(utilisateur_id);
  if (!utilisateur.telephone_connexion) {
    throw new ErreurPin("Créez d'abord votre code PIN avec votre numéro.", 409, "PIN_A_CREER");
  }
  await exigerPreuve(preuve_telephone, "changement_telephone", utilisateur.telephone_connexion);
  return prisma.utilisateur.update({
    where: { utilisateur_id },
    data: { telephone_verifie: true },
    include: { role: true },
  });
}
