// src/routes/parametreAmende.routes.js
// Politique de fonds v2 §7 — Taux d'amende du médecin, par pays et
// versionné. Réservé à admin/superadmin.

import { Router } from "express";
import { listerParametresAmende, creerParametreAmende } from "../controllers/parametreAmende.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = Router();

router.get("/parametres-amende", authentifier, autoriser("admin", "superadmin"), listerParametresAmende);
router.post("/parametres-amende", authentifier, autoriser("admin", "superadmin"), creerParametreAmende);

export default router;
