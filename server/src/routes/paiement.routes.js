import { Router } from "express";
import { authentifier } from "../middlewares/auth.middleware.js";
import { creerPaiementRdv, creerPaymentSheetRdv, obtenirStatutPaiementRdv } from "../controllers/paiement.controller.js";

const router = Router();
router.post("/rendez-vous/:id/paiement", authentifier, creerPaiementRdv);
router.post("/rendez-vous/:id/paiement-natif", authentifier, creerPaymentSheetRdv);
router.get("/rendez-vous/:id/paiement", authentifier, obtenirStatutPaiementRdv);
export default router;