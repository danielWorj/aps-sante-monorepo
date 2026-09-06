// src/middlewares/upload_apk.middleware.js
//
// Configuration multer pour les endpoints d'upload/modification d'APKs
// (voir gestionapk.routes.js).
//
// Les fichiers APK sont stockés EN MÉMOIRE (buffer) puis écrits sur le
// disque dans le contrôleur (storage/apk/).
//
// Utilisé par :
//   POST /apks          → creerApk
//   PUT  /apks/:id      → modifierApk (remplacement fichier optionnel)
//
// Validation :
//   - Type MIME : application/vnd.android.package-archive ou application/octet-stream
//   - Extension : .apk
//   - Taille max : 100 Mo par fichier
//
// Le caractère "obligatoire" du fichier (requis en création, optionnel
// en modification) est vérifié dans le contrôleur, pas ici.

import multer from "multer";

// Limite 100 Mo par fichier APK
const TAILLE_MAX_APK = 100 * 1024 * 1024;

// Types MIME autorisés pour les APKs (peuvent varier selon la source/le navigateur)
const TYPES_AUTORISES_APK = [
  "application/vnd.android.package-archive",
  "application/octet-stream", // fallback pour certains navigateurs/outils
];

// Stockage en mémoire (buffer)
const stockage = multer.memoryStorage();

/**
 * Filtre de validation pour les fichiers APK.
 * Vérifie le type MIME et l'extension .apk.
 */
function filtreApk(_req, file, cb) {
  // Vérifier le type MIME
  if (!TYPES_AUTORISES_APK.includes(file.mimetype)) {
    return cb(
      new Error(
        `Type de fichier non autorisé pour "${file.fieldname}" (${file.mimetype}). ` +
          `Seules les APKs Android (application/vnd.android.package-archive) sont acceptées.`
      )
    );
  }

  // Vérifier l'extension .apk
  const extension = file.originalname.toLowerCase().split(".").pop();
  if (extension !== "apk") {
    return cb(
      new Error(
        `Extension de fichier non autorisée pour "${file.fieldname}". ` +
          `Reçu : .${extension}, attendu : .apk`
      )
    );
  }

  cb(null, true);
}

/**
 * Configuration multer pour un seul champ fichier "file" (APK).
 */
const televersementApk = multer({
  storage: stockage,
  limits: { fileSize: TAILLE_MAX_APK },
  fileFilter: filtreApk,
}).single("file"); // Un seul fichier dans le champ "file"

/**
 * Enveloppe multer pour POST/PUT /apks.
 * Renvoie une erreur 400 propre (taille, type, etc.) au lieu de
 * laisser l'erreur remonter jusqu'au gestionnaire d'erreurs global.
 *
 * Utilisation dans les routes :
 *   router.post("/", gererTeleversementApk, creerApk);
 *   router.put("/:id", gererTeleversementApk, modifierApk);
 */
export function gererTeleversementApk(req, res, next) {
  televersementApk(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Erreur multer spécifique (taille, encodage, champs, etc.)
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: `Fichier trop volumineux. Taille maximale : ${(TAILLE_MAX_APK / 1024 / 1024).toFixed(0)} Mo.`,
        });
      }
      return res.status(400).json({
        message: err.message || "Erreur lors du téléversement du fichier.",
      });
    }
    if (err) {
      // Erreur personnalisée (filtre, validation)
      return res.status(400).json({
        message: err.message || "Erreur lors du téléversement du fichier.",
      });
    }
    next();
  });
}