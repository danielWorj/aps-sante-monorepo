// src/controllers/sms.controller.js
// SMS (Twilio) — API d'administration (configuration, SMS de test, journal),
// rappel de statut Twilio, et vérification de numéro par code (publique).
// Toute la logique vit dans sms.service.js et verificationTelephone.service.js.

import { configurationTwilio, signatureTwilioValide } from "../lib/twilioSmsService.js";
import {
  ErreurSms,
  envoyerSms,
  listerMessagesSms,
  modeSms,
  paysSmsAutorises,
  renvoyerMessageSms,
  traiterStatutSmsTwilio,
  RELANCE_FENETRE_H,
  RELANCE_MAX_TENTATIVES,
} from "../services/sms.service.js";
import { demanderCodeVerification, verifierCodeVerification } from "../services/verificationTelephone.service.js";

const STATUTS_MESSAGE = ["en_attente", "envoye", "delivre", "echec", "simule"];
const TAILLE_PAGE_MAX = 100;

function repondreErreur(err, res, next) {
  if (err instanceof ErreurSms) {
    return res.status(err.status).json({
      message: err.message,
      code: err.code,
      ...(err.attente_s !== undefined && { attente_s: err.attente_s }),
      ...(err.tentatives_restantes !== undefined && { tentatives_restantes: err.tentatives_restantes }),
    });
  }
  return next(err);
}

/* ============================== Back-office ============================== */

/** GET /api/sms/configuration — état du socle (jamais les secrets). */
export function obtenirConfigurationSmsCtrl(_req, res) {
  return res.status(200).json({
    configuration: {
      mode: modeSms(),
      pays_autorises: paysSmsAutorises(),
      twilio: configurationTwilio(),
      relance_max_tentatives: RELANCE_MAX_TENTATIVES,
      relance_fenetre_heures: RELANCE_FENETRE_H,
    },
  });
}

/** POST /api/sms/test   body: { destinataire, texte } */
export async function envoyerSmsTestCtrl(req, res, next) {
  try {
    const { destinataire, texte } = req.body ?? {};
    const r = await envoyerSms({ destinataire, texte, origine: "test_back_office", utilisateur_id: null });
    const ok = r.statut !== "echec";
    return res.status(ok ? 200 : 502).json({
      message: !ok
        ? r.erreur || "Échec de l'envoi."
        : r.statut === "simule"
          ? "SMS simulé (SMS_MODE=test) : rien n'a été envoyé, le texte est dans la console du serveur."
          : "SMS accepté par Twilio.",
      code: ok ? undefined : r.erreur_code,
      resultat: r,
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** GET /api/sms/messages?statut=&origine=&recherche=&page=&taille= */
export async function listerMessagesSmsCtrl(req, res, next) {
  try {
    const { statut, origine, recherche } = req.query;
    if (statut !== undefined && !STATUTS_MESSAGE.includes(statut)) {
      return res.status(400).json({ message: `statut invalide. Valeurs acceptées : ${STATUTS_MESSAGE.join(", ")}.` });
    }
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const taille = Math.min(TAILLE_PAGE_MAX, Math.max(1, Number.parseInt(req.query.taille, 10) || 50));
    const journal = await listerMessagesSms({
      statut,
      origine: origine || undefined,
      recherche: recherche || undefined,
      page,
      taille,
    });
    return res.status(200).json(journal);
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** POST /api/sms/messages/:id/renvoyer (SMS en échec uniquement) */
export async function renvoyerMessageSmsCtrl(req, res, next) {
  try {
    const r = await renvoyerMessageSms(req.params.id);
    const ok = r.statut !== "echec";
    return res.status(ok ? 200 : 502).json({
      message: ok ? "SMS renvoyé." : r.erreur || "Nouvel échec de l'envoi.",
      code: ok ? undefined : r.erreur_code,
      resultat: r,
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/* ========================= Rappel de statut Twilio ========================= */

/**
 * POST /api/sms/webhook/statut (application/x-www-form-urlencoded, signé).
 * La signature est calculée sur l'URL déclarée à Twilio : on utilise donc
 * TWILIO_STATUS_CALLBACK_URL telle quelle (l'URL vue derrière nginx diffère).
 */
export async function statutSmsTwilioCtrl(req, res, next) {
  try {
    const url = process.env.TWILIO_STATUS_CALLBACK_URL;
    if (!url) return res.status(404).end();
    if (!signatureTwilioValide({ signature: req.get("X-Twilio-Signature"), url, parametres: req.body ?? {} })) {
      return res.status(403).json({ message: "Signature Twilio invalide." });
    }
    await traiterStatutSmsTwilio(req.body ?? {});
    // Twilio n'attend qu'un 2xx ; tout autre code déclenche des relances.
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

/* ===================== Vérification de numéro (publique) ===================== */

/** POST /api/verification-telephone/envoyer   body: { telephone, pays_iso2?, objet, canal? } */
export async function demanderCodeVerificationCtrl(req, res, next) {
  try {
    const { telephone, pays_iso2, objet, canal } = req.body ?? {};
    const r = await demanderCodeVerification({ telephone, pays_iso2, objet, canal, adresse_ip: req.ip ?? null });
    return res.status(200).json({ message: `Code envoyé au ${r.telephone_masque}.`, ...r });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** POST /api/verification-telephone/verifier   body: { telephone, pays_iso2?, objet, code } */
export async function verifierCodeVerificationCtrl(req, res, next) {
  try {
    const { telephone, pays_iso2, objet, code } = req.body ?? {};
    const r = await verifierCodeVerification({ telephone, pays_iso2, objet, code });
    return res.status(200).json({ message: "Numéro vérifié.", ...r });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}
