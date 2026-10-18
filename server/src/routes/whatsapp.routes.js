// src/routes/whatsapp.routes.js
// WhatsApp — administration du socle d'envoi.
//   - Lecture (configuration, numéros, journal), message de test, renvoi
//     d'un échec, vérification chez Meta : admin / superadmin.
//   - Création, modification, activation, désactivation, suppression d'un
//     numéro expéditeur : superadmin (tous les messages de la plateforme
//     partent de ce numéro).

import { Router } from "express";
import {
  obtenirConfigurationWhatsappCtrl,
  listerNumerosWhatsappCtrl,
  creerNumeroWhatsappCtrl,
  modifierNumeroWhatsappCtrl,
  activerNumeroWhatsappCtrl,
  desactiverNumeroWhatsappCtrl,
  supprimerNumeroWhatsappCtrl,
  verifierNumeroWhatsappCtrl,
  envoyerMessageTestWhatsappCtrl,
  listerMessagesWhatsappCtrl,
  renvoyerMessageWhatsappCtrl,
  listerModelesMessageCtrl,
  modifierModeleMessageCtrl,
} from "../controllers/whatsapp.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = Router();
const lecture = [authentifier, autoriser("admin", "superadmin")];
const gestion = [authentifier, autoriser("superadmin")];

router.get("/whatsapp/configuration", ...lecture, obtenirConfigurationWhatsappCtrl);

router.get("/whatsapp/numeros", ...lecture, listerNumerosWhatsappCtrl);
router.post("/whatsapp/numeros", ...gestion, creerNumeroWhatsappCtrl);
router.patch("/whatsapp/numeros/:id", ...gestion, modifierNumeroWhatsappCtrl);
router.post("/whatsapp/numeros/:id/activer", ...gestion, activerNumeroWhatsappCtrl);
router.post("/whatsapp/numeros/:id/desactiver", ...gestion, desactiverNumeroWhatsappCtrl);
router.delete("/whatsapp/numeros/:id", ...gestion, supprimerNumeroWhatsappCtrl);
router.post("/whatsapp/numeros/:id/verifier", ...lecture, verifierNumeroWhatsappCtrl);

router.post("/whatsapp/test", ...lecture, envoyerMessageTestWhatsappCtrl);

router.get("/whatsapp/messages", ...lecture, listerMessagesWhatsappCtrl);
router.post("/whatsapp/messages/:id/renvoyer", ...lecture, renvoyerMessageWhatsappCtrl);

// Textes des notifications (publicité acceptée / rejetée / payée…).
router.get("/whatsapp/modeles-messages", ...lecture, listerModelesMessageCtrl);
router.put("/whatsapp/modeles-messages/:code", ...lecture, modifierModeleMessageCtrl);

export default router;
