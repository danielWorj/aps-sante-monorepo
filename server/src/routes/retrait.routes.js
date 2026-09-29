// src/routes/retrait.routes.js
// Phase 6 — Retrait du médecin. Routeur dédié monté sur /api (même patron que portefeuille.routes.js).

import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import {
  approuverRetrait, demanderRetrait, listerMesRetraits, listerRetraits, marquerEchoue,
  obtenirSoldeCampay, rattacherReference, rejeterDemandeRetrait,
} from "../controllers/retrait.controller.js";

// Une demande = un décaissement potentiel : limite serrée, par utilisateur (repli sur l'IP).
const limiteurRetrait = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.utilisateur?.utilisateur_id ?? ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de demandes de retrait, réessayez dans quelques minutes." },
});

const router = Router();

// Médecin (propriétaire) — l'autorisation fine est faite dans le contrôleur.
router.post("/medecins/:id/retraits", authentifier, limiteurRetrait, demanderRetrait);
router.get("/medecins/:id/retraits", authentifier, listerMesRetraits);

// Admin / superadmin
const admin = [authentifier, autoriser("admin", "superadmin")];
router.get("/retraits", ...admin, listerRetraits);
router.get("/retraits/solde-campay", ...admin, obtenirSoldeCampay);
router.post("/retraits/:id/approuver", ...admin, approuverRetrait);
router.post("/retraits/:id/rejeter", ...admin, rejeterDemandeRetrait);
router.post("/retraits/:id/rattacher-reference", ...admin, rattacherReference);
router.post("/retraits/:id/marquer-echoue", ...admin, marquerEchoue);

export default router;