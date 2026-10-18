// src/services/whatsapp.service.js
// WhatsApp — POINT UNIQUE d'envoi des messages, à utiliser par tous les
// services métier (jamais lib/whatsappService.js directement).
//
// Ce que le socle garantit à l'appelant :
//   - expéditeur : le numéro actif de la table numero_whatsapp (géré au
//     back-office) ; l'appelant ne choisit jamais le numéro ;
//   - journal : chaque envoi laisse une ligne message_whatsapp (statut,
//     identifiant Meta, erreur) consultable au back-office ;
//   - idempotence : avec une `cle` (événement + destinataire), un même
//     message n'est jamais envoyé deux fois, même si l'appelant est rejoué ;
//   - aucune exception sur un échec d'envoi (numéro absent, Meta refuse ou
//     injoignable) : le résultat porte `statut: "echec"`. Un envoi WhatsApp
//     ne doit JAMAIS défaire une opération métier déjà validée. Seule une
//     saisie invalide de l'appelant (bug) lève ErreurWhatsapp ;
//   - relance : les échecs transitoires (débit, réseau, numéro pas encore
//     configuré) sont réessayés par le job (relancerMessagesWhatsapp).
//
// Règle WhatsApp à connaître : un message LIBRE (texte) n'est délivré que
// dans les 24 h qui suivent le dernier message du destinataire. Pour initier
// une conversation (notifications), il faut un MODÈLE approuvé par Meta.
//
// Appeler APRÈS la validation de la transaction métier, jamais dedans
// (l'appel réseau peut prendre jusqu'à 15 s). Exemple :
//
//   import { envoyerWhatsappUtilisateur } from "./whatsapp.service.js";
//   await envoyerWhatsappUtilisateur({
//     utilisateur_id: rdv.patient.utilisateur_id,
//     origine: "rdv_accepte",
//     cle: `rdv_accepte:${rdv.rdv_id}:${rdv.patient.utilisateur_id}`,
//     modele: { nom: "rdv_accepte", langue: "fr", parametres: [nomMedecin, dateLisible] },
//   });

import prisma from "../lib/prisma.js";
import { normaliserNumeroInternational } from "../lib/telephone.js";
import { envoyerMessageMeta, WhatsappError } from "../lib/whatsappService.js";
import { ErreurWhatsapp, obtenirNumeroWhatsappActif } from "./numeroWhatsapp.service.js";

export { ErreurWhatsapp };

const LONGUEUR_MAX_TEXTE = 4096; // limite de l'API Cloud
const FORMAT_NOM_MODELE = /^[a-z0-9_]{1,512}$/;
const FORMAT_LANGUE = /^[a-z]{2,3}(_[A-Z]{2})?$/;
const LONGUEUR_MAX_ORIGINE = 60;
const LONGUEUR_MAX_CLE = 200;

// Relance : au-delà, l'échec est considéré définitif. Un message vieux de plus
// de RELANCE_FENETRE_H n'a généralement plus de sens (rappel passé, etc.).
export const RELANCE_MAX_TENTATIVES = Number(process.env.WHATSAPP_RELANCE_MAX_TENTATIVES ?? 5);
export const RELANCE_FENETRE_H = Number(process.env.WHATSAPP_RELANCE_FENETRE_H ?? 24);

// Échecs qui disparaissent d'eux-mêmes ou par une action d'exploitation
// (activer un numéro, poser le jeton) : le job peut réessayer.
const CODES_RELANCABLES = new Set(["AUCUN_NUMERO_ACTIF", "NON_CONFIGURE"]);

/**
 * Contrôle le contenu demandé par l'appelant.
 * @param {{ texte?: string, modele?: { nom: string, langue?: string, parametres?: Array<string|number>, composants?: object[] } }} p
 * @returns {{ type: "texte"|"modele", contenu: object }}
 * @throws {ErreurWhatsapp}
 */
