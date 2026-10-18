// src/services/numeroWhatsapp.service.js
// WhatsApp — gestion des numéros EXPÉDITEURS d'APS Santé (back-office).
//
// Règles :
//   - un seul numéro actif à la fois (index unique partiel en base) ; activer
//     un numéro désactive l'actuel dans la MÊME transaction ;
//   - un numéro qui a déjà servi à envoyer n'est pas supprimable (le journal
//     des messages perdrait son expéditeur) : on le désactive ;
//   - le jeton d'accès Meta n'est jamais en base (WHATSAPP_ACCESS_TOKEN) ;
//   - toute modification est tracée dans le journal d'audit.

import prisma from "../lib/prisma.js";
import { journaliserAudit } from "../lib/audit.js";
import { estNumeroInternational, normaliserNumeroInternational } from "../lib/telephone.js";
import { lireNumeroMeta } from "../lib/whatsappService.js";

const LONGUEUR_MAX_LIBELLE = 100;
const FORMAT_IDENTIFIANT_META = /^\d{5,40}$/;

/** Erreur métier attendue : le contrôleur la traduit en réponse HTTP via `status`. */
export class ErreurWhatsapp extends Error {
  constructor(message, status = 400, code = "WHATSAPP_INVALIDE") {
    super(message);
    this.name = "ErreurWhatsapp";
    this.status = status;
    this.code = code;
  }
}

/**
 * Numéro expéditeur actif, ou null.
 * @param {object} [client] prisma ou tx
 */
export function obtenirNumeroWhatsappActif(client = prisma) {
  return client.numeroWhatsapp.findFirst({ where: { actif: true } });
}

export function listerNumerosWhatsapp(client = prisma) {
  return client.numeroWhatsapp.findMany({
    orderBy: [{ actif: "desc" }, { date_creation: "desc" }],
    include: { _count: { select: { messages: true } } },
  });
}

/**
 * Valide et normalise les champs saisis. `partiel` : seuls les champs
 * présents sont contrôlés (modification).
 * @returns {object} données prêtes pour Prisma
 */
export function validerChampsNumero(champs = {}, { partiel = false } = {}) {
  const data = {};

  if (!partiel || champs.libelle !== undefined) {
    if (typeof champs.libelle !== "string" || !champs.libelle.trim()) {
      throw new ErreurWhatsapp("Champ requis manquant : libelle.");
    }
    if (champs.libelle.trim().length > LONGUEUR_MAX_LIBELLE) {
      throw new ErreurWhatsapp(`libelle trop long (${LONGUEUR_MAX_LIBELLE} caractères maximum).`);
    }
    data.libelle = champs.libelle.trim();
  }

  if (!partiel || champs.numero !== undefined) {
    // Le numéro expéditeur doit être saisi au format international : aucun
    // pays par défaut n'est supposé pour lui.
    const numero = normaliserNumeroInternational(champs.numero);
    if (!numero) {
      throw new ErreurWhatsapp("Numéro invalide : saisissez-le au format international (ex. +237 690 00 00 00).");
    }
    data.numero = numero;
  }

  if (!partiel || champs.phone_number_id !== undefined) {
    const id = String(champs.phone_number_id ?? "").trim();
    if (!FORMAT_IDENTIFIANT_META.test(id)) {
      throw new ErreurWhatsapp("phone_number_id invalide : identifiant numérique fourni par Meta (WhatsApp > Configuration de l'API).");
    }
    data.phone_number_id = id;
  }

  if (champs.waba_id !== undefined) {
    const waba = String(champs.waba_id ?? "").trim();
    if (waba && !FORMAT_IDENTIFIANT_META.test(waba)) {
      throw new ErreurWhatsapp("waba_id invalide : identifiant numérique du compte WhatsApp Business.");
    }
    data.waba_id = waba || null;
  }

  return data;
}

async function trouverOuEchouer(db, numero_whatsapp_id) {
  const numero = await db.numeroWhatsapp.findUnique({ where: { numero_whatsapp_id } });
  if (!numero) throw new ErreurWhatsapp("Numéro WhatsApp introuvable.", 404, "NUMERO_WHATSAPP_INTROUVABLE");
  return numero;
}

/**
 * @param {{ libelle, numero, phone_number_id, waba_id?, actif? }} champs
 * @param {string|null} acteur_id
 */
export async function creerNumeroWhatsapp(champs, acteur_id = null) {
  const data = validerChampsNumero(champs);
  const activer = champs?.actif === true;

  return prisma.$transaction(async (tx) => {
    if (activer) await tx.numeroWhatsapp.updateMany({ where: { actif: true }, data: { actif: false } });
    const cree = await tx.numeroWhatsapp.create({ data: { ...data, actif: activer } });
    await journaliserAudit(tx, {
      acteur_id, type: "NUMERO_WHATSAPP_CREE", objet_type: "numero_whatsapp", objet_id: cree.numero_whatsapp_id,
      details: { numero: cree.numero, actif: cree.actif },
    });
    return cree;
  });
}

