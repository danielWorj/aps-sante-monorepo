// src/controllers/portailLaboratoire.controller.js
// Portail laboratoire (espace du gérant) : tableau de bord, médiathèque,
// enregistrement des engagements de la fiche publique. Règles métier dans
// services/portailLaboratoire.service.js.
//
// Autorisation : agent de la fiche ou administration (lib/accesLaboratoire.js),
// sauf la médiathèque PUBLIQUE (fiche publiée) et l'enregistrement d'un
// engagement (visiteur, jeton facultatif).

import prisma from "../lib/prisma.js";
import { televerserFichier, supprimerFichier } from "../lib/cloudinaryService.js";
import { creerAccesseurGeospatial } from "../lib/geo.js";
import { estAdminOuSuperadmin, peutGererLaboratoire } from "../lib/accesLaboratoire.js";
import { TAILLE_MAX_IMAGE_MEDIA, typeMediaDuMimetype } from "../middlewares/upload.middleware.js";
import { statistiquesFiche } from "../services/vuesFiche.service.js";
import { presenterMedia } from "../services/portailAssurance.service.js";
import {
  TITRE_MEDIA_MAX,
  TYPES_ENGAGEMENT_LABORATOIRE,
  auteurPublic,
  completudeFiche,
  enregistrerEngagementLaboratoire,
  listerMediasDeLaFiche,
  quotasMedias,
  refusAjoutMedia,
  resumeAvis,
  statistiquesEngagements,
  tauxEngagement,
} from "../services/portailLaboratoire.service.js";

const geoLaboratoire = creerAccesseurGeospatial({
  table: "laboratoire",
  colonne: "geolocalisation",
  clePrimaire: "laboratoire_id",
});

const INTROUVABLE = { message: "Laboratoire introuvable." };
const REFUS_ACCES = { message: "Accès réservé à l'agent du laboratoire concerné ou à un administrateur." };

/* ============================ Tableau de bord ============================ */

/**
 * GET /api/laboratoires/:id/tableau-de-bord?jours=30
 * Vues de la fiche, engagements (par type et jour par jour), taux
 * d'engagement, avis (synthèse, en attente, derniers), contenus, complétude.
 */
export async function obtenirTableauDeBord(req, res, next) {
  try {
    const id = req.params.id;
    if (!(await peutGererLaboratoire(req.utilisateur, id))) return res.status(403).json(REFUS_ACCES);
    const fiche = await prisma.laboratoire.findUnique({
      where: { laboratoire_id: id },
      select: { laboratoire_id: true, nom: true, statut_verification: true, description: true, image_nom: true },
    });
    if (!fiche) return res.status(404).json(INTROUVABLE);

    const jours = Math.min(Math.max(Number.parseInt(req.query.jours, 10) || 30, 7), 90);
    const [vues, engagements, notes, enAttente, derniersAvis, nbExamens, nbExamensIndispo, nbCentres, medias, geo] =
      await Promise.all([
        statistiquesFiche({ type: "laboratoire", acteur_id: id, jours, detaillees: true }),
        statistiquesEngagements(id, jours),
        prisma.avisLaboratoire.findMany({ where: { laboratoire_id: id, statut_moderation: "publie" }, select: { note: true } }),
        prisma.avisLaboratoire.count({ where: { laboratoire_id: id, statut_moderation: "en_attente" } }),
        prisma.avisLaboratoire.findMany({
          where: { laboratoire_id: id, statut_moderation: "publie" },
          include: { utilisateur: { select: { nom: true, prenom: true } } },
          orderBy: { date_creation: "desc" },
          take: 5,
        }),
        prisma.examenLaboratoire.count({ where: { laboratoire_id: id } }),
        prisma.examenLaboratoire.count({ where: { laboratoire_id: id, disponible: false } }),
        prisma.centreLaboratoire.count({ where: { laboratoire_id: id } }),
        listerMediasDeLaFiche(id),
        geoLaboratoire.recuperer(id),
      ]);
    const quotas = quotasMedias(medias);
    const { image_nom, ...ficheSansFichier } = fiche;

    return res.status(200).json({
      fiche: ficheSansFichier,
      jours,
      vues,
      engagements,
      taux_engagement: tauxEngagement(vues.totaux.periode.vues, engagements.total_periode),
      avis: {
        ...resumeAvis(notes),
        en_attente: enAttente,
        derniers: derniersAvis.map((a) => ({
          avis_id: a.avis_id, note: a.note, commentaire: a.commentaire, date_creation: a.date_creation, auteur: auteurPublic(a.utilisateur),
        })),
      },
      contenus: {
        examens: nbExamens,
        examens_indisponibles: nbExamensIndispo,
        centres: nbCentres,
        photos: quotas.photos,
        videos: quotas.videos,
      },
      completude: completudeFiche({
        fiche: { ...fiche, image_nom },
        nbExamens,
        nbCentres,
        nbPhotos: quotas.photos.utilise,
        aGeolocalisation: !!geo,
      }),
    });
  } catch (err) {
    next(err);
  }
}

