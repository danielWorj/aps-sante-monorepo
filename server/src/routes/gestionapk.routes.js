// src/routes/gestionapk.routes.js
//
// Routes de gestion des APKs de l'application mobile.
// Accès réservé au SUPERADMIN (sauf le téléchargement qui peut être public/authentifié selon besoin).
//
// Endpoints :
//   POST   /api/apks                    → créer une APK (superadmin)
//   GET    /api/apks                    → lister les APKs (superadmin)
//   GET    /api/apks/:id                → obtenir une APK (superadmin)
//   PUT    /api/apks/:id                → modifier une APK (superadmin)
//   DELETE /api/apks/:id                → supprimer une APK (superadmin)
//   GET    /api/apks/download/:id/:nom  → télécharger une APK (public ou authentifié)

import express from "express";
import {
  creerApk,
  listerApks,
  obtenirApk,
  obtenirApkActive,
  modifierApk,
  supprimerApk,
  telechargerApk,
} from "../controllers/gestionapk.controller.js";
import { gererTeleversementApk } from "../middlewares/upload_apk.middleware.js";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────
// Routes protégées (SUPERADMIN uniquement)
// ─────────────────────────────────────────────────────────────────

/**
 * POST /api/apks
 * Crée une nouvelle APK avec upload de fichier.
 * - Authentification requise : OUI
 * - Autorisation requise : SUPERADMIN
 * - Multipart : OUI (file field)
 *
 * Body (multipart/form-data) :
 *   - file : fichier APK (requis)
 *   - libelle : nom de l'APK (requis, string)
 *   - description : description (optionnel, string)
 *   - status : actif/inactif (optionnel, boolean, défaut true)
 *
 * Réponse (201 Created) :
 *   {
 *     message: "APK créée avec succès.",
 *     apk: {
 *       id: "uuid",
 *       libelle: "...",
 *       description: "...",
 *       file_url: "/api/apks/download/...",
 *       status: true,
 *       date_upload: "2024-01-15T10:30:00Z"
 *     }
 *   }
 */
router.post("/", authentifier, autoriser("superadmin"), gererTeleversementApk, creerApk);

/**
 * GET /api/apks
 * Liste toutes les APKs (avec filtres et pagination).
 * - Authentification requise : OUI
 * - Autorisation requise : SUPERADMIN
 *
 * Query parameters (optionnels) :
 *   - status : filtrer par statut (true/false/"true"/"false")
 *   - search : recherche textuelle (libelle, description)
 *   - skip : nombre d'enregistrements à sauter (défaut 0)
 *   - take : nombre d'enregistrements à retourner (défaut 20, max 100)
 *
 * Exemples :
 *   GET /api/apks?status=true&search=android&skip=0&take=10
 *   GET /api/apks?status=false
 *
 * Réponse (200 OK) :
 *   {
 *     message: "APKs listées.",
 *     total: 5,
 *     skip: 0,
 *     take: 20,
 *     apks: [
 *       {
 *         id: "uuid",
 *         libelle: "...",
 *         description: "...",
 *         file_url: "/api/apks/download/...",
 *         status: true,
 *         date_upload: "2024-01-15T10:30:00Z"
 *       },
 *       ...
 *     ]
 *   }
 */
router.get("/", authentifier, autoriser("superadmin"), listerApks);

/**
 * GET /api/apks/active
 * Route PUBLIQUE (aucune authentification) : renvoie la dernière APK
 * active, utilisée par le bouton "Télécharger l'application" de
 * client-plateform (voir apkService.js / Home.jsx côté public).
 *
 * ⚠️ BUG CORRIGÉ : le contrôleur `obtenirApkActive` existait déjà
 * (gestionapk.controller.js) mais n'était jamais monté sur aucune
 * route. Le front public appelait donc GET /api/apks/active, qui
 * tombait par défaut sur la route GET /:id juste en dessous (avec
 * id = "active") — laquelle exige authentifier + autoriser("superadmin").
 * Un visiteur non connecté recevait donc un 401/403 (jamais un 404),
 * ce que le front ne savait pas distinguer d'une vraie erreur : le
 * bouton de téléchargement de la page d'accueil restait donc TOUJOURS
 * désactivé pour le grand public, quel que soit l'état des APKs en
 * base.
 *
 * IMPORTANT : cette route doit être déclarée AVANT "/:id" ci-dessous —
 * express matche les routes dans l'ordre de déclaration, et "/active"
 * et "/:id" ont le même nombre de segments. La déclarer après referait
 * réapparaître le même bug.
 */
