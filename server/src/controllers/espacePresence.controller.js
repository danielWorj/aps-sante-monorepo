// src/controllers/espacePresence.controller.js
// Espaces pharmacie et centre de santé : tout ce que le gestionnaire de la
// fiche (agent rattaché) gère depuis son espace, en plus de la modification
// de la fiche (PUT /pharmacies/:id, PUT /centres-sante/:id) et de
// l'abonnement de présence (/abonnements-presence/...).
//
// Une seule implémentation pour les deux types : la route pose le type
// (req.typeEspace = "pharmacie" | "structure", voir espacePresence.routes.js) ;
// pour les routes par ligne (/photos-fiche/:id…), il se lit sur la ligne.
//
// Autorisation : agent de la fiche dans l'espace correspondant, ou
// administration (lib/acteursPresence.js — peutGererFichePresence), sauf les
// lectures PUBLIQUES (photos, actualités, prestations) et l'envoi d'un
// message (visiteur, jeton facultatif). Règles métier :
// services/espacePresence.service.js.

import prisma from "../lib/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { televerserFichier, supprimerFichier, construireUrl } from "../lib/cloudinaryService.js";
import { creerAccesseurGeospatial } from "../lib/geo.js";
import { acteur, estAdminOuSuperadmin, estFicheEnLigne, peutGererFichePresence } from "../lib/acteursPresence.js";
import { resoudreDroitsPresence, droitsPresencePublics } from "../lib/droitsPresence.js";
import { debutDuJourUtc } from "../lib/droitsAssurance.js";
import { estOuvert24h, etatOuverture, normaliserHoraires, normaliserNoteHoraires } from "../lib/horairesFiche.js";
import { statistiquesFiche } from "../services/vuesFiche.service.js";
import { auteurPublic, resumeAvis } from "../services/portailLaboratoire.service.js";
import {
  MAX_ACTUALITES,
  MAX_PHOTOS_STOCKEES,
  MAX_PRESTATIONS,
  STATUTS_MESSAGE,
  TITRE_PHOTO_MAX,
  acteurDeLaLigne,
  actualiteEnLigne,
  completudeFiche,
  listerPhotosDeLaFiche,
  normaliserActualite,
  normaliserMessage,
  normaliserPrestation,
  notifierMessageRecu,
  photosVisibles,
  presenterActualite,
  presenterMessage,
  presenterPhoto,
  presenterPrestation,
  rattachement,
  refusAjoutPhoto,
} from "../services/espacePresence.service.js";

/* ============================ Configuration par type ============================ */

const TYPES = {
  pharmacie: {
    modele: "pharmacie",
    cle: "pharmacie_id",
    roleAgent: "agent_pharmacie",
    modeleAgent: "agentPharmacie",
    dossier: "pharmacies",
    geo: creerAccesseurGeospatial({ table: "pharmacie", colonne: "geolocalisation", clePrimaire: "pharmacie_id" }),
    introuvable: { message: "Pharmacie introuvable." },
    refus: { message: "Accès réservé à l'agent de cette pharmacie ou à un administrateur." },
  },
  structure: {
    modele: "structureSante",
    cle: "structure_id",
    roleAgent: "agent_structure_sante",
    modeleAgent: "agentStructureSante",
    dossier: "centres-sante",
    geo: creerAccesseurGeospatial({ table: "structure_sante", colonne: "geolocalisation", clePrimaire: "structure_id" }),
    introuvable: { message: "Centre de santé introuvable." },
    refus: { message: "Accès réservé à l'agent de ce centre de santé ou à un administrateur." },
  },
};

const typeDe = (req) => req.typeEspace;
const cfg = (type) => TYPES[type];
const typeDeLaLigne = (ligne) => (ligne.pharmacie_id ? "pharmacie" : "structure");

const SELECTION_PAYS = { select: { pays_id: true, nom: true, code_iso2: true, fuseau_horaire: true, devise: { select: { libelle: true } } } };
const SELECTION_VILLE = { select: { ville_id: true, nom: true } };

async function chargerFiche(type, id, select) {
  const c = cfg(type);
  return prisma[c.modele].findUnique({ where: { [c.cle]: id }, ...(select ? { select } : {}) });
}

/** Contrôle d'accès du gestionnaire ; répond 403 / 404 et renvoie null en cas de refus. */
async function exigerGestionnaire(req, res, type, id) {
  if (!(await peutGererFichePresence(req.utilisateur, type, id))) {
    res.status(403).json(cfg(type).refus);
    return false;
  }
  const existe = await chargerFiche(type, id, { [cfg(type).cle]: true });
  if (!existe) {
    res.status(404).json(cfg(type).introuvable);
    return false;
  }
  return true;
}

