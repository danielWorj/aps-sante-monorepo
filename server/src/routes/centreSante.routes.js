// src/routes/centreSante.routes.js
// Composant "annuaire — centre de santé" : structure_sante (cliniques,
// hôpitaux, centres médicaux, dispensaires, laboratoires).
//
// Lecture (GET) : PUBLIQUE, sans authentification. Même logique que le
// référentiel géographique (voir referentiels.routes.js) : l'Annuaire
// doit précéder Pharmacie/RDV/Urgences et être consultable avant
// inscription (ex : recherche d'un centre proche avant de créer un
// compte patient).
//
// Création (POST) : tout utilisateur authentifié, quel que soit son
// rôle (patient, médecin, agent_xxx, admin, superadmin). Le site étant
// ouvert à la soumission par les professionnels eux-mêmes, la création
// exige 3 pièces justificatives en multipart/form-data (voir
// upload.middleware.js et centreSante.controller.js) :
//   - image_structure   : photo du centre de santé
//   - piece_identite     : pièce d'identité du professionnel
//   - document_agrement  : agrément officiel autorisant l'exercice
// Le formulaire est unique côté front : la création du centre crée
// AUSSI, dans la même transaction, l'agent qui en a la charge — champ
// texte supplémentaire requis :
//   - fonction  : intitulé du poste de l'utilisateur au sein du centre
//                 (ex. "Gérant", "Directeur médical")
// Un compte ne peut être agent que d'un seul centre de santé à la fois
// (voir centreSante.controller.js).
//
// Modification (PUT) : réservée à l'agent du centre et à admin/superadmin
// (vérifié dans le contrôleur — une modification repasse la fiche en
// vérification et suspend ses droits d'abonnement de présence, un tiers
// ne doit pas pouvoir la déclencher).
// Seuls admin/superadmin peuvent choisir librement statut_verification ;
// pour tout autre profil, toute modification repasse la fiche en
// "en_cours" pour re-vérification (voir le contrôleur).
//
// Suppression (DELETE) : superadmin uniquement (des agents peuvent être
// rattachés à la structure ; d'autres modules — RDV, avis — s'appuient
// sur cette fiche).
import { Router } from "express";
import {
  listerCentresSante,
  obtenirCentreSante,
  creerCentreSante,
  modifierCentreSante,
  supprimerCentreSante,
} from "../controllers/centreSante.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
// Lectures publiques : le jeton, s'il est présent, permet à l'admin et à
// l'agent de la fiche de la voir complète (abonnement de présence).
import { authentifierOptionnel } from "../middlewares/authOptionnel.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import { gererTeleversementCentreSante } from "../middlewares/upload.middleware.js";

const router = Router();

// ─── Centres de santé ─────────────────────────────────────────
// GET liste : filtres optionnels ?pays_id=...&ville_id=...&type_structure=...
// &statut_verification=...&recherche=... (nom, insensible à la casse),
// combinables avec une recherche par proximité optionnelle
// ?lat=...&lng=...&rayon_km=... (lat/lng à fournir ensemble ; rayon_km
// défaut 10 km) — voir listerCentresSante / lib/geo.js (même pattern
// que le module Assurance et le module Pharmacie). Quand la proximité
// est active, chaque fiche renvoyée gagne un champ distance_km et le
// tri se fait par distance croissante.
router.get("/centres-sante", authentifierOptionnel, listerCentresSante);
router.get("/centres-sante/:id", authentifierOptionnel, obtenirCentreSante);

router.post(
  "/centres-sante",
  authentifier,
  gererTeleversementCentreSante,
  creerCentreSante
);

// Agent de la fiche ou admin/superadmin (contrôle dans le contrôleur) —
// voir le commentaire d'en-tête.
router.put(
  "/centres-sante/:id",
  authentifier,
  gererTeleversementCentreSante,
  modifierCentreSante
);

router.delete(
  "/centres-sante/:id",
  authentifier,
  autoriser("superadmin"),
  supprimerCentreSante
);

export default router;