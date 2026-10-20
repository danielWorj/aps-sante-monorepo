// src/routes/visio.routes.js
import { Router } from "express";
import { cloturerVisio, obtenirBilanVisio, obtenirTokenVisio } from "../controllers/visio.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/visio/token", authentifier, obtenirTokenVisio);

// Fin d'appel : le médecin clôt la consultation (fin constatée, paiement dans
// T heures) ; le patient lit le bilan (noter, avis, litige).
router.post("/visio/:id/cloture", authentifier, cloturerVisio);
router.get("/visio/:id/cloture", authentifier, obtenirBilanVisio);

export default router;