/* ============================ Ma fiche ============================ */

/**
 * GET /api/pharmacies/mon-espace, /api/centres-sante/mon-espace
 * Fiche COMPLÈTE de l'espace actif (y compris les contenus masqués au public
 * et les pièces justificatives), droits appliqués au public, équipe.
 * 404 si la session n'est pas celle d'un agent rattaché à une fiche.
 */
export async function obtenirMaFiche(req, res, next) {
  try {
    const type = typeDe(req);
    const c = cfg(type);
    if (req.utilisateur.role !== c.roleAgent) {
      return res.status(404).json({ message: `Aucune fiche ${acteur(type).libelle} dans cet espace.` });
    }
    const id = await acteur(type).acteurDeUtilisateur(req.utilisateur.utilisateur_id, req.utilisateur.espace);
    if (!id) return res.status(404).json({ message: `Aucune fiche ${acteur(type).libelle} rattachée à ce compte.` });

    const [fiche, geolocalisation, resolution, agents] = await Promise.all([
      prisma[c.modele].findUnique({ where: { [c.cle]: id }, include: { pays: SELECTION_PAYS, ville: SELECTION_VILLE } }),
      c.geo.recuperer(id),
      resoudreDroitsPresence(type, id),
      prisma[c.modeleAgent].findMany({
        where: { [c.cle]: id },
        select: { utilisateur_id: true, fonction: true, utilisateur: { select: { prenom: true, nom: true } } },
        orderBy: { agent_id: "asc" },
      }),
    ]);
    if (!fiche) return res.status(404).json(c.introuvable);

    return res.status(200).json({
      type_acteur: type,
      fiche: {
        ...fiche,
        acteur_id: id,
        geolocalisation,
        en_ligne: estFicheEnLigne(fiche),
        image_url: construireUrl(fiche.image_nom),
        piece_identite_url: construireUrl(fiche.piece_identite_nom),
        document_agrement_url: construireUrl(fiche.document_agrement_nom),
        ouvert_24h: estOuvert24h(fiche.horaires),
        ouverture: etatOuverture(fiche.horaires, fiche.pays?.fuseau_horaire),
      },
      droits: droitsPresencePublics(resolution.droits),
      statut_abonnement: resolution.statut_abonnement,
      equipe: agents.map((a) => ({
        prenom: a.utilisateur.prenom,
        nom: a.utilisateur.nom,
        fonction: a.fonction,
        moi: a.utilisateur_id === req.utilisateur.utilisateur_id,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/* ============================ Horaires ============================ */

/**
 * PUT /api/pharmacies/:id/horaires, /api/centres-sante/:id/horaires
 * { horaires: {...} | null, horaires_note?, urgences_24h? (centres) }
 * Donnée pratique et factuelle : enregistrée sans repasser la fiche en
 * vérification (contrairement aux informations d'identité).
 */
export async function modifierHoraires(req, res, next) {
  try {
    const type = typeDe(req);
    const c = cfg(type);
    const id = req.params.id;
    if (!(await exigerGestionnaire(req, res, type, id))) return undefined;

    const corps = req.body ?? {};
    const data = {};
    if (corps.horaires !== undefined) {
      const h = normaliserHoraires(corps.horaires);
      if (h.erreur) return res.status(400).json({ message: h.erreur });
      // Colonne Json : l'effacement s'écrit Prisma.DbNull (NULL SQL).
      data.horaires = h.data ?? Prisma.DbNull;
    }
    const note = normaliserNoteHoraires(corps.horaires_note);
    if (note.erreur) return res.status(400).json({ message: note.erreur });
    if (note.data !== undefined) data.horaires_note = note.data;
    if (type === "structure" && corps.urgences_24h !== undefined) {
      data.urgences_24h = corps.urgences_24h === true || corps.urgences_24h === "true";
    }
    if (!Object.keys(data).length) return res.status(400).json({ message: "Rien à enregistrer." });

    const fiche = await prisma[c.modele].update({
      where: { [c.cle]: id },
      data,
      select: { horaires: true, horaires_note: true, ...(type === "structure" ? { urgences_24h: true } : {}) },
    });
    return res.status(200).json({ message: "Horaires enregistrés.", ...fiche, ouvert_24h: estOuvert24h(fiche.horaires) });
  } catch (err) {
    next(err);
  }
}

/* ============================ Tableau de bord ============================ */

/**
 * GET /api/pharmacies/:id/tableau-de-bord?jours=30 (idem centres-sante)
 * État de la fiche et de l'abonnement, ouverture, consultations (selon
 * l'abonnement), messages, contenus, complétude ; gardes et avis pour une
 * pharmacie.
 */
export async function obtenirTableauDeBord(req, res, next) {
  try {
    const type = typeDe(req);
    const c = cfg(type);
    const id = req.params.id;
    if (!(await peutGererFichePresence(req.utilisateur, type, id))) return res.status(403).json(c.refus);
    const fiche = await prisma[c.modele].findUnique({ where: { [c.cle]: id }, include: { pays: SELECTION_PAYS } });
    if (!fiche) return res.status(404).json(c.introuvable);

    const jours = Math.min(Math.max(Number.parseInt(req.query.jours, 10) || 30, 7), 90);
    const maintenant = new Date();
    const lien = rattachement(type, id);

    const [resolution, geo, photos, actualites, nonLus, recus30j, derniersMessages, nbPrestations] = await Promise.all([
      resoudreDroitsPresence(type, id),
      c.geo.recuperer(id),
      listerPhotosDeLaFiche(type, id),
      prisma.actualiteFichePresence.findMany({ where: lien }),
      prisma.messageFichePresence.count({ where: { ...lien, statut: "non_lu" } }),
      prisma.messageFichePresence.count({ where: { ...lien, date_creation: { gte: new Date(maintenant - 30 * 86_400_000) } } }),
      prisma.messageFichePresence.findMany({ where: { ...lien, statut: { not: "archive" } }, orderBy: { date_creation: "desc" }, take: 3 }),
      type === "structure" ? prisma.prestationStructure.count({ where: { structure_id: id } }) : Promise.resolve(0),
    ]);
    const { droits, statut_abonnement, date_fin, en_grace } = resolution;

    const vues = droits.statistiques
      ? await statistiquesFiche({ type, acteur_id: id, jours, detaillees: !!droits.statistiques_detaillees })
      : null;

    const reponse = {
      type_acteur: type,
      jours,
      fiche: {
        acteur_id: id,
        nom: fiche.nom,
        statut_verification: fiche.statut_verification,
        en_ligne: estFicheEnLigne(fiche),
      },
      abonnement: {
        statut_abonnement,
        niveau_presence: droits.niveau_presence,
        date_fin,
        en_grace,
        jours_restants: statut_abonnement === "actif" && date_fin ? Math.round((date_fin - debutDuJourUtc()) / 86_400_000) : null,
      },
      droits: droitsPresencePublics(droits),
      ouverture: etatOuverture(fiche.horaires, fiche.pays?.fuseau_horaire, maintenant),
      vues: vues ? { disponible: true, detaillees: !!droits.statistiques_detaillees, ...vues } : { disponible: false },
      messages: { non_lus: nonLus, recus_30_jours: recus30j, derniers: derniersMessages.map(presenterMessage) },
      contenus: {
        photos: { total: photos.length, visibles: photosVisibles(photos, droits).length },
        actualites: { total: actualites.length, en_ligne: actualites.filter((a) => actualiteEnLigne(a, maintenant)).length },
        ...(type === "structure" ? { prestations: nbPrestations } : {}),
      },
      completude: completudeFiche(type, { fiche, nbPhotos: photos.length, nbPrestations, aGeolocalisation: !!geo }),
    };

    if (type === "pharmacie") {
      const [gardeEnCours, prochainesGardes, notes, enAttente, derniersAvis] = await Promise.all([
        prisma.gardePharmacie.findFirst({
          where: { pharmacie_id: id, date_debut: { lte: maintenant }, date_fin: { gt: maintenant }, planning_garde: { statut: "publie" } },
          include: { ville: SELECTION_VILLE },
        }),
        prisma.gardePharmacie.findMany({
          where: { pharmacie_id: id, date_debut: { gt: maintenant }, planning_garde: { statut: "publie" } },
          include: { ville: SELECTION_VILLE },
          orderBy: { date_debut: "asc" },
          take: 3,
        }),
        prisma.avisPharmacie.findMany({ where: { pharmacie_id: id, statut_moderation: "publie" }, select: { note: true } }),
        prisma.avisPharmacie.count({ where: { pharmacie_id: id, statut_moderation: "en_attente" } }),
        prisma.avisPharmacie.findMany({
          where: { pharmacie_id: id, statut_moderation: "publie" },
          include: { utilisateur: { select: { nom: true, prenom: true } } },
          orderBy: { date_creation: "desc" },
          take: 3,
        }),
      ]);
      reponse.gardes = { en_cours: gardeEnCours ? presenterGarde(gardeEnCours) : null, prochaines: prochainesGardes.map(presenterGarde) };
      reponse.avis = { ...resumeAvis(notes), en_attente: enAttente, derniers: derniersAvis.map(presenterAvis) };
    }

    return res.status(200).json(reponse);
  } catch (err) {
    next(err);
  }
}

function presenterGarde(g) {
  return { garde_id: g.garde_id, date_debut: g.date_debut, date_fin: g.date_fin, ville: g.ville ?? null };
}

function presenterAvis(a) {
  return { avis_id: a.avis_id, note: a.note, commentaire: a.commentaire, date_creation: a.date_creation, auteur: auteurPublic(a.utilisateur) };
}

/* ============================ Gardes et avis (pharmacie) ============================ */

/**
 * GET /api/pharmacies/:id/gardes/gestion?periode=a_venir|passees
 * Gardes officielles de la pharmacie (plannings publiés), planifiées par
 * l'administration — lecture seule pour l'agent.
 */
export async function listerGardesGestion(req, res, next) {
  try {
    const id = req.params.id;
    if (!(await exigerGestionnaire(req, res, "pharmacie", id))) return undefined;
    const passees = req.query.periode === "passees";
    const maintenant = new Date();
    const gardes = await prisma.gardePharmacie.findMany({
      where: {
        pharmacie_id: id,
        planning_garde: { statut: { in: ["publie", "expire"] } },
        ...(passees ? { date_fin: { lte: maintenant } } : { date_fin: { gt: maintenant } }),
      },
      include: { ville: SELECTION_VILLE },
      orderBy: { date_debut: passees ? "desc" : "asc" },
      take: 100,
    });
    return res.status(200).json({
      gardes: gardes.map((g) => ({ ...presenterGarde(g), en_cours: g.date_debut <= maintenant && g.date_fin > maintenant })),
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/pharmacies/:id/avis/gestion — avis publiés (auteur « Prénom N. »), synthèse, nombre en attente. */
export async function listerAvisGestion(req, res, next) {
  try {
    const id = req.params.id;
    if (!(await exigerGestionnaire(req, res, "pharmacie", id))) return undefined;
    const [publies, enAttente] = await Promise.all([
      prisma.avisPharmacie.findMany({
        where: { pharmacie_id: id, statut_moderation: "publie" },
        include: { utilisateur: { select: { nom: true, prenom: true } } },
        orderBy: { date_creation: "desc" },
        take: 200,
      }),
      prisma.avisPharmacie.count({ where: { pharmacie_id: id, statut_moderation: "en_attente" } }),
    ]);
    return res.status(200).json({ resume: resumeAvis(publies), en_attente: enAttente, avis: publies.map(presenterAvis) });
  } catch (err) {
    next(err);
  }
}

/* ============================ Photos ============================ */

/** GET /api/pharmacies/:id/images — PUBLIQUE : photos visibles selon l'abonnement. */
export async function listerPhotosPubliques(req, res, next) {
  try {
    const type = typeDe(req);
    const id = req.params.id;
    if (!(await chargerFiche(type, id, { [cfg(type).cle]: true }))) return res.status(404).json(cfg(type).introuvable);
    const [photos, { droits }] = await Promise.all([listerPhotosDeLaFiche(type, id), resoudreDroitsPresence(type, id)]);
    return res.status(200).json({ images: photosVisibles(photos, droits).map(presenterPhoto) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/pharmacies/:id/images/gestion — toutes les photos, avec ce que le public en voit. */
export async function listerPhotosGestion(req, res, next) {
  try {
    const type = typeDe(req);
    const id = req.params.id;
    if (!(await exigerGestionnaire(req, res, type, id))) return undefined;
    const [photos, { droits }] = await Promise.all([listerPhotosDeLaFiche(type, id), resoudreDroitsPresence(type, id)]);
    const visibles = new Set(photosVisibles(photos, droits).map((p) => p.media_id));
    return res.status(200).json({
      images: photos.map((p) => ({ ...presenterPhoto(p), visible_public: visibles.has(p.media_id) })),
      quota: { utilise: photos.length, max: MAX_PHOTOS_STOCKEES },
      droits: { photos: !!droits.photos, max_photos: droits.max_photos ?? null },
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/pharmacies/:id/images — multipart, champ « fichier » (+ « titre »). */
export async function ajouterPhoto(req, res, next) {
  try {
    const type = typeDe(req);
    const id = req.params.id;
    if (!(await exigerGestionnaire(req, res, type, id))) return undefined;
    const fichier = req.files?.fichier?.[0];
    if (!fichier) return res.status(400).json({ message: "Photo requise (champ « fichier »)." });
    const titre = typeof req.body.titre === "string" ? req.body.titre.trim() : "";
    if (titre.length > TITRE_PHOTO_MAX) return res.status(400).json({ message: `Légende trop longue (${TITRE_PHOTO_MAX} caractères maximum).` });

    const photos = await listerPhotosDeLaFiche(type, id);
    if (!estAdminOuSuperadmin(req.utilisateur)) {
      const refus = refusAjoutPhoto(photos.length);
      if (refus) return res.status(403).json(refus);
    }
    const upload = await televerserFichier(fichier.buffer, `${cfg(type).dossier}/photos/${id}`);
    const ordre = photos.reduce((max, p) => Math.max(max, p.ordre), -1) + 1;
    let photo;
    try {
      photo = await prisma.mediaFichePresence.create({
        data: { ...rattachement(type, id), fichier_nom: upload.nom, titre: titre || null, ordre, taille_octets: fichier.size },
      });
    } catch (err) {
      await supprimerFichier(upload.nom); // pas d'orphelin Cloudinary
      throw err;
    }
    return res.status(201).json({ message: "Photo ajoutée.", image: presenterPhoto(photo) });
  } catch (err) {
    next(err);
  }
}

async function chargerLigneGerable(req, res, modele, cle, introuvable) {
  const ligne = await prisma[modele].findUnique({ where: { [cle]: req.params.id } });
  if (!ligne) {
    res.status(404).json({ message: introuvable });
    return null;
  }
  const type = typeDeLaLigne(ligne);
  if (!(await peutGererFichePresence(req.utilisateur, type, acteurDeLaLigne(ligne)))) {
    res.status(403).json(cfg(type).refus);
    return null;
  }
  return ligne;
}

/** PUT /api/photos-fiche/:id — { titre } */
export async function modifierPhoto(req, res, next) {
  try {
    const photo = await chargerLigneGerable(req, res, "mediaFichePresence", "media_id", "Photo introuvable.");
    if (!photo) return undefined;
    const { titre } = req.body ?? {};
    if (titre !== undefined && titre !== null && typeof titre !== "string") return res.status(400).json({ message: "titre invalide." });
    const propre = titre?.trim() || null;
    if (propre && propre.length > TITRE_PHOTO_MAX) return res.status(400).json({ message: `Légende trop longue (${TITRE_PHOTO_MAX} caractères maximum).` });
    const maj = await prisma.mediaFichePresence.update({ where: { media_id: photo.media_id }, data: { titre: propre } });
    return res.status(200).json({ message: "Photo mise à jour.", image: presenterPhoto(maj) });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/photos-fiche/:id — supprime aussi le fichier Cloudinary (best effort). */
export async function supprimerPhoto(req, res, next) {
  try {
    const photo = await chargerLigneGerable(req, res, "mediaFichePresence", "media_id", "Photo introuvable.");
    if (!photo) return undefined;
    await prisma.mediaFichePresence.delete({ where: { media_id: photo.media_id } });
    await supprimerFichier(photo.fichier_nom);
    return res.status(200).json({ message: "Photo supprimée." });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/pharmacies/:id/images/ordre — { ids: [media_id…] } (toutes les photos, une fois chacune). */
export async function ordonnerPhotos(req, res, next) {
  try {
    const type = typeDe(req);
    const id = req.params.id;
    if (!(await exigerGestionnaire(req, res, type, id))) return undefined;
    const { ids } = req.body ?? {};
    if (!Array.isArray(ids)) return res.status(400).json({ message: "Paramètre requis : ids (liste)." });
    const existantes = await prisma.mediaFichePresence.findMany({ where: rattachement(type, id), select: { media_id: true } });
    const attendus = new Set(existantes.map((m) => m.media_id));
    if (ids.length !== attendus.size || new Set(ids).size !== ids.length || !ids.every((m) => attendus.has(m))) {
      return res.status(400).json({ message: "La liste doit contenir exactement les photos de la fiche, une fois chacune." });
    }
    await prisma.$transaction(ids.map((media_id, ordre) => prisma.mediaFichePresence.update({ where: { media_id }, data: { ordre } })));
    return res.status(200).json({ message: "Ordre enregistré." });
  } catch (err) {
    next(err);
  }
}

/* ============================ Actualités ============================ */

/** GET /api/pharmacies/:id/annonces (et /actualites) — PUBLIQUE : actualités en ligne si l'abonnement inclut l'enrichi. */
export async function listerActualitesPubliques(req, res, next) {
  try {
    const type = typeDe(req);
    const id = req.params.id;
    if (!(await chargerFiche(type, id, { [cfg(type).cle]: true }))) return res.status(404).json(cfg(type).introuvable);
    const { droits } = await resoudreDroitsPresence(type, id);
    if (!droits.description_enrichie) return res.status(200).json({ annonces: [] });
    const maintenant = new Date();
    const actualites = await prisma.actualiteFichePresence.findMany({
      where: {
        ...rattachement(type, id),
        publiee: true,
        date_publication: { lte: maintenant },
        OR: [{ date_expiration: null }, { date_expiration: { gt: maintenant } }],
      },
      orderBy: { date_publication: "desc" },
      take: 20,
    });
    return res.status(200).json({ annonces: actualites.map((a) => presenterActualite(a, maintenant)) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/pharmacies/:id/actualites/gestion — toutes les actualités, avec leur statut. */
export async function listerActualitesGestion(req, res, next) {
  try {
    const type = typeDe(req);
    const id = req.params.id;
    if (!(await exigerGestionnaire(req, res, type, id))) return undefined;
    const [actualites, { droits }] = await Promise.all([
      prisma.actualiteFichePresence.findMany({ where: rattachement(type, id), orderBy: { date_publication: "desc" } }),
      resoudreDroitsPresence(type, id),
    ]);
    const maintenant = new Date();
    return res.status(200).json({
      actualites: actualites.map((a) => presenterActualite(a, maintenant)),
      visibles_public: !!droits.description_enrichie,
      max: MAX_ACTUALITES,
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/pharmacies/:id/actualites — multipart : titre, contenu, publiee, date_publication, date_expiration, image (facultative). */
export async function creerActualite(req, res, next) {
  try {
    const type = typeDe(req);
    const id = req.params.id;
    if (!(await exigerGestionnaire(req, res, type, id))) return undefined;
    const { erreur, data } = normaliserActualite(req.body);
    if (erreur) return res.status(400).json({ message: erreur });
    const nb = await prisma.actualiteFichePresence.count({ where: rattachement(type, id) });
    if (nb >= MAX_ACTUALITES) {
      return res.status(403).json({ message: `Vous avez atteint le nombre maximal d'actualités (${MAX_ACTUALITES}). Supprimez les plus anciennes.` });
    }
    const fichier = req.files?.image?.[0];
    const upload = fichier ? await televerserFichier(fichier.buffer, `${cfg(type).dossier}/actualites/${id}`) : null;
    let actualite;
    try {
      actualite = await prisma.actualiteFichePresence.create({
        data: { ...rattachement(type, id), ...data, image_nom: upload?.nom ?? null },
      });
    } catch (err) {
      if (upload) await supprimerFichier(upload.nom);
      throw err;
    }
    return res.status(201).json({ message: "Actualité enregistrée.", actualite: presenterActualite(actualite) });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/actualites-fiche/:id — multipart, champs facultatifs ; supprimer_image=true retire l'illustration. */
export async function modifierActualite(req, res, next) {
  try {
    const actualite = await chargerLigneGerable(req, res, "actualiteFichePresence", "actualite_id", "Actualité introuvable.");
    if (!actualite) return undefined;
    const { erreur, data } = normaliserActualite(req.body, { partiel: true, existante: actualite });
    if (erreur) return res.status(400).json({ message: erreur });

    const type = typeDeLaLigne(actualite);
    const fichier = req.files?.image?.[0];
    const retirer = req.body?.supprimer_image === true || req.body?.supprimer_image === "true";
    let ancienneImage = null;
    if (fichier) {
      const upload = await televerserFichier(fichier.buffer, `${cfg(type).dossier}/actualites/${acteurDeLaLigne(actualite)}`);
      data.image_nom = upload.nom;
      ancienneImage = actualite.image_nom;
    } else if (retirer) {
      data.image_nom = null;
      ancienneImage = actualite.image_nom;
    }
    const maj = await prisma.actualiteFichePresence.update({ where: { actualite_id: actualite.actualite_id }, data });
    if (ancienneImage) await supprimerFichier(ancienneImage);
    return res.status(200).json({ message: "Actualité mise à jour.", actualite: presenterActualite(maj) });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/actualites-fiche/:id */
export async function supprimerActualite(req, res, next) {
  try {
    const actualite = await chargerLigneGerable(req, res, "actualiteFichePresence", "actualite_id", "Actualité introuvable.");
    if (!actualite) return undefined;
    await prisma.actualiteFichePresence.delete({ where: { actualite_id: actualite.actualite_id } });
    if (actualite.image_nom) await supprimerFichier(actualite.image_nom);
    return res.status(200).json({ message: "Actualité supprimée." });
  } catch (err) {
    next(err);
  }
}

/* ============================ Messages ============================ */

/**
 * POST /api/pharmacies/:id/messages (idem centres-sante) — formulaire de
 * contact de la fiche publique { nom?, email, telephone?, message }.
 * Ouvert seulement si l'abonnement de la fiche inclut le contact direct.
 */
export async function envoyerMessage(req, res, next) {
  try {
    const type = typeDe(req);
    const c = cfg(type);
    const id = req.params.id;
    const fiche = await chargerFiche(type, id, { [c.cle]: true, nom: true });
    if (!fiche) return res.status(404).json(c.introuvable);
    const { droits } = await resoudreDroitsPresence(type, id);
    if (!droits.contact_direct) {
      return res.status(403).json({ code: "CONTACT_INDISPONIBLE", message: "Cette fiche ne reçoit pas de messages pour le moment." });
    }
    const { erreur, data } = normaliserMessage(req.body);
    if (erreur) return res.status(400).json({ message: erreur });

    const message = await prisma.messageFichePresence.create({
      data: { ...rattachement(type, id), ...data, utilisateur_id: req.utilisateur?.utilisateur_id ?? null },
    });
    const agents = await prisma[c.modeleAgent].findMany({ where: { [c.cle]: id }, select: { utilisateur_id: true } });
    notifierMessageRecu({ type, acteur_id: id, nomFiche: fiche.nom, message, agents: agents.map((a) => a.utilisateur_id) });
    return res.status(201).json({ message: "Message envoyé." });
  } catch (err) {
    next(err);
  }
}

/** GET /api/pharmacies/:id/messages/gestion?statut=non_lu|lu|archive (défaut : non archivés) */
export async function listerMessagesGestion(req, res, next) {
  try {
    const type = typeDe(req);
    const id = req.params.id;
    if (!(await exigerGestionnaire(req, res, type, id))) return undefined;
    const { statut } = req.query;
    if (statut && !STATUTS_MESSAGE.includes(statut)) {
      return res.status(400).json({ message: `statut invalide. Valeurs acceptées : ${STATUTS_MESSAGE.join(", ")}.` });
    }
    const lien = rattachement(type, id);
    const [messages, compteurs] = await Promise.all([
      prisma.messageFichePresence.findMany({
        where: { ...lien, statut: statut ? statut : { not: "archive" } },
        orderBy: { date_creation: "desc" },
        take: 200,
      }),
      prisma.messageFichePresence.groupBy({ by: ["statut"], where: lien, _count: { _all: true } }),
    ]);
    const parStatut = Object.fromEntries(STATUTS_MESSAGE.map((s) => [s, 0]));
    for (const ligne of compteurs) parStatut[ligne.statut] = ligne._count._all;
    return res.status(200).json({ messages: messages.map(presenterMessage), compteurs: parStatut });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/messages-fiche/:id — { statut: non_lu | lu | archive } */
export async function changerStatutMessage(req, res, next) {
  try {
    const message = await chargerLigneGerable(req, res, "messageFichePresence", "message_id", "Message introuvable.");
    if (!message) return undefined;
    const { statut } = req.body ?? {};
    if (!STATUTS_MESSAGE.includes(statut)) {
      return res.status(400).json({ message: `statut invalide. Valeurs acceptées : ${STATUTS_MESSAGE.join(", ")}.` });
    }
    const maj = await prisma.messageFichePresence.update({
      where: { message_id: message.message_id },
      data: { statut, ...(statut !== "non_lu" && !message.date_lecture ? { date_lecture: new Date() } : {}), ...(statut === "non_lu" ? { date_lecture: null } : {}) },
    });
    return res.status(200).json({ message: "Message mis à jour.", donnees: presenterMessage(maj) });
  } catch (err) {
    next(err);
  }
}

/* ============================ Prestations (centres de santé) ============================ */

async function deviseDuCentre(id) {
  const s = await prisma.structureSante.findUnique({ where: { structure_id: id }, select: { pays: { select: { devise: { select: { libelle: true } } } } } });
  return s?.pays?.devise?.libelle ?? null;
}

/** GET /api/centres-sante/:id/examens — PUBLIQUE : prestations disponibles si l'abonnement inclut l'enrichi. */
export async function listerPrestationsPubliques(req, res, next) {
  try {
    const id = req.params.id;
    if (!(await chargerFiche("structure", id, { structure_id: true }))) return res.status(404).json(TYPES.structure.introuvable);
    const { droits } = await resoudreDroitsPresence("structure", id);
    if (!droits.description_enrichie) return res.status(200).json({ examens: [] });
    const [prestations, devise] = await Promise.all([
      prisma.prestationStructure.findMany({ where: { structure_id: id, disponible: true }, orderBy: [{ categorie: "asc" }, { nom: "asc" }] }),
      deviseDuCentre(id),
    ]);
    return res.status(200).json({ examens: prestations.map((p) => presenterPrestation(p, devise)) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/centres-sante/:id/prestations/gestion */
export async function listerPrestationsGestion(req, res, next) {
  try {
    const id = req.params.id;
    if (!(await exigerGestionnaire(req, res, "structure", id))) return undefined;
    const [prestations, devise, { droits }] = await Promise.all([
      prisma.prestationStructure.findMany({ where: { structure_id: id }, orderBy: [{ categorie: "asc" }, { nom: "asc" }] }),
      deviseDuCentre(id),
      resoudreDroitsPresence("structure", id),
    ]);
    return res.status(200).json({
      prestations: prestations.map((p) => presenterPrestation(p, devise)),
      devise,
      visibles_public: !!droits.description_enrichie,
      max: MAX_PRESTATIONS,
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/centres-sante/:id/prestations — { nom, categorie?, description?, prix?, disponible? } */
export async function creerPrestation(req, res, next) {
  try {
    const id = req.params.id;
    if (!(await exigerGestionnaire(req, res, "structure", id))) return undefined;
    const { erreur, data } = normaliserPrestation(req.body);
    if (erreur) return res.status(400).json({ message: erreur });
    if ((await prisma.prestationStructure.count({ where: { structure_id: id } })) >= MAX_PRESTATIONS) {
      return res.status(403).json({ message: `Vous avez atteint le nombre maximal de prestations (${MAX_PRESTATIONS}).` });
    }
    const prestation = await prisma.prestationStructure.create({ data: { structure_id: id, ...data } });
    return res.status(201).json({ message: "Prestation ajoutée.", prestation: presenterPrestation(prestation, await deviseDuCentre(id)) });
  } catch (err) {
    next(err);
  }
}

async function chargerPrestationGerable(req, res) {
  const prestation = await prisma.prestationStructure.findUnique({ where: { prestation_id: req.params.id } });
  if (!prestation) {
    res.status(404).json({ message: "Prestation introuvable." });
    return null;
  }
  if (!(await peutGererFichePresence(req.utilisateur, "structure", prestation.structure_id))) {
    res.status(403).json(TYPES.structure.refus);
    return null;
  }
  return prestation;
}

/** PUT /api/prestations-structure/:id */
export async function modifierPrestation(req, res, next) {
  try {
    const prestation = await chargerPrestationGerable(req, res);
    if (!prestation) return undefined;
    const { erreur, data } = normaliserPrestation(req.body, { partiel: true });
    if (erreur) return res.status(400).json({ message: erreur });
    const maj = await prisma.prestationStructure.update({ where: { prestation_id: prestation.prestation_id }, data });
    return res.status(200).json({ message: "Prestation mise à jour.", prestation: presenterPrestation(maj, await deviseDuCentre(prestation.structure_id)) });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/prestations-structure/:id */
export async function supprimerPrestation(req, res, next) {
  try {
    const prestation = await chargerPrestationGerable(req, res);
    if (!prestation) return undefined;
    await prisma.prestationStructure.delete({ where: { prestation_id: prestation.prestation_id } });
    return res.status(200).json({ message: "Prestation supprimée." });
  } catch (err) {
    next(err);
  }
}