export async function modifierNumeroWhatsapp(numero_whatsapp_id, champs, acteur_id = null) {
  const data = validerChampsNumero(champs, { partiel: true });
  if (!Object.keys(data).length) throw new ErreurWhatsapp("Aucun champ à modifier.");

  return prisma.$transaction(async (tx) => {
    const avant = await trouverOuEchouer(tx, numero_whatsapp_id);
    const modifie = await tx.numeroWhatsapp.update({ where: { numero_whatsapp_id }, data });
    await journaliserAudit(tx, {
      acteur_id, type: "NUMERO_WHATSAPP_MODIFIE", objet_type: "numero_whatsapp", objet_id: numero_whatsapp_id,
      details: {
        avant: { libelle: avant.libelle, numero: avant.numero, phone_number_id: avant.phone_number_id, waba_id: avant.waba_id },
        apres: data,
      },
    });
    return modifie;
  });
}

/** Active ce numéro et désactive l'actuel (transaction). */
export async function activerNumeroWhatsapp(numero_whatsapp_id, acteur_id = null) {
  return prisma.$transaction(async (tx) => {
    const numero = await trouverOuEchouer(tx, numero_whatsapp_id);
    if (numero.actif) return numero;
    const precedent = await obtenirNumeroWhatsappActif(tx);
    await tx.numeroWhatsapp.updateMany({ where: { actif: true }, data: { actif: false } });
    const active = await tx.numeroWhatsapp.update({ where: { numero_whatsapp_id }, data: { actif: true } });
    await journaliserAudit(tx, {
      acteur_id, type: "NUMERO_WHATSAPP_ACTIVE", objet_type: "numero_whatsapp", objet_id: numero_whatsapp_id,
      details: { numero: active.numero, remplace: precedent?.numero ?? null },
    });
    return active;
  });
}

/** Désactive ce numéro : plus aucun message ne part tant qu'aucun autre n'est actif. */
export async function desactiverNumeroWhatsapp(numero_whatsapp_id, acteur_id = null) {
  return prisma.$transaction(async (tx) => {
    const numero = await trouverOuEchouer(tx, numero_whatsapp_id);
    if (!numero.actif) return numero;
    const desactive = await tx.numeroWhatsapp.update({ where: { numero_whatsapp_id }, data: { actif: false } });
    await journaliserAudit(tx, {
      acteur_id, type: "NUMERO_WHATSAPP_DESACTIVE", objet_type: "numero_whatsapp", objet_id: numero_whatsapp_id,
      details: { numero: numero.numero },
    });
    return desactive;
  });
}

export async function supprimerNumeroWhatsapp(numero_whatsapp_id, acteur_id = null) {
  return prisma.$transaction(async (tx) => {
    const numero = await trouverOuEchouer(tx, numero_whatsapp_id);
    if (numero.actif) {
      throw new ErreurWhatsapp("Désactivez ce numéro avant de le supprimer.", 409, "NUMERO_WHATSAPP_ACTIF");
    }
    const messages = await tx.messageWhatsapp.count({ where: { numero_whatsapp_id } });
    if (messages > 0) {
      throw new ErreurWhatsapp(
        "Ce numéro a déjà servi à envoyer des messages : il ne peut pas être supprimé (laissez-le désactivé).",
        409, "NUMERO_WHATSAPP_UTILISE"
      );
    }
    await tx.numeroWhatsapp.delete({ where: { numero_whatsapp_id } });
    await journaliserAudit(tx, {
      acteur_id, type: "NUMERO_WHATSAPP_SUPPRIME", objet_type: "numero_whatsapp", objet_id: numero_whatsapp_id,
      details: { numero: numero.numero, phone_number_id: numero.phone_number_id },
    });
  });
}

/**
 * Interroge Meta sur ce phone_number_id et compare le numéro affiché par Meta
 * au numéro saisi. Ne modifie rien.
 * @returns {Promise<{ correspond: boolean, meta: object }>}
 * @throws {ErreurWhatsapp|import("../lib/whatsappService.js").WhatsappError}
 */
export async function verifierNumeroWhatsapp(numero_whatsapp_id) {
  const numero = await trouverOuEchouer(prisma, numero_whatsapp_id);
  const meta = await lireNumeroMeta(numero.phone_number_id);
  const affiche = String(meta?.display_phone_number ?? "").replace(/\D/g, "");
  return { correspond: estNumeroInternational(affiche) && affiche === numero.numero, meta };
}
