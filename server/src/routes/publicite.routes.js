// src/routes/publicite.routes.js
// Module autonome "Présence, publicité & boost commercial" (diagramme
// 09_presence_publicite_boost) : emplacement_publicitaire,
// forfait_publicitaire, ligne_forfait_publicitaire, publicite.
//
// v8 : ce module a été isolé de Pharmacie et n'a plus AUCUN lien avec
// elle (ni avec aucun autre module métier) — voir
// publicite.controller.js et schema.prisma. Il n'y a donc plus de
// notion d'"agent de la pharmacie propriétaire" : une publicité est
// déposée par n'importe quel utilisateur authentifié, quel que soit
// son rôle.
//
// emplacement_publicitaire est une TABLE de référence (plus d'enum
// zone_affichage — retiré du schéma) : l'utilisateur fournit
// directement emplacement_publicitaire_id à la création de sa
// publicité, en plus de forfait_publicitaire_id (voir
// publicite.controller.js, creerPublicite).
//
// Le visuel EST téléversé en multipart/form-data (champ "visuel") et
// stocké sur Cloudinary — voir gererTeleversementPublicite dans
// middlewares/upload.middleware.js et lib/cloudinaryService.js, même
// patron que pharmacie.routes.js / centreSante.routes.js. "visuel_url"
// contient le "nom" (public_id) renvoyé par Cloudinary, jamais une
// valeur saisie par le client. Contrairement aux pièces justificatives
// de Pharmacie/Centre de santé, seul JPEG/PNG/WEBP est accepté ici
// (pas de PDF — un encart publicitaire est toujours une image, voir
// upload.middleware.js).
//
// ─── Emplacements publicitaires ─────────────────────────────────
// Lecture (GET) : PUBLIQUE — même logique que le référentiel
// géographique (voir referentiels.routes.js).
// Écriture (POST/PUT) : admin ou superadmin.
// Suppression (DELETE) : superadmin uniquement (des forfaits peuvent
// encore référencer cet emplacement).
//
// ─── Forfaits publicitaires ──────────────────────────────────────
// Lecture (GET) : PUBLIQUE — un utilisateur doit pouvoir choisir un
// forfait avant de soumettre sa publicité.
// Écriture (POST/PUT) : admin ou superadmin.
// Suppression (DELETE) : superadmin uniquement (des publicités
// peuvent encore référencer ce forfait).
//
// ─── Lignes d'avantages (ligne_forfait_publicitaire) ─────────────
// Même autorisation que le forfait parent : admin/superadmin.
// Préfixe DÉDIÉ ("/lignes-forfait-publicitaire"), distinct de
// "/forfaits-publicitaires/:id" — même raisonnement que
// abonnement.routes.js (évite qu'une requête PUT/DELETE sur une ligne
// ne soit accidentellement capturée par la route générique du
// forfait).
//
// ─── Publicités ───────────────────────────────────────────────────
// Lecture (GET) : PUBLIQUE, filtrée selon qui consulte — voir
// authentifierOptionnel et publicite.controller.js (même patron que
// avis.routes.js).
// Création (POST) : tout utilisateur authentifié, quel que soit son
// rôle.
// Modification (PUT) : l'auteur (tant que "en_attente") ou
// admin/superadmin (statut_moderation à tout moment).
// Suppression (DELETE) : l'auteur ou admin/superadmin.
import { Router } from "express";
import {
  listerEmplacementsPublicitaires,
  obtenirEmplacementPublicitaire,
  creerEmplacementPublicitaire,
  modifierEmplacementPublicitaire,
  supprimerEmplacementPublicitaire,
  listerForfaitsPublicitaires,
  obtenirForfaitPublicitaire,
  creerForfaitPublicitaire,
  modifierForfaitPublicitaire,
  supprimerForfaitPublicitaire,
  ajouterLigneForfait,
  modifierLigneForfait,
  supprimerLigneForfait,
  listerPublicites,
  obtenirPublicite,
  rechercherPublicitesParCodePage,
  creerPublicite,
  modifierPublicite,
  supprimerPublicite,
} from "../controllers/publicite.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { authentifierOptionnel } from "../middlewares/authOptionnel.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import { gererTeleversementPublicite } from "../middlewares/upload.middleware.js";

const router = Router();

// ─── Emplacements publicitaires ─────────────────────────────────
router.get("/emplacements-publicitaires", listerEmplacementsPublicitaires);
router.get("/emplacements-publicitaires/:id", obtenirEmplacementPublicitaire);
router.post("/emplacements-publicitaires", authentifier, autoriser("admin", "superadmin"), creerEmplacementPublicitaire);
router.put("/emplacements-publicitaires/:id", authentifier, autoriser("admin", "superadmin"), modifierEmplacementPublicitaire);
router.delete("/emplacements-publicitaires/:id", authentifier, autoriser("superadmin"), supprimerEmplacementPublicitaire);

// ─── Forfaits publicitaires ──────────────────────────────────────
router.get("/forfaits-publicitaires", listerForfaitsPublicitaires);
router.get("/forfaits-publicitaires/:id", obtenirForfaitPublicitaire);
router.post("/forfaits-publicitaires", authentifier, autoriser("admin", "superadmin"), creerForfaitPublicitaire);
router.post("/forfaits-publicitaires/:id/lignes", authentifier, autoriser("admin", "superadmin"), ajouterLigneForfait);
router.put("/forfaits-publicitaires/:id", authentifier, autoriser("admin", "superadmin"), modifierForfaitPublicitaire);
router.delete("/forfaits-publicitaires/:id", authentifier, autoriser("superadmin"), supprimerForfaitPublicitaire);

// Lignes d'avantages — préfixe dédié, voir commentaire d'en-tête.
router.put("/lignes-forfait-publicitaire/:ligneId", authentifier, autoriser("admin", "superadmin"), modifierLigneForfait);
router.delete("/lignes-forfait-publicitaire/:ligneId", authentifier, autoriser("admin", "superadmin"), supprimerLigneForfait);

// ─── Publicités ───────────────────────────────────────────────────
router.get("/publicites", authentifierOptionnel, listerPublicites);
// Route dédiée par code d'emplacement (code de la page), déclarée AVANT
// "/publicites/:id" pour éviter que "par-page" ne soit capturé comme
// un :id.
router.get("/publicites/par-page/:code", authentifierOptionnel, rechercherPublicitesParCodePage);
router.get("/publicites/:id", authentifierOptionnel, obtenirPublicite);

router.post("/publicites", authentifier, gererTeleversementPublicite, creerPublicite);
router.put("/publicites/:id", authentifier, gererTeleversementPublicite, modifierPublicite);
router.delete("/publicites/:id", authentifier, supprimerPublicite);

export default router;