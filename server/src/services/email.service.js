// src/services/email.service.js
// E-mail — POINT UNIQUE d'envoi et de réception, à utiliser par tous les
// services métier (jamais lib/emailService.js directement). Même contrat
// que sms.service.js / whatsapp.service.js :
//   - journal : chaque envoi laisse une ligne message_email (statut,
//     Message-ID, erreur), consultable au back-office ;
//   - idempotence : avec une `cle` (événement + destinataire), un même
//     e-mail n'est jamais envoyé deux fois, même si l'appelant est rejoué ;
//   - aucune exception sur un échec d'envoi : le résultat porte
//     `statut: "echec"`. Un e-mail ne doit JAMAIS défaire une opération
//     métier déjà validée. Seule une saisie invalide de l'appelant lève
//     ErreurEmail ;
//   - relance : les échecs transitoires (réseau, SMTP pas encore configuré,
//     refus 4xx) sont réessayés par le job (relancerMessagesEmail) ;
//   - réception : le job releverEmailsRecus enregistre les e-mails arrivés
//     dans la boîte IMAP (table email_recu), reliés à notre e-mail
//     d'origine quand c'est une réponse.
//
// Appeler APRÈS la validation de la transaction métier, jamais dedans.
// Exemple :
//
//   import { construireEmailHtml, envoyerEmailUtilisateur } from "./email.service.js";
//   await envoyerEmailUtilisateur({
//     utilisateur_id,
//     origine: "rdv_rappel",
//     cle: `rdv_rappel:${rdv.rdv_id}:${utilisateur_id}`,
//     sujet: "Rappel de votre rendez-vous",
//     texte,
//     html: construireEmailHtml({ titre: "Rappel", paragraphes: [texte] }),
//   });

import prisma from "../lib/prisma.js";
import { EmailError, envoyerEmailSmtp, releverBoiteImap } from "../lib/emailService.js";

export class ErreurEmail extends Error {
  constructor(message, status = 400, code = "EMAIL_INVALIDE") {
    super(message);
    this.name = "ErreurEmail";
    this.status = status;
    this.code = code;
  }
}

const FORMAT_EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const LONGUEUR_MAX_SUJET = 255;
const LONGUEUR_MAX_TEXTE = 100_000;
const LONGUEUR_MAX_ORIGINE = 60;
const LONGUEUR_MAX_CLE = 200;

export const RELANCE_MAX_TENTATIVES = Number(process.env.EMAIL_RELANCE_MAX_TENTATIVES ?? 5);
export const RELANCE_FENETRE_H = Number(process.env.EMAIL_RELANCE_FENETRE_H ?? 24);

const CODES_RELANCABLES = new Set(["NON_CONFIGURE"]);

export const adresseEmailValide = (v) => typeof v === "string" && v.length <= 254 && FORMAT_EMAIL.test(v.trim());

function resultat(message, deja_traite = false) {
  return {
    message_email_id: message.message_email_id,
    statut: message.statut,
    identifiant_fournisseur: message.identifiant_fournisseur ?? null,
    erreur_code: message.erreur_code ?? null,
    erreur: message.erreur ?? null,
    deja_traite,
  };
}

/**
 * Remet au serveur SMTP un message journalisé en_attente et enregistre
 * l'issue. Ne lève jamais d'exception sur un échec d'envoi.
 */
async function tenterEnvoi(message) {
  let maj;
  try {
    const { identifiant } = await envoyerEmailSmtp({
      destinataire: message.destinataire,
      sujet: message.sujet,
      texte: message.texte,
      html: message.html,
    });
    maj = {
      statut: "envoye", identifiant_fournisseur: identifiant ?? null,
      erreur_code: null, erreur: null, relancable: false, date_envoi: new Date(),
    };
  } catch (err) {
    const connue = err instanceof EmailError;
    if (!connue) console.error("[email] Erreur inattendue à l'envoi :", err);
    maj = {
      statut: "echec",
      erreur_code: connue ? String(err.code ?? "SMTP").slice(0, 40) : "INTERNE",
      erreur: connue ? err.message : "Erreur interne lors de l'envoi.",
      relancable: connue ? err.transitoire || CODES_RELANCABLES.has(err.code) : true,
    };
  }

  return prisma.messageEmail.update({
    where: { message_email_id: message.message_email_id },
    data: { ...maj, tentatives: { increment: 1 } },
  });
}

