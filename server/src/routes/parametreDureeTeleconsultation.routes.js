// src/routes/parametreDureeTeleconsultation.routes.js
// Téléconsultation — durée maximale d'un appel (minutes), par pays et
// versionnée. Lecture et création (= nouvelle version active) : admin / superadmin.

import { Router } from "express";
import {
  creerParametreDureeCtrl,
  listerParametresDureeCtrl,
  obtenirDureePaysCtrl,
} from "../controllers/parametreDureeTeleconsultation.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = Router();

router.get("/parametres-duree-teleconsultation", authentifier, autoriser("admin", "superadmin"), listerParametresDureeCtrl);
router.get(
  "/parametres-duree-teleconsultation/pays/:pays_id/actif",
  authentifier,
  autoriser("admin", "superadmin"),
  obtenirDureePaysCtrl
);
router.post("/parametres-duree-teleconsultation", authentifier, autoriser("admin", "superadmin"), creerParametreDureeCtrl);

export default router;
