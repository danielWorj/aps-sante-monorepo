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
//   - Extension : .apk (SOURCE DE VÉRITÉ — voir note MIME ci-dessous)
//   - Type MIME : indicatif seulement, jamais bloquant à lui seul
//   - Taille max : voir TAILLE_MAX_APK (source unique, réutilisée par
//     le contrôleur — gestionapk.controller.js — pour éviter toute
//     divergence entre la limite appliquée ici par multer et celle
//     revérifiée côté contrôleur)
//
// Le caractère "obligatoire" du fichier (requis en création, optionnel
// en modification) est vérifié dans le contrôleur, pas ici.
//
// ⚠️ Ancien bug corrigé : cette limite valait 500 Mo ici mais 100 Mo
// dans le contrôleur (TAILLE_MAX_APK de gestionapk.controller.js). Un
// fichier de, disons, 150 Mo passait donc entièrement le upload (la
// barre de progression allait jusqu'à 100 %, tout le buffer transitait
// en mémoire) avant d'être rejeté par le contrôleur — upload lent,
// bande passante gâchée, et une erreur qui n'apparaît qu'à la toute
// fin. La limite est maintenant définie UNE SEULE FOIS ici et importée
// par le contrôleur, afin que multer rejette immédiatement (avant même
// de recevoir tout le fichier) un envoi qui de toute façon serait
// refusé ensuite.
//
// ⚠️ Ancien bug corrigé : le filtre MIME était strict et n'autorisait
// que "application/vnd.android.package-archive" ou
// "application/octet-stream". Beaucoup de systèmes n'ont pas
// l'extension .apk enregistrée dans leur base MIME locale : le
// navigateur peut alors envoyer un mimetype différent, voire une
// chaîne vide (""), pour un .apk pourtant parfaitement valide — ce
// fichier légitime était alors rejeté à tort. L'extension ".apk" est
// désormais la validation faisant foi ; le MIME n'est plus qu'un
// signal indicatif (journalisé), jamais bloquant à lui seul.

import multer from "multer";

// Limite unique et partagée avec le contrôleur (voir
// gestionapk.controller.js, qui importe cette même constante au lieu
// d'en redéfinir une divergente).
export const TAILLE_MAX_APK = 100 * 1024 * 1024; // 100 Mo

// Types MIME habituellement observés pour un .apk — purement indicatif
// (journalisation), la validation réelle repose sur l'extension.
const TYPES_MIME_ATTENDUS_APK = [
  "application/vnd.android.package-archive",
  "application/octet-stream", // fallback fréquent (OS/navigateur sans association .apk)
  "application/java-archive", // certains navigateurs traitent l'APK (zip) comme un jar
  "application/x-zip-compressed",
  "application/zip",
  "", // aucune association MIME locale pour .apk : chaîne vide, à ne pas rejeter
];

// Stockage en mémoire (buffer)
const stockage = multer.memoryStorage();

/**
 * Filtre de validation pour les fichiers APK.
 * L'extension ".apk" est la seule condition bloquante ; le type MIME
 * n'est utilisé qu'à titre indicatif (voir note en tête de fichier).
 */
function filtreApk(_req, file, cb) {
  // Vérifier l'extension .apk — condition bloquante
  const extension = file.originalname.toLowerCase().split(".").pop();
  if (extension !== "apk") {
    return cb(
      new Error(
        `Extension de fichier non autorisée pour "${file.fieldname}". ` +
          `Reçu : .${extension}, attendu : .apk`
      )
    );
  }

  // Type MIME inattendu : on n'en fait qu'un avertissement, l'extension
  // .apk ayant déjà validé la nature du fichier ci-dessus.
  if (!TYPES_MIME_ATTENDUS_APK.includes(file.mimetype)) {
    console.warn(
      `⚠️ Type MIME inhabituel pour un .apk : "${file.mimetype}" (fichier "${file.originalname}") — accepté quand même, l'extension fait foi.`
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
      // Rejetée ICI, dès que la limite est atteinte pendant la
      // réception du flux — pas besoin d'attendre la fin de l'upload
      // pour le savoir (voir note en tête de fichier).
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