router.get("/active", obtenirApkActive);

/**
 * GET /api/apks/:id
 * Récupère le détail d'une APK.
 * - Authentification requise : OUI
 * - Autorisation requise : SUPERADMIN
 *
 * Paramètres de route :
 *   - id : UUID de l'APK (requis)
 *
 * Réponse (200 OK) :
 *   {
 *     message: "APK trouvée.",
 *     apk: {
 *       id: "uuid",
 *       libelle: "...",
 *       description: "...",
 *       file_url: "/api/apks/download/...",
 *       status: true,
 *       date_upload: "2024-01-15T10:30:00Z"
 *     }
 *   }
 *
 * Erreurs :
 *   - 404 Not Found : APK introuvable
 */
router.get("/:id", authentifier, autoriser("superadmin"), obtenirApk);

/**
 * PUT /api/apks/:id
 * Modifie les métadonnées d'une APK (et optionnellement remplace le fichier).
 * - Authentification requise : OUI
 * - Autorisation requise : SUPERADMIN
 * - Multipart : OUI (file field, optionnel)
 *
 * Paramètres de route :
 *   - id : UUID de l'APK (requis)
 *
 * Body (multipart/form-data, optionnel) :
 *   - file : nouveau fichier APK (optionnel, remplace l'ancien si présent)
 *   - libelle : nouveau nom (optionnel, string)
 *   - description : nouvelle description (optionnel, string)
 *   - status : nouveau statut (optionnel, boolean)
 *
 * Note : au moins l'un des champs doit être fourni pour que la mise à jour réussisse.
 *
 * Réponse (200 OK) :
 *   {
 *     message: "APK modifiée avec succès.",
 *     apk: {
 *       id: "uuid",
 *       libelle: "...",
 *       description: "...",
 *       file_url: "/api/apks/download/...",
 *       status: true,
 *       date_upload: "2024-01-15T10:30:00Z"
 *     }
 *   }
 *
 * Erreurs :
 *   - 400 Bad Request : paramètres invalides ou aucun champ à modifier
 *   - 404 Not Found : APK introuvable
 */
router.put("/:id", authentifier, autoriser("superadmin"), gererTeleversementApk, modifierApk);

/**
 * DELETE /api/apks/:id
 * Supprime une APK et son fichier associé.
 * - Authentification requise : OUI
 * - Autorisation requise : SUPERADMIN
 *
 * Paramètres de route :
 *   - id : UUID de l'APK (requis)
 *
 * Réponse (200 OK) :
 *   {
 *     message: "APK supprimée avec succès."
 *   }
 *
 * Erreurs :
 *   - 404 Not Found : APK introuvable
 */
router.delete("/:id", authentifier, autoriser("superadmin"), supprimerApk);

// ─────────────────────────────────────────────────────────────────
// Route de téléchargement (PUBLIC ou AUTHENTIFIÉE selon besoin)
// ─────────────────────────────────────────────────────────────────

/**
 * GET /api/apks/download/:id/:nomFichier
 * Télécharge le fichier APK depuis le disque.
 *
 * Cette route peut être :
 *   - PUBLIQUE (enlever le autoriser()) : n'importe qui peut télécharger
 *   - AUTHENTIFIÉE (garder le autoriser()) : seuls les utilisateurs connectés
 *   - PROTÉGÉE (ajouter d'autres conditions) : ex. uniquement superadmin
 *
 * Dans l'implémentation actuelle, c'est PUBLIC (aucune protection).
 * À adapter selon votre politique de sécurité.
 *
 * Paramètres de route :
 *   - id : UUID de l'APK
 *   - nomFichier : nom du fichier (vérifié contre la BD pour sécurité)
 *
 * Réponse (200 OK) :
 *   - Content-Type: application/vnd.android.package-archive
 *   - Content-Disposition: attachment; filename="...apk"
 *   - Le contenu du fichier APK en streaming
 *
 * Erreurs :
 *   - 404 Not Found : APK ou fichier introuvable
 *   - 500 Internal Server Error : erreur de streaming
 */
// PUBLIC : tout le monde peut télécharger
router.get("/download/:id/:nomFichier", telechargerApk);

// OU PROTÉGÉ (décommenter si vous voulez limiter aux superadmins) :
// router.get("/download/:id/:nomFichier", autoriser("superadmin"), telechargerApk);

export default router;