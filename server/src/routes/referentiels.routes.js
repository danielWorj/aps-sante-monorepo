// src/routes/referentiels.routes.js
// Composant "référentiels" : Langue, Devise, Pays, Ville, Role.
//
// Lecture (GET) :
//   - Langue / Devise / Pays / Ville : PUBLIQUE, sans authentification.
//     Ces données géographiques non sensibles doivent être consultables
//     AVANT inscription (ex : remplir un `pays_id` dans un formulaire
//     public). Les laisser derrière `authentifier` créait un problème
//     d'œuf-et-poule : impossible de lister les pays sans déjà avoir
//     un compte.
//   - Role (IAM) : reste réservé aux utilisateurs authentifiés, ces
//     données décrivant la structure des privilèges de la plateforme.
// Écriture (POST/PUT) : admin ou superadmin.
// Suppression (DELETE) : superadmin uniquement (impact transverse sur
// les autres modules qui référencent ces tables par FK).
import { Router } from "express";
import {
  listerLangues,
  obtenirLangue,
  creerLangue,
  modifierLangue,
  supprimerLangue,
  listerDevises,
  obtenirDevise,
  creerDevise,
  modifierDevise,
  supprimerDevise,
  listerPays,
  obtenirPays,
  creerPays,
  modifierPays,
  supprimerPays,
  listerVilles,
  obtenirVille,
  creerVille,
  modifierVille,
  supprimerVille,
  listerRoles,
  obtenirRole,
  creerRole,
  modifierRole,
  supprimerRole,
} from "../controllers/referentiels.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = Router();

// ─── Langues ──────────────────────────────────────────────────
router.get("/langues", listerLangues);
router.get("/langues/:id", obtenirLangue);
router.post("/langues", authentifier, autoriser("admin", "superadmin"), creerLangue);
router.put("/langues/:id", authentifier, autoriser("admin", "superadmin"), modifierLangue);
router.delete("/langues/:id", authentifier, autoriser("superadmin"), supprimerLangue);

// ─── Devises ──────────────────────────────────────────────────
router.get("/devises", listerDevises);
router.get("/devises/:id", obtenirDevise);
router.post("/devises", authentifier, autoriser("admin", "superadmin"), creerDevise);
router.put("/devises/:id", authentifier, autoriser("admin", "superadmin"), modifierDevise);
router.delete("/devises/:id", authentifier, autoriser("superadmin"), supprimerDevise);

// ─── Pays ─────────────────────────────────────────────────────
router.get("/pays", listerPays);
router.get("/pays/:id", obtenirPays);
router.post("/pays", authentifier, autoriser("admin", "superadmin"), creerPays);
router.put("/pays/:id", authentifier, autoriser("admin", "superadmin"), modifierPays);
router.delete("/pays/:id", authentifier, autoriser("superadmin"), supprimerPays);

// ─── Villes ───────────────────────────────────────────────────
router.get("/villes", listerVilles);
router.get("/villes/:id", obtenirVille);
router.post("/villes", authentifier, autoriser("admin", "superadmin"), creerVille);
router.put("/villes/:id", authentifier, autoriser("admin", "superadmin"), modifierVille);
router.delete("/villes/:id", authentifier, autoriser("superadmin"), supprimerVille);

// ─── Rôles (IAM) ──────────────────────────────────────────────
router.get("/roles", authentifier, listerRoles);
router.get("/roles/:id", authentifier, obtenirRole);
router.post("/roles", authentifier, autoriser("superadmin"), creerRole);
router.put("/roles/:id", authentifier, autoriser("superadmin"), modifierRole);
router.delete("/roles/:id", authentifier, autoriser("superadmin"), supprimerRole);

export default router;