/** Passage atomique echec -> en_attente : un seul processus renvoie le message. */
async function reprendreMessageEnEchec(message_email_id) {
  const { count } = await prisma.messageEmail.updateMany({
    where: { message_email_id, statut: "echec" },
    data: { statut: "en_attente" },
  });
  return count === 1 ? prisma.messageEmail.findUnique({ where: { message_email_id } }) : null;
}

/**
 * Envoie un e-mail.
 *
 * @param {object} p
 * @param {string} p.destinataire     adresse e-mail
 * @param {string} p.sujet            objet (255 caractères maximum)
 * @param {string} p.texte            version texte (toujours fournie : clients sans HTML, journal)
 * @param {string} [p.html]           version HTML (voir construireEmailHtml)
 * @param {string} p.origine          service émetteur, pour le journal (ex. "publicite_acceptee")
 * @param {string} [p.cle]            clé d'idempotence (événement + destinataire)
 * @param {string} [p.utilisateur_id] destinataire connu, pour le journal
 * @returns {Promise<{ message_email_id: string, statut: "envoye"|"echec"|"en_attente",
 *   identifiant_fournisseur: string|null, erreur_code: string|null, erreur: string|null, deja_traite: boolean }>}
 * @throws {ErreurEmail} uniquement si les paramètres sont invalides
 */
export async function envoyerEmail({ destinataire, sujet, texte, html = null, origine, cle = null, utilisateur_id = null } = {}) {
  if (typeof origine !== "string" || !origine.trim() || origine.length > LONGUEUR_MAX_ORIGINE) {
    throw new ErreurEmail(`origine requise (${LONGUEUR_MAX_ORIGINE} caractères maximum).`);
  }
  if (cle !== null && (typeof cle !== "string" || !cle || cle.length > LONGUEUR_MAX_CLE)) {
    throw new ErreurEmail(`cle invalide (${LONGUEUR_MAX_CLE} caractères maximum).`);
  }
  if (!adresseEmailValide(destinataire)) throw new ErreurEmail("Adresse e-mail destinataire invalide.", 400, "DESTINATAIRE_INVALIDE");
  if (typeof sujet !== "string" || !sujet.trim()) throw new ErreurEmail("L'objet de l'e-mail est vide.");
  if (sujet.length > LONGUEUR_MAX_SUJET) throw new ErreurEmail(`Objet trop long (${LONGUEUR_MAX_SUJET} caractères maximum).`);
  if (typeof texte !== "string" || !texte.trim()) throw new ErreurEmail("Le texte de l'e-mail est vide.");
  if (texte.length > LONGUEUR_MAX_TEXTE || (html && html.length > LONGUEUR_MAX_TEXTE)) {
    throw new ErreurEmail("Contenu de l'e-mail trop long.");
  }

  if (cle) {
    const existant = await prisma.messageEmail.findUnique({ where: { cle } });
    if (existant) return renvoyerSiEchec(existant);
  }

  let message;
  try {
    message = await prisma.messageEmail.create({
      data: {
        cle, origine: origine.trim(), destinataire: destinataire.trim().toLowerCase(), utilisateur_id,
        sujet: sujet.trim(), texte, html, statut: "en_attente",
      },
    });
  } catch (err) {
    // Deux appels simultanés avec la même clé : l'autre a gagné.
    if (err?.code === "P2002" && cle) {
      return resultat(await prisma.messageEmail.findUnique({ where: { cle } }), true);
    }
    throw err;
  }

  return resultat(await tenterEnvoi(message));
}

async function renvoyerSiEchec(existant) {
  if (existant.statut !== "echec") return resultat(existant, true);
  const repris = await reprendreMessageEnEchec(existant.message_email_id);
  if (!repris) return resultat(await prisma.messageEmail.findUnique({ where: { message_email_id: existant.message_email_id } }), true);
  return resultat(await tenterEnvoi(repris));
}

/**
 * Envoie un e-mail à un utilisateur de la plateforme (utilisateur.email).
 * Sans adresse exploitable, rien n'est envoyé ni journalisé.
 * @returns {Promise<object>} résultat de envoyerEmail, ou { statut: "ignore", raison }
 */
