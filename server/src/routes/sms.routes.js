// src/routes/sms.routes.js
// SMS (Twilio) :
//   - administration (configuration, SMS de test, journal, renvoi) :
//     admin / superadmin ;
//   - rappel de statut Twilio : public, authentifié par la signature
//     X-Twilio-Signature (corps application/x-www-form-urlencoded) ;
//   - vérification de numéro par code : publique, limitée en débit
//     (limiteur IP dans index.js + plafonds par numéro / IP en base).

import express, { Router } from "express";
import {
  obtenirConfigurationSmsCtrl,
  envoyerSmsTestCtrl,
  listerMessagesSmsCtrl,
  renvoyerMessageSmsCtrl,
  statutSmsTwilioCtrl,
  demanderCodeVerificationCtrl,
  verifierCodeVerificationCtrl,
} from "../controllers/sms.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = Router();
// Configuration globale (sans pays) : superadmin seul.
const lecture = [authentifier, autoriser("superadmin")];

router.get("/sms/configuration", ...lecture, obtenirConfigurationSmsCtrl);
router.post("/sms/test", ...lecture, envoyerSmsTestCtrl);
router.get("/sms/messages", ...lecture, listerMessagesSmsCtrl);
router.post("/sms/messages/:id/renvoyer", ...lecture, renvoyerMessageSmsCtrl);

router.post("/sms/webhook/statut", express.urlencoded({ extended: false, limit: "20kb" }), statutSmsTwilioCtrl);

router.post("/verification-telephone/envoyer", demanderCodeVerificationCtrl);
router.post("/verification-telephone/verifier", verifierCodeVerificationCtrl);

export default router;
