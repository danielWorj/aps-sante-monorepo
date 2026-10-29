// src/lib/emailService.js
// Seul point d'accès aux serveurs de messagerie (même convention que
// twilioSmsService.js / whatsappService.js) : envoi par SMTP (nodemailer),
// relève de la boîte de réception par IMAP (imapflow + mailparser). Aucun
// accès base ici : le journal, l'idempotence, les relances et
// l'enregistrement des e-mails reçus sont faits par services/email.service.js,
// que les services métier doivent utiliser.
//
// Configuration (variables d'environnement, lues à l'appel) :
//   SMTP_HOST, SMTP_PORT (défaut 587)   serveur d'envoi
//   SMTP_SECURE                         "true" pour TLS direct (port 465) ; sinon STARTTLS
//   SMTP_USER, SMTP_PASSWORD            identifiants — SECRET
//   SMTP_FROM                           expéditeur, ex. « APS Santé <no-reply@apssante.com> »
//                                       (défaut : SMTP_USER)
//   SMTP_REPLY_TO                       facultatif : adresse de réponse (ex. la boîte relevée en IMAP)
//   IMAP_HOST, IMAP_PORT (défaut 993)   serveur de réception ; sans IMAP_HOST, la relève est désactivée
//   IMAP_SECURE                         "false" pour désactiver TLS (défaut : TLS)
//   IMAP_USER, IMAP_PASSWORD            défaut : SMTP_USER / SMTP_PASSWORD (même boîte)
//   IMAP_DOSSIER                        dossier relevé (défaut INBOX)

import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const DELAI_APPEL_MS = 20_000;

// Codes nodemailer pour lesquels réessayer plus tard a un sens (réseau, panne).
const CODES_TRANSITOIRES = new Set(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNRESET", "ECONNREFUSED"]);

export class EmailError extends Error {
  // transitoire : l'échec peut disparaître en réessayant plus tard.
  constructor(message, { code = null, transitoire = false } = {}) {
    super(message);
    this.name = "EmailError";
    this.code = code;
    this.transitoire = transitoire;
  }
}

const vrai = (v, defaut) => (v === undefined || v === "" ? defaut : String(v).trim().toLowerCase() === "true");

function configSmtp() {
  const port = Number(process.env.SMTP_PORT || 587);
  return {
    host: process.env.SMTP_HOST?.trim() || null,
    port,
    secure: vrai(process.env.SMTP_SECURE, port === 465),
    user: process.env.SMTP_USER?.trim() || null,
    pass: process.env.SMTP_PASSWORD || null,
    from: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || null,
    replyTo: process.env.SMTP_REPLY_TO?.trim() || null,
  };
}

function configImap() {
  return {
    host: process.env.IMAP_HOST?.trim() || null,
    port: Number(process.env.IMAP_PORT || 993),
    secure: vrai(process.env.IMAP_SECURE, true),
    user: process.env.IMAP_USER?.trim() || process.env.SMTP_USER?.trim() || null,
    pass: process.env.IMAP_PASSWORD || process.env.SMTP_PASSWORD || null,
    dossier: process.env.IMAP_DOSSIER?.trim() || "INBOX",
  };
}

/** État de la configuration, pour le back-office (jamais les secrets). */
export function configurationEmail() {
  const smtp = configSmtp();
  const imap = configImap();
  return {
    smtp: {
      configure: Boolean(smtp.host && smtp.from),
      serveur: smtp.host ? `${smtp.host}:${smtp.port}${smtp.secure ? " (TLS)" : ""}` : null,
      authentification: Boolean(smtp.user && smtp.pass),
      expediteur: smtp.from,
      repondre_a: smtp.replyTo,
    },
    imap: {
      configure: Boolean(imap.host && imap.user && imap.pass),
      serveur: imap.host ? `${imap.host}:${imap.port}${imap.secure ? " (TLS)" : ""}` : null,
      compte: imap.user,
      dossier: imap.dossier,
    },
  };
}

// Transport réutilisé tant que la configuration ne change pas.
let transport = null;
let empreinte = null;

function obtenirTransport() {
  const c = configSmtp();
  if (!c.host || !c.from) {
    throw new EmailError("SMTP non configuré (SMTP_HOST / SMTP_FROM).", { code: "NON_CONFIGURE" });
  }
  const cle = JSON.stringify(c);
  if (!transport || empreinte !== cle) {
    transport?.close();
    transport = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      ...(c.user && c.pass && { auth: { user: c.user, pass: c.pass } }),
      connectionTimeout: DELAI_APPEL_MS,
      greetingTimeout: DELAI_APPEL_MS,
      socketTimeout: DELAI_APPEL_MS,
    });
    empreinte = cle;
  }
  return { transport, from: c.from, replyTo: c.replyTo };
}

