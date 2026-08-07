// src/routes/centreSante.routes.js
// Composant "annuaire — centre de santé" : structure_sante (cliniques,
// hôpitaux, centres médicaux, dispensaires, laboratoires).
//
// Lecture (GET) : PUBLIQUE, sans authentification. Même logique que le
// référentiel géographique (voir referentiels.routes.js) : l'Annuaire
// doit précéder Pharmacie/RDV/Urgences et être consultable avant
// inscription (ex : recherche d'un centre proche avant de créer un
// compte patient).
// Écriture (POST/PUT) : admin ou superadmin.
// Suppression (DELETE) : superadmin uniquement (des agents peuvent être
// rattachés à la structure ; d'autres modules — RDV, avis — s'appuient
// sur cette fiche).
import { Router } from "express";
import {
  listerCentresSante,
  obtenirCentreSante,
  creerCentreSante,
  modifierCentreSante,
  supprimerCentreSante,
} from "../controllers/centreSante.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = Router();

// ─── Centres de santé ─────────────────────────────────────────
router.get("/centres-sante", listerCentresSante);
router.get("/centres-sante/:id", obtenirCentreSante);
router.post(
  "/centres-sante",
  authentifier,
  autoriser("admin", "superadmin"),
  creerCentreSante
);
router.put(
  "/centres-sante/:id",
  authentifier,
  autoriser("admin", "superadmin"),
  modifierCentreSante
);
router.delete(
  "/centres-sante/:id",
  authentifier,
  autoriser("superadmin"),
  supprimerCentreSante
);

export default router;