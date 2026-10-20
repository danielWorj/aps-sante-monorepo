// src/routes/contact.routes.js
// Page publique « Contactez-nous » + boîte de réception du back-office.
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authentifier } from "../middlewares/auth.middleware.js";
import { authentifierOptionnel } from "../middlewares/authOptionnel.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import {
  envoyerMessageContact,
  listerMessagesContact,
  modifierMessageContact,
  obtenirCoordonneesContact,
} from "../controllers/contact.controller.js";

const router = Router();

// Anti-spam : 5 messages par IP et par heure.
const limiteurContact = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Vous avez envoyé plusieurs messages récemment. Réessayez dans une heure." },
});

router.get("/contact/coordonnees", obtenirCoordonneesContact);
router.post("/contact", limiteurContact, authentifierOptionnel, envoyerMessageContact);

router.get("/admin/messages-contact", authentifier, autoriser("admin", "superadmin"), listerMessagesContact);
router.put("/admin/messages-contact/:id", authentifier, autoriser("admin", "superadmin"), modifierMessageContact);

export default router;
