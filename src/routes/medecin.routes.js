// src/routes/medecin.routes.js
// Point d'entrée UNIQUE du module transverse "Gestion des médecins".
//
// Comme expliqué en tête de medecin.controller.js, les 27 handlers de
// ce module sont répartis dans 4 fichiers contrôleurs distincts mais
// tous importés ici depuis un seul chemin :
//   "../controllers/medecin.controller.js"
// (qui ré-exporte lui-même avis.controller.js / abonnementMedecin.
// controller.js / rendezVous.controller.js). Ce fichier de routes ne
// connaît donc pas ce découpage interne — un seul routeur, monté une
// seule fois dans l'app (ex. app.use("/api", medecinRoutes)).
//
// ⚠️ Hypothèses faites faute d'avoir les fichiers middlewares sous les
// yeux (à ajuster aux noms réels de votre projet) :
//   - authentifier            : exige un token valide, sinon 401,
//                                peuple req.utilisateur.
//   - authentifierOptionnel   : peuple req.utilisateur si un token
//                                valide est fourni, ne bloque jamais
//                                sinon (nécessaire pour les listes/
//                                fiches "publiques mais enrichies" —
//                                voir avis-medecin ci-dessous, où le
//                                contrôleur distingue explicitement
//                                visiteur / auteur / admin).
//   - autoriser(...roles)     : exige que req.utilisateur.role fasse
//                                partie des rôles donnés, sinon 403.
//   - gererTeleversementMedecin : middleware d'upload (multer ou
//                                équivalent) qui place cni_url /
//                                attestation_url dans req.body avant
//                                modifierMedecin — voir upload.
//                                middleware.js, référencé dans
//                                medecin.controller.js.

import { Router } from "express";
import { authentifier, authentifierOptionnel, autoriser } from "../middlewares/auth.middleware.js";
import { gererTeleversementMedecin } from "../middlewares/upload.middleware.js";

import {
  // Fiche médecin (Annuaire)
  listerMedecins,
  obtenirMedecin,
  modifierMedecin,
  supprimerMedecin,
  // Avis médecin
  listerAvisMedecin,
  obtenirAvisMedecin,
  creerAvisMedecin,
  modifierAvisMedecin,
  supprimerAvisMedecin,
  // Abonnements médecin + lignes d'avantages
  listerAbonnementsMedecin,
  obtenirAbonnementMedecin,
  creerAbonnementMedecin,
  modifierAbonnementMedecin,
  supprimerAbonnementMedecin,
  ajouterLigneAbonnementMedecin,
  modifierLigneAbonnementMedecin,
  supprimerLigneAbonnementMedecin,
  // Rendez-vous
  listerRendezVous,
  obtenirRendezVous,
  creerRendezVous,
  modifierRendezVous,
  supprimerRendezVous,
  // Ordonnances
  listerOrdonnances,
  obtenirOrdonnance,
  creerOrdonnance,
  modifierOrdonnance,
  supprimerOrdonnance,
} from "../controllers/medecin.controller.js";

const router = Router();

/* ===================================================================
 * Médecins (fiche Annuaire)
 * =================================================================== */

// PUBLIQUE, sans authentification — req.utilisateur doit rester
// indéfini ici (voir commentaire de listerMedecins/obtenirMedecin :
// pas de vue "admin" élargie sur ces deux routes).
router.get("/medecins", listerMedecins);
router.get("/medecins/:id", obtenirMedecin);

// Le médecin propriétaire (utilisateur_id déduit du token) ou
// admin/superadmin. gererTeleversementMedecin traite un éventuel
// remplacement de cni_url/attestation_url avant d'atteindre le
// contrôleur.
router.put("/medecins/:id", authentifier, gererTeleversementMedecin, modifierMedecin);

// Réservé à superadmin (pas admin simple).
router.delete("/medecins/:id", authentifier, autoriser("superadmin"), supprimerMedecin);

/* ===================================================================
 * Avis médecin
 * =================================================================== */

// Lecture publique, mais enrichie si connecté (auteur voit son propre
// avis en attente/rejeté, admin/superadmin voit tout) — d'où l'auth
// optionnelle plutôt qu'absente ou obligatoire.
router.get("/avis-medecin", authentifierOptionnel, listerAvisMedecin);
router.get("/avis-medecin/:id", authentifierOptionnel, obtenirAvisMedecin);

// Dépôt d'avis réservé aux utilisateurs authentifiés (patient inclus).
router.post("/avis-medecin", authentifier, creerAvisMedecin);

// Auteur (tant que "en_attente") ou admin/superadmin (statut_moderation).
router.put("/avis-medecin/:id", authentifier, modifierAvisMedecin);

// Auteur (quel que soit le statut) ou admin/superadmin.
router.delete("/avis-medecin/:id", authentifier, supprimerAvisMedecin);

/* ===================================================================
 * Abonnements médecin
 * =================================================================== */
// Donnée commerciale interne : jamais publique, authentifier partout,
// l'autorisation fine (médecin concerné vs admin/superadmin) est
// gérée à l'intérieur de chaque handler.

router.get("/abonnements-medecin", authentifier, listerAbonnementsMedecin);
router.get("/abonnements-medecin/:id", authentifier, obtenirAbonnementMedecin);
router.post("/abonnements-medecin", authentifier, creerAbonnementMedecin);
router.put("/abonnements-medecin/:id", authentifier, modifierAbonnementMedecin);
router.delete("/abonnements-medecin/:id", authentifier, supprimerAbonnementMedecin);

// Lignes d'avantages — routes indépendantes (pas nichées sous /:id
// pour lecture/suppression, telles que documentées dans les JSDoc du
// contrôleur).
router.post("/abonnements-medecin/:id/lignes", authentifier, ajouterLigneAbonnementMedecin);
router.put("/lignes-abonnement-medecin/:ligneId", authentifier, modifierLigneAbonnementMedecin);
router.delete("/lignes-abonnement-medecin/:ligneId", authentifier, supprimerLigneAbonnementMedecin);

/* ===================================================================
 * Rendez-vous
 * =================================================================== */
// Donnée privée patient/médecin : authentifier partout. L'autorisation
// fine (patient concerné, médecin concerné, admin/superadmin) est
// gérée à l'intérieur de chaque handler.

router.get("/rendez-vous", authentifier, listerRendezVous);
router.get("/rendez-vous/:id", authentifier, obtenirRendezVous);
router.post("/rendez-vous", authentifier, creerRendezVous);
router.put("/rendez-vous/:id", authentifier, modifierRendezVous);

// Suppression physique réservée à admin/superadmin — un rendez-vous
// s'annule normalement via PUT (statut="annule").
router.delete("/rendez-vous/:id", authentifier, autoriser("admin", "superadmin"), supprimerRendezVous);

/* ===================================================================
 * Ordonnances
 * =================================================================== */

router.get("/ordonnances", authentifier, listerOrdonnances);
router.get("/ordonnances/:id", authentifier, obtenirOrdonnance);

// Réservé au médecin du rendez-vous concerné — pièce médicale
// nominative, même un admin ne peut émettre à sa place.
router.post("/ordonnances", authentifier, creerOrdonnance);

// Médecin auteur ou admin/superadmin.
router.put("/ordonnances/:id", authentifier, modifierOrdonnance);

// Suppression réservée à admin/superadmin — jamais par le médecin
// après émission.
router.delete("/ordonnances/:id", authentifier, autoriser("admin", "superadmin"), supprimerOrdonnance);

export default router;