// src/routes/avis.routes.js
// Sous-module "Pharmacie — Avis" : table avis_pharmacie.
//
// Lecture (GET) : PUBLIQUE (mais un avis non "publie" n'est visible
// qu'à son auteur ou à admin/superadmin — filtrage fait dans le
// contrôleur, voir avis.controller.js). Pas de middleware
// "authentifier" imposé sur les GET : req.utilisateur reste undefined
// pour un visiteur anonyme, ce que le contrôleur gère explicitement.
//
// Création (POST) : tout utilisateur authentifié.
// Modification (PUT) : auteur (tant que "en_attente") ou
// admin/superadmin (statut_moderation à tout moment).
// Suppression (DELETE) : auteur ou admin/superadmin.
import { Router } from "express";
import {
  listerAvisPharmacie,
  obtenirAvisPharmacie,
  creerAvisPharmacie,
  modifierAvisPharmacie,
  supprimerAvisPharmacie,
} from "../controllers/avis.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { authentifierOptionnel } from "../middlewares/authOptionnel.middleware.js";

const router = Router();

// authentifierOptionnel (et non authentifier) : la lecture reste
// publique, mais req.utilisateur doit être renseigné quand un token
// valide est fourni, pour que le contrôleur puisse lever le filtre de
// modération pour l'auteur/admin (voir avis.controller.js).
router.get("/avis-pharmacie", authentifierOptionnel, listerAvisPharmacie);
router.get("/avis-pharmacie/:id", authentifierOptionnel, obtenirAvisPharmacie);

router.post("/avis-pharmacie", authentifier, creerAvisPharmacie);
router.put("/avis-pharmacie/:id", authentifier, modifierAvisPharmacie);
router.delete("/avis-pharmacie/:id", authentifier, supprimerAvisPharmacie);

export default router;