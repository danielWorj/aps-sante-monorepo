// src/controllers/annonce.controller.js
//
// Module "Annonces" (schema.prisma, model Annonce) — fiche autonome,
// sans aucune relation vers un autre module métier (même esprit que
// MobileApk juste au-dessus dans schema.prisma) : CRUD complet +
// gestion du fichier associé (image ou PDF) sur Cloudinary.
//
// Champs réels du modèle Annonce (voir schema.prisma) :
//   annonce { id, libelle (obligatoire), description (optionnel),
//     courte_description (optionnel), file_url (optionnel),
//     date_creation (auto), jour_validite (obligatoire, Int),
//     statut (Boolean, défaut true) }
//
// ⚠️ Comme pour Medecin/StructureSante/Pharmacie (voir
// medecin.controller.js), file_url ne contient EN BASE que le "nom"
// (public_id Cloudinary) — jamais l'URL complète. On passe donc
// systématiquement par construireUrl() avant d'envoyer une réponse au
// front, et on ne stocke que `resultat.nom` après un televerserFichier.
//
// ⚠️ Upload — ce contrôleur suppose un middleware multer dédié
// `gererTeleversementAnnonce`, à ajouter dans upload.middleware.js sur
// le même patron que gererTeleversementPublicite/gererTeleversementAssurance
// (fichier fourni en multipart/form-data, mémoire uniquement) :
//
//   const televersementAnnonce = multer({
//     storage: stockage,
//     limits: { fileSize: TAILLE_MAX_OCTETS },
//     fileFilter: filtreFichier, // image OU pdf — une annonce peut être un visuel ou un flyer PDF
//   }).fields([{ name: "fichier", maxCount: 1 }]);
//
//   export function gererTeleversementAnnonce(req, res, next) {
//     televersementAnnonce(req, res, (err) => {
//       if (err) {
//         return res.status(400).json({
//           message: err.message || "Erreur lors du téléversement du fichier.",
//         });
//       }
//       next();
//     });
//   }
//
// Le champ multipart attendu est donc `fichier` (req.files.fichier[0]),
// optionnel à la création comme en modification (file_url est
// nullable en base).
//
// Accès (à câbler dans annonce.routes.js, non fourni ici) :
//   - GET  /annonces, GET /annonces/:id      → publique
//   - POST /annonces, PUT/PATCH/DELETE ...   → admin/superadmin
// (voir estAdmin ci-dessous, même garde que dans medecin.controller.js)

import prisma from "../lib/prisma.js";
import cloudinaryService, { construireUrl } from "../lib/cloudinaryService.js";

function estAdmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

/**
 * file_url est nullable en base (une annonce peut être purement
 * textuelle) : on ne passe par construireUrl() que si elle est
 * effectivement renseignée — même règle que photo_url/cv_url sur
 * Medecin (voir avecUrlsFichiersMedecin dans medecin.controller.js).
 */
function avecUrlFichier(annonce) {
  if (!annonce) return annonce;
  return {
    ...annonce,
    file_url: annonce.file_url ? construireUrl(annonce.file_url) : null,
  };
}

/**
 * Une annonce est considérée expirée quand
 * date_creation + jour_validite (jours) est dépassé. Ce n'est pas un
 * champ stocké en base (jour_validite est une DURÉE, pas une date de
 * fin) : on le recalcule à la volée et on l'expose sous
 * `annonce.expiree` pour éviter au front de refaire ce calcul.
 */
function estAnnonceExpiree(annonce) {
  const dateExpiration = new Date(annonce.date_creation);
  dateExpiration.setDate(dateExpiration.getDate() + annonce.jour_validite);
  return dateExpiration.getTime() < Date.now();
}

function avecExpiration(annonce) {
  if (!annonce) return annonce;
  return { ...annonce, expiree: estAnnonceExpiree(annonce) };
}

function avecUrlEtExpiration(annonce) {
  return avecExpiration(avecUrlFichier(annonce));
}

/* ===================================================================
 * Annonces
 * =================================================================== */

/**
 * GET /api/annonces
 * PUBLIQUE.
 * Filtres optionnels :
 *   - ?statut=true|false   : filtre exact sur le champ statut
 *   - ?recherche=...       : recherche insensible à la casse sur libelle
 *   - ?actives=true        : ne renvoie que les annonces ni désactivées
 *                             (statut=true) ni expirées (jour_validite
 *                             dépassé) — pratique pour l'affichage
 *                             public, sans exposer le calcul au front.
 * Triées de la plus récente à la plus ancienne.
 */
