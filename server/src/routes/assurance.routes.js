// src/routes/assurance.routes.js
// Composant "annuaire — assurance" (diagramme 08_annuaire_assurances) :
// gère service_assurance, mise_en_relation, ainsi que le catalogue
// activite / option_activite et les agence physiques d'un service.
//
// v8 : il n'existe plus de sous-modules dédiés "publicité/abonnement/
// avis assurance" (voir schema.prisma — Publicite est un module
// autonome qui ne référence plus aucune fiche annuaire ; il n'y a pas
// d'AbonnementAssurance ni d'AvisAssurance). "contact_prospect_assurance"
// est remplacé par "mise_en_relation" — voir assurance.controller.js.
// v8 ajoute également activite / option_activite (catalogue produits)
// et agence (implantations physiques) — voir assurance.controller.js.
//
//   service_assurance
//     GET     : PUBLIQUE (même logique que centres de santé / pharmacies)
//     POST    : tout utilisateur authentifié, multipart/form-data avec
//               1 fichier obligatoire "image_assurance" (crée aussi le
//               compte agent — voir upload.middleware.js)
//     PUT     : tout utilisateur authentifié (fichier optionnel ;
//               statut_verification réservé admin/superadmin)
//     DELETE  : superadmin uniquement
//
//   mise_en_relation
//     POST       : tout utilisateur authentifié (n'importe quel rôle,
//                  pas seulement patient — voir assurance.controller.js)
//     GET/DELETE : agent du service_assurance concerné, ou admin/superadmin
//
//   activite / option_activite / agence
//     GET        : PUBLIQUE
//     POST/PUT/DELETE : agent du service_assurance concerné (déduit
//                  directement ou, pour option_activite, via l'activité
//                  parente), ou admin/superadmin — voir
//                  assurance.controller.js pour le détail de la
//                  vérification.

import { Router } from "express";
import {
  listerServicesAssurance,
  obtenirServiceAssurance,
  creerServiceAssurance,
  modifierServiceAssurance,
  supprimerServiceAssurance,
  listerMisesEnRelationAssurance,
  creerMiseEnRelationAssurance,
  supprimerMiseEnRelationAssurance,
  listerActivites,
  obtenirActivite,
  creerActivite,
  modifierActivite,
  supprimerActivite,
  listerOptionsActivite,
  obtenirOptionActivite,
  creerOptionActivite,
  modifierOptionActivite,
  supprimerOptionActivite,
  listerAgences,
  obtenirAgence,
  creerAgence,
  modifierAgence,
  supprimerAgence,
} from "../controllers/assurance.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import { gererTeleversementAssurance } from "../middlewares/upload.middleware.js";

const router = Router();

// ─── Services d'assurance ──────────────────────────────────────
// 1 fichier obligatoire à la création (image_assurance), optionnel en
// modification — voir upload.middleware.js / assurance.controller.js.
// GET liste : filtres optionnels ?pays_id=...&ville_id=...&type_acteur=...
// &statut_verification=...&recherche=... (nom, insensible à la casse),
// combinables avec une recherche par proximité optionnelle
// ?lat=...&lng=...&rayon_km=... (lat/lng à fournir ensemble ; rayon_km
// défaut 10 km) — voir listerServicesAssurance / lib/geo.js. Quand la
// proximité est active, chaque fiche renvoyée gagne un champ
// distance_km et le tri se fait par distance croissante.
router.get("/services-assurance", listerServicesAssurance);
router.get("/services-assurance/:id", obtenirServiceAssurance);

router.post(
  "/services-assurance",
  authentifier,
  gererTeleversementAssurance,
  creerServiceAssurance
);

// Ouvert à tout utilisateur authentifié — voir le commentaire d'en-tête.
router.put(
  "/services-assurance/:id",
  authentifier,
  gererTeleversementAssurance,
  modifierServiceAssurance
);

router.delete(
  "/services-assurance/:id",
  authentifier,
  autoriser("superadmin"),
  supprimerServiceAssurance
);

// ─── Mises en relation ──────────────────────────────────────────
// Pas de route GET liste sans filtre : toujours scopée à un
// service_assurance (voir listerMisesEnRelationAssurance).
router.get("/mises-en-relation-assurance", authentifier, listerMisesEnRelationAssurance);
router.post("/mises-en-relation-assurance", authentifier, creerMiseEnRelationAssurance);
router.delete(
  "/mises-en-relation-assurance/:id",
  authentifier,
  supprimerMiseEnRelationAssurance
);

// ─── Activités (catalogue produits) ────────────────────────────
// GET publique ; écriture réservée à l'agent du service_assurance
// concerné ou à admin/superadmin (vérifié dans le contrôleur).
router.get("/activites", listerActivites);
router.get("/activites/:id", obtenirActivite);
router.post("/activites", authentifier, creerActivite);
router.put("/activites/:id", authentifier, modifierActivite);
router.delete("/activites/:id", authentifier, supprimerActivite);

// ─── Options d'activité ─────────────────────────────────────────
// Pas de route GET liste sans filtre : toujours scopée à une activité
// (voir listerOptionsActivite). Même autorisation que activite, déduite
// via l'activité parente.
router.get("/options-activite", listerOptionsActivite);
router.get("/options-activite/:id", obtenirOptionActivite);
router.post("/options-activite", authentifier, creerOptionActivite);
router.put("/options-activite/:id", authentifier, modifierOptionActivite);
router.delete("/options-activite/:id", authentifier, supprimerOptionActivite);

// ─── Agences ──────────────────────────────────────────────────
// GET publique ; écriture réservée à l'agent du service_assurance
// concerné ou à admin/superadmin (vérifié dans le contrôleur).
// GET liste : filtre optionnel ?service_assurance_id=..., combinable
// avec une recherche par proximité optionnelle ?lat=...&lng=...
// &rayon_km=... (même contrat que /services-assurance ci-dessus — voir
// listerAgences / lib/geo.js), utile pour trouver l'agence la plus
// proche d'un point donné. Quand la proximité est active, chaque
// agence renvoyée gagne un champ distance_km et le tri se fait par
// distance croissante.
router.get("/agences", listerAgences);
router.get("/agences/:id", obtenirAgence);
router.post("/agences", authentifier, creerAgence);
router.put("/agences/:id", authentifier, modifierAgence);
router.delete("/agences/:id", authentifier, supprimerAgence);

export default router;