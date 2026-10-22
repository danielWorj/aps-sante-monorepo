// src/routes/documentLegal.routes.js
// Documents légaux (CGU, politique de confidentialité) : lecture publique
// pour le site, rédaction et publication réservées au superadmin.
import { Router } from "express";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import {
  creerBrouillonDocumentLegal,
  listerAcceptationsDocumentLegal,
  listerVersionsDocumentLegal,
  modifierBrouillonDocumentLegal,
  obtenirDocumentLegal,
  obtenirVersionDocumentLegal,
  publierVersionDocumentLegal,
  supprimerBrouillonDocumentLegal,
} from "../controllers/documentLegal.controller.js";

const router = Router();

router.get("/documents-legaux/:type", obtenirDocumentLegal);

const superadmin = [authentifier, autoriser("superadmin")];
router.get("/admin/documents-legaux", ...superadmin, listerVersionsDocumentLegal);
router.post("/admin/documents-legaux", ...superadmin, creerBrouillonDocumentLegal);
router.get("/admin/documents-legaux/versions/:id", ...superadmin, obtenirVersionDocumentLegal);
router.put("/admin/documents-legaux/versions/:id", ...superadmin, modifierBrouillonDocumentLegal);
router.post("/admin/documents-legaux/versions/:id/publier", ...superadmin, publierVersionDocumentLegal);
router.delete("/admin/documents-legaux/versions/:id", ...superadmin, supprimerBrouillonDocumentLegal);
router.get("/admin/documents-legaux/versions/:id/acceptations", ...superadmin, listerAcceptationsDocumentLegal);

export default router;
