// src/routes/urgences.routes.js

import { Router } from "express";
import {
  listerTypesUrgence,
  obtenirTypeUrgence,
  creerTypeUrgence,
  modifierTypeUrgence,
  supprimerTypeUrgence,
  listerUrgences,
  obtenirUrgence,
  creerUrgence,
  modifierUrgence,
  supprimerUrgence,
} from "../controllers/urgences.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = Router();

// ─── Types d'Urgence ──────────────────────────────────────────
// Lecture : PUBLIQUE.
// Écriture : admin ou superadmin.
router.get("/types-urgence", listerTypesUrgence);
router.get("/types-urgence/:id", obtenirTypeUrgence);
router.post("/types-urgence", authentifier, autoriser("admin", "superadmin"), creerTypeUrgence);
router.put("/types-urgence/:id", authentifier, autoriser("admin", "superadmin"), modifierTypeUrgence);
router.delete("/types-urgence/:id", authentifier, autoriser("superadmin"), supprimerTypeUrgence);

// ─── Urgences (Numéros) ───────────────────────────────────────
// Lecture : PUBLIQUE.
// Écriture : admin ou superadmin.
router.get("/urgences", listerUrgences);
router.get("/urgences/:id", obtenirUrgence);
router.post("/urgences", authentifier, autoriser("admin", "superadmin"), creerUrgence);
router.put("/urgences/:id", authentifier, autoriser("admin", "superadmin"), modifierUrgence);
router.delete("/urgences/:id", authentifier, autoriser("superadmin"), supprimerUrgence);

export default router;