export async function listerAnnonces(req, res, next) {
  try {
    const { statut, recherche, actives } = req.query;

    const where = {};
    if (statut !== undefined) where.statut = statut === "true";
    if (recherche) where.libelle = { contains: recherche, mode: "insensitive" };

    let annonces = await prisma.annonce.findMany({
      where,
      orderBy: { date_creation: "desc" },
    });

    annonces = annonces.map(avecUrlEtExpiration);

    if (actives === "true") {
      annonces = annonces.filter((a) => a.statut && !a.expiree);
    }

    return res.status(200).json({ annonces });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/annonces/:id
 * PUBLIQUE.
 */
export async function obtenirAnnonce(req, res, next) {
  try {
    const annonce = await prisma.annonce.findUnique({ where: { id: req.params.id } });
    if (!annonce) {
      return res.status(404).json({ message: "Annonce introuvable." });
    }

    return res.status(200).json({ annonce: avecUrlEtExpiration(annonce) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/annonces
 * Réservé à admin/superadmin (voir annonce.routes.js — à câbler avec
 * authentifier + autoriser("admin", "superadmin")).
 * Champs requis (req.body) : libelle, jour_validite (entier positif).
 * Champs optionnels : description, courte_description.
 * Fichier optionnel (multipart, voir gererTeleversementAnnonce) :
 *   - fichier : visuel ou flyer PDF de l'annonce.
 * statut n'est pas lisible depuis req.body à la création : toute
 * nouvelle annonce démarre active (statut=true, valeur par défaut du
 * schéma) — à désactiver ensuite via PUT/PATCH si besoin.
 */
export async function creerAnnonce(req, res, next) {
  try {
    const { libelle, description, courte_description, jour_validite } = req.body;

    const champsManquants = [];
    if (!libelle || !String(libelle).trim()) champsManquants.push("libelle");
    if (jour_validite === undefined || jour_validite === null || jour_validite === "") {
      champsManquants.push("jour_validite");
    }

    if (champsManquants.length > 0) {
      return res.status(400).json({
        message: `Champs obligatoires manquants : ${champsManquants.join(", ")}.`,
      });
    }

    const jourValiditeNombre = Number(jour_validite);
    if (!Number.isInteger(jourValiditeNombre) || jourValiditeNombre <= 0) {
      return res.status(400).json({
        message: "Le champ jour_validite doit être un nombre entier de jours strictement positif.",
      });
    }

    const fichier = req.files?.fichier?.[0];

    // Upload Cloudinary AVANT la création en base : en cas d'échec de
    // l'écriture DB, on nettoie le fichier déjà envoyé (best effort) —
    // même patron que creerMedecin.
    let resultatFichier = null;
    if (fichier) {
      resultatFichier = await cloudinaryService.televerserFichier(fichier.buffer, "annonces");
    }

    try {
      const annonce = await prisma.annonce.create({
        data: {
          libelle,
          description: description || null,
          courte_description: courte_description || null,
          jour_validite: jourValiditeNombre,
          file_url: resultatFichier ? resultatFichier.nom : null,
        },
      });

      return res.status(201).json({
        message: "Annonce créée.",
        annonce: avecUrlEtExpiration(annonce),
      });
    } catch (errCreation) {
      if (resultatFichier) {
        await cloudinaryService.supprimerFichier(resultatFichier.nom);
      }
      throw errCreation;
    }
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/annonces/:id
 * Réservé à admin/superadmin.
 * Champs modifiables : libelle, description, courte_description,
 * jour_validite, statut.
 * Fichier optionnel (multipart) : `fichier` — remplace file_url ;
 * l'ancien fichier Cloudinary est nettoyé (best effort) une fois la
 * mise à jour DB confirmée, même patron que modifierMedecin.
 */
export async function modifierAnnonce(req, res, next) {
  try {
    if (!estAdmin(req.utilisateur)) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const annonce = await prisma.annonce.findUnique({ where: { id: req.params.id } });
    if (!annonce) {
      return res.status(404).json({ message: "Annonce introuvable." });
    }

    const donnees = {};

    if (req.body.libelle !== undefined) {
      if (!req.body.libelle || !String(req.body.libelle).trim()) {
        return res.status(400).json({ message: "Le champ libelle ne peut pas être vide." });
      }
      donnees.libelle = req.body.libelle;
    }

    if (req.body.description !== undefined) {
      donnees.description = req.body.description || null;
    }

    if (req.body.courte_description !== undefined) {
      donnees.courte_description = req.body.courte_description || null;
    }

    if (req.body.jour_validite !== undefined) {
      const jourValiditeNombre = Number(req.body.jour_validite);
      if (!Number.isInteger(jourValiditeNombre) || jourValiditeNombre <= 0) {
        return res.status(400).json({
          message: "Le champ jour_validite doit être un nombre entier de jours strictement positif.",
        });
      }
      donnees.jour_validite = jourValiditeNombre;
    }

    if (req.body.statut !== undefined) {
      donnees.statut = req.body.statut === true || req.body.statut === "true";
    }

    // Remplacement optionnel du fichier — nouveau fichier téléversé
    // d'abord, ancien nettoyé seulement après confirmation de la mise
    // à jour DB (même règle que photo_url/cv_url sur Medecin).
    let ancienFichierNom = null;
    const fichier = req.files?.fichier?.[0];
    if (fichier) {
      const resultat = await cloudinaryService.televerserFichier(fichier.buffer, "annonces");
      donnees.file_url = resultat.nom;
      ancienFichierNom = annonce.file_url;
    }

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    const annonceMiseAJour = await prisma.annonce.update({
      where: { id: req.params.id },
      data: donnees,
    });

    if (ancienFichierNom) {
      await cloudinaryService.supprimerFichier(ancienFichierNom);
    }

    return res.status(200).json({
      message: "Annonce mise à jour.",
      annonce: avecUrlEtExpiration(annonceMiseAJour),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/annonces/:id/activer
 * PATCH /api/annonces/:id/desactiver
 * Réservés à admin/superadmin. Actions explicites équivalentes à
 * PUT /annonces/:id avec { statut: true|false }, isolées dans leur
 * propre handler — même esprit que publierMedecin/suspendreMedecin
 * dans medecin.controller.js.
 */
export async function activerAnnonce(req, res, next) {
  try {
    if (!estAdmin(req.utilisateur)) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const annonce = await basculerStatutAnnonce(req.params.id, true);
    if (!annonce) {
      return res.status(404).json({ message: "Annonce introuvable." });
    }

    return res.status(200).json({ message: "Annonce activée.", annonce: avecUrlEtExpiration(annonce) });
  } catch (err) {
    next(err);
  }
}

export async function desactiverAnnonce(req, res, next) {
  try {
    if (!estAdmin(req.utilisateur)) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const annonce = await basculerStatutAnnonce(req.params.id, false);
    if (!annonce) {
      return res.status(404).json({ message: "Annonce introuvable." });
    }

    return res.status(200).json({ message: "Annonce désactivée.", annonce: avecUrlEtExpiration(annonce) });
  } catch (err) {
    next(err);
  }
}

async function basculerStatutAnnonce(id, statut) {
  const annonce = await prisma.annonce.findUnique({ where: { id } });
  if (!annonce) return null;

  if (annonce.statut === statut) return annonce;

  return prisma.annonce.update({ where: { id }, data: { statut } });
}

/**
 * DELETE /api/annonces/:id
 * Réservé à admin/superadmin. Aucune table ne référence Annonce (voir
 * schema.prisma — modèle autonome, sans relation) : suppression directe,
 * sans risque de contrainte P2003. Le fichier Cloudinary associé,
 * s'il existe, est nettoyé (best effort) après suppression en base.
 */
export async function supprimerAnnonce(req, res, next) {
  try {
    if (!estAdmin(req.utilisateur)) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const annonce = await prisma.annonce.findUnique({ where: { id: req.params.id } });
    if (!annonce) {
      return res.status(404).json({ message: "Annonce introuvable." });
    }

    await prisma.annonce.delete({ where: { id: req.params.id } });

    if (annonce.file_url) {
      await cloudinaryService.supprimerFichier(annonce.file_url);
    }

    return res.status(200).json({ message: "Annonce supprimée." });
  } catch (err) {
    next(err);
  }
}