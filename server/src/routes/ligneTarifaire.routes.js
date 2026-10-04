// src/routes/ligneTarifaire.routes.js
// Lignes tarifaires (commission médecin CM et commission patient CP depuis
// la politique de fonds v2), versionnées par pays. Réservé à
// admin/superadmin : ces taux déterminent directement ce que paie le
// patient (CP) et ce qui est crédité au médecin (CM).

import { Router } from "express";
import {
  listerLignesTarifaires,
  creerLigneTarifaire,
} from "../controllers/ligneTarifaire.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = Router();

router.get(
  "/lignes-tarifaires",
  authentifier,
  autoriser("admin", "superadmin"),
  listerLignesTarifaires
);
router.post(
  "/lignes-tarifaires",
  authentifier,
  autoriser("admin", "superadmin"),
  creerLigneTarifaire
);

export default router;