export function validerContenuWhatsapp({ texte, modele } = {}) {
  if ((texte === undefined) === (modele === undefined)) {
    throw new ErreurWhatsapp("Fournir soit `texte`, soit `modele` (exactement l'un des deux).");
  }

  if (texte !== undefined) {
    if (typeof texte !== "string" || !texte.trim()) throw new ErreurWhatsapp("Le texte du message est vide.");
    if (texte.length > LONGUEUR_MAX_TEXTE) {
      throw new ErreurWhatsapp(`Texte trop long (${LONGUEUR_MAX_TEXTE} caractères maximum).`);
    }
    return { type: "texte", contenu: { texte } };
  }

  const nom = String(modele?.nom ?? "").trim();
  const langue = String(modele?.langue ?? "fr").trim();
  if (!FORMAT_NOM_MODELE.test(nom)) {
    throw new ErreurWhatsapp("Nom de modèle invalide (minuscules, chiffres et « _ », tel qu'approuvé chez Meta).");
  }
  if (!FORMAT_LANGUE.test(langue)) throw new ErreurWhatsapp("Code langue du modèle invalide (ex. fr, en_US).");
  if (modele.parametres !== undefined && modele.composants !== undefined) {
    throw new ErreurWhatsapp("Fournir `parametres` (corps du modèle) OU `composants` (forme brute Meta), pas les deux.");
  }

  let composants;
  if (Array.isArray(modele.parametres) && modele.parametres.length) {
    // Raccourci : paramètres {{1}}, {{2}}… du corps du modèle, dans l'ordre.
    composants = [{ type: "body", parameters: modele.parametres.map((p) => ({ type: "text", text: String(p) })) }];
  } else if (Array.isArray(modele.composants) && modele.composants.length) {
    composants = modele.composants;
  }

  return { type: "modele", contenu: { nom, langue, ...(composants && { composants }) } };
}

function resultat(message, deja_traite = false) {
  return {
    message_whatsapp_id: message.message_whatsapp_id,
    statut: message.statut,
    identifiant_fournisseur: message.identifiant_fournisseur ?? null,
    erreur_code: message.erreur_code ?? null,
    erreur: message.erreur ?? null,
    deja_traite,
  };
}

/**
 * Appelle Meta pour un message déjà journalisé (statut en_attente) et
 * enregistre l'issue. Ne lève jamais d'exception sur un échec d'envoi.
 */
async function tenterEnvoi(message) {
  let maj;
  try {
    const numero = await obtenirNumeroWhatsappActif();
    if (!numero) {
      maj = { statut: "echec", erreur_code: "AUCUN_NUMERO_ACTIF", erreur: "Aucun numéro WhatsApp actif (back-office).", relancable: true };
    } else {
      const { identifiant } = await envoyerMessageMeta({
        phone_number_id: numero.phone_number_id,
        destinataire: message.destinataire,
        type: message.type,
        contenu: message.contenu,
      });
      maj = {
        statut: "envoye", numero_whatsapp_id: numero.numero_whatsapp_id, identifiant_fournisseur: identifiant,
        erreur_code: null, erreur: null, relancable: false, date_envoi: new Date(),
      };
    }
  } catch (err) {
    const connue = err instanceof WhatsappError;
    if (!connue) console.error("[whatsapp] Erreur inattendue à l'envoi :", err);
    maj = {
      statut: "echec",
      erreur_code: connue ? err.code : "INTERNE",
      erreur: connue ? err.message : "Erreur interne lors de l'envoi.",
      relancable: connue ? err.transitoire || CODES_RELANCABLES.has(err.code) : true,
    };
  }

  return prisma.messageWhatsapp.update({
    where: { message_whatsapp_id: message.message_whatsapp_id },
    data: { ...maj, tentatives: { increment: 1 } },
  });
}

/**
 * Prend la main sur un message en échec (passage atomique echec -> en_attente)
 * pour qu'un seul processus le renvoie (job et appel manuel concurrents).
 * @returns {Promise<object|null>} le message, ou null si quelqu'un d'autre l'a pris
 */
