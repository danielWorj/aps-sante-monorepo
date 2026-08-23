// src/routes/moyenPaiement.routes.js
// Point d'entrée du module transverse "Moyens de paiement du médecin"
// (Mobile Money & Compte Bancaire).
//
// Ce module couvre trois entités distinctes du schema.prisma :
//   - TypeMobileMoney : référentiel des opérateurs Mobile Money par pays
//                       (lecture publique, écriture admin/superadmin)
//   - MobileMoney     : coordonnées Mobile Money d'un médecin
//                       (accès restreint au médecin propriétaire ou admin)
//   - CompteBancaire  : coordonnées bancaires d'un médecin
//                       (accès restreint au médecin propriétaire ou admin)
//
// Middlewares utilisés (mêmes chemins que dans medecin.routes.js) :
//   - authentifier            (auth.middleware.js)        : exige un
//                                token valide, sinon 401, peuple
//                                req.utilisateur.
//   - autoriser(...roles)     (autorisation.middleware.js) : exige que
//                                req.utilisateur.role fasse partie des
//                                rôles donnés, sinon 403.
//
// Toutes les routes d'écriture/lecture sur les coordonnées de paiement
// sont privées (authentifier obligatoire). L'autorisation fine
// (propriétaire vs admin) est gérée à l'intérieur de chaque handler du
// contrôleur — le routeur se contente ici d'exiger l'authentification.
import { Router } from "express";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import {
  // Référentiel TypeMobileMoney (opérateurs par pays)
  listerTypesMobileMoney,
  obtenirTypeMobileMoney,
  creerTypeMobileMoney,
  modifierTypeMobileMoney,
  supprimerTypeMobileMoney,
  // Coordonnées MobileMoney
  listerMobileMoneyMedecin,
  obtenirMobileMoney,
  creerMobileMoney,
  modifierMobileMoney,
  supprimerMobileMoney,
  // Coordonnées CompteBancaire
  listerComptesBancairesMedecin,
  obtenirCompteBancaire,
  creerCompteBancaire,
  modifierCompteBancaire,
  supprimerCompteBancaire,
} from "../controllers/moyenPaiement.controller.js";

const router = Router();

/* ===================================================================
TypeMobileMoney (Référentiel des opérateurs Mobile Money par pays)
=================================================================== */
// Lecture publique — tout visiteur (ou client non authentifié) doit
// pouvoir afficher la liste des opérateurs disponibles pour un pays
// donné lors du remplissage d'un formulaire de saisie de moyen de
// paiement. Écriture et suppression réservées à l'administration.
router.get("/types-mobile-money", listerTypesMobileMoney);
router.get("/types-mobile-money/:id", obtenirTypeMobileMoney);

// Création / modification — admin ou superadmin.
router.post(
  "/types-mobile-money",
  authentifier,
  autoriser("admin", "superadmin"),
  creerTypeMobileMoney
);
router.put(
  "/types-mobile-money/:id",
  authentifier,
  autoriser("admin", "superadmin"),
  modifierTypeMobileMoney
);

// Suppression — superadmin uniquement (même patron que
// supprimerSpecialite / supprimerMedecin : des MobileMoney peuvent
// encore référencer ce type, le contrôleur renvoie 409 dans ce cas).
router.delete(
  "/types-mobile-money/:id",
  authentifier,
  autoriser("superadmin"),
  supprimerTypeMobileMoney
);

/* ===================================================================
MobileMoney (Coordonnées Mobile Money d'un médecin)
=================================================================== */
// Routes privées (authentifier obligatoire). L'autorisation fine
// (médecin propriétaire vs admin/superadmin) est appliquée dans chaque
// handler du contrôleur en comparant req.utilisateur.utilisateur_id à
// medecin.utilisateur_id — le routeur n'a pas à connaître cette règle.
//
// Deux formes d'appel pour la liste :
//   - GET /medecins/:medecin_id/mobile-moneys (RESTful, nichée)
//   - GET /mobile-moneys?medecin_id=...       (query string)
// Les deux appellent le même handler (listerMobileMoneyMedecin) qui
// lit req.params.medecin_id en priorité, puis req.query.medecin_id.
router.get(
  "/medecins/:medecin_id/mobile-moneys",
  authentifier,
  listerMobileMoneyMedecin
);
router.get("/mobile-moneys", authentifier, listerMobileMoneyMedecin);

router.get("/mobile-moneys/:id", authentifier, obtenirMobileMoney);
router.post("/mobile-moneys", authentifier, creerMobileMoney);
router.put("/mobile-moneys/:id", authentifier, modifierMobileMoney);
router.delete("/mobile-moneys/:id", authentifier, supprimerMobileMoney);

/* ===================================================================
CompteBancaire (Coordonnées bancaires d'un médecin)
=================================================================== */
// Mêmes règles d'accès que MobileMoney : authentifier obligatoire,
// autorisation fine (propriétaire ou admin) gérée dans le contrôleur.
// Deux formes d'appel pour la liste (nichée + query string).
router.get(
  "/medecins/:medecin_id/comptes-bancaires",
  authentifier,
  listerComptesBancairesMedecin
);
router.get("/comptes-bancaires", authentifier, listerComptesBancairesMedecin);

router.get("/comptes-bancaires/:id", authentifier, obtenirCompteBancaire);
router.post("/comptes-bancaires", authentifier, creerCompteBancaire);
router.put("/comptes-bancaires/:id", authentifier, modifierCompteBancaire);
router.delete("/comptes-bancaires/:id", authentifier, supprimerCompteBancaire);

export default router;