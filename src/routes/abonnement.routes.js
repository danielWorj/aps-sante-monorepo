// src/routes/abonnement.routes.js
// Sous-module "Pharmacie — Abonnement" : abonnement_pharmacie et ses
// lignes d'avantages (ligne_abonnement_pharmacie).
//
// Donnée commerciale interne (pas d'Annuaire public ici) : TOUTES les
// routes exigent "authentifier" — l'autorisation fine (agent de la
// pharmacie concernée vs admin/superadmin) est appliquée dans le
// contrôleur, au cas par cas, car elle dépend de la pharmacie ciblée
// (voir abonnement.controller.js).
import { Router } from "express";
import {
  listerAbonnementsPharmacie,
  obtenirAbonnementPharmacie,
  creerAbonnementPharmacie,
  modifierAbonnementPharmacie,
  supprimerAbonnementPharmacie,
  ajouterLigneAbonnement,
  modifierLigneAbonnement,
  supprimerLigneAbonnement,
} from "../controllers/abonnement.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/abonnements-pharmacie", authentifier, listerAbonnementsPharmacie);
router.post("/abonnements-pharmacie", authentifier, creerAbonnementPharmacie);
router.post("/abonnements-pharmacie/:id/lignes", authentifier, ajouterLigneAbonnement);
router.get("/abonnements-pharmacie/:id", authentifier, obtenirAbonnementPharmacie);
router.put("/abonnements-pharmacie/:id", authentifier, modifierAbonnementPharmacie);
router.delete("/abonnements-pharmacie/:id", authentifier, supprimerAbonnementPharmacie);

// Lignes d'avantages — préfixe DÉDIÉ ("/lignes-abonnement-pharmacie"),
// distinct de "/abonnements-pharmacie/:id" : évite qu'une requête
// PUT/DELETE sur une ligne ("lignes-abonnement-pharmacie/:ligneId")
// ne soit accidentellement capturée par la route générique
// "/abonnements-pharmacie/:id" si elle avait été nichée sous le même
// préfixe (Express résout par ordre de déclaration, pas par arité).
router.put("/lignes-abonnement-pharmacie/:ligneId", authentifier, modifierLigneAbonnement);
router.delete("/lignes-abonnement-pharmacie/:ligneId", authentifier, supprimerLigneAbonnement);

export default router;