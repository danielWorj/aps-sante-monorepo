// src/controllers/gestionapk.controller.js
//
// Gestion du CRUD des APKs de l'application mobile par le superadmin.
// Les fichiers APK sont stockés localement dans le dossier `/storage/apk`
// à la racine du projet (créé automatiquement s'il n'existe pas).
//
// Opérations disponibles :
//   POST   /api/apks              → creerApk (création + upload fichier)
//   GET    /api/apks              → listerApks (listing avec filtres)
//   GET    /api/apks/:id          → obtenirApk (détail une APK)
//   PUT    /api/apks/:id          → modifierApk (metadonnées + remplacement fichier optionnel)
//   DELETE /api/apks/:id          → supprimerApk (suppression + nettoyage fichier)
//
// Sécurité :
//   - Accès réservé au SUPERADMIN (voir routes)
//   - Validation des fichiers : type .apk, taille max 100 Mo
//   - Gestion d'erreurs cohérente (400/404/500)

import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../lib/prisma.js";

// Récupérer le répertoire racine du projet
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const APK_STORAGE_DIR = path.join(PROJECT_ROOT, "storage", "apk");

// Taille maximale d'un fichier APK : 100 Mo
const TAILLE_MAX_APK = 100 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────
// Utilitaires
// ─────────────────────────────────────────────────────────────────

/**
 * Crée le répertoire de stockage des APKs s'il n'existe pas.
 * Exécuté au démarrage du contrôleur (voir fin du fichier).
 */
async function initierStockageApks() {
  try {
    await fs.mkdir(APK_STORAGE_DIR, { recursive: true });
    console.log(`📁 Répertoire de stockage des APKs prêt : ${APK_STORAGE_DIR}`);
  } catch (err) {
    console.error(`❌ Erreur lors de la création du répertoire APKs : ${err.message}`);
    throw err;
  }
}

/**
 * Valide le fichier APK : type MIME et taille.
 * Retourne un objet { valide: boolean, erreur: string | null }
 */
function validerFichierApk(file) {
  if (!file) {
    return { valide: false, erreur: "Aucun fichier fourni." };
  }

  // Vérifier le type MIME
  const typesAutorises = ["application/vnd.android.package-archive", "application/octet-stream"];
  if (!typesAutorises.includes(file.mimetype)) {
    return {
      valide: false,
      erreur: `Type de fichier non autorisé (${file.mimetype}). Seules les APKs Android sont acceptées.`,
    };
  }

  // Vérifier l'extension .apk
  const extension = path.extname(file.originalname).toLowerCase();
  if (extension !== ".apk") {
    return {
      valide: false,
      erreur: `Extension de fichier invalide. Seuls les fichiers .apk sont acceptés, reçu : ${extension}`,
    };
  }

  // Vérifier la taille
  if (file.size > TAILLE_MAX_APK) {
    return {
      valide: false,
      erreur: `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(2)} Mo). Taille maximale : 100 Mo.`,
    };
  }

  return { valide: true, erreur: null };
}

/**
 * Génère un nom de fichier unique et sécurisé.
 * Format : {uuid}_{timestamp}_{originalname}
 */
function genererNomFichierSecurise(fileOriginalName) {
  const uuid = prisma.createUUID?.() || crypto.randomUUID?.();
  const timestamp = Date.now();
  const nameClean = fileOriginalName
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "_") // remplace les caractères spéciaux
    .substring(0, 50); // limite à 50 caractères
  return `${uuid}_${timestamp}_${nameClean}`;
}

/**
 * Supprime un fichier APK du disque.
 * Effectue un nettoyage best-effort (ne remonte pas d'erreur).
 */
async function supprimerFichierDuDisque(nomFichier) {
  if (!nomFichier) return;
  try {
    const cheminFichier = path.join(APK_STORAGE_DIR, nomFichier);
    // Vérifier que le chemin reste bien dans APK_STORAGE_DIR (sécurité : path traversal)
    if (!cheminFichier.startsWith(APK_STORAGE_DIR)) {
      console.warn(`⚠️ Tentative de suppression hors du répertoire de stockage : ${cheminFichier}`);
      return;
    }
    await fs.unlink(cheminFichier);
    console.log(`🗑️ Fichier supprimé : ${nomFichier}`);
  } catch (err) {
    console.warn(`⚠️ Impossible de supprimer le fichier ${nomFichier} : ${err.message}`);
  }
}