/* ============================ Engagements ============================ */

/**
 * POST /api/laboratoires/:id/engagements — { type } (jeton facultatif).
 * Toujours 204 pour un type valide : l'appelant n'a pas à savoir si
 * l'engagement a été compté (dédoublonnage, gestionnaire, robot).
 */
export async function enregistrerEngagement(req, res, next) {
  try {
    const type = req.body?.type;
    if (!TYPES_ENGAGEMENT_LABORATOIRE.includes(type)) {
      return res.status(400).json({ message: `type invalide. Valeurs acceptées : ${TYPES_ENGAGEMENT_LABORATOIRE.join(", ")}.` });
    }
    const labo = await prisma.laboratoire.findUnique({
      where: { laboratoire_id: req.params.id },
      select: { laboratoire_id: true, statut_verification: true },
    });
    if (!labo || labo.statut_verification !== "publie") return res.status(404).json(INTROUVABLE);
    const gestionnaire = req.utilisateur ? await peutGererLaboratoire(req.utilisateur, labo.laboratoire_id) : false;
    enregistrerEngagementLaboratoire({ req, laboratoire_id: labo.laboratoire_id, type, gestionnaire });
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/* ============================ Médiathèque ============================ */

/** GET /api/laboratoires/:id/medias — PUBLIQUE, fiche publiée. */
export async function listerMediasPublics(req, res, next) {
  try {
    const fiche = await prisma.laboratoire.findUnique({
      where: { laboratoire_id: req.params.id },
      select: { statut_verification: true },
    });
    if (!fiche || fiche.statut_verification !== "publie") return res.status(404).json(INTROUVABLE);
    const medias = await listerMediasDeLaFiche(req.params.id);
    return res.status(200).json({ medias: medias.map(presenterMedia) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/laboratoires/:id/medias/gestion — vue propriétaire + quotas. */
export async function listerMediasGestion(req, res, next) {
  try {
    const id = req.params.id;
    if (!(await peutGererLaboratoire(req.utilisateur, id))) return res.status(403).json(REFUS_ACCES);
    const fiche = await prisma.laboratoire.findUnique({ where: { laboratoire_id: id }, select: { statut_verification: true } });
    if (!fiche) return res.status(404).json(INTROUVABLE);
    const medias = await listerMediasDeLaFiche(id);
    return res.status(200).json({
      medias: medias.map(presenterMedia),
      quotas: quotasMedias(medias),
      fiche_publiee: fiche.statut_verification === "publie",
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/laboratoires/:id/medias — multipart, champ « fichier » (+ « titre »). */
export async function ajouterMedia(req, res, next) {
  try {
    const id = req.params.id;
    if (!(await peutGererLaboratoire(req.utilisateur, id))) return res.status(403).json(REFUS_ACCES);
    const fichier = req.files?.fichier?.[0];
    if (!fichier) return res.status(400).json({ message: "Fichier requis (champ « fichier »)." });
    const type = typeMediaDuMimetype(fichier.mimetype);
    if (!type) return res.status(400).json({ message: "Format de fichier non pris en charge." });
    if (type === "image" && fichier.size > TAILLE_MAX_IMAGE_MEDIA) {
      return res.status(400).json({ message: "Photo trop volumineuse (5 Mo maximum)." });
    }
    const titre = typeof req.body.titre === "string" ? req.body.titre.trim() : "";
    if (titre.length > TITRE_MEDIA_MAX) {
      return res.status(400).json({ message: `Titre trop long (${TITRE_MEDIA_MAX} caractères maximum).` });
    }
    const fiche = await prisma.laboratoire.findUnique({ where: { laboratoire_id: id }, select: { laboratoire_id: true } });
    if (!fiche) return res.status(404).json(INTROUVABLE);

    const medias = await listerMediasDeLaFiche(id);
    if (!estAdminOuSuperadmin(req.utilisateur)) {
      const refus = refusAjoutMedia(type, quotasMedias(medias));
      if (refus) return res.status(403).json(refus);
    }

    const upload = await televerserFichier(fichier.buffer, `laboratoires/medias/${id}`, { resourceType: type });
    const ordre = medias.filter((m) => m.type === type).reduce((max, m) => Math.max(max, m.ordre), -1) + 1;
    let media;
    try {
      media = await prisma.mediaLaboratoire.create({
        data: { laboratoire_id: id, type, fichier_nom: upload.nom, titre: titre || null, ordre, taille_octets: fichier.size },
      });
    } catch (err) {
      await supprimerFichier(upload.nom, { resourceType: type }); // pas d'orphelin Cloudinary
      throw err;
    }
    return res.status(201).json({ message: type === "video" ? "Vidéo ajoutée." : "Photo ajoutée.", media: presenterMedia(media) });
  } catch (err) {
    next(err);
  }
}

async function chargerMediaGerable(req, res) {
  const media = await prisma.mediaLaboratoire.findUnique({ where: { media_id: req.params.id } });
  if (!media) {
    res.status(404).json({ message: "Média introuvable." });
    return null;
  }
  if (!(await peutGererLaboratoire(req.utilisateur, media.laboratoire_id))) {
    res.status(403).json(REFUS_ACCES);
    return null;
  }
  return media;
}

/** PUT /api/medias-laboratoire/:id — { titre } */
export async function modifierMedia(req, res, next) {
  try {
    const media = await chargerMediaGerable(req, res);
    if (!media) return undefined;
    const { titre } = req.body ?? {};
    if (titre !== undefined && titre !== null && typeof titre !== "string") {
      return res.status(400).json({ message: "titre invalide." });
    }
    const propre = titre?.trim() || null;
    if (propre && propre.length > TITRE_MEDIA_MAX) {
      return res.status(400).json({ message: `Titre trop long (${TITRE_MEDIA_MAX} caractères maximum).` });
    }
    const maj = await prisma.mediaLaboratoire.update({ where: { media_id: media.media_id }, data: { titre: propre } });
    return res.status(200).json({ message: "Média mis à jour.", media: presenterMedia(maj) });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/medias-laboratoire/:id — supprime aussi le fichier Cloudinary (best effort). */
export async function supprimerMedia(req, res, next) {
  try {
    const media = await chargerMediaGerable(req, res);
    if (!media) return undefined;
    await prisma.mediaLaboratoire.delete({ where: { media_id: media.media_id } });
    await supprimerFichier(media.fichier_nom, { resourceType: media.type === "video" ? "video" : "image" });
    return res.status(200).json({ message: "Média supprimé." });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/laboratoires/:id/medias/ordre — { type, ids: [media_id…] } (tous les médias du type). */
export async function ordonnerMedias(req, res, next) {
  try {
    const id = req.params.id;
    if (!(await peutGererLaboratoire(req.utilisateur, id))) return res.status(403).json(REFUS_ACCES);
    const { type, ids } = req.body ?? {};
    if (!["image", "video"].includes(type) || !Array.isArray(ids)) {
      return res.status(400).json({ message: "Paramètres requis : type (image | video) et ids (liste)." });
    }
    const existants = await prisma.mediaLaboratoire.findMany({ where: { laboratoire_id: id, type }, select: { media_id: true } });
    const attendus = new Set(existants.map((m) => m.media_id));
    if (ids.length !== attendus.size || new Set(ids).size !== ids.length || !ids.every((m) => attendus.has(m))) {
      return res.status(400).json({ message: "La liste doit contenir exactement les médias de ce type, une fois chacun." });
    }
    await prisma.$transaction(ids.map((media_id, ordre) => prisma.mediaLaboratoire.update({ where: { media_id }, data: { ordre } })));
    return res.status(200).json({ message: "Ordre enregistré." });
  } catch (err) {
    next(err);
  }
}
