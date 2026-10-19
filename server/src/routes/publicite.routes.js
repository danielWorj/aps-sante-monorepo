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
// ─── Publicités (v9 : réservation d'espace) ───────────────────────
// Lecture publique : publicités diffusées seulement (slider par page).
// Réservation, portail annonceur, paiement : utilisateur authentifié,
// propriétaire de la publicité (ou admin).
// Modération (accepter / rejeter) et paiements tardifs : admin/superadmin.
// Les routes nommées (par-page, disponibilites, mes-publicites…) sont
// déclarées AVANT "/publicites/:id".
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
  obtenirDisponibilites,
  obtenirProfilAnnonceur,
  reserverAvecCompte,
  accepterPubliciteCtrl,
  rejeterPubliciteCtrl,
  annulerPubliciteCtrl,
  listerMesPublicites,
  obtenirStatistiquesPublicite,
  enregistrerEvenementsPublicite,
} from "../controllers/publicite.controller.js";
import {
  obtenirDevisPublicite,
  creerPaiementStripePublicite,
  creerPaiementCampayPublicite,
  obtenirStatutPaiementPublicite,
  annulerPaiementPublicite,
  obtenirFacturePublicite,
  listerPaiementsTardifsPublicite,
  traiterPaiementTardifPublicite,
} from "../controllers/paiementPublicite.controller.js";
import { limiteurCampay } from "../middlewares/limiteurCampay.js";
import rateLimit from "express-rate-limit";
import { authentifier } from "../middlewares/auth.middleware.js";
import { authentifierOptionnel } from "../middlewares/authOptionnel.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import { gererTeleversementPublicite } from "../middlewares/upload.middleware.js";

const router = Router();
const admin = [authentifier, autoriser("admin", "superadmin")];

// Suivi des impressions/clics : public, donc borné par IP.
const limiteurEvenements = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
// Réservation avec création de compte : publique, donc bornée par IP.
const limiteurReservationPublique = rateLimit({ windowMs: 60 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

// ─── Emplacements publicitaires ─────────────────────────────────
router.get("/emplacements-publicitaires", listerEmplacementsPublicitaires);
router.get("/emplacements-publicitaires/:id", obtenirEmplacementPublicitaire);
router.post("/emplacements-publicitaires", authentifier, autoriser("admin", "superadmin"), creerEmplacementPublicitaire);
router.put("/emplacements-publicitaires/:id", authentifier, autoriser("admin", "superadmin"), modifierEmplacementPublicitaire);
router.delete("/emplacements-publicitaires/:id", authentifier, autoriser("superadmin"), supprimerEmplacementPublicitaire);

// ─── Forfaits publicitaires ──────────────────────────────────────
router.get("/forfaits-publicitaires", authentifierOptionnel, listerForfaitsPublicitaires);
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
router.get("/publicites/par-page/:code", authentifierOptionnel, rechercherPublicitesParCodePage);
// Disponibilités : publiques (aucune donnée d'annonceur), le formulaire
// de réservation s'ouvre aussi aux visiteurs sans compte.
router.get("/publicites/disponibilites", obtenirDisponibilites);
router.get("/publicites/profil-annonceur", authentifier, obtenirProfilAnnonceur);
router.get("/publicites/mes-publicites", authentifier, listerMesPublicites);
router.post("/publicites/evenements", limiteurEvenements, enregistrerEvenementsPublicite);
router.get("/publicites/:id", authentifierOptionnel, obtenirPublicite);

router.post("/publicites", authentifier, gererTeleversementPublicite, creerPublicite);
router.post("/publicites/reservation-avec-compte", limiteurReservationPublique, gererTeleversementPublicite, reserverAvecCompte);
router.put("/publicites/:id", authentifier, gererTeleversementPublicite, modifierPublicite);
router.delete("/publicites/:id", authentifier, supprimerPublicite);

// Modération (WhatsApp à l'annonceur) et retrait par l'annonceur.
router.post("/publicites/:id/accepter", ...admin, accepterPubliciteCtrl);
router.post("/publicites/:id/rejeter", ...admin, rejeterPubliciteCtrl);
router.post("/publicites/:id/annuler", authentifier, annulerPubliciteCtrl);

// Portail annonceur : statistiques de diffusion.
router.get("/publicites/:id/statistiques", authentifier, obtenirStatistiquesPublicite);

// Paiement (lien WhatsApp -> page de paiement), facture.
router.get("/publicites/:id/devis", authentifier, obtenirDevisPublicite);
router.post("/publicites/:id/paiement", authentifier, creerPaiementStripePublicite);
router.post("/publicites/:id/paiement-campay", authentifier, limiteurCampay, creerPaiementCampayPublicite);
router.get("/publicites/:id/paiement", authentifier, obtenirStatutPaiementPublicite);
router.post("/publicites/:id/paiement/annuler", authentifier, annulerPaiementPublicite);
router.get("/publicites/:id/facture", authentifier, obtenirFacturePublicite);

router.get("/admin/publicites/paiements-tardifs", ...admin, listerPaiementsTardifsPublicite);
router.post("/admin/publicites/paiements-tardifs/:id/traiter", ...admin, traiterPaiementTardifPublicite);

export default router;