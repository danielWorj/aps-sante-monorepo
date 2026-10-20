// src/routes/notification.routes.js
// Politique de fonds v2 §5 (étape 6) — notifications in-app de l'utilisateur connecté.
import { Router } from "express";
import { authentifier } from "../middlewares/auth.middleware.js";
import {
  listerNotifications,
  marquerNotificationLue,
  marquerToutesLues,
  enregistrerAppareilPush,
  retirerAppareilPush,
} from "../controllers/notification.controller.js";

const router = Router();

router.get("/notifications", authentifier, listerNotifications);
// « lues » (collection) avant « :id/lue » : aucun conflit, chemins distincts.
router.post("/notifications/lues", authentifier, marquerToutesLues);
router.patch("/notifications/:id/lue", authentifier, marquerNotificationLue);

// Push mobile : jeton FCM du téléphone (enregistré à la connexion, retiré à la déconnexion).
router.post("/notifications/appareils", authentifier, enregistrerAppareilPush);
router.delete("/notifications/appareils", authentifier, retirerAppareilPush);

export default router;
