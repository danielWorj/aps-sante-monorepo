// src/routes/medecin.routes.js
// Point d'entrée UNIQUE du module transverse "Gestion des médecins".
//
// Comme expliqué en tête de medecin.controller.js, les 41 handlers de
// ce module sont répartis dans 5 fichiers contrôleurs distincts mais
// tous importés ici depuis un seul chemin :
//   "../controllers/medecin.controller.js"
// (qui ré-exporte lui-même avis.controller.js / abonnementMedecin.
// controller.js / rendezVous.controller.js / agenda.controller.js). Ce
// fichier de routes ne connaît donc pas ce découpage interne — un seul
// routeur, monté une seule fois dans l'app (ex. app.use("/api", medecinRoutes)).
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
//
// Module Agenda (Horaire / DisponibiliteMedecin / CreneauAgenda) :
// aucun nouveau middleware, mais un patron d'accès particulier — la
// CONSULTATION (listerDisponibilitesMedecin, listerCreneauxAgenda,
// obtenirCreneauAgenda, listerHoraires, obtenirHoraire) est PUBLIQUE
// sans authentification (ni même authentifierOptionnel : il n'y a pas
// de vue "enrichie" ici), tandis que la GESTION (créer/modifier/
// supprimer une disponibilité ou un créneau) exige authentifier, la
// vérification fine médecin-propriétaire-vs-admin étant faite à
// l'intérieur de chaque handler (voir agenda.controller.js).

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
  obtenirMonProfil,
  modifierMedecin,
  supprimerMedecin,
  publierMedecin,
  suspendreMedecin,
  reactiverMedecin,
  verifierAppartenanceOrdre,
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
  changerStatutRendezVous,
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
  // Agenda du médecin — Horaire (référentiel partagé)
  listerHoraires,
  obtenirHoraire,
  creerHoraire,
  supprimerHoraire,
  // Agenda du médecin — DisponibiliteMedecin (gabarit récurrent)
  listerDisponibilitesMedecin,
  creerDisponibiliteMedecin,
  supprimerDisponibiliteMedecin,
  // Agenda du médecin — CreneauAgenda (instances concrètes)
  listerCreneauxAgenda,
  obtenirCreneauAgenda,
  genererCreneauxAgenda,
  creerCreneauAgenda,
  modifierCreneauAgenda,
  supprimerCreneauAgenda,
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

// AUTHENTIFIÉ — Récupère le profil complet du médecin connecté
// (utilisateur_id déduit du token) avec toutes ses relations.
// DOIT être déclarée AVANT router.get("/medecins/:id", ...) : Express
// matche les routes dans l'ordre de déclaration, donc si elle vient
// après, "/medecins/mon-profil" est capturé par ":id" avec
// id="mon-profil", ce qui plante Prisma (P2007 : "mon-profil" n'est
// pas un UUID valide).
router.get("/medecins/mon-profil", authentifier, obtenirMonProfil);

router.get("/medecins/:id", authentifierOptionnel, obtenirMedecin);

// Le médecin propriétaire (utilisateur_id déduit du token) ou
// admin/superadmin. gererTeleversementMedecin traite un éventuel
// remplacement de cni/attestation avant d'atteindre le contrôleur.
router.put("/medecins/:id", authentifier, gererTeleversementMedecin, modifierMedecin);

// Réservé à superadmin (pas admin simple).
router.delete("/medecins/:id", authentifier, autoriser("superadmin"), supprimerMedecin);

// Publication / suspension — actions explicites distinctes du PUT
// générique (qui permet toujours aussi de fixer statut_verification
// "à la main", pour compat). Réservées à admin/superadmin :
//   - publier   : passe la fiche à statut_verification="publie".
//   - suspendre : bloque le compte du médecin (statut_compte="suspendu")
//                 et retire la fiche de l'annuaire public en même temps.
//   - reactiver : débloque le compte (statut_compte="actif") sans
//                 republier automatiquement la fiche.
router.patch("/medecins/:id/publier", authentifier, autoriser("admin", "superadmin"), publierMedecin);
router.patch("/medecins/:id/suspendre", authentifier, autoriser("admin", "superadmin"), suspendreMedecin);
router.patch("/medecins/:id/reactiver", authentifier, autoriser("admin", "superadmin"), reactiverMedecin);

