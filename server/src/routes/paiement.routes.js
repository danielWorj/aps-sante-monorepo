import { Router } from "express";
import { authentifier } from "../middlewares/auth.middleware.js";
import { limiteurCampay } from "../middlewares/limiteurCampay.js";
import { creerPaiementRdv, creerPaymentSheetRdv, obtenirStatutPaiementRdv, obtenirDevisPaiementRdv, annulerPaiementEnCoursRdv } from "../controllers/paiement.controller.js";
import { creerPaiementCampayRdv } from "../controllers/paiementCampay.controller.js";
import { obtenirFactureRdv } from "../controllers/facture.controller.js";

const router = Router();
router.post("/rendez-vous/:id/paiement", authentifier, creerPaiementRdv);
router.post("/rendez-vous/:id/paiement-natif", authentifier, creerPaymentSheetRdv);
router.post("/rendez-vous/:id/paiement-campay", authentifier, limiteurCampay, creerPaiementCampayRdv);
router.get("/rendez-vous/:id/paiement", authentifier, obtenirStatutPaiementRdv);
// Annule le paiement en cours (Stripe / Mobile Money) pour permettre d'en relancer un nouveau.
router.post("/rendez-vous/:id/paiement/annuler", authentifier, annulerPaiementEnCoursRdv);
// Devis avant paiement : honoraires + frais d'envoi de l'agrégateur choisi (lecture seule).
router.get("/rendez-vous/:id/devis", authentifier, obtenirDevisPaiementRdv);
// Facture récapitulative (JSON, jamais de PDF côté serveur) : facture du paiement
// abouti, ou aperçu avant paiement (?agregateur=stripe|campay) pour le patient.
// Visibilité par rôle : patient / médecin (consultation seule) / admin (tout).
router.get("/rendez-vous/:id/facture", authentifier, obtenirFactureRdv);
export default router;