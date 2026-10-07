// src/routes/parametreDelaiLiberation.routes.js
// Libération différée des fonds — Phase 4 : délai T (heures) avant libération
// des fonds, par pays et versionné.
//   - Lecture : admin / superadmin.
//   - Création (= nouvelle version active) : superadmin uniquement (le délai
//     de séquestre est un paramètre financier saisi par le super admin).

import { Router } from "express";
import {
  listerParametresDelaiLiberation,
  obtenirParametreDelaiLiberationActif,
  creerParametreDelaiLiberation,
} from "../controllers/parametreDelaiLiberation.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = Router();

router.get(
  "/parametres-delai-liberation",
  authentifier,
  autoriser("admin", "superadmin"),
  listerParametresDelaiLiberation
);
router.get(
  "/parametres-delai-liberation/pays/:pays_id/actif",
  authentifier,
  autoriser("admin", "superadmin"),
  obtenirParametreDelaiLiberationActif
);
router.post(
  "/parametres-delai-liberation",
  authentifier,
  autoriser("superadmin"),
  creerParametreDelaiLiberation
);

export default router;