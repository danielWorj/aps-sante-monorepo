import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authentifier } from "../middlewares/auth.middleware.js";
import { creerPaiementRdv, creerPaymentSheetRdv, obtenirStatutPaiementRdv } from "../controllers/paiement.controller.js";
import { creerPaiementCampayRdv } from "../controllers/paiementCampay.controller.js";

// Limiteur anti-spam : chaque appel déclenche une demande USSD sur le téléphone du payeur.
const limiteurCampay = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives de paiement, réessayez dans quelques minutes." },
});

const router = Router();
router.post("/rendez-vous/:id/paiement", authentifier, creerPaiementRdv);
router.post("/rendez-vous/:id/paiement-natif", authentifier, creerPaymentSheetRdv);
router.post("/rendez-vous/:id/paiement-campay", authentifier, limiteurCampay, creerPaiementCampayRdv);
router.get("/rendez-vous/:id/paiement", authentifier, obtenirStatutPaiementRdv);
export default router;