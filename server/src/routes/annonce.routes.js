// src/routes/annonce.routes.js
//
// Point d'entrée du module autonome "Annonces" (voir schema.prisma,
// modèle Annonce — sans relation vers un autre module métier, même
// esprit que MobileApk). Un seul routeur, monté une seule fois dans
// l'app (ex. app.use("/api", annonceRoutes)).
//
// Middlewares utilisés (chemins réels du projet, voir aussi
// medecin.routes.js) :
//   - authentifier             (auth.middleware.js)   : exige un token
//                                 valide, sinon 401, peuple
//                                 req.utilisateur.
//   - autoriser(...roles)      (autorisation.middleware.js) : exige que
//                                 req.utilisateur.role fasse partie des
//                                 rôles donnés, sinon 403. (Le contrôleur
//                                 revérifie lui-même estAdmin() dans
//                                 chaque handler protégé — la garde ici
//                                 est une première ligne de défense,
//                                 même double contrôle que sur les
//                                 routes /medecins.)
//   - gererTeleversementAnnonce (upload.middleware.js) : middleware
//                                 d'upload (multer) qui place le champ
//                                 `fichier` dans req.files avant
//                                 creerAnnonce / modifierAnnonce — à
//                                 ajouter dans upload.middleware.js
//                                 (voir le patron documenté en tête de
//                                 annonce.controller.js).
//
// Accès :
//   - GET  /annonces, GET /annonces/:id            → PUBLIQUE
//   - POST /annonces, PUT/PATCH/DELETE /annonces/*  → admin/superadmin

import { Router } from "express";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import { gererTeleversementAnnonce } from "../middlewares/upload.middleware.js";

import {
  listerAnnonces,
  obtenirAnnonce,
  creerAnnonce,
  modifierAnnonce,
  activerAnnonce,
  desactiverAnnonce,
  supprimerAnnonce,
} from "../controllers/annonce.controller.js";

const router = Router();

/* ===================================================================
 * Annonces
 * =================================================================== */

// PUBLIQUE — liste des annonces, avec filtres optionnels
// (?statut=, ?recherche=, ?actives=true) gérés dans le contrôleur.
router.get("/annonces", listerAnnonces);

// PUBLIQUE — fiche détaillée d'une annonce.
router.get("/annonces/:id", obtenirAnnonce);

// Réservé à admin/superadmin. gererTeleversementAnnonce traite le
// fichier optionnel (`fichier`, image ou PDF) avant d'atteindre le
// contrôleur.
router.post(
  "/annonces",
  authentifier,
  autoriser("admin", "superadmin"),
  gererTeleversementAnnonce,
  creerAnnonce
);

// Réservé à admin/superadmin. gererTeleversementAnnonce traite un
// éventuel remplacement du fichier avant d'atteindre le contrôleur.
router.put(
  "/annonces/:id",
  authentifier,
  autoriser("admin", "superadmin"),
  gererTeleversementAnnonce,
  modifierAnnonce
);

// Actions explicites équivalentes à PUT /annonces/:id avec
// { statut: true|false } — même esprit que publier/suspendreMedecin.
// Réservées à admin/superadmin.
router.patch(
  "/annonces/:id/activer",
  authentifier,
  autoriser("admin", "superadmin"),
  activerAnnonce
);
router.patch(
  "/annonces/:id/desactiver",
  authentifier,
  autoriser("admin", "superadmin"),
  desactiverAnnonce
);

// Suppression physique — aucune table ne référence Annonce (modèle
// autonome, sans relation), donc pas de risque de contrainte P2003.
// Réservée à admin/superadmin.
router.delete(
  "/annonces/:id",
  authentifier,
  autoriser("admin", "superadmin"),
  supprimerAnnonce
);

export default router;