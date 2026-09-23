// src/routes/configurationTarifaire.routes.js
// Phase 0 — Configuration tarifaire (commission APS, taxes, frais
// d'agrégateur), versionnée par pays. Réservé à admin/superadmin : ces
// taux déterminent directement ce qui est facturé/crédité, ce n'est
// pas un paramétrage médecin (à la différence de
// taux_frais_annulation_tardive, voir Phase 3).

import { Router } from "express";
import {
  listerConfigurationsTarifaires,
  creerConfigurationTarifaire,
} from "../controllers/configurationTarifaire.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = Router();

router.get(
  "/configurations-tarifaires",
  authentifier,
  autoriser("admin", "superadmin"),
  listerConfigurationsTarifaires
);
router.post(
  "/configurations-tarifaires",
  authentifier,
  autoriser("admin", "superadmin"),
  creerConfigurationTarifaire
);

export default router;