async function reprendreMessageEnEchec(message_whatsapp_id) {
  const { count } = await prisma.messageWhatsapp.updateMany({
    where: { message_whatsapp_id, statut: "echec" },
    data: { statut: "en_attente" },
  });
  return count === 1 ? prisma.messageWhatsapp.findUnique({ where: { message_whatsapp_id } }) : null;
}

/**
 * Envoie un message WhatsApp à un numéro.
 *
 * @param {object} p
 * @param {string} p.destinataire     numéro (international, ou local avec `pays_iso2`)
 * @param {string} [p.pays_iso2]      pays servant à compléter un numéro local (ex. "CM")
 * @param {string} [p.texte]          message libre (fenêtre de 24 h)
 * @param {object} [p.modele]         { nom, langue = "fr", parametres?: [...] | composants?: [...] }
 * @param {string} p.origine          service émetteur, pour le journal (ex. "rdv_accepte")
 * @param {string} [p.cle]            clé d'idempotence (événement + destinataire)
 * @param {string} [p.utilisateur_id] destinataire connu, pour le journal
 * @returns {Promise<{ message_whatsapp_id: string, statut: "envoye"|"echec"|"en_attente",
 *   identifiant_fournisseur: string|null, erreur_code: string|null, erreur: string|null, deja_traite: boolean }>}
 * @throws {ErreurWhatsapp} uniquement si les paramètres sont invalides
 */
export async function envoyerWhatsapp({ destinataire, pays_iso2 = null, texte, modele, origine, cle = null, utilisateur_id = null } = {}) {
  if (typeof origine !== "string" || !origine.trim() || origine.length > LONGUEUR_MAX_ORIGINE) {
    throw new ErreurWhatsapp(`origine requise (${LONGUEUR_MAX_ORIGINE} caractères maximum).`);
  }
  if (cle !== null && (typeof cle !== "string" || !cle || cle.length > LONGUEUR_MAX_CLE)) {
    throw new ErreurWhatsapp(`cle invalide (${LONGUEUR_MAX_CLE} caractères maximum).`);
  }
  const numero = normaliserNumeroInternational(destinataire, pays_iso2);
  if (!numero) throw new ErreurWhatsapp("Numéro destinataire invalide.", 400, "DESTINATAIRE_INVALIDE");
  const { type, contenu } = validerContenuWhatsapp({ texte, modele });

  if (cle) {
    const existant = await prisma.messageWhatsapp.findUnique({ where: { cle } });
    if (existant) return renvoyerSiEchec(existant);
  }

  let message;
  try {
    message = await prisma.messageWhatsapp.create({
      data: { cle, origine: origine.trim(), destinataire: numero, utilisateur_id, type, contenu, statut: "en_attente" },
    });
  } catch (err) {
    // Deux appels simultanés avec la même clé : l'autre a gagné.
    if (err?.code === "P2002" && cle) {
      return resultat(await prisma.messageWhatsapp.findUnique({ where: { cle } }), true);
    }
    throw err;
  }

  return resultat(await tenterEnvoi(message));
}

// Message déjà journalisé sous cette clé : envoyé ou en cours -> rien à faire ;
// en échec -> nouvelle tentative sur la même ligne.
async function renvoyerSiEchec(existant) {
  if (existant.statut !== "echec") return resultat(existant, true);
  const repris = await reprendreMessageEnEchec(existant.message_whatsapp_id);
  if (!repris) return resultat(await prisma.messageWhatsapp.findUnique({ where: { message_whatsapp_id: existant.message_whatsapp_id } }), true);
  return resultat(await tenterEnvoi(repris));
}

/**
 * Envoie un message WhatsApp à un utilisateur de la plateforme : son
 * téléphone (utilisateur.telephone) est complété avec l'indicatif de son pays.
 * Sans téléphone exploitable, rien n'est envoyé ni journalisé.
 *
 * @param {object} p  mêmes champs que envoyerWhatsapp, `utilisateur_id` à la place de `destinataire`
 * @returns {Promise<object>} résultat de envoyerWhatsapp, ou { statut: "ignore", raison }
 */
