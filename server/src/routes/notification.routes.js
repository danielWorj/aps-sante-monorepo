// src/routes/notification.routes.js
// Politique de fonds v2 §5 (étape 6) — notifications in-app de l'utilisateur connecté.
import { Router } from "express";
import { authentifier } from "../middlewares/auth.middleware.js";
import {
  listerNotifications,
  marquerNotificationLue,
  marquerToutesLues,
} from "../controllers/notification.controller.js";

const router = Router();

router.get("/notifications", authentifier, listerNotifications);
// « lues » (collection) avant « :id/lue » : aucun conflit, chemins distincts.
router.post("/notifications/lues", authentifier, marquerToutesLues);
router.patch("/notifications/:id/lue", authentifier, marquerNotificationLue);

export default router;