/**
 * Remet un e-mail au serveur SMTP.
 * @param {{ destinataire: string, sujet: string, texte: string, html?: string|null, messageId?: string }} p
 * @returns {Promise<{ identifiant: string }>} Message-ID
 * @throws {EmailError}
 */
export async function envoyerEmailSmtp({ destinataire, sujet, texte, html = null, messageId }) {
  const { transport: t, from, replyTo } = obtenirTransport();
  try {
    const info = await t.sendMail({
      from,
      to: destinataire,
      ...(replyTo && { replyTo }),
      subject: sujet,
      text: texte,
      ...(html && { html }),
      ...(messageId && { messageId }),
    });
    if (info.rejected?.length) {
      throw new EmailError("Adresse refusée par le serveur SMTP.", { code: "DESTINATAIRE_REFUSE" });
    }
    return { identifiant: info.messageId };
  } catch (err) {
    if (err instanceof EmailError) throw err;
    if (err.code === "EAUTH") {
      throw new EmailError("Identifiants SMTP refusés (SMTP_USER / SMTP_PASSWORD).", { code: "AUTHENTIFICATION" });
    }
    // Réponse SMTP 4xx : refus temporaire (boîte pleine, limite de débit…).
    const temporaire = err.responseCode >= 400 && err.responseCode < 500;
    throw new EmailError(err.response || err.message || "Envoi SMTP impossible.", {
      code: err.code || (err.responseCode ? `SMTP_${err.responseCode}` : "SMTP"),
      transitoire: temporaire || CODES_TRANSITOIRES.has(err.code),
    });
  }
}

/** Vérifie la connexion et l'authentification SMTP (back-office). */
export async function verifierConnexionSmtp() {
  const { transport: t } = obtenirTransport();
  try {
    await t.verify();
  } catch (err) {
    throw new EmailError(err.code === "EAUTH" ? "Identifiants SMTP refusés." : err.message, { code: err.code || "SMTP" });
  }
}

const adresse = (champ) => champ?.value?.[0] ?? null;

/**
 * Relève les e-mails NON LUS du dossier IMAP, les passe à `traiter` un par
 * un, puis les marque lus une fois traités (un e-mail dont le traitement
 * échoue reste non lu : il sera relu à la prochaine relève).
 *
 * @param {(email: { message_id, expediteur, expediteur_nom, destinataire, sujet, texte, html,
 *   en_reponse_a, date_reception }) => Promise<void>} traiter
 * @param {{ limite?: number }} [options]
 * @returns {Promise<{ releves: number, erreurs: number } | null>} null si IMAP n'est pas configuré
 */
export async function releverBoiteImap(traiter, { limite = 50 } = {}) {
  const c = configImap();
  if (!c.host || !c.user || !c.pass) return null;

  const client = new ImapFlow({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: { user: c.user, pass: c.pass },
    logger: false,
    socketTimeout: 60_000,
  });
  let releves = 0;
  let erreurs = 0;
  await client.connect();
  const verrou = await client.getMailboxLock(c.dossier);
  try {
    const uids = (await client.search({ seen: false }, { uid: true })) || [];
    for (const uid of uids.slice(0, limite)) {
      try {
        const brut = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
        if (!brut?.source) continue;
        const m = await simpleParser(brut.source);
        const expediteur = adresse(m.from);
        await traiter({
          // Sans Message-ID (rare), un identifiant stable dérivé de la boîte.
          message_id: m.messageId || `<imap-${c.user}-${c.dossier}-${uid}>`,
          expediteur: expediteur?.address || "inconnu",
          expediteur_nom: expediteur?.name || null,
          destinataire: adresse(m.to)?.address || null,
          sujet: m.subject || "(sans objet)",
          texte: m.text || "",
          html: typeof m.html === "string" ? m.html : null,
          en_reponse_a: m.inReplyTo || null,
          date_reception: m.date || brut.internalDate || new Date(),
        });
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        releves += 1;
      } catch (err) {
        erreurs += 1;
        console.error(`[email] E-mail IMAP ${uid} non traité :`, err.message);
      }
    }
  } finally {
    verrou.release();
    await client.logout().catch(() => {});
  }
  return { releves, erreurs };
}
