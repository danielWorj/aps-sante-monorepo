// src/routes/utilisateurs.routes.js
// Composant "utilisateurs" : gestion des comptes privilégiés
// (admin / superadmin) UNIQUEMENT. La création de patients, médecins
// et agent_xxx reste du ressort de authentification.routes.js
// (POST /api/auth/comptes).
//
// ─── Modèle de permissions (voir aussi utilisateurs.controller.js) ──
//  - Lecture (GET)         : "admin" ET "superadmin"
//  - Écriture (POST/PATCH) : "superadmin" SEUL
//
// Toutes les routes de ce composant exigent d'être authentifié — il
// n'existe aucune route publique ici, contrairement à
// authentification.routes.js (/register, /login, ...).
import { Router } from "express";
import {
  listerUtilisateurs,
  obtenirUtilisateur,
  creerUtilisateur,
  modifierUtilisateur,
  suspendreUtilisateur,
  reactiverUtilisateur,
} from "../controllers/utilisateurs.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = Router();

// Appliquée à toutes les routes ci-dessous : il faut un access token
// valide pour atteindre ce composant.
router.use(authentifier);

// ─── Lecture : admin ET superadmin ───────────────────────────
router.get("/", autoriser("admin", "superadmin"), listerUtilisateurs);
router.get("/:id", autoriser("admin", "superadmin"), obtenirUtilisateur);

// ─── Écriture : superadmin SEUL ──────────────────────────────
// Le contrôleur revérifie aussi req.utilisateur.role === "superadmin"
// en défense en profondeur (voir utilisateurs.controller.js) : même si
// cette route était un jour mal configurée, l'écriture resterait
// bloquée pour un simple admin.
router.post("/", autoriser("superadmin"), creerUtilisateur);
router.patch("/:id", autoriser("superadmin"), modifierUtilisateur);
router.patch("/:id/suspendre", autoriser("superadmin"), suspendreUtilisateur);
router.patch("/:id/reactiver", autoriser("superadmin"), reactiverUtilisateur);

export default router;