// src/routes/fraisAgregateur.routes.js
// Politique de fonds v2 — Frais d'agrégateur (Stripe / CamPay), par type
// (envoi / remboursement), versionnés. Réservé à admin/superadmin : ces
// frais déterminent le montant débité au patient et ce qui lui est
// remboursé.

import { Router } from "express";
import { listerFraisAgregateur, creerFraisAgregateur } from "../controllers/fraisAgregateur.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = Router();

router.get("/frais-agregateur", authentifier, autoriser("admin", "superadmin"), listerFraisAgregateur);
router.post("/frais-agregateur", authentifier, autoriser("admin", "superadmin"), creerFraisAgregateur);

export default router;