export async function envoyerWhatsappUtilisateur({ utilisateur_id, ...reste } = {}) {
  if (!utilisateur_id) throw new ErreurWhatsapp("utilisateur_id requis.");
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { utilisateur_id },
    select: { telephone: true, pays: { select: { code_iso2: true } } },
  });
  if (!utilisateur) return { statut: "ignore", raison: "UTILISATEUR_INTROUVABLE" };

  const numero = normaliserNumeroInternational(utilisateur.telephone, utilisateur.pays?.code_iso2);
  if (!numero) return { statut: "ignore", raison: utilisateur.telephone ? "TELEPHONE_INVALIDE" : "SANS_TELEPHONE" };

  // « + » : le numéro est déjà international, il ne doit pas être recomplété.
  return envoyerWhatsapp({ ...reste, destinataire: `+${numero}`, pays_iso2: null, utilisateur_id });
}

/**
 * Job : réessaie les échecs relançables récents. Chaque message est traité
 * indépendamment ; un échec n'interrompt pas les autres.
 * @returns {Promise<{ envoyes: number, echecs: number }>}
 */
export async function relancerMessagesWhatsapp({ limite = 50 } = {}) {
  const depuis = new Date(Date.now() - RELANCE_FENETRE_H * 3_600_000);
  const candidats = await prisma.messageWhatsapp.findMany({
    where: { statut: "echec", relancable: true, tentatives: { lt: RELANCE_MAX_TENTATIVES }, date_creation: { gte: depuis } },
    orderBy: { date_creation: "asc" },
    take: limite,
    select: { message_whatsapp_id: true },
  });

  let envoyes = 0;
  let echecs = 0;
  for (const { message_whatsapp_id } of candidats) {
    try {
      const repris = await reprendreMessageEnEchec(message_whatsapp_id);
      if (!repris) continue;
      const fin = await tenterEnvoi(repris);
      if (fin.statut === "envoye") envoyes += 1;
      else echecs += 1;
    } catch (err) {
      echecs += 1;
      console.error(`[whatsapp] Relance impossible du message ${message_whatsapp_id} :`, err);
    }
  }
  return { envoyes, echecs };
}

/**
 * Renvoi manuel depuis le back-office d'un message en échec (même définitif).
 * @throws {ErreurWhatsapp} message introuvable (404) ou pas en échec (409)
 */
export async function renvoyerMessageWhatsapp(message_whatsapp_id) {
  const message = await prisma.messageWhatsapp.findUnique({ where: { message_whatsapp_id } });
  if (!message) throw new ErreurWhatsapp("Message introuvable.", 404, "MESSAGE_WHATSAPP_INTROUVABLE");
  if (message.statut !== "echec") {
    throw new ErreurWhatsapp("Seul un message en échec peut être renvoyé.", 409, "MESSAGE_WHATSAPP_NON_ECHOUE");
  }
  const repris = await reprendreMessageEnEchec(message_whatsapp_id);
  if (!repris) throw new ErreurWhatsapp("Ce message est déjà en cours de renvoi.", 409, "MESSAGE_WHATSAPP_EN_COURS");
  return resultat(await tenterEnvoi(repris));
}

/**
 * Journal des envois, du plus récent au plus ancien, paginé.
 * @param {{ statut?: string, origine?: string, recherche?: string, page?: number, taille?: number }} filtres
 */
export async function listerMessagesWhatsapp({ statut, origine, recherche, page = 1, taille = 50 } = {}) {
  const where = {
    ...(statut && { statut }),
    ...(origine && { origine }),
    ...(recherche && { destinataire: { contains: String(recherche).replace(/\D/g, "") } }),
  };
  const [total, messages] = await Promise.all([
    prisma.messageWhatsapp.count({ where }),
    prisma.messageWhatsapp.findMany({
      where,
      orderBy: { date_creation: "desc" },
      skip: (page - 1) * taille,
      take: taille,
      include: {
        numero: { select: { numero: true, libelle: true } },
        utilisateur: { select: { utilisateur_id: true, nom: true, prenom: true } },
      },
    }),
  ]);
  return { total, page, taille, messages };
}
