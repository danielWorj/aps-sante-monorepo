// src/routes/laboratoire.routes.js
// Annuaire et portail des laboratoires d'analyses — voir
// controllers/laboratoire.controller.js et portailLaboratoire.controller.js.
//
//   laboratoire
//     GET liste / détail : PUBLIQUE (fiches publiées ; jeton facultatif pour
//       que le gestionnaire voie sa fiche non publiée et ne compte pas de vue)
//     POST   : tout utilisateur authentifié, multipart (image_laboratoire,
//              piece_identite, document_agrement) — crée aussi le compte agent
//     PUT    : agent de la fiche ou administration (fichiers facultatifs)
//     DELETE : superadmin
//   examens / centres : lecture PUBLIQUE, écriture agent ou administration
//   médiathèque       : lecture PUBLIQUE, gestion agent ou administration
//   avis              : lecture PUBLIQUE, dépôt compte connecté, modération admin
//   engagements       : enregistrement par le visiteur (jeton facultatif)
//   administration    : /admin/laboratoires, /admin/avis-laboratoire
import { Router } from "express";
import { authentifier } from "../middlewares/auth.middleware.js";
import { authentifierOptionnel } from "../middlewares/authOptionnel.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import {
  gererTeleversementLaboratoire,
  gererTeleversementMediaLaboratoire,
} from "../middlewares/upload.middleware.js";
import {
  changerStatutLaboratoire,
  creerCentre,
  creerExamen,
  creerLaboratoire,
  deposerAvisLaboratoire,
  listerAvisLaboratoire,
  listerAvisLaboratoireAdmin,
  listerCentres,
  listerExamens,
  listerLaboratoires,
  listerLaboratoiresAdmin,
  modererAvisLaboratoire,
  modifierCentre,
  modifierExamen,
  modifierLaboratoire,
  obtenirGestionLaboratoire,
  obtenirLaboratoire,
  obtenirMonLaboratoire,
  supprimerAvisLaboratoire,
  supprimerCentre,
  supprimerExamen,
  supprimerLaboratoire,
} from "../controllers/laboratoire.controller.js";
import {
  ajouterMedia,
  enregistrerEngagement,
  listerMediasGestion,
  listerMediasPublics,
  modifierMedia,
  obtenirTableauDeBord,
  ordonnerMedias,
  supprimerMedia,
} from "../controllers/portailLaboratoire.controller.js";

const router = Router();
const admin = [authentifier, autoriser("admin", "superadmin")];

// ─── Administration (back-office) ───────────────────────────────
router.get("/admin/laboratoires", ...admin, listerLaboratoiresAdmin);
router.patch("/admin/laboratoires/:id/statut", ...admin, changerStatutLaboratoire);
router.get("/admin/avis-laboratoire", ...admin, listerAvisLaboratoireAdmin);
router.patch("/admin/avis-laboratoire/:id", ...admin, modererAvisLaboratoire);

// ─── Fiches ─────────────────────────────────────────────────────
router.get("/laboratoires", listerLaboratoires);
// Avant "/laboratoires/:id" (sinon « mon-laboratoire » serait pris pour un id).
router.get("/laboratoires/mon-laboratoire", authentifier, obtenirMonLaboratoire);
router.get("/laboratoires/:id", authentifierOptionnel, obtenirLaboratoire);
router.get("/laboratoires/:id/gestion", authentifier, obtenirGestionLaboratoire);
router.get("/laboratoires/:id/tableau-de-bord", authentifier, obtenirTableauDeBord);
router.post("/laboratoires", authentifier, gererTeleversementLaboratoire, creerLaboratoire);
router.put("/laboratoires/:id", authentifier, gererTeleversementLaboratoire, modifierLaboratoire);
router.delete("/laboratoires/:id", authentifier, autoriser("superadmin"), supprimerLaboratoire);

// ─── Examens ────────────────────────────────────────────────────
router.get("/laboratoires/:id/examens", authentifierOptionnel, listerExamens);
router.post("/laboratoires/:id/examens", authentifier, creerExamen);
router.put("/examens-laboratoire/:id", authentifier, modifierExamen);
router.delete("/examens-laboratoire/:id", authentifier, supprimerExamen);

// ─── Centres de prélèvement ─────────────────────────────────────
router.get("/laboratoires/:id/centres", authentifierOptionnel, listerCentres);
router.post("/laboratoires/:id/centres", authentifier, creerCentre);
router.put("/centres-laboratoire/:id", authentifier, modifierCentre);
router.delete("/centres-laboratoire/:id", authentifier, supprimerCentre);

// ─── Médiathèque ────────────────────────────────────────────────
router.get("/laboratoires/:id/medias", listerMediasPublics);
router.get("/laboratoires/:id/medias/gestion", authentifier, listerMediasGestion);
router.post("/laboratoires/:id/medias", authentifier, gererTeleversementMediaLaboratoire, ajouterMedia);
router.put("/laboratoires/:id/medias/ordre", authentifier, ordonnerMedias);
router.put("/medias-laboratoire/:id", authentifier, modifierMedia);
router.delete("/medias-laboratoire/:id", authentifier, supprimerMedia);

// ─── Avis ───────────────────────────────────────────────────────
router.get("/laboratoires/:id/avis", authentifierOptionnel, listerAvisLaboratoire);
router.post("/laboratoires/:id/avis", authentifier, deposerAvisLaboratoire);
router.delete("/avis-laboratoire/:id", authentifier, supprimerAvisLaboratoire);

// ─── Engagements (fiche publique) ───────────────────────────────
router.post("/laboratoires/:id/engagements", authentifierOptionnel, enregistrerEngagement);

export default router;
