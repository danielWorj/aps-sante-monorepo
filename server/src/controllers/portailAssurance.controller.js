// src/controllers/portailAssurance.controller.js
// Portail assurance (espace de l'agent d'une compagnie / d'un courtier) :
// tableau de bord, médiathèque, suivi des demandes reçues. Les règles
// métier vivent dans services/portailAssurance.service.js.
//
// Autorisation : agent de la fiche ou admin/superadmin
// (lib/accesAssurance.js), sauf la médiathèque PUBLIQUE (fiche publiée,
// filtrée par les droits de l'abonnement).

import prisma from "../lib/prisma.js";
import { televerserFichier, supprimerFichier } from "../lib/cloudinaryService.js";
import { creerAccesseurGeospatial } from "../lib/geo.js";
import { resoudreDroits, debutDuJourUtc } from "../lib/droitsAssurance.js";
import { estAdminOuSuperadmin, peutGererServiceAssurance } from "../lib/accesAssurance.js";
import { TAILLE_MAX_IMAGE_MEDIA, typeMediaDuMimetype } from "../middlewares/upload.middleware.js";
import { statistiquesFiche } from "../services/vuesFiche.service.js";
import {
  NOTE_INTERNE_MAX,
  TITRE_MEDIA_MAX,
  completudeFiche,
  listerMediasDeLaFiche,
  mediasVisibles,
  metriquesDemandes,
  presenterMedia,
  quotasMedias,
  refusAjoutMedia,
  validerChangementStatut,
} from "../services/portailAssurance.service.js";

const geoServiceAssurance = creerAccesseurGeospatial({
  table: "service_assurance",
  colonne: "geolocalisation",
  clePrimaire: "service_assurance_id",
});

const REFUS_ACCES = {
  message: "Accès réservé à l'agent du service d'assurance concerné ou à un administrateur.",
};

/* ============================ Tableau de bord ============================ */

/**
 * GET /api/services-assurance/:id/tableau-de-bord?jours=30
 * Métriques de la fiche pour son agent : demandes (par statut, délai moyen
 * de traitement, dernières reçues), vues de la fiche publique, contenus et
 * quotas, complétude. Les courbes jour par jour exigent `stats_completes`.
 */
export async function obtenirTableauDeBord(req, res, next) {
  try {
    const id = req.params.id;
    if (!(await peutGererServiceAssurance(req.utilisateur, id))) return res.status(403).json(REFUS_ACCES);

    const fiche = await prisma.serviceAssurance.findUnique({
      where: { service_assurance_id: id },
      select: {
        service_assurance_id: true, nom: true, type_acteur: true, statut_verification: true,
        description: true, file_url: true,
      },
    });
    if (!fiche) return res.status(404).json({ message: "Service d'assurance introuvable." });

    const jours = Math.min(Math.max(Number.parseInt(req.query.jours, 10) || 30, 7), 90);
    const resolution = await resoudreDroits(id);
    const { droits } = resolution;
    const detaillees = droits.stats_completes === true;

    const [demandes, vues, nbActivites, nbOptions, nbAgences, medias, geo, abonnementCourant] = await Promise.all([
      metriquesDemandes(id, { detaillees, jours }),
      statistiquesFiche({ type: "assurance", acteur_id: id, jours, detaillees }),
      prisma.activite.count({ where: { service_assurance_id: id } }),
      prisma.optionActivite.count({ where: { activite: { service_assurance_id: id } } }),
      prisma.agence.count({ where: { service_assurance_id: id } }),
      listerMediasDeLaFiche(id),
      geoServiceAssurance.recuperer(id),
      resolution.abonnement_id
        ? prisma.abonnementAssurance.findUnique({
            where: { abonnement_id: resolution.abonnement_id },
            select: { niveau: { select: { code: true, libelle: true } } },
          })
        : null,
    ]);

    const quotas = quotasMedias(medias, droits);
    const joursRestants = resolution.statut_abonnement === "actif" && resolution.date_fin
      ? Math.round((resolution.date_fin - debutDuJourUtc()) / 86_400_000)
      : null;

    return res.status(200).json({
      fiche: { ...fiche, file_url: undefined },
      abonnement: {
        statut_abonnement: resolution.statut_abonnement,
        niveau: abonnementCourant?.niveau ?? null,
        date_fin: resolution.date_fin,
        en_grace: resolution.en_grace,
        jours_restants: joursRestants,
      },
      droits,
      demandes,
      vues,
      contenus: {
        activites: nbActivites,
        options: nbOptions,
        agences: { utilise: nbAgences, max: droits.max_agences },
        photos: quotas.photos,
        videos: quotas.videos,
      },
      completude: completudeFiche({
        fiche,
        nbActivites,
        nbAgences,
        nbPhotos: quotas.photos.utilise,
        aGeolocalisation: !!geo,
      }),
      statistiques_detaillees: detaillees,
    });
  } catch (err) {
    next(err);
  }
}

