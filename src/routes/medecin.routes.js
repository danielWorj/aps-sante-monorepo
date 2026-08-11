// src/routes/medecin.routes.js
// Point d'entrée UNIQUE du module transverse "Gestion des médecins".
//
// Comme expliqué en tête de medecin.controller.js, les 28 handlers de
// ce module sont répartis dans 4 fichiers contrôleurs distincts mais
// tous importés ici depuis un seul chemin :
//   "../controllers/medecin.controller.js"
// (qui ré-exporte lui-même avis.controller.js / abonnementMedecin.
// controller.js / rendezVous.controller.js). Ce fichier de routes ne
// connaît donc pas ce découpage interne — un seul routeur, monté une
// seule fois dans l'app (ex. app.use("/api", medecinRoutes)).
//
// Middlewares utilisés (chemins réels du projet) :
//   - authentifier            (auth.middleware.js)        : exige un
//                                token valide, sinon 401, peuple
//                                req.utilisateur.
//   - authentifierOptionnel   (authOptionnel.middleware.js) : peuple
//                                req.utilisateur si un token valide
//                                est fourni, ne bloque jamais sinon
//                                (nécessaire pour les listes/fiches
//                                "publiques mais enrichies" — voir
//                                avis-medecin ci-dessous, où le
//                                contrôleur distingue explicitement
//                                visiteur / auteur / admin).
//   - autoriser(...roles)     (autorisation.middleware.js) : exige
//                                que req.utilisateur.role fasse
//                                partie des rôles donnés, sinon 403.
//   - gererTeleversementMedecin (upload.middleware.js)      : middle-
//                                ware d'upload (multer) qui place
//                                cni / attestation dans req.files
//                                avant creerMedecin / modifierMedecin.

import { Router } from "express";
import { authentifier } from "../middlewares/auth.middleware.js";
import { authentifierOptionnel } from "../middlewares/authOptionnel.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import { gererTeleversementMedecin } from "../middlewares/upload.middleware.js";

import {
  // Fiche médecin (Annuaire)
  creerMedecin,
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
  // v9 : composition N-N des souscripteurs (forfait_abonnement_medecin)
  ajouterMedecinAbonnement,
  retirerMedecinAbonnement,
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
  // Spécialités médicales (référentiel — voir schema.prisma : specialite
  // n'est plus une colonne texte de medecin mais une vraie entité liée
  // par FK, medecin.specialite_id)
  listerSpecialites,
  obtenirSpecialite,
  creerSpecialite,
  modifierSpecialite,
  supprimerSpecialite,
} from "../controllers/medecin.controller.js";

const router = Router();

/* ===================================================================
 * Médecins (fiche Annuaire)
 * =================================================================== */

// PUBLIQUE — n'importe qui peut soumettre une candidature médecin,
// sans authentification. La création crée toujours en même temps le
// compte utilisateur du médecin (mot de passe temporaire) et la fiche
// medecin liée, mais celle-ci est systématiquement forcée en attente
// de vérification côté contrôleur (statut_verification="non_publie"),
// quoi que le corps de la requête envoie — voir creerMedecin. Un
// admin/superadmin doit ensuite la faire passer à "publie" via PUT
// /medecins/:id après vérification des pièces (cni/attestation).
router.post("/medecins", gererTeleversementMedecin, creerMedecin);

// PUBLIQUE, authentification OPTIONNELLE — un visiteur anonyme reçoit
// la vue de base (nom/prenom uniquement), un admin/superadmin connecté
// reçoit en plus email/téléphone (nécessaire à l'écran back-office
// "Tous les médecins"). Voir selectionUtilisateurSelonRole dans le
// contrôleur.
router.get("/medecins", authentifierOptionnel, listerMedecins);
router.get("/medecins/:id", authentifierOptionnel, obtenirMedecin);

// Le médecin propriétaire (utilisateur_id déduit du token) ou
// admin/superadmin. gererTeleversementMedecin traite un éventuel
// remplacement de cni/attestation avant d'atteindre le contrôleur.
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
// l'autorisation fine (médecin souscripteur vs admin/superadmin) est
// gérée à l'intérieur de chaque handler.
//
// v9 : abonnement_medecin n'a plus de medecin_id direct — c'est une
// offre reliée aux médecins par la table de jointure N-N
// forfait_abonnement_medecin (voir schema.prisma et le contrôleur).
// La souscription initiale (un ou plusieurs médecins) se fait à la
// création (POST /abonnements-medecin) ; l'ajout/retrait d'un médecin
// à un abonnement déjà existant (offre groupée) passe par les deux
// routes dédiées ci-dessous, réservées à admin/superadmin.

router.get("/abonnements-medecin", authentifier, listerAbonnementsMedecin);
router.get("/abonnements-medecin/:id", authentifier, obtenirAbonnementMedecin);
router.post("/abonnements-medecin", authentifier, creerAbonnementMedecin);
router.put("/abonnements-medecin/:id", authentifier, modifierAbonnementMedecin);
router.delete("/abonnements-medecin/:id", authentifier, supprimerAbonnementMedecin);

// Composition des souscripteurs d'un abonnement existant (offre
// groupée) — réservé à admin/superadmin (voir contrôleur).
router.post(
  "/abonnements-medecin/:id/medecins",
  authentifier,
  autoriser("admin", "superadmin"),
  ajouterMedecinAbonnement
);
router.delete(
  "/abonnements-medecin/:id/medecins/:medecinId",
  authentifier,
  autoriser("admin", "superadmin"),
  retirerMedecinAbonnement
);

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

/* ===================================================================
 * Spécialités médicales (référentiel)
 * =================================================================== */
// Table de référence autonome (même patron que Langue/Devise/Pays/
// Ville) : lecture publique, écriture réservée à admin/superadmin,
// suppression réservée à superadmin (des fiches medecin peuvent
// encore référencer la spécialité via specialite_id — voir le
// contrôleur, qui renvoie 409 dans ce cas).

router.get("/specialites", listerSpecialites);
router.get("/specialites/:id", obtenirSpecialite);
router.post("/specialites", authentifier, autoriser("admin", "superadmin"), creerSpecialite);
router.put("/specialites/:id", authentifier, autoriser("admin", "superadmin"), modifierSpecialite);
router.delete("/specialites/:id", authentifier, autoriser("superadmin"), supprimerSpecialite);

export default router;