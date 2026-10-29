// src/controllers/email.controller.js
// E-mail (SMTP / IMAP) — API d'administration : configuration, e-mail de
// test, journal des envois, boîte de réception. Toute la logique vit dans
// email.service.js.

import { configurationEmail, EmailError, verifierConnexionSmtp } from "../lib/emailService.js";
import {
  construireEmailHtml,
  envoyerEmail,
  ErreurEmail,
  listerEmailsRecus,
  listerMessagesEmail,
  marquerEmailRecu,
  releverEmailsRecus,
  renvoyerMessageEmail,
  RELANCE_FENETRE_H,
  RELANCE_MAX_TENTATIVES,
} from "../services/email.service.js";
import prisma from "../lib/prisma.js";

const STATUTS_MESSAGE = ["en_attente", "envoye", "echec"];
const TAILLE_PAGE_MAX = 100;

function repondreErreur(err, res, next) {
  if (err instanceof ErreurEmail) return res.status(err.status).json({ message: err.message, code: err.code });
  if (err instanceof EmailError) return res.status(502).json({ message: err.message, code: err.code });
  return next(err);
}

const pagination = (q) => ({
  page: Math.max(1, Number.parseInt(q.page, 10) || 1),
  taille: Math.min(TAILLE_PAGE_MAX, Math.max(1, Number.parseInt(q.taille, 10) || 50)),
});

/** GET /api/email/configuration — état du socle (jamais les secrets). */
export function obtenirConfigurationEmailCtrl(_req, res) {
  return res.status(200).json({
    configuration: {
      ...configurationEmail(),
      relance_max_tentatives: RELANCE_MAX_TENTATIVES,
      relance_fenetre_heures: RELANCE_FENETRE_H,
    },
  });
}

/** POST /api/email/verifier — teste la connexion et l'authentification SMTP. */
export async function verifierSmtpCtrl(_req, res, next) {
  try {
    await verifierConnexionSmtp();
    return res.status(200).json({ message: "Connexion SMTP établie : identifiants acceptés." });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** POST /api/email/test   body: { destinataire, sujet?, texte } */
export async function envoyerEmailTestCtrl(req, res, next) {
  try {
    const { destinataire, texte } = req.body ?? {};
    const sujet = String(req.body?.sujet || "Test e-mail APS Santé");
    const r = await envoyerEmail({
      destinataire, sujet, texte,
      html: construireEmailHtml({ titre: sujet, paragraphes: [String(texte ?? "")], pied: "E-mail de test envoyé depuis le back-office." }),
      origine: "test_back_office",
    });
    const ok = r.statut !== "echec";
    return res.status(ok ? 200 : 502).json({
      message: ok ? "E-mail accepté par le serveur SMTP." : r.erreur || "Échec de l'envoi.",
      code: ok ? undefined : r.erreur_code,
      resultat: r,
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** GET /api/email/messages?statut=&origine=&recherche=&page=&taille= */
export async function listerMessagesEmailCtrl(req, res, next) {
  try {
    const { statut, origine, recherche } = req.query;
    if (statut !== undefined && !STATUTS_MESSAGE.includes(statut)) {
      return res.status(400).json({ message: `statut invalide. Valeurs acceptées : ${STATUTS_MESSAGE.join(", ")}.` });
    }
    const journal = await listerMessagesEmail({
      statut, origine: origine || undefined, recherche: recherche || undefined, ...pagination(req.query),
    });
    return res.status(200).json(journal);
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** POST /api/email/messages/:id/renvoyer (e-mail en échec uniquement) */
export async function renvoyerMessageEmailCtrl(req, res, next) {
  try {
    const r = await renvoyerMessageEmail(req.params.id);
    const ok = r.statut !== "echec";
    return res.status(ok ? 200 : 502).json({
      message: ok ? "E-mail renvoyé." : r.erreur || "Nouvel échec de l'envoi.",
      code: ok ? undefined : r.erreur_code,
      resultat: r,
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** GET /api/email/recus?lu=true|false&recherche=&page=&taille= */
export async function listerEmailsRecusCtrl(req, res, next) {
  try {
    const lu = req.query.lu === "true" ? true : req.query.lu === "false" ? false : undefined;
    const boite = await listerEmailsRecus({ lu, recherche: req.query.recherche || undefined, ...pagination(req.query) });
    return res.status(200).json(boite);
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** GET /api/email/recus/:id — e-mail complet (texte ; le HTML n'est jamais rendu au back-office). */
export async function obtenirEmailRecuCtrl(req, res, next) {
  try {
    const email = await prisma.emailRecu.findUnique({
      where: { email_recu_id: req.params.id },
      omit: { html: true },
      include: { message_email: { select: { message_email_id: true, origine: true, sujet: true, destinataire: true, date_envoi: true } } },
    });
    if (!email) return res.status(404).json({ message: "E-mail introuvable." });
    return res.status(200).json({ email });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** PATCH /api/email/recus/:id   body: { lu: boolean } */
export async function marquerEmailRecuCtrl(req, res, next) {
  try {
    await marquerEmailRecu(req.params.id, req.body?.lu !== false);
    return res.status(200).json({ message: "E-mail mis à jour." });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** POST /api/email/recus/relever — relève immédiate de la boîte IMAP. */
export async function releverEmailsRecusCtrl(_req, res, next) {
  try {
    const r = await releverEmailsRecus();
    if (!r) return res.status(409).json({ code: "IMAP_NON_CONFIGURE", message: "IMAP non configuré (IMAP_HOST, IMAP_USER, IMAP_PASSWORD)." });
    return res.status(200).json({ message: `${r.releves} e-mail(s) relevé(s).`, ...r });
  } catch (err) {
    // Serveur IMAP injoignable ou identifiants refusés.
    return res.status(502).json({ code: "IMAP", message: `Relève impossible : ${err.message}` });
  }
}
