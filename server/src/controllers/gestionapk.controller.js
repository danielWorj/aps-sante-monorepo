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
import { createHash } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../lib/prisma.js";
// Taille maximale d'un fichier APK : source UNIQUE, définie dans le
// middleware multer et réimportée ici — voir la note dans
// upload_apk.middleware.js. Corrige l'ancienne divergence (500 Mo ici
// vs 100 Mo côté middleware, ou l'inverse) qui laissait un gros
// fichier être entièrement envoyé avant d'être rejeté a posteriori.
import { TAILLE_MAX_APK } from "../middlewares/upload_apk.middleware.js";
import { lireVersionApk, numeroBuild } from "../utils/apkVersion.js";

// Récupérer le répertoire racine du projet
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const APK_STORAGE_DIR = path.join(PROJECT_ROOT, "storage", "apk");

// Identifiant Android de l'application (applicationId, build.gradle.kts).
// Android ne met à jour une application qu'avec une APK du même paquet : une
// APK d'un autre identifiant s'installe à côté et la version reste la même.
const PAQUET_APPLICATION = process.env.APK_PACKAGE || "com.apssante.app";

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
 * Interprète un statut reçu du client. En multipart (FormData) tout
 * arrive en chaîne : `Boolean("false")` vaut true, d'où l'impossibilité
 * de désactiver une APK. Retourne true/false, ou null si invalide.
 */
function lireStatut(valeur) {
  if (typeof valeur === "boolean") return valeur;
  const s = String(valeur).trim().toLowerCase();
  if (s === "true" || s === "1") return true;
  if (s === "false" || s === "0") return false;
  return null;
}

/**
 * Valide le fichier APK : type MIME et taille.
 * Retourne un objet { valide: boolean, erreur: string | null }
 */
