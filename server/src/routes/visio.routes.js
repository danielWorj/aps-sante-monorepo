// src/routes/visio.routes.js
import { Router } from "express";
import { cloturerVisio, obtenirBilanVisio, obtenirTokenVisio, signalerPresenceVisio } from "../controllers/visio.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/visio/token", authentifier, obtenirTokenVisio);

// L'application signale que l'utilisateur est réellement entré dans la salle
// (en plus du webhook Prosody, qui peut manquer).
router.post("/visio/:id/presence", authentifier, signalerPresenceVisio);

// Fin d'appel : le médecin clôt la consultation (fin constatée, paiement dans
// T heures) ; le patient lit le bilan (noter, avis, litige).
router.post("/visio/:id/cloture", authentifier, cloturerVisio);
router.get("/visio/:id/cloture", authentifier, obtenirBilanVisio);

export default router;
