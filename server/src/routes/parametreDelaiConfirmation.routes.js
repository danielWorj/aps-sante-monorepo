// src/routes/parametreDelaiConfirmation.routes.js
// Agenda — délai H (heures) pendant lequel un RDV non confirmé garde son
// créneau, par pays et versionné.
//   - Lecture et création (= nouvelle version active) : admin / superadmin
//     (paramètre opérationnel, sans incidence financière directe).

import { Router } from "express";
import {
  listerParametresDelaiConfirmationCtrl,
  obtenirDelaiConfirmationPaysCtrl,
  creerParametreDelaiConfirmationCtrl,
} from "../controllers/parametreDelaiConfirmation.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = Router();

router.get(
  "/parametres-delai-confirmation",
  authentifier,
  autoriser("admin", "superadmin"),
  listerParametresDelaiConfirmationCtrl
);
router.get(
  "/parametres-delai-confirmation/pays/:pays_id/actif",
  authentifier,
  autoriser("admin", "superadmin"),
  obtenirDelaiConfirmationPaysCtrl
);
router.post(
  "/parametres-delai-confirmation",
  authentifier,
  autoriser("admin", "superadmin"),
  creerParametreDelaiConfirmationCtrl
);

export default router;