export async function envoyerEmailUtilisateur({ utilisateur_id, ...reste } = {}) {
  if (!utilisateur_id) throw new ErreurEmail("utilisateur_id requis.");
  const utilisateur = await prisma.utilisateur.findUnique({ where: { utilisateur_id }, select: { email: true } });
  if (!utilisateur) return { statut: "ignore", raison: "UTILISATEUR_INTROUVABLE" };
  if (!adresseEmailValide(utilisateur.email)) return { statut: "ignore", raison: utilisateur.email ? "EMAIL_INVALIDE" : "SANS_EMAIL" };
  return envoyerEmail({ ...reste, destinataire: utilisateur.email, utilisateur_id });
}

/**
 * Job : réessaie les échecs relançables récents.
 * @returns {Promise<{ envoyes: number, echecs: number }>}
 */
export async function relancerMessagesEmail({ limite = 50 } = {}) {
  const depuis = new Date(Date.now() - RELANCE_FENETRE_H * 3_600_000);
  const candidats = await prisma.messageEmail.findMany({
    where: { statut: "echec", relancable: true, tentatives: { lt: RELANCE_MAX_TENTATIVES }, date_creation: { gte: depuis } },
    orderBy: { date_creation: "asc" },
    take: limite,
    select: { message_email_id: true },
  });

  let envoyes = 0;
  let echecs = 0;
  for (const { message_email_id } of candidats) {
    try {
      const repris = await reprendreMessageEnEchec(message_email_id);
      if (!repris) continue;
      const fin = await tenterEnvoi(repris);
      if (fin.statut === "envoye") envoyes += 1;
      else echecs += 1;
    } catch (err) {
      echecs += 1;
      console.error(`[email] Relance impossible du message ${message_email_id} :`, err);
    }
  }
  return { envoyes, echecs };
}

/**
 * Renvoi manuel depuis le back-office d'un e-mail en échec (même définitif).
 * @throws {ErreurEmail} introuvable (404) ou pas en échec (409)
 */
export async function renvoyerMessageEmail(message_email_id) {
  const message = await prisma.messageEmail.findUnique({ where: { message_email_id } });
  if (!message) throw new ErreurEmail("E-mail introuvable.", 404, "MESSAGE_EMAIL_INTROUVABLE");
  if (message.statut !== "echec") throw new ErreurEmail("Seul un e-mail en échec peut être renvoyé.", 409, "MESSAGE_EMAIL_NON_ECHOUE");
  const repris = await reprendreMessageEnEchec(message_email_id);
  if (!repris) throw new ErreurEmail("Cet e-mail est déjà en cours de renvoi.", 409, "MESSAGE_EMAIL_EN_COURS");
  return resultat(await tenterEnvoi(repris));
}

/**
 * Journal des envois, du plus récent au plus ancien, paginé.
 * @param {{ statut?: string, origine?: string, recherche?: string, page?: number, taille?: number }} filtres
 */
export async function listerMessagesEmail({ statut, origine, recherche, page = 1, taille = 50 } = {}) {
  const where = {
    ...(statut && { statut }),
    ...(origine && { origine }),
    ...(recherche && { destinataire: { contains: String(recherche).trim().toLowerCase() } }),
  };
  const [total, messages] = await Promise.all([
    prisma.messageEmail.count({ where }),
    prisma.messageEmail.findMany({
      where,
      orderBy: { date_creation: "desc" },
      skip: (page - 1) * taille,
      take: taille,
      omit: { html: true },
      include: { utilisateur: { select: { utilisateur_id: true, nom: true, prenom: true } } },
    }),
  ]);
  return { total, page, taille, messages };
}

/* ===================================================================
 * Réception (IMAP)
 * =================================================================== */

/** Enregistre un e-mail relevé (idempotent par Message-ID). */
async function enregistrerEmailRecu(e) {
  const origine = e.en_reponse_a
    ? await prisma.messageEmail.findUnique({ where: { identifiant_fournisseur: e.en_reponse_a }, select: { message_email_id: true } })
    : null;
  await prisma.emailRecu.upsert({
    where: { message_id: e.message_id.slice(0, 512) },
    update: {},
    create: {
      message_id: e.message_id.slice(0, 512),
      expediteur: e.expediteur.slice(0, 254).toLowerCase(),
      expediteur_nom: e.expediteur_nom?.slice(0, 255) ?? null,
      destinataire: e.destinataire?.slice(0, 254) ?? null,
      sujet: e.sujet.slice(0, 500),
      texte: e.texte,
      html: e.html,
      en_reponse_a: e.en_reponse_a?.slice(0, 512) ?? null,
      message_email_id: origine?.message_email_id ?? null,
      date_reception: new Date(e.date_reception),
    },
  });
}

