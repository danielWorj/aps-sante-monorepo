// src/routes/email.routes.js
// E-mail (SMTP / IMAP) — administration (configuration, e-mail de test,
// journal des envois, boîte de réception) : superadmin, comme les SMS.

import { Router } from "express";
import {
  obtenirConfigurationEmailCtrl,
  verifierSmtpCtrl,
  envoyerEmailTestCtrl,
  listerMessagesEmailCtrl,
  renvoyerMessageEmailCtrl,
  listerEmailsRecusCtrl,
  obtenirEmailRecuCtrl,
  marquerEmailRecuCtrl,
  releverEmailsRecusCtrl,
} from "../controllers/email.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = Router();
// Configuration globale (sans pays) : superadmin seul.
const acces = [authentifier, autoriser("superadmin")];

router.get("/email/configuration", ...acces, obtenirConfigurationEmailCtrl);
router.post("/email/verifier", ...acces, verifierSmtpCtrl);
router.post("/email/test", ...acces, envoyerEmailTestCtrl);
router.get("/email/messages", ...acces, listerMessagesEmailCtrl);
router.post("/email/messages/:id/renvoyer", ...acces, renvoyerMessageEmailCtrl);
router.get("/email/recus", ...acces, listerEmailsRecusCtrl);
router.post("/email/recus/relever", ...acces, releverEmailsRecusCtrl);
router.get("/email/recus/:id", ...acces, obtenirEmailRecuCtrl);
router.patch("/email/recus/:id", ...acces, marquerEmailRecuCtrl);

export default router;