// PUBLIQUE — vérifie l'appartenance d'un médecin au Tableau de l'Ordre
// National des Médecins du Cameroun (ONMC) à partir de son
// numero_ordre, en interrogeant https://onmc.app/tableau_de_lordre
// (voir onmcVerificationService.js — ce site n'a pas d'API publique
// documentée, la vérification pilote donc un navigateur headless).
// Volontairement PUBLIQUE (pas de authentifier) : utile en amont de
// POST /medecins, avant même la création d'un compte.
router.post("/medecins/verifier-ordre", verifierAppartenanceOrdre);

/* ===================================================================
 * Agenda du médecin
 * ===================================================================
 * Trois niveaux (voir schema.prisma et agenda.controller.js) :
 *   - Horaire              : référentiel PARTAGÉ des tranches, lecture
 *                            publique / écriture admin-superadmin
 *                            (même patron que /specialites plus bas).
 *   - DisponibiliteMedecin : gabarit récurrent du médecin (jour de la
 *                            semaine + horaire) — géré par le médecin
 *                            propriétaire ou un admin/superadmin,
 *                            consultable publiquement.
 *   - CreneauAgenda         : instances datées concrètes, générées à
 *                            partir du gabarit ou ajoutées à la main —
 *                            même règle d'accès, consultable
 *                            publiquement (c'est cette liste qu'un
 *                            patient regarde avant de prendre
 *                            rendez-vous).
 */

// -- Horaire (référentiel partagé) ----------------------------------
router.get("/horaires", listerHoraires);
router.get("/horaires/:id", obtenirHoraire);
router.post("/horaires", authentifier, autoriser("admin", "superadmin"), creerHoraire);
router.delete("/horaires/:id", authentifier, autoriser("superadmin"), supprimerHoraire);

// -- DisponibiliteMedecin (gabarit récurrent) ------------------------
// Consultation PUBLIQUE ; gestion réservée au médecin propriétaire ou
// à admin/superadmin (vérifié dans le contrôleur, comme pour PUT
// /medecins/:id).
router.get("/medecins/:medecinId/disponibilites", listerDisponibilitesMedecin);
router.post("/medecins/:medecinId/disponibilites", authentifier, creerDisponibiliteMedecin);
router.delete("/disponibilites/:disponibiliteId", authentifier, supprimerDisponibiliteMedecin);

// -- CreneauAgenda (instances concrètes) -----------------------------
// Consultation PUBLIQUE : c'est la route que la prise de rendez-vous
// interroge pour savoir quels créneaux sont réellement libres, sans
// exiger de compte patient. Gestion (génération depuis le gabarit,
// ajout manuel, changement de statut, suppression) réservée au médecin
// propriétaire ou à admin/superadmin.
router.get("/medecins/:medecinId/agenda", listerCreneauxAgenda);
router.get("/creneaux-agenda/:id", obtenirCreneauAgenda);
router.post("/medecins/:medecinId/agenda/generer", authentifier, genererCreneauxAgenda);
router.post("/medecins/:medecinId/agenda", authentifier, creerCreneauAgenda);
router.put("/creneaux-agenda/:id", authentifier, modifierCreneauAgenda);
router.delete("/creneaux-agenda/:id", authentifier, supprimerCreneauAgenda);

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

// Action dédiée au changement de statut (confirmation, annulation,
// passage en salle d'attente, issue de consultation, contestation) —
// contrôle fin des transitions par rôle géré dans le contrôleur (voir
// TRANSITIONS_AUTORISEES dans rendezVous.controller.js), contrairement
// au PUT générique ci-dessus qui accepte "statut" sans ce contrôle.
router.patch("/rendez-vous/:id/statut", authentifier, changerStatutRendezVous);

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