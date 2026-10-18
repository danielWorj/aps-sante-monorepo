// src/routes/abonnementAssurance.routes.js
// Abonnements des assurances (guide abonnements assurances v3).
//
//   /abonnements-assurance/...        souscription par le promoteur (§1.5.2)
//     authentifier ; l'appartenance à la fiche (agent ou admin) est
//     vérifiée dans le contrôleur, sur CHAQUE route.
//
//   /admin/...                        administration (§1.4.3)
//     authentifier + autoriser("admin", "superadmin") sur TOUTES les routes.
//
// Monté dans index.js après express.json() (les webhooks Stripe / CamPay
// restent ceux du RDV : ils aiguillent selon l'objet payé).

import { Router } from "express";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import { limiteurCampay } from "../middlewares/limiteurCampay.js";
import {
  obtenirOffres,
  creerAbonnement,
  obtenirDevis,
  creerPaiementStripe,
  creerPaiementCampay,
  obtenirStatutPaiement,
  annulerPaiementEnCours,
  choisirVirement,
  obtenirFacture,
} from "../controllers/paiementAbonnementAssurance.controller.js";
import {
  listerNiveaux,
  creerNiveau,
  modifierNiveau,
  listerTarifs,
  enregistrerTarif,
  listerRemises,
  enregistrerRemises,
  supprimerRemise,
  listerConfigs,
  enregistrerConfig,
  creerAbonnementAdmin,
  constaterEncaissement,
  suspendreAbonnement,
  retablirAbonnement,
  prolongerAbonnement,
  listerAbonnements,
  tableauDeBord,
  listerPaiements,
  listerPaiementsTardifs,
  traiterPaiementTardif,
  listerServicesAssuranceAdmin,
} from "../controllers/abonnementAssurance.controller.js";
import { catalogueAbonnementAssurance } from "../controllers/catalogueAbonnement.controller.js";

const router = Router();
const admin = [authentifier, autoriser("admin", "superadmin")];

// ─── Public : catalogue de la page « Abonnements » ────────────
router.get("/abonnements-assurance/catalogue", catalogueAbonnementAssurance);

// ─── Promoteur ────────────────────────────────────────────────
// "offres" est déclarée avant "/:id/..." par lisibilité (pas de conflit d'arité).
router.get("/abonnements-assurance/offres", authentifier, obtenirOffres);
router.post("/abonnements-assurance", authentifier, creerAbonnement);
router.get("/abonnements-assurance/:id/devis", authentifier, obtenirDevis);
router.post("/abonnements-assurance/:id/paiement", authentifier, creerPaiementStripe);
router.post("/abonnements-assurance/:id/paiement-campay", authentifier, limiteurCampay, creerPaiementCampay);
router.get("/abonnements-assurance/:id/paiement", authentifier, obtenirStatutPaiement);
router.post("/abonnements-assurance/:id/paiement/annuler", authentifier, annulerPaiementEnCours);
router.post("/abonnements-assurance/:id/virement", authentifier, choisirVirement);
router.get("/abonnements-assurance/:id/facture", authentifier, obtenirFacture);

// ─── Administration ───────────────────────────────────────────
router.get("/admin/niveaux-assurance", ...admin, listerNiveaux);
router.post("/admin/niveaux-assurance", ...admin, creerNiveau);
router.put("/admin/niveaux-assurance/:id", ...admin, modifierNiveau);

router.get("/admin/tarifs-abonnement-assurance", ...admin, listerTarifs);
router.put("/admin/tarifs-abonnement-assurance", ...admin, enregistrerTarif);

router.get("/admin/remises-duree-abonnement-assurance", ...admin, listerRemises);
router.put("/admin/remises-duree-abonnement-assurance", ...admin, enregistrerRemises);
router.delete("/admin/remises-duree-abonnement-assurance/:duree", ...admin, supprimerRemise);

router.get("/admin/config-abonnement-assurance", ...admin, listerConfigs);
router.put("/admin/config-abonnement-assurance/:pays_id", ...admin, enregistrerConfig);

// "tableau-de-bord" avant "/:id/..." : sinon pris pour un :id sur les routes GET futures.
router.get("/admin/abonnements-assurance/tableau-de-bord", ...admin, tableauDeBord);
router.get("/admin/abonnements-assurance", ...admin, listerAbonnements);
router.post("/admin/abonnements-assurance", ...admin, creerAbonnementAdmin);
router.post("/admin/abonnements-assurance/:id/encaissement-constate", ...admin, constaterEncaissement);
router.patch("/admin/abonnements-assurance/:id/suspendre", ...admin, suspendreAbonnement);
router.patch("/admin/abonnements-assurance/:id/retablir", ...admin, retablirAbonnement);
router.patch("/admin/abonnements-assurance/:id/prolonger", ...admin, prolongerAbonnement);

router.get("/admin/paiements-abonnement-assurance", ...admin, listerPaiements);
router.get("/admin/paiements-tardifs-abonnement-assurance", ...admin, listerPaiementsTardifs);
router.post("/admin/paiements-tardifs-abonnement-assurance/:id/traiter", ...admin, traiterPaiementTardif);

router.get("/admin/services-assurance", ...admin, listerServicesAssuranceAdmin);

export default router;
