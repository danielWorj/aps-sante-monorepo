// src/routes/onmc.routes.js
// Tableau de l'Ordre National des Médecins du Cameroun (ONMC).
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import {
  lancerSynchronisationOnmc,
  listerRegistreOnmc,
  obtenirEtatOnmc,
  verifierOrdre,
  verifierOrdreMedecin,
} from "../controllers/onmc.controller.js";

const router = Router();

// La vérification publique peut solliciter le site de l'ONMC : débit limité.
const limiteurVerification = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de vérifications, réessayez dans une minute." },
});

// PUBLIQUES : utilisables avant toute création de compte (inscription médecin).
router.get("/onmc/verifier", limiteurVerification, verifierOrdre);
router.post("/medecins/verifier-ordre", limiteurVerification, verifierOrdre);

// Back-office.
router.get("/onmc/etat", authentifier, autoriser("admin", "superadmin"), obtenirEtatOnmc);
router.get("/onmc/registre", authentifier, autoriser("admin", "superadmin"), listerRegistreOnmc);
router.post("/onmc/synchroniser", authentifier, autoriser("admin", "superadmin"), lancerSynchronisationOnmc);
router.post("/medecins/:id/verifier-ordre", authentifier, autoriser("admin", "superadmin"), verifierOrdreMedecin);

export default router;