/* ============================ Médiathèque ============================ */

/**
 * GET /api/services-assurance/:id/medias — PUBLIQUE.
 * Fiche publiée uniquement ; médias filtrés par les droits (mediasVisibles).
 */
export async function listerMediasPublics(req, res, next) {
  try {
    const id = req.params.id;
    const fiche = await prisma.serviceAssurance.findUnique({
      where: { service_assurance_id: id },
      select: { statut_verification: true },
    });
    if (!fiche || fiche.statut_verification !== "publie") {
      return res.status(404).json({ message: "Service d'assurance introuvable." });
    }
    const [{ droits }, medias] = await Promise.all([resoudreDroits(id), listerMediasDeLaFiche(id)]);
    return res.status(200).json({ medias: mediasVisibles(medias, droits).map(presenterMedia) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/services-assurance/:id/medias/gestion — vue propriétaire :
 * TOUS les médias (visibles ou non au public), quotas et indicateur de
 * visibilité par média.
 */
export async function listerMediasGestion(req, res, next) {
  try {
    const id = req.params.id;
    if (!(await peutGererServiceAssurance(req.utilisateur, id))) return res.status(403).json(REFUS_ACCES);
    const fiche = await prisma.serviceAssurance.findUnique({
      where: { service_assurance_id: id },
      select: { statut_verification: true },
    });
    if (!fiche) return res.status(404).json({ message: "Service d'assurance introuvable." });

    const [{ droits }, medias] = await Promise.all([resoudreDroits(id), listerMediasDeLaFiche(id)]);
    const visibles = new Set(
      fiche.statut_verification === "publie" ? mediasVisibles(medias, droits).map((m) => m.media_id) : []
    );
    return res.status(200).json({
      medias: medias.map((m) => ({ ...presenterMedia(m), visible_au_public: visibles.has(m.media_id) })),
      quotas: quotasMedias(medias, droits),
      droits: { max_photos: droits.max_photos, video_presentation: droits.video_presentation },
      fiche_publiee: fiche.statut_verification === "publie",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/services-assurance/:id/medias — multipart, champ "fichier"
 * (+ "titre" facultatif). Type déduit du mimetype ; quotas vérifiés AVANT
 * le téléversement Cloudinary.
 */
export async function ajouterMedia(req, res, next) {
  try {
    const id = req.params.id;
    if (!(await peutGererServiceAssurance(req.utilisateur, id))) return res.status(403).json(REFUS_ACCES);

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

    const fiche = await prisma.serviceAssurance.findUnique({
      where: { service_assurance_id: id },
      select: { service_assurance_id: true },
    });
    if (!fiche) return res.status(404).json({ message: "Service d'assurance introuvable." });

    const [{ droits }, medias] = await Promise.all([resoudreDroits(id), listerMediasDeLaFiche(id)]);
    // L'admin n'est pas limité par les quotas (geste, correction de fiche).
    if (!estAdminOuSuperadmin(req.utilisateur)) {
      const refus = refusAjoutMedia(type, quotasMedias(medias, droits));
      if (refus) return res.status(403).json(refus);
    }

    const upload = await televerserFichier(fichier.buffer, `assurances/medias/${id}`, { resourceType: type });
    const ordre = medias.filter((m) => m.type === type).reduce((max, m) => Math.max(max, m.ordre), -1) + 1;
    let media;
    try {
      media = await prisma.mediaAssurance.create({
        data: {
          service_assurance_id: id,
          type,
          fichier_nom: upload.nom,
          titre: titre || null,
          ordre,
          taille_octets: fichier.size,
        },
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
  const media = await prisma.mediaAssurance.findUnique({ where: { media_id: req.params.id } });
  if (!media) {
    res.status(404).json({ message: "Média introuvable." });
    return null;
  }
  if (!(await peutGererServiceAssurance(req.utilisateur, media.service_assurance_id))) {
    res.status(403).json(REFUS_ACCES);
    return null;
  }
  return media;
}

/** PUT /api/medias-assurance/:id — { titre } */
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
    const maj = await prisma.mediaAssurance.update({ where: { media_id: media.media_id }, data: { titre: propre } });
    return res.status(200).json({ message: "Média mis à jour.", media: presenterMedia(maj) });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/medias-assurance/:id — supprime aussi le fichier Cloudinary (best effort). */
export async function supprimerMedia(req, res, next) {
  try {
    const media = await chargerMediaGerable(req, res);
    if (!media) return undefined;
    await prisma.mediaAssurance.delete({ where: { media_id: media.media_id } });
    await supprimerFichier(media.fichier_nom, { resourceType: media.type === "video" ? "video" : "image" });
    return res.status(200).json({ message: "Média supprimé." });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/services-assurance/:id/medias/ordre — { type, ids: [media_id…] }
 * Réordonne les médias d'un type (l'ordre décide quelles photos restent
 * visibles quand le quota de l'abonnement baisse). `ids` doit contenir
 * exactement les médias de ce type de la fiche.
 */
export async function ordonnerMedias(req, res, next) {
  try {
    const id = req.params.id;
    if (!(await peutGererServiceAssurance(req.utilisateur, id))) return res.status(403).json(REFUS_ACCES);
    const { type, ids } = req.body ?? {};
    if (!["image", "video"].includes(type) || !Array.isArray(ids)) {
      return res.status(400).json({ message: "Paramètres requis : type (image | video) et ids (liste)." });
    }
    const existants = await prisma.mediaAssurance.findMany({
      where: { service_assurance_id: id, type },
      select: { media_id: true },
    });
    const attendus = new Set(existants.map((m) => m.media_id));
    if (ids.length !== attendus.size || new Set(ids).size !== ids.length || !ids.every((m) => attendus.has(m))) {
      return res.status(400).json({ message: "La liste doit contenir exactement les médias de ce type, une fois chacun." });
    }
    await prisma.$transaction(
      ids.map((media_id, ordre) => prisma.mediaAssurance.update({ where: { media_id }, data: { ordre } }))
    );
    return res.status(200).json({ message: "Ordre enregistré." });
  } catch (err) {
    next(err);
  }
}

/* ============================ Demandes ============================ */

/**
 * PATCH /api/mises-en-relation-assurance/:id — { statut?, note_interne? }
 * Suivi d'une demande par l'agent. Exige le droit `suivi_demandes`
 * (admin : toujours).
 */
export async function suivreMiseEnRelation(req, res, next) {
  try {
    const demande = await prisma.miseEnRelation.findUnique({ where: { mise_en_relation_id: req.params.id } });
    if (!demande) return res.status(404).json({ message: "Demande introuvable." });
    if (!(await peutGererServiceAssurance(req.utilisateur, demande.service_assurance_id))) {
      return res.status(403).json(REFUS_ACCES);
    }
    if (!estAdminOuSuperadmin(req.utilisateur)) {
      const { droits } = await resoudreDroits(demande.service_assurance_id);
      if (!droits.suivi_demandes) {
        return res.status(403).json({
          code: "SUIVI_DEMANDES_INDISPONIBLE",
          message: "Le suivi des demandes (statut, notes) est inclus dans les abonnements qui le proposent.",
        });
      }
    }

    const { statut, note_interne } = req.body ?? {};
    const data = {};
    if (statut !== undefined) {
      const verdict = validerChangementStatut(demande.statut, statut);
      if (verdict.erreur) return res.status(400).json({ message: verdict.erreur });
      Object.assign(data, verdict.data);
    }
    if (note_interne !== undefined) {
      if (note_interne !== null && typeof note_interne !== "string") {
        return res.status(400).json({ message: "note_interne invalide." });
      }
      const note = note_interne?.trim() || null;
      if (note && note.length > NOTE_INTERNE_MAX) {
        return res.status(400).json({ message: `Note trop longue (${NOTE_INTERNE_MAX} caractères maximum).` });
      }
      data.note_interne = note;
    }
    if (!Object.keys(data).length) {
      return res.status(200).json({ message: "Aucune modification.", mise_en_relation: demande });
    }

    const maj = await prisma.miseEnRelation.update({
      where: { mise_en_relation_id: demande.mise_en_relation_id },
      data,
      include: { utilisateur: { select: { nom: true, prenom: true, email: true, telephone: true } } },
    });
    return res.status(200).json({ message: "Demande mise à jour.", mise_en_relation: maj });
  } catch (err) {
    next(err);
  }
}

