// src/routes/portefeuille.routes.js
// Phase 1 — Portefeuille médecin & grand-livre. Routeur dédié, monté
// séparément dans index.js — même patron que ligneTarifaire.routes.js
// (Phase 0) et paiement.routes.js : un sous-module du paiement qui
// touche à la ressource médecin, mais géré hors de medecin.routes.js.

import { Router } from "express";
import { obtenirPortefeuilleMedecin } from "../controllers/portefeuille.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";

const router = Router();

// Autorisation fine (médecin propriétaire vs admin/superadmin) gérée
// à l'intérieur du contrôleur, comme pour /medecins/:id.
router.get("/medecins/:id/portefeuille", authentifier, obtenirPortefeuilleMedecin);

export default router;