/**
 * Job : relève la boîte IMAP et enregistre les nouveaux e-mails.
 * @returns {Promise<{ releves: number, erreurs: number } | null>} null si IMAP n'est pas configuré
 */
export function releverEmailsRecus({ limite = 50 } = {}) {
  return releverBoiteImap(enregistrerEmailRecu, { limite });
}

/** Boîte de réception, du plus récent au plus ancien, paginée. */
export async function listerEmailsRecus({ lu, recherche, page = 1, taille = 50 } = {}) {
  const where = {
    ...(lu !== undefined && { lu }),
    ...(recherche && {
      OR: [
        { expediteur: { contains: String(recherche).trim().toLowerCase() } },
        { sujet: { contains: String(recherche).trim(), mode: "insensitive" } },
      ],
    }),
  };
  const [total, non_lus, emails] = await Promise.all([
    prisma.emailRecu.count({ where }),
    prisma.emailRecu.count({ where: { lu: false } }),
    prisma.emailRecu.findMany({
      where,
      orderBy: { date_reception: "desc" },
      skip: (page - 1) * taille,
      take: taille,
      omit: { html: true },
      include: { message_email: { select: { message_email_id: true, origine: true, sujet: true } } },
    }),
  ]);
  return { total, non_lus, page, taille, emails };
}

/** Marque un e-mail reçu lu / non lu. @throws {ErreurEmail} 404 */
export async function marquerEmailRecu(email_recu_id, lu) {
  const { count } = await prisma.emailRecu.updateMany({ where: { email_recu_id }, data: { lu: Boolean(lu) } });
  if (!count) throw new ErreurEmail("E-mail introuvable.", 404, "EMAIL_RECU_INTROUVABLE");
}

/* ===================================================================
 * Mise en forme
 * =================================================================== */

const echapper = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Les URL du texte deviennent des liens cliquables.
const avecLiens = (s) => echapper(s).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#0f7a55;">${url}</a>`);

/**
 * Gabarit HTML commun des e-mails d'APS Santé (tableaux et styles en ligne :
 * compatibles avec les clients de messagerie).
 * @param {{ titre: string, paragraphes: string[], bouton?: { libelle: string, url: string }|null,
 *   details?: Array<[string, string]>, pied?: string }} p
 */
export function construireEmailHtml({ titre, paragraphes = [], bouton = null, details = [], pied = null }) {
  const corps = paragraphes
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1f2a37;">${avecLiens(p)}</p>`)
    .join("");
  const tableau = details.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;border:1px solid #e3e8ef;border-radius:10px;border-collapse:separate;">${details
        .map(
          ([k, v], i) =>
            `<tr><td style="padding:10px 14px;font-size:13px;color:#64748b;${i ? "border-top:1px solid #e3e8ef;" : ""}">${echapper(k)}</td>` +
            `<td style="padding:10px 14px;font-size:14px;color:#1f2a37;font-weight:600;text-align:right;${i ? "border-top:1px solid #e3e8ef;" : ""}">${echapper(v)}</td></tr>`
        )
        .join("")}</table>`
    : "";
  const cta = bouton
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;"><tr><td style="border-radius:10px;background:#16996c;">` +
      `<a href="${echapper(bouton.url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${echapper(bouton.libelle)}</a>` +
      `</td></tr></table>`
    : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapper(titre)}</title></head>
<body style="margin:0;padding:0;background:#f3f6f8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6f8;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border:1px solid #e3e8ef;border-radius:14px;">
<tr><td style="padding:22px 28px;border-bottom:1px solid #e3e8ef;font-size:18px;font-weight:700;color:#16996c;">APS Santé</td></tr>
<tr><td style="padding:26px 28px 10px;">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:#0f172a;">${echapper(titre)}</h1>
${corps}${tableau}${cta}
</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #e3e8ef;font-size:12px;line-height:1.5;color:#94a3b8;">${echapper(
    pied ?? "Vous recevez cet e-mail car vous avez une demande en cours sur APS Santé."
  )}</td></tr>
</table></td></tr></table></body></html>`;
}
