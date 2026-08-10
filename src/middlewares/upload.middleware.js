// src/middlewares/upload.middleware.js
//
// Configuration multer pour les endpoints qui acceptent des fichiers
// (image / PDF) en multipart/form-data. Stockage en mémoire (buffer) :
// rien n'est écrit sur le disque du serveur, les fichiers sont
// transmis directement à Cloudinary (voir lib/cloudinaryService.js).
//
// Utilisé par POST/PUT /centres-sante (voir centreSante.routes.js) qui
// exigent 3 champs fichier :
//   - image_structure   : photo du centre de santé
//   - piece_identite     : pièce d'identité (image ou PDF) du
//                          professionnel qui soumet la fiche
//   - document_agrement  : agrément officiel (image ou PDF) autorisant
//                          l'établissement à exercer
//
// Le caractère "obligatoire" (3 fichiers requis à la création, optionnels
// en modification) est vérifié dans le contrôleur, pas ici : ce
// middleware se contente du parsing + de la validation de format/taille.

import multer from "multer";

const TAILLE_MAX_OCTETS = 5 * 1024 * 1024; // 5 Mo par fichier
const TYPES_AUTORISES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const stockage = multer.memoryStorage();

function filtreFichier(_req, file, cb) {
  if (!TYPES_AUTORISES.includes(file.mimetype)) {
    return cb(
      new Error(
        `Type de fichier non autorisé pour "${file.fieldname}" (${file.mimetype}). Formats acceptés : JPEG, PNG, WEBP, PDF.`
      )
    );
  }
  cb(null, true);
}

const televersementCentreSante = multer({
  storage: stockage,
  limits: { fileSize: TAILLE_MAX_OCTETS },
  fileFilter: filtreFichier,
}).fields([
  { name: "image_structure", maxCount: 1 },
  { name: "piece_identite", maxCount: 1 },
  { name: "document_agrement", maxCount: 1 },
]);

/**
 * Enveloppe multer pour renvoyer une erreur 400 propre (taille, type
 * de fichier non autorisé, etc.) au lieu de laisser l'erreur remonter
 * telle quelle jusqu'au gestionnaire d'erreurs global (500).
 */
export function gererTeleversementCentreSante(req, res, next) {
  televersementCentreSante(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        message: err.message || "Erreur lors du téléversement des fichiers.",
      });
    }
    next();
  });
}

// ─────────────────────────────────────────────────────────────────
// Pharmacie — même logique que Centre de santé : 3 champs fichier
// requis à la création (optionnels en modification, voir
// pharmacie.controller.js) :
//   - image_pharmacie   : photo de la pharmacie
//   - piece_identite     : pièce d'identité du titulaire/responsable
//   - document_agrement  : agrément officiel autorisant l'exercice
// ─────────────────────────────────────────────────────────────────
const televersementPharmacie = multer({
  storage: stockage,
  limits: { fileSize: TAILLE_MAX_OCTETS },
  fileFilter: filtreFichier,
}).fields([
  { name: "image_pharmacie", maxCount: 1 },
  { name: "piece_identite", maxCount: 1 },
  { name: "document_agrement", maxCount: 1 },
]);

export function gererTeleversementPharmacie(req, res, next) {
  televersementPharmacie(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        message: err.message || "Erreur lors du téléversement des fichiers.",
      });
    }
    next();
  });
}

// ─────────────────────────────────────────────────────────────────
// Publicité (pharmacie) — un seul fichier, le visuel de l'encart à
// diffuser (voir publicite.controller.js) :
//   - visuel : image de la publicité
// Contrairement à Centre de santé / Pharmacie ci-dessus (pièces
// justificatives), le PDF n'a pas de sens ici : un encart publicitaire
// est toujours une image, jamais un document — filtre dédié, plus
// restrictif que TYPES_AUTORISES.
// ─────────────────────────────────────────────────────────────────
const TYPES_AUTORISES_VISUEL = ["image/jpeg", "image/png", "image/webp"];

function filtreFichierVisuel(_req, file, cb) {
  if (!TYPES_AUTORISES_VISUEL.includes(file.mimetype)) {
    return cb(
      new Error(
        `Type de fichier non autorisé pour "${file.fieldname}" (${file.mimetype}). Formats acceptés : JPEG, PNG, WEBP.`
      )
    );
  }
  cb(null, true);
}

const televersementPublicite = multer({
  storage: stockage,
  limits: { fileSize: TAILLE_MAX_OCTETS },
  fileFilter: filtreFichierVisuel,
}).fields([{ name: "visuel", maxCount: 1 }]);

export function gererTeleversementPublicite(req, res, next) {
  televersementPublicite(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        message: err.message || "Erreur lors du téléversement du visuel.",
      });
    }
    next();
  });
}

// ─────────────────────────────────────────────────────────────────
// Assurance — un seul fichier requis à la création (optionnel en
// modification, voir assurance.controller.js) :
//   - image_assurance : photo/logo de la compagnie ou du courtier
// Comme pour Publicité (et contrairement à Centre de santé / Pharmacie
// qui exigent aussi une pièce d'identité + un agrément), le diagramme
// "Annuaire assurances" (v8) ne modélise qu'UNE seule pièce, une image
// (schema.prisma, ServiceAssurance.file_url) : le PDF n'a donc pas de
// sens ici, filtre restreint aux images comme pour Publicité.
// ─────────────────────────────────────────────────────────────────
const televersementAssurance = multer({
  storage: stockage,
  limits: { fileSize: TAILLE_MAX_OCTETS },
  fileFilter: filtreFichierVisuel,
}).fields([{ name: "image_assurance", maxCount: 1 }]);

export function gererTeleversementAssurance(req, res, next) {
  televersementAssurance(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        message: err.message || "Erreur lors du téléversement de l'image.",
      });
    }
    next();
  });
}