import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { authentifier } from "../middlewares/auth.middleware.js";
import { creerPaiementRdv, creerPaymentSheetRdv, obtenirStatutPaiementRdv, obtenirDevisPaiementRdv, annulerPaiementEnCoursRdv } from "../controllers/paiement.controller.js";
import { creerPaiementCampayRdv } from "../controllers/paiementCampay.controller.js";
import { obtenirFactureRdv } from "../controllers/facture.controller.js";

// Limiteur anti-spam : chaque appel déclenche une demande USSD sur le téléphone du payeur.
const limiteurCampay = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  // Compteur par utilisateur authentifié (le limiteur est placé après
  // `authentifier`), avec repli sur l'IP : évite qu'un patient en
  // bloque un autre derrière le même NAT / réseau mobile.
  keyGenerator: (req) => req.utilisateur?.utilisateur_id ?? ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives de paiement, réessayez dans quelques minutes." },
});

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