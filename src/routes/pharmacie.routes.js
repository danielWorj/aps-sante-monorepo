// src/routes/pharmacie.routes.js
// Composant "annuaire — pharmacie" : table pharmacie.
//
// Lecture (GET) : PUBLIQUE, sans authentification. Même logique que
// Centre de santé (voir centreSante.routes.js) : l'Annuaire Pharmacie
// doit être consultable avant inscription (ex : recherche d'une
// pharmacie proche avant de créer un compte patient) et précéder les
// Gardes officielles (diagramme 03_pharmacie_gardes), qui référencent
// cette fiche.
//
// Création (POST) : tout utilisateur authentifié, quel que soit son
// rôle (patient, médecin, agent_xxx, admin, superadmin). Le site étant
// ouvert à la soumission par les professionnels eux-mêmes, la création
// exige 3 pièces justificatives en multipart/form-data (voir
// upload.middleware.js et pharmacie.controller.js) :
//   - image_pharmacie   : photo de la pharmacie
//   - piece_identite     : pièce d'identité du titulaire/responsable
//   - document_agrement  : agrément officiel autorisant l'exercice
// Le formulaire est unique côté front : la création de la pharmacie
// crée AUSSI, dans la même transaction, l'agent qui en a la charge —
// champ texte supplémentaire requis :
//   - fonction  : intitulé du poste de l'utilisateur au sein de la
//                 pharmacie (ex. "Titulaire", "Pharmacien assistant")
// Un compte ne peut être agent que d'une seule pharmacie à la fois
// (voir pharmacie.controller.js).
//
// Modification (PUT) : tout utilisateur authentifié, quel que soit son
// rôle — même logique que la création. Seuls admin/superadmin peuvent
// choisir librement statut_verification ; pour tout autre profil,
// toute modification repasse la fiche en "en_cours" pour
// re-vérification (voir le contrôleur).
//
// Suppression (DELETE) : superadmin uniquement (des agents peuvent être
// rattachés à la pharmacie ; le futur module Gardes s'appuie sur cette
// fiche).
import { Router } from "express";
import {
  listerPharmacies,
  obtenirPharmacie,
  creerPharmacie,
  modifierPharmacie,
  supprimerPharmacie,
} from "../controllers/pharmacie.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import { gererTeleversementPharmacie } from "../middlewares/upload.middleware.js";

const router = Router();

// ─── Pharmacies ────────────────────────────────────────────────
router.get("/pharmacies", listerPharmacies);
router.get("/pharmacies/:id", obtenirPharmacie);

router.post(
  "/pharmacies",
  authentifier,
  gererTeleversementPharmacie,
  creerPharmacie
);

// Ouvert à tout utilisateur authentifié (pas de restriction
// admin/superadmin) — voir le commentaire d'en-tête.
router.put(
  "/pharmacies/:id",
  authentifier,
  gererTeleversementPharmacie,
  modifierPharmacie
);

router.delete(
  "/pharmacies/:id",
  authentifier,
  autoriser("superadmin"),
  supprimerPharmacie
);

export default router;