/**
 * Assemble l'URL publique d'une APK téléchargeable.
 * Format : /api/apks/download/{id}/{nomFichier}
 */
function construireUrlTelechargement(apkId, nomFichier) {
  return `/api/apks/download/${apkId}/${encodeURIComponent(nomFichier)}`;
}

// ─────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────

/**
 * POST /api/apks
 * Crée une nouvelle APK : valide le fichier, l'enregistre sur disque,
 * puis crée l'entrée en base de données.
 *
 * Champs requis dans req.body :
 *   - libelle (string, max 255 caractères) : nom/identifiant de l'APK
 *   - description (string, optionnel) : description longue
 *   - status (boolean, optionnel, défaut true) : active ou inactive
 *
 * Fichier requis (multipart) :
 *   - file : le fichier APK (application/vnd.android.package-archive)
 *
 * Retour :
 *   - 201 Created : { message, apk } avec l'enregistrement créé
 *   - 400 Bad Request : validation échouée
 *   - 500 Internal Server Error : erreur disque ou BD
 */
export async function creerApk(req, res, next) {
  try {
    const { libelle, description, status } = req.body;
    const fichier = req.file;

    // Validation des champs obligatoires
    const champsManquants = [];
    if (!libelle || !String(libelle).trim()) champsManquants.push("libelle");
    if (!fichier) champsManquants.push("file");

    if (champsManquants.length > 0) {
      return res.status(400).json({
        message: `Champs obligatoires manquants : ${champsManquants.join(", ")}.`,
      });
    }

    // Validation du fichier
    const validation = validerFichierApk(fichier);
    if (!validation.valide) {
      return res.status(400).json({ message: validation.erreur });
    }

    // Générer un nom de fichier sécurisé et unique
    const nomFichierSecurise = genererNomFichierSecurise(fichier.originalname);
    const cheminFichier = path.join(APK_STORAGE_DIR, nomFichierSecurise);

    // Écrire le fichier sur disque
    try {
      await fs.writeFile(cheminFichier, fichier.buffer);
    } catch (errEcriture) {
      console.error(`❌ Erreur lors de l'écriture du fichier : ${errEcriture.message}`);
      return res.status(500).json({
        message: "Erreur lors de l'enregistrement du fichier sur le serveur.",
      });
    }

    // Créer l'enregistrement en base de données
    let apkCreee;
    try {
      apkCreee = await prisma.mobileApk.create({
        data: {
          libelle: String(libelle).trim(),
          description: description ? String(description).trim() : null,
          file_url: nomFichierSecurise,
          status: status !== undefined ? Boolean(status) : true,
        },
      });
    } catch (errDb) {
      // Nettoyage best-effort : supprimer le fichier si la BD échoue
      await supprimerFichierDuDisque(nomFichierSecurise);
      console.error(`❌ Erreur lors de la création en BD : ${errDb.message}`);
      return res.status(500).json({
        message: "Erreur lors de la création de l'APK en base de données.",
      });
    }

    // Répondre avec l'APK créée (ajouter l'URL de téléchargement)
    return res.status(201).json({
      message: "APK créée avec succès.",
      apk: {
        ...apkCreee,
        file_url: construireUrlTelechargement(apkCreee.id, apkCreee.file_url),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/apks
 * Liste toutes les APKs avec filtres optionnels.
 *
 * Paramètres de requête (query) optionnels :
 *   - status (boolean ou "true"/"false") : filtrer par statut (actif/inactif)
 *   - search (string) : recherche textuelle sur libelle et description
 *   - skip (number) : pagination, nombre d'enregistrements à sauter
 *   - take (number) : pagination, nombre d'enregistrements à retourner (max 100)
 *
 * Retour :
 *   - 200 OK : { message, total, skip, take, apks: [...] }
 *   - 400 Bad Request : paramètres invalides
 *   - 500 Internal Server Error : erreur BD
 */
export async function listerApks(req, res, next) {
  try {
    const { status, search, skip = 0, take = 20 } = req.query;

    // Validation et conversion des paramètres de pagination
    let skipNum = parseInt(skip, 10) || 0;
    let takeNum = parseInt(take, 10) || 20;

    if (skipNum < 0) skipNum = 0;
    if (takeNum < 1 || takeNum > 100) takeNum = 20;

    // Construction du filtre
    const filtre = {};

    // Filtre par statut si fourni
    if (status !== undefined) {
      const statusStr = String(status).toLowerCase();
      if (statusStr === "true" || statusStr === "1") filtre.status = true;
      else if (statusStr === "false" || statusStr === "0") filtre.status = false;
      else {
        return res.status(400).json({
          message: `Paramètre 'status' invalide (boolean ou "true"/"false" attendu, reçu : ${status}).`,
        });
      }
    }

    // Filtre de recherche textuelle (libelle ou description)
    if (search) {
      const rechercheStr = String(search).trim();
      if (rechercheStr.length > 0) {
        filtre.OR = [
          { libelle: { contains: rechercheStr, mode: "insensitive" } },
          { description: { contains: rechercheStr, mode: "insensitive" } },
        ];
      }
    }

    // Récupérer le total avant pagination
    const total = await prisma.mobileApk.count({ where: filtre });

    // Lister les APKs avec pagination et tri (plus récentes d'abord)
    const apks = await prisma.mobileApk.findMany({
      where: filtre,
      orderBy: { date_upload: "desc" },
      skip: skipNum,
      take: takeNum,
    });

    // Enrichir les URLs de téléchargement
    const apksAvecUrl = apks.map((apk) => ({
      ...apk,
      file_url: construireUrlTelechargement(apk.id, apk.file_url),
    }));

    return res.status(200).json({
      message: "APKs listées.",
      total,
      skip: skipNum,
      take: takeNum,
      apks: apksAvecUrl,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/apks/active
 * Route PUBLIQUE (aucune authentification requise) : renvoie la
 * dernière APK active (status=true), destinée au bouton de
 * téléchargement de la page d'accueil du site public
 * (client-plateform/src/pages/Home.jsx).
 *
 * Ajoutée car listerApks/obtenirApk sont réservées au SUPERADMIN
 * (voir gestionapk.routes.js) — le front public a besoin d'un moyen
 * de connaître l'APK courante et son URL de téléchargement sans
 * authentification, sans pour autant exposer tout le CRUD.
 *
 * Retour :
 *   - 200 OK : { message, apk } — la plus récente des APKs actives
 *   - 404 Not Found : aucune APK active pour le moment
 *   - 500 Internal Server Error : erreur BD
 */
export async function obtenirApkActive(req, res, next) {
  try {
    const apk = await prisma.mobileApk.findFirst({
      where: { status: true },
      orderBy: { date_upload: "desc" },
    });

    if (!apk) {
      return res.status(404).json({ message: "Aucune APK active pour le moment." });
    }

    return res.status(200).json({
      message: "APK active trouvée.",
      apk: {
        ...apk,
        file_url: construireUrlTelechargement(apk.id, apk.file_url),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/apks/:id
 * Récupère le détail d'une APK par son ID.
 *
 * Retour :
 *   - 200 OK : { message, apk }
 *   - 404 Not Found : APK introuvable
 *   - 500 Internal Server Error : erreur BD
 */
export async function obtenirApk(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || id.trim() === "") {
      return res.status(400).json({ message: "ID d'APK manquant ou invalide." });
    }

    const apk = await prisma.mobileApk.findUnique({
      where: { id },
    });

    if (!apk) {
      return res.status(404).json({ message: `APK avec l'ID ${id} introuvable.` });
    }

    return res.status(200).json({
      message: "APK trouvée.",
      apk: {
        ...apk,
        file_url: construireUrlTelechargement(apk.id, apk.file_url),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/apks/:id
 * Modifie les métadonnées d'une APK. Le remplacement du fichier APK
 * lui-même est optionnel (si un nouveau fichier est fourni, il remplace
 * l'ancien et l'ancien est supprimé du disque).
 *
 * Champs modifiables dans req.body :
 *   - libelle (string, max 255) : optionnel
 *   - description (string) : optionnel
 *   - status (boolean) : optionnel
 *
 * Fichier optionnel (multipart) :
 *   - file : nouveau fichier APK (remplace l'ancien s'il existe)
 *
 * Retour :
 *   - 200 OK : { message, apk } avec les modifications
 *   - 400 Bad Request : validation échouée
 *   - 404 Not Found : APK introuvable
 *   - 500 Internal Server Error : erreur disque ou BD
 */
export async function modifierApk(req, res, next) {
  try {
    const { id } = req.params;
    const { libelle, description, status } = req.body;
    const fichier = req.file;

    if (!id || id.trim() === "") {
      return res.status(400).json({ message: "ID d'APK manquant ou invalide." });
    }

    // Récupérer l'APK existante
    const apkExistante = await prisma.mobileApk.findUnique({
      where: { id },
    });

    if (!apkExistante) {
      return res.status(404).json({ message: `APK avec l'ID ${id} introuvable.` });
    }

    // Préparer l'objet de mise à jour
    const miseAJour = {};

    if (libelle !== undefined) {
      const libelleStr = String(libelle).trim();
      if (!libelleStr) {
        return res.status(400).json({
          message: "Le 'libelle' ne peut pas être vide.",
        });
      }
      miseAJour.libelle = libelleStr;
    }

    if (description !== undefined) {
      miseAJour.description = description ? String(description).trim() : null;
    }

    if (status !== undefined) {
      miseAJour.status = Boolean(status);
    }

    // Si un nouveau fichier est fourni, le valider et le traiter
    let ancienNomFichier = null;
    if (fichier) {
      const validation = validerFichierApk(fichier);
      if (!validation.valide) {
        return res.status(400).json({ message: validation.erreur });
      }

      const nomFichierSecurise = genererNomFichierSecurise(fichier.originalname);
      const cheminFichier = path.join(APK_STORAGE_DIR, nomFichierSecurise);

      try {
        await fs.writeFile(cheminFichier, fichier.buffer);
        ancienNomFichier = apkExistante.file_url;
        miseAJour.file_url = nomFichierSecurise;
      } catch (errEcriture) {
        console.error(`❌ Erreur lors de l'écriture du fichier : ${errEcriture.message}`);
        return res.status(500).json({
          message: "Erreur lors de l'enregistrement du fichier sur le serveur.",
        });
      }
    }

    // Si aucune mise à jour n'a été spécifiée
    if (Object.keys(miseAJour).length === 0) {
      return res.status(400).json({
        message: "Aucun champ à modifier fourni (libelle, description, status, ou fichier).",
      });
    }

    // Mettre à jour en base de données
    let apkModifiee;
    try {
      apkModifiee = await prisma.mobileApk.update({
        where: { id },
        data: miseAJour,
      });
    } catch (errDb) {
      // Nettoyage best-effort : supprimer le nouveau fichier si la BD échoue
      if (miseAJour.file_url) {
        await supprimerFichierDuDisque(miseAJour.file_url);
      }
      console.error(`❌ Erreur lors de la mise à jour en BD : ${errDb.message}`);
      return res.status(500).json({
        message: "Erreur lors de la mise à jour de l'APK en base de données.",
      });
    }

    // Supprimer l'ancien fichier maintenant que la BD est à jour
    if (ancienNomFichier) {
      await supprimerFichierDuDisque(ancienNomFichier);
    }

    return res.status(200).json({
      message: "APK modifiée avec succès.",
      apk: {
        ...apkModifiee,
        file_url: construireUrlTelechargement(apkModifiee.id, apkModifiee.file_url),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/apks/:id
 * Supprime une APK et le fichier associé du disque.
 *
 * Retour :
 *   - 200 OK : { message } — suppression réussie
 *   - 404 Not Found : APK introuvable
 *   - 500 Internal Server Error : erreur BD
 */
export async function supprimerApk(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || id.trim() === "") {
      return res.status(400).json({ message: "ID d'APK manquant ou invalide." });
    }

    // Récupérer l'APK pour connaître le nom du fichier
    const apk = await prisma.mobileApk.findUnique({
      where: { id },
    });

    if (!apk) {
      return res.status(404).json({ message: `APK avec l'ID ${id} introuvable.` });
    }

    // Supprimer en base de données
    try {
      await prisma.mobileApk.delete({
        where: { id },
      });
    } catch (errDb) {
      console.error(`❌ Erreur lors de la suppression en BD : ${errDb.message}`);
      return res.status(500).json({
        message: "Erreur lors de la suppression de l'APK en base de données.",
      });
    }

    // Nettoyer le fichier du disque (best-effort)
    await supprimerFichierDuDisque(apk.file_url);

    return res.status(200).json({
      message: "APK supprimée avec succès.",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/apks/download/:id/:nomFichier
 * Endpoint de téléchargement : sert le fichier APK depuis le disque.
 *
 * Sécurité :
 *   - Vérifier que l'ID existe en BD
 *   - Valider que le nomFichier correspond bien à celui en BD
 *   - Utiliser path.resolve() pour éviter les path traversal attacks
 *
 * Retour :
 *   - 200 OK + Content-Type application/vnd.android.package-archive
 *   - 404 Not Found : APK ou fichier introuvable
 *   - 500 Internal Server Error : erreur disque
 */
export async function telechargerApk(req, res, next) {
  try {
    const { id, nomFichier } = req.params;

    if (!id || !nomFichier) {
      return res.status(404).json({ message: "APK introuvable." });
    }

    // Récupérer l'APK par ID
    const apk = await prisma.mobileApk.findUnique({
      where: { id },
    });

    if (!apk) {
      return res.status(404).json({ message: `APK avec l'ID ${id} introuvable.` });
    }

    // Vérifier que le nomFichier décodé correspond à celui en BD
    const nomFichierDecode = decodeURIComponent(nomFichier);
    if (nomFichierDecode !== apk.file_url) {
      console.warn(
        `⚠️ Tentative d'accès avec mauvais nom de fichier : ${nomFichierDecode} vs ${apk.file_url}`
      );
      return res.status(404).json({ message: "APK introuvable." });
    }

    const cheminFichier = path.resolve(APK_STORAGE_DIR, nomFichierDecode);

    // Vérification de sécurité : s'assurer que le chemin réalisé reste dans APK_STORAGE_DIR
    if (!cheminFichier.startsWith(APK_STORAGE_DIR)) {
      console.warn(`⚠️ Tentative de path traversal : ${cheminFichier}`);
      return res.status(404).json({ message: "APK introuvable." });
    }

    // Vérifier l'existence du fichier
    try {
      await fs.access(cheminFichier);
    } catch (err) {
      console.warn(`⚠️ Fichier introuvable sur disque : ${cheminFichier}`);
      return res.status(404).json({ message: "Fichier APK introuvable sur le serveur." });
    }

    // Envoyer le fichier avec les bons en-têtes
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${apk.libelle.replace(/"/g, '\\"')}.apk"`
    );
    res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache 1 an

    const stream = createReadStream(cheminFichier);
    stream.pipe(res);

    stream.on("error", (errStream) => {
      console.error(`❌ Erreur lors du streaming du fichier : ${errStream.message}`);
      if (!res.headersSent) {
        res.status(500).json({
          message: "Erreur lors du téléchargement du fichier.",
        });
      }
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────
// Initialisation
// ─────────────────────────────────────────────────────────────────

// Initialiser le répertoire de stockage au chargement du module
try {
  await initierStockageApks();
} catch (err) {
  console.error(`❌ Impossible d'initialiser le stockage des APKs. L'application peut ne pas fonctionner correctement.`);
}