function validerFichierApk(file) {
  if (!file) {
    return { valide: false, erreur: "Aucun fichier fourni." };
  }

  // Vérifier l'extension .apk — seule condition bloquante (voir
  // upload_apk.middleware.js : le type MIME n'est plus revérifié ici
  // en doublon, il est trop peu fiable selon navigateur/OS pour
  // justifier un rejet à lui seul ; l'extension est déjà passée par le
  // même filtre côté middleware avant d'arriver jusqu'ici).
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
 * Lit la version dans le manifeste de l'APK (voir utils/apkVersion.js).
 * Une APK dont la version est illisible est refusée : l'application mobile
 * ne pourrait pas savoir si elle est plus récente que la version installée.
 * Retourne { version: { version_name, version_code } } ou { erreur }.
 */
function lireVersionFichierApk(file) {
  try {
    const { versionName, versionCode, packageName } = lireVersionApk(file.buffer);
    if (!Number.isInteger(versionCode)) {
      return { erreur: "Numéro de version (versionCode) introuvable dans l'APK." };
    }
    if (packageName && packageName !== PAQUET_APPLICATION) {
      return {
        erreur:
          `Cette APK est celle du paquet « ${packageName} », pas de « ${PAQUET_APPLICATION} » : ` +
          "elle ne mettrait pas à jour l'application installée. Recompilez l'application actuelle.",
      };
    }
    return { version: { version_name: versionName, version_code: versionCode } };
  } catch (err) {
    return { erreur: `APK illisible : ${err.message}` };
  }
}

/** Ajoute aux réponses l'URL de téléchargement et le numéro de build comparable. */
function serialiserApk(apk) {
  return {
    ...apk,
    // Version iOS : file_url est déjà le lien externe (App Store / TestFlight).
    file_url: apk.plateforme === "ios" ? apk.file_url : construireUrlTelechargement(apk.id, apk.file_url),
    numero_build: numeroBuild(apk.version_code),
  };
}

const PLATEFORMES = ["android", "ios"];

/** Plateforme reçue du client (défaut android), ou null si inconnue. */
function lirePlateforme(valeur) {
  const p = String(valeur ?? "android").trim().toLowerCase() || "android";
  return PLATEFORMES.includes(p) ? p : null;
}

/**
 * Champs d'une version iOS : lien (https), version_name et version_code
 * (numéro de build, le « +N » de pubspec.yaml). Avec [exigerTout], les trois
 * sont obligatoires (création) ; sinon seuls les champs fournis sont lus.
 * Retourne { donnees } ou { erreur }.
 */
function lireChampsIos(body, exigerTout) {
  const donnees = {};
  const { lien, version_name, version_code } = body;

  if (lien !== undefined || exigerTout) {
    const l = String(lien ?? "").trim();
    let valide = false;
    try {
      valide = new URL(l).protocol === "https:";
    } catch {
      valide = false;
    }
    if (!valide) return { erreur: "Le lien iOS (App Store ou TestFlight) doit être une adresse https valide." };
    donnees.file_url = l;
  }
  if (version_name !== undefined || exigerTout) {
    const v = String(version_name ?? "").trim();
    if (!v || v.length > 50) return { erreur: "Le nom de version (ex : 1.2.0) est obligatoire (50 caractères max)." };
    donnees.version_name = v;
  }
  if (version_code !== undefined || exigerTout) {
    const c = Number(version_code);
    if (!Number.isInteger(c) || c < 1) return { erreur: "Le numéro de build doit être un entier positif." };
    donnees.version_code = c;
  }
  return { donnees };
}

/** Empreinte SHA-256 (hexadécimal) d'un contenu en mémoire. */
function empreinteSha256(contenu) {
  return createHash("sha256").update(contenu).digest("hex");
}

/** Empreinte SHA-256 d'un fichier du disque, lu en flux (APK de plusieurs dizaines de Mo). */
function empreinteFichier(chemin) {
  return new Promise((resoudre, rejeter) => {
    const hash = createHash("sha256");
    createReadStream(chemin)
      .on("data", (morceau) => hash.update(morceau))
      .on("error", rejeter)
      .on("end", () => resoudre(hash.digest("hex")));
  });
}

/**
 * Réglages OTA d'une version (les deux plateformes) :
 *   - build_minimum : vide = aucune obligation, sinon entier ≥ 1 ne dépassant
 *     pas le build de la version (sinon personne ne pourrait s'y conformer) ;
 *   - deploiement_pourcentage : entier de 1 à 100.
 * [buildVersion] = numéro de build de la version après modification (null si
 * inconnu). Seuls les champs fournis sont lus. Retourne { donnees } ou { erreur }.
 */
export function lireChampsOta(body, buildVersion) {
  const donnees = {};
  const { build_minimum, deploiement_pourcentage } = body;

  if (build_minimum !== undefined) {
    const brut = String(build_minimum ?? "").trim();
    if (brut === "" || brut === "null") {
      donnees.build_minimum = null;
    } else {
      const b = Number(brut);
      if (!Number.isInteger(b) || b < 1) {
        return { erreur: "Le build minimal requis doit être un entier positif (ou vide)." };
      }
      if (buildVersion != null && b > buildVersion) {
        return {
          erreur: `Le build minimal requis (${b}) ne peut pas dépasser le build de cette version (${buildVersion}).`,
        };
      }
      donnees.build_minimum = b;
    }
  }
  if (deploiement_pourcentage !== undefined) {
    const p = Number(String(deploiement_pourcentage).trim());
    if (!Number.isInteger(p) || p < 1 || p > 100) {
      return { erreur: "Le pourcentage de déploiement doit être un entier entre 1 et 100." };
    }
    donnees.deploiement_pourcentage = p;
  }
  return { donnees };
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

    const plateforme = lirePlateforme(req.body.plateforme);
    if (!plateforme) {
      return res.status(400).json({ message: "La 'plateforme' doit valoir android ou ios." });
    }
    if (plateforme === "ios") return creerVersionIos(req, res);

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

    const lecture = lireVersionFichierApk(fichier);
    if (lecture.erreur) {
      return res.status(400).json({ message: lecture.erreur });
    }

    const statutLu = status !== undefined ? lireStatut(status) : true;
    if (statutLu === null) {
      return res.status(400).json({ message: "Le 'status' doit valoir true ou false." });
    }

    const ota = lireChampsOta(req.body, numeroBuild(lecture.version.version_code));
    if (ota.erreur) return res.status(400).json({ message: ota.erreur });

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
      // Une seule APK active par plateforme : activer celle-ci désactive les autres.
      apkCreee = await prisma.$transaction(async (tx) => {
        if (statutLu) {
          await tx.mobileApk.updateMany({
            where: { status: true, plateforme: "android" },
            data: { status: false },
          });
        }
        return tx.mobileApk.create({
          data: {
            libelle: String(libelle).trim(),
            description: description ? String(description).trim() : null,
            file_url: nomFichierSecurise,
            status: statutLu,
            sha256: empreinteSha256(fichier.buffer),
            ...lecture.version,
            ...ota.donnees,
          },
        });
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
      apk: serialiserApk(apkCreee),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Création d'une version iOS (appelée par creerApk) : pas de fichier, un
 * lien externe et une version saisie au back-office.
 */
async function creerVersionIos(req, res) {
  const { libelle, description, status } = req.body;
  if (req.file) {
    return res.status(400).json({ message: "Une version iOS se publie par un lien, sans fichier." });
  }
  if (!libelle || !String(libelle).trim()) {
    return res.status(400).json({ message: "Champs obligatoires manquants : libelle." });
  }
  const champs = lireChampsIos(req.body, true);
  if (champs.erreur) return res.status(400).json({ message: champs.erreur });
  const ota = lireChampsOta(req.body, champs.donnees.version_code);
  if (ota.erreur) return res.status(400).json({ message: ota.erreur });

  const statutLu = status !== undefined ? lireStatut(status) : true;
  if (statutLu === null) {
    return res.status(400).json({ message: "Le 'status' doit valoir true ou false." });
  }

  const version = await prisma.$transaction(async (tx) => {
    if (statutLu) {
      await tx.mobileApk.updateMany({ where: { status: true, plateforme: "ios" }, data: { status: false } });
    }
    return tx.mobileApk.create({
      data: {
        libelle: String(libelle).trim(),
        description: description ? String(description).trim() : null,
        status: statutLu,
        plateforme: "ios",
        ...champs.donnees,
        ...ota.donnees,
      },
    });
  });

  return res.status(201).json({ message: "Version iOS créée avec succès.", apk: serialiserApk(version) });
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
    const { status, search, plateforme, skip = 0, take = 20 } = req.query;

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

    if (plateforme !== undefined && plateforme !== "") {
      const p = lirePlateforme(plateforme);
      if (!p) return res.status(400).json({ message: "Paramètre 'plateforme' invalide (android ou ios)." });
      filtre.plateforme = p;
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
    const apksAvecUrl = apks.map(serialiserApk);

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
    // ?plateforme=ios pour l'application iPhone ; android par défaut (site public, APK).
    const plateforme = lirePlateforme(req.query.plateforme);
    if (!plateforme) {
      return res.status(400).json({ message: "Paramètre 'plateforme' invalide (android ou ios)." });
    }

    const apk = await prisma.mobileApk.findFirst({
      where: { status: true, plateforme },
      orderBy: { date_upload: "desc" },
    });

    if (!apk) {
      return res.status(404).json({ message: "Aucune APK active pour le moment." });
    }

    // APK téléversée avant la lecture des versions (migration apk_version) :
    // sans version_code, l'application se croirait toujours à jour. On lit
    // le manifeste une fois et on l'enregistre.
    if (plateforme === "android" && apk.version_code == null) {
      try {
        const contenu = await fs.readFile(path.join(APK_STORAGE_DIR, apk.file_url));
        const { versionName, versionCode } = lireVersionApk(contenu);
        if (Number.isInteger(versionCode)) {
          Object.assign(
            apk,
            await prisma.mobileApk.update({
              where: { id: apk.id },
              data: { version_name: versionName, version_code: versionCode },
            })
          );
        }
      } catch (err) {
        console.warn(`⚠️ Version illisible pour l'APK active ${apk.id} : ${err.message}`);
      }
    }

    // Taille du fichier (octets) : repli côté client pour la barre de
    // progression si un proxy retire Content-Length au téléchargement.
    let taille = null;
    if (plateforme === "android") {
      const chemin = path.join(APK_STORAGE_DIR, apk.file_url);
      try {
        taille = (await fs.stat(chemin)).size;
        // APK téléversée avant la migration mobile_ota : empreinte calculée une fois.
        if (!apk.sha256) {
          Object.assign(
            apk,
            await prisma.mobileApk.update({ where: { id: apk.id }, data: { sha256: await empreinteFichier(chemin) } })
          );
        }
      } catch {
        // Fichier absent : le téléchargement renverra lui-même un 404.
      }
    }

    return res.status(200).json({
      message: "APK active trouvée.",
      apk: { ...serialiserApk(apk), taille },
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
      apk: serialiserApk(apk),
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
      const statutLu = lireStatut(status);
      if (statutLu === null) {
        return res.status(400).json({ message: "Le 'status' doit valoir true ou false." });
      }
      miseAJour.status = statutLu;
    }

    // Version iOS : lien et version saisis, jamais de fichier.
    const estIos = apkExistante.plateforme === "ios";
    if (estIos) {
      if (fichier) {
        return res.status(400).json({ message: "Une version iOS se publie par un lien, sans fichier." });
      }
      const champs = lireChampsIos(req.body, false);
      if (champs.erreur) return res.status(400).json({ message: champs.erreur });
      Object.assign(miseAJour, champs.donnees);
    }

    // Si un nouveau fichier est fourni, le valider et le traiter
    let ancienNomFichier = null;
    if (fichier) {
      const validation = validerFichierApk(fichier);
      if (!validation.valide) {
        return res.status(400).json({ message: validation.erreur });
      }

      const lecture = lireVersionFichierApk(fichier);
      if (lecture.erreur) {
        return res.status(400).json({ message: lecture.erreur });
      }

      const nomFichierSecurise = genererNomFichierSecurise(fichier.originalname);
      const cheminFichier = path.join(APK_STORAGE_DIR, nomFichierSecurise);

      try {
        await fs.writeFile(cheminFichier, fichier.buffer);
        ancienNomFichier = apkExistante.file_url;
        miseAJour.file_url = nomFichierSecurise;
        miseAJour.sha256 = empreinteSha256(fichier.buffer);
        Object.assign(miseAJour, lecture.version);
      } catch (errEcriture) {
        console.error(`❌ Erreur lors de l'écriture du fichier : ${errEcriture.message}`);
        return res.status(500).json({
          message: "Erreur lors de l'enregistrement du fichier sur le serveur.",
        });
      }
    }

    // Réglages OTA, contrôlés face au build de la version après modification.
    const codeFinal = miseAJour.version_code ?? apkExistante.version_code;
    const ota = lireChampsOta(req.body, codeFinal == null ? null : numeroBuild(codeFinal));
    if (ota.erreur) {
      if (miseAJour.file_url && !estIos) await supprimerFichierDuDisque(miseAJour.file_url);
      return res.status(400).json({ message: ota.erreur });
    }
    Object.assign(miseAJour, ota.donnees);

    // Si aucune mise à jour n'a été spécifiée
    if (Object.keys(miseAJour).length === 0) {
      return res.status(400).json({
        message: "Aucun champ à modifier fourni (libelle, description, status, ou fichier).",
      });
    }

    // Mettre à jour en base de données
    let apkModifiee;
    try {
      // Une seule APK active par plateforme : activer celle-ci désactive les autres.
      apkModifiee = await prisma.$transaction(async (tx) => {
        if (miseAJour.status === true) {
          await tx.mobileApk.updateMany({
            where: { status: true, plateforme: apkExistante.plateforme, id: { not: id } },
            data: { status: false },
          });
        }
        return tx.mobileApk.update({ where: { id }, data: miseAJour });
      });
    } catch (errDb) {
      // Nettoyage best-effort : supprimer le nouveau fichier si la BD échoue
      if (miseAJour.file_url && !estIos) {
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
      apk: serialiserApk(apkModifiee),
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

    // Nettoyer le fichier du disque (best-effort) — une version iOS n'en a pas.
    if (apk.plateforme !== "ios") await supprimerFichierDuDisque(apk.file_url);

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
    if (apk.plateforme === "ios") return res.redirect(302, apk.file_url);

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

    // Vérifier l'existence du fichier (et récupérer sa taille)
    let infosFichier;
    try {
      infosFichier = await fs.stat(cheminFichier);
    } catch (err) {
      console.warn(`⚠️ Fichier introuvable sur disque : ${cheminFichier}`);
      return res.status(404).json({ message: "Fichier APK introuvable sur le serveur." });
    }

    // sendFile gère Content-Length (progression côté site et application)
    // et les requêtes Range (206) : l'application reprend un téléchargement
    // interrompu là où il s'était arrêté au lieu de tout recommencer —
    // indispensable sur un réseau mobile instable. Nom de fichier unique par
    // version : cache d'un an sans risque.
    res.sendFile(
      cheminFichier,
      {
        acceptRanges: true,
        maxAge: 365 * 24 * 60 * 60 * 1000,
        headers: {
          "Content-Type": "application/vnd.android.package-archive",
          "Content-Disposition": `attachment; filename="${apk.libelle.replace(/"/g, '\\"')}.apk"`,
        },
      },
      (errEnvoi) => {
        if (!errEnvoi) return;
        console.error(`❌ Erreur lors de l'envoi du fichier : ${errEnvoi.message}`);
        if (!res.headersSent) {
          res.status(500).json({ message: "Erreur lors du téléchargement du fichier." });
        }
      }
    );
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