// src/routes/ligneTarifaire.routes.js
// Phase 0 — Lignes tarifaires (commission APS, taxes, frais
// d'agrégateur), versionnées par pays et par type de frais. Réservé à
// admin/superadmin : ces taux déterminent directement ce qui est
// facturé/crédité, ce n'est pas un paramétrage médecin (à la
// différence de taux_frais_annulation_tardive, voir Phase 3).

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