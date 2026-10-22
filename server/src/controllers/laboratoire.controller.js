// src/controllers/laboratoire.controller.js
// Composant "annuaire — laboratoire d'analyses" : fiche laboratoire,
// examens proposés, centres de prélèvement et avis des utilisateurs.
// Le tableau de bord, la médiathèque et les engagements du portail du
// laboratoire sont dans portailLaboratoire.controller.js.
//
// Même logique d'annuaire que Pharmacie / Assurance :
//   - lecture PUBLIQUE des seules fiches publiées (le gestionnaire et
//     l'administration lisent aussi une fiche non publiée) ;
//   - création par tout utilisateur authentifié, avec 3 pièces (logo, CNI
//     du responsable, agrément) et le compte de l'agent (ou rattachement au
//     compte connecté avec `responsable_moi` — rattachementAgent.service.js) ;
//   - modification par l'agent de la fiche ou l'administration, SANS
//     re-modération (décision du 2026-10-18 pour les assurances, reprise
//     ici) : seule une fiche « non_publie » modifiée par son agent est
//     re-soumise (« en_cours ») ;
//   - publication / suspension et modération des avis : administration ;
//   - suppression : superadmin.
//
// Les pièces justificatives (CNI, agrément) ne sont JAMAIS renvoyées au
// public : seuls le gestionnaire et l'administration en reçoivent l'URL.
// Pas d'abonnement laboratoire pour l'instant : tout le contenu d'une fiche
// publiée est public.

import crypto from "crypto";
import bcrypt from "bcrypt"; // même bibliothèque que authentification.controller.js
import prisma from "../lib/prisma.js";
import { televerserFichier, supprimerFichier, construireUrl } from "../lib/cloudinaryService.js";
import { analyserParametresProximite, creerAccesseurGeospatial } from "../lib/geo.js";
import {
  estAdminOuSuperadmin,
  estAgentDuLaboratoire,
  laboratoireDeLAgent,
  peutGererLaboratoire,
} from "../lib/accesLaboratoire.js";
import { enregistrerVueFiche } from "../services/vuesFiche.service.js";
import { estResponsableMoi, rattacherCompteConnecte } from "../services/rattachementAgent.service.js";
import {
  COMMENTAIRE_AVIS_MAX,
  NOTE_MAX,
  NOTE_MIN,
  STATUTS_MODERATION_AVIS,
  auteurPublic,
  normaliserExamen,
  presenterExamen,
  resumeAvis,
} from "../services/portailLaboratoire.service.js";
import { MESSAGE_CGU_REFUSEES, cguRefusees, enregistrerAcceptationsAuteur } from "../services/documentLegal.service.js";

const SALT_ROUNDS = 10;
const LIBELLE_ROLE_AGENT = "agent_laboratoire";
const STATUTS_VERIFICATION = ["non_publie", "en_cours", "publie"];
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOSSIER_CLOUDINARY = "laboratoires";

const geoLaboratoire = creerAccesseurGeospatial({
  table: "laboratoire",
  colonne: "geolocalisation",
  clePrimaire: "laboratoire_id",
});
const geoCentre = creerAccesseurGeospatial({
  table: "centre_laboratoire",
  colonne: "gps",
  clePrimaire: "centre_id",
});

const INTROUVABLE = { message: "Laboratoire introuvable." };
const REFUS_GESTION = { message: "Accès réservé à l'agent du laboratoire concerné ou à un administrateur." };

const chaine = (v) => (typeof v === "string" ? v.trim() : "");

/* ===================================================================
 * Compte de l'agent (même patron que creerCompteAgentPourPharmacie)
 * =================================================================== */

function genererMotDePasseTemporaire() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const octets = crypto.randomBytes(12);
  let motDePasse = "";
  for (let i = 0; i < 12; i++) motDePasse += alphabet[octets[i] % alphabet.length];
  return motDePasse;
}

async function creerCompteAgent(tx, { laboratoireId, fonction, nom, prenom, email, telephone, paysId }) {
  const roleAgent = await tx.role.findUnique({ where: { libelle: LIBELLE_ROLE_AGENT } });
  if (!roleAgent) {
    throw new Error(`Rôle "${LIBELLE_ROLE_AGENT}" introuvable en base (table role) — appliquer la migration du module laboratoire.`);
  }
  const motDePasseTemporaire = genererMotDePasseTemporaire();
  const utilisateur = await tx.utilisateur.create({
    data: {
      nom,
      prenom,
      email,
      telephone: telephone || null,
      mot_de_passe_hash: await bcrypt.hash(motDePasseTemporaire, SALT_ROUNDS),
      role_id: roleAgent.role_id,
      pays_id: paysId,
      statut_compte: "actif",
      mot_de_passe_temporaire: true,
    },
  });
  const agent = await tx.agentLaboratoire.create({
    data: { utilisateur_id: utilisateur.utilisateur_id, laboratoire_id: laboratoireId, fonction },
  });
  return { utilisateur, agent, motDePasseTemporaire };
}

/* ===================================================================
 * Présentation des fiches
 * =================================================================== */

const INCLUDE_FICHE = { pays: { include: { devise: true } }, ville: true };

/**
 * Fiche prête pour le client. `complete` (gestionnaire / admin) ajoute les
 * URL des pièces justificatives ; le public ne reçoit que l'image.
 */
function presenterFiche(labo, { geolocalisation = null, complete = false, extra = {} } = {}) {
  const { image_nom, piece_identite_nom, document_agrement_nom, pays, ...reste } = labo;
  return {
    ...reste,
    pays: pays ? { pays_id: pays.pays_id, nom: pays.nom, code_iso2: pays.code_iso2 } : undefined,
    devise: pays?.devise?.libelle ?? null,
    image_url: construireUrl(image_nom),
    geolocalisation,
    ...(complete && {
      piece_identite_url: construireUrl(piece_identite_nom),
      document_agrement_url: construireUrl(document_agrement_nom),
    }),
    ...extra,
  };
}

/** Compteurs de la liste (examens, centres, avis publiés) en 3 requêtes groupées. */
async function compteursEnLot(ids) {
  if (!ids.length) return new Map();
  const [examens, centres, avis] = await Promise.all([
    prisma.examenLaboratoire.groupBy({ by: ["laboratoire_id"], where: { laboratoire_id: { in: ids }, disponible: true }, _count: { _all: true } }),
    prisma.centreLaboratoire.groupBy({ by: ["laboratoire_id"], where: { laboratoire_id: { in: ids } }, _count: { _all: true } }),
    prisma.avisLaboratoire.groupBy({
      by: ["laboratoire_id"],
      where: { laboratoire_id: { in: ids }, statut_moderation: "publie" },
      _count: { _all: true },
      _avg: { note: true },
    }),
  ]);
  const carte = new Map(ids.map((id) => [id, { nb_examens: 0, nb_centres: 0, nb_avis: 0, note_moyenne: null }]));
  for (const l of examens) carte.get(l.laboratoire_id).nb_examens = l._count._all;
  for (const l of centres) carte.get(l.laboratoire_id).nb_centres = l._count._all;
  for (const l of avis) {
    const c = carte.get(l.laboratoire_id);
    c.nb_avis = l._count._all;
    c.note_moyenne = l._avg.note === null ? null : Math.round(l._avg.note * 10) / 10;
  }
  return carte;
}

async function presenterListe(labos, { complete = false, distances = null } = {}) {
  const ids = labos.map((l) => l.laboratoire_id);
  const [points, compteurs] = await Promise.all([geoLaboratoire.recupererPlusieurs(ids), compteursEnLot(ids)]);
  return labos.map((l) => presenterFiche(l, {
    geolocalisation: points.get(l.laboratoire_id) ?? null,
    complete,
    extra: {
      ...compteurs.get(l.laboratoire_id),
      ...(distances && { distance_km: Math.round(distances.get(l.laboratoire_id) * 10) / 10 }),
    },
  }));
}

/** Ids des laboratoires proposant un examen dont le nom correspond. */
async function idsAvecExamen(terme) {
  const lignes = await prisma.examenLaboratoire.findMany({
    where: { nom: { contains: terme, mode: "insensitive" }, disponible: true },
    select: { laboratoire_id: true },
    distinct: ["laboratoire_id"],
  });
  return lignes.map((l) => l.laboratoire_id);
}

/* ===================================================================
 * Fiches laboratoire
 * =================================================================== */

/**
 * GET /api/laboratoires — PUBLIQUE, fiches publiées seulement.
 * Filtres : ?pays_id=&ville_id=&recherche=(nom)&examen=(nom d'examen)
 * Proximité : ?lat=&lng=&rayon_km= (tri par distance, champ distance_km).
 */
export async function listerLaboratoires(req, res, next) {
  try {
    const { pays_id, ville_id } = req.query;
    const recherche = chaine(req.query.recherche);
    const examen = chaine(req.query.examen);

    const proximite = analyserParametresProximite(req.query);
    if (proximite.erreur) return res.status(400).json({ message: proximite.erreur });

    const where = { statut_verification: "publie" };
    if (pays_id) where.pays_id = pays_id;
    if (ville_id) where.ville_id = ville_id;
    if (recherche) where.nom = { contains: recherche, mode: "insensitive" };
    if (examen) where.laboratoire_id = { in: await idsAvecExamen(examen) };

    if (proximite.actif) {
      const proches = await geoLaboratoire.rechercherParProximite({
        latitude: proximite.latitude,
        longitude: proximite.longitude,
        rayonKm: proximite.rayonKm,
        where,
      });
      if (!proches.length) return res.status(200).json({ laboratoires: [] });
      const ids = proches.map((p) => p.id);
      const labos = await prisma.laboratoire.findMany({ where: { laboratoire_id: { in: ids } }, include: INCLUDE_FICHE });
      const parId = new Map(labos.map((l) => [l.laboratoire_id, l]));
      const ordonnes = ids.map((id) => parId.get(id)).filter(Boolean);
      const distances = new Map(proches.map((p) => [p.id, p.distance_km]));
      return res.status(200).json({ laboratoires: await presenterListe(ordonnes, { distances }) });
    }

    const labos = await prisma.laboratoire.findMany({ where, include: INCLUDE_FICHE, orderBy: { nom: "asc" } });
    return res.status(200).json({ laboratoires: await presenterListe(labos) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/laboratoires — administration (admin : son pays).
 * Tous statuts, pièces justificatives et agents rattachés.
 * Filtres : ?pays_id=&ville_id=&statut_verification=&recherche=
 */
export async function listerLaboratoiresAdmin(req, res, next) {
  try {
    const { pays_id, ville_id, statut_verification } = req.query;
    const recherche = chaine(req.query.recherche);
    if (statut_verification && !STATUTS_VERIFICATION.includes(statut_verification)) {
      return res.status(400).json({ message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION.join(", ")}.` });
    }
    const where = {};
    if (pays_id) where.pays_id = pays_id;
    if (ville_id) where.ville_id = ville_id;
    if (statut_verification) where.statut_verification = statut_verification;
    if (recherche) {
      where.OR = [
        { nom: { contains: recherche, mode: "insensitive" } },
        { agrement: { contains: recherche, mode: "insensitive" } },
        { email: { contains: recherche, mode: "insensitive" } },
      ];
    }
    const labos = await prisma.laboratoire.findMany({
      where,
      include: {
        ...INCLUDE_FICHE,
        agents: {
          select: {
            agent_id: true,
            fonction: true,
            utilisateur: { select: { utilisateur_id: true, nom: true, prenom: true, email: true, telephone: true } },
          },
        },
        _count: { select: { avis: { where: { statut_moderation: "en_attente" } }, medias: true } },
      },
      orderBy: { date_creation: "desc" },
    });
    const presentes = await presenterListe(labos, { complete: true });
    return res.status(200).json({
      laboratoires: presentes.map(({ _count, ...l }) => ({
        ...l,
        nb_avis_en_attente: _count?.avis ?? 0,
        nb_medias: _count?.medias ?? 0,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/laboratoires/mon-laboratoire — fiche gérée par le compte connecté
 * (espace actif). 404 si le compte n'est agent d'aucun laboratoire.
 */
export async function obtenirMonLaboratoire(req, res, next) {
  try {
    const id = await laboratoireDeLAgent(req.utilisateur.utilisateur_id, req.utilisateur.espace);
    if (!id) return res.status(404).json({ message: "Aucun laboratoire rattaché à ce compte." });
    const labo = await prisma.laboratoire.findUnique({
      where: { laboratoire_id: id },
      select: { laboratoire_id: true, nom: true, statut_verification: true, image_nom: true, ville: { select: { nom: true } } },
    });
    const { image_nom, ...reste } = labo;
    return res.status(200).json({ laboratoire: { ...reste, image_url: construireUrl(image_nom) } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/laboratoires/:id — PUBLIQUE (jeton facultatif). Fiche publiée,
 * ou toute fiche pour son gestionnaire / l'administration (aperçu). Compte
 * une vue (hors gestionnaire, administration et robots).
 */
export async function obtenirLaboratoire(req, res, next) {
  try {
    const labo = await prisma.laboratoire.findUnique({ where: { laboratoire_id: req.params.id }, include: INCLUDE_FICHE });
    if (!labo) return res.status(404).json(INTROUVABLE);
    const gestionnaire = req.utilisateur ? await peutGererLaboratoire(req.utilisateur, labo.laboratoire_id) : false;
    if (labo.statut_verification !== "publie" && !gestionnaire) return res.status(404).json(INTROUVABLE);

    enregistrerVueFiche({ req, type: "laboratoire", acteur_id: labo.laboratoire_id, gestionnaire });

    const [geolocalisation, compteurs, avisPublies] = await Promise.all([
      geoLaboratoire.recuperer(labo.laboratoire_id),
      compteursEnLot([labo.laboratoire_id]),
      prisma.avisLaboratoire.findMany({
        where: { laboratoire_id: labo.laboratoire_id, statut_moderation: "publie" },
        select: { note: true },
      }),
    ]);
    return res.status(200).json({
      laboratoire: presenterFiche(labo, {
        geolocalisation,
        complete: gestionnaire,
        extra: { ...compteurs.get(labo.laboratoire_id), resume_avis: resumeAvis(avisPublies), est_gestionnaire: gestionnaire },
      }),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/laboratoires/:id/gestion — vue propriétaire (agent ou admin) :
 * fiche complète, examens (disponibles ou non), centres.
 */
export async function obtenirGestionLaboratoire(req, res, next) {
  try {
    const id = req.params.id;
    if (!(await peutGererLaboratoire(req.utilisateur, id))) return res.status(403).json(REFUS_GESTION);
    const labo = await prisma.laboratoire.findUnique({ where: { laboratoire_id: id }, include: INCLUDE_FICHE });
    if (!labo) return res.status(404).json(INTROUVABLE);
    const [geolocalisation, examens, centres] = await Promise.all([
      geoLaboratoire.recuperer(id),
      prisma.examenLaboratoire.findMany({ where: { laboratoire_id: id }, orderBy: [{ categorie: "asc" }, { nom: "asc" }] }),
      listerCentresDe(id),
    ]);
    return res.status(200).json({
      laboratoire: presenterFiche(labo, { geolocalisation, complete: true }),
      examens: examens.map(presenterExamen),
      centres,
    });
  } catch (err) {
    next(err);
  }
}

/** Contrôle pays / ville (création et modification). */
async function verifierPaysVille(paysId, villeId) {
  const [pays, ville] = await Promise.all([
    prisma.pays.findUnique({ where: { pays_id: paysId } }),
    prisma.ville.findUnique({ where: { ville_id: villeId } }),
  ]);
  if (!pays) return "pays_id introuvable.";
  if (!ville) return "ville_id introuvable.";
  if (ville.pays_id !== paysId) return "ville_id n'appartient pas à pays_id.";
  return null;
}

/**
 * POST /api/laboratoires — multipart/form-data, tout utilisateur authentifié.
 * Fiche : nom, pays_id, ville_id, localisation, telephone, email, agrement
 *   (+ description, latitude, longitude facultatifs ; statut_verification
 *   honoré pour l'administration seulement, « en_cours » sinon).
 * Agent : fonction, agent_nom, agent_prenom, agent_email, agent_telephone —
 *   sauf `responsable_moi` (la fiche est rattachée au compte connecté).
 * Fichiers requis : image_laboratoire, piece_identite (CNI), document_agrement.
 */
export async function creerLaboratoire(req, res, next) {
  try {
    if (cguRefusees(req.body)) {
      return res.status(400).json({ message: MESSAGE_CGU_REFUSEES });
    }

    const nom = chaine(req.body.nom);
    const localisation = chaine(req.body.localisation);
    const telephone = chaine(req.body.telephone);
    const email = chaine(req.body.email).toLowerCase();
    const agrement = chaine(req.body.agrement);
    const description = chaine(req.body.description);
    const { pays_id, ville_id, statut_verification, latitude, longitude } = req.body;

    if (!nom || !pays_id || !ville_id || !localisation || !telephone || !email || !agrement) {
      return res.status(400).json({
        message: "Champs requis manquants : nom, pays_id, ville_id, localisation, telephone, email, agrement.",
      });
    }
    if (!REGEX_EMAIL.test(email)) return res.status(400).json({ message: "email invalide." });

    const responsableMoi = estResponsableMoi(req);
    const fonction = chaine(req.body.fonction);
    const agent = {
      nom: chaine(req.body.agent_nom),
      prenom: chaine(req.body.agent_prenom),
      email: chaine(req.body.agent_email).toLowerCase(),
      telephone: chaine(req.body.agent_telephone),
    };
    if (!responsableMoi) {
      if (!fonction || !agent.nom || !agent.prenom || !agent.email || !agent.telephone) {
        return res.status(400).json({
          message: "Champs requis manquants pour l'agent du laboratoire : fonction, agent_nom, agent_prenom, agent_email, agent_telephone.",
        });
      }
      if (!REGEX_EMAIL.test(agent.email)) return res.status(400).json({ message: "agent_email invalide." });
    }

    const fichierImage = req.files?.image_laboratoire?.[0];
    const fichierCni = req.files?.piece_identite?.[0];
    const fichierAgrement = req.files?.document_agrement?.[0];
    if (!fichierImage || !fichierCni || !fichierAgrement) {
      return res.status(400).json({
        message: "3 fichiers sont requis : image_laboratoire (logo/photo), piece_identite (CNI du responsable) et document_agrement (agrément officiel).",
      });
    }

    const erreurLieu = await verifierPaysVille(pays_id, ville_id);
    if (erreurLieu) return res.status(400).json({ message: erreurLieu });

    if (!responsableMoi && (await prisma.utilisateur.findUnique({ where: { email: agent.email } }))) {
      return res.status(409).json({ message: "Un compte existe déjà avec cet email : impossible de créer le compte agent." });
    }

    const estAdmin = estAdminOuSuperadmin(req.utilisateur);
    if (estAdmin && statut_verification && !STATUTS_VERIFICATION.includes(statut_verification)) {
      return res.status(400).json({ message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION.join(", ")}.` });
    }
    const statutApplique = estAdmin && statut_verification ? statut_verification : "en_cours";

    // Téléversements après les validations (pas d'envoi inutile).
    const [uploadImage, uploadCni, uploadAgrement] = await Promise.all([
      televerserFichier(fichierImage.buffer, DOSSIER_CLOUDINARY),
      televerserFichier(fichierCni.buffer, `${DOSSIER_CLOUDINARY}/pieces`),
      televerserFichier(fichierAgrement.buffer, `${DOSSIER_CLOUDINARY}/pieces`),
    ]);
    const nettoyerFichiers = () => Promise.all([uploadImage, uploadCni, uploadAgrement].map((u) => supprimerFichier(u.nom)));

    let resultat;
    try {
      resultat = await prisma.$transaction(async (tx) => {
        const labo = await tx.laboratoire.create({
          data: {
            nom,
            description: description || null,
            pays_id,
            ville_id,
            localisation,
            telephone,
            email,
            agrement,
            statut_verification: statutApplique,
            date_premiere_publication: statutApplique === "publie" ? new Date() : null,
            image_nom: uploadImage.nom,
            piece_identite_nom: uploadCni.nom,
            document_agrement_nom: uploadAgrement.nom,
          },
          include: INCLUDE_FICHE,
        });
        const compte = responsableMoi
          ? await rattacherCompteConnecte(tx, {
            modele: "agentLaboratoire", fk: "laboratoire_id", id: labo.laboratoire_id,
            utilisateur_id: req.utilisateur.utilisateur_id, fonction,
          })
          : await creerCompteAgent(tx, {
            laboratoireId: labo.laboratoire_id, fonction, ...agent, paysId: pays_id,
          });
        return { labo, ...compte };
      });
    } catch (errTransaction) {
      await nettoyerFichiers();
      if (errTransaction.code === "P2002") {
        return res.status(409).json({ message: "Un compte existe déjà avec cet email : impossible de créer le compte agent." });
      }
      throw errTransaction;
    }

    await enregistrerAcceptationsAuteur(req, "creation_laboratoire");

    const erreurGeo = await geoLaboratoire.appliquer(resultat.labo.laboratoire_id, latitude, longitude);
    const geolocalisation = await geoLaboratoire.recuperer(resultat.labo.laboratoire_id);

    return res.status(201).json({
      message: erreurGeo
        ? `Laboratoire créé avec succès. Avertissement : ${erreurGeo}`
        : responsableMoi
          ? "Laboratoire créé avec succès. Il est rattaché à votre compte : retrouvez-le dans « Changer d’espace »."
          : "Laboratoire créé avec succès. Compte agent créé — communiquez-lui le mot de passe temporaire.",
      laboratoire: presenterFiche(resultat.labo, { geolocalisation, complete: true }),
      agent: {
        agent_id: resultat.agent.agent_id,
        fonction: resultat.agent.fonction,
        utilisateur: {
          utilisateur_id: resultat.utilisateur.utilisateur_id,
          nom: resultat.utilisateur.nom,
          prenom: resultat.utilisateur.prenom,
          email: resultat.utilisateur.email,
        },
        // ⚠️ Renvoyé UNE seule fois (même avertissement que pharmacie.controller.js).
        mot_de_passe_temporaire: resultat.motDePasseTemporaire,
        rattache_au_compte: responsableMoi,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/laboratoires/:id — multipart, agent de la fiche ou administration.
 * Fichiers facultatifs (seuls ceux envoyés sont remplacés). Statut conservé
 * (voir l'en-tête) ; statut_verification honoré pour l'administration.
 */
export async function modifierLaboratoire(req, res, next) {
  try {
    const existant = await prisma.laboratoire.findUnique({ where: { laboratoire_id: req.params.id } });
    if (!existant) return res.status(404).json(INTROUVABLE);
    if (!(await peutGererLaboratoire(req.utilisateur, existant.laboratoire_id))) {
      return res.status(403).json({ message: "Seul l'agent de ce laboratoire ou un administrateur peut modifier la fiche." });
    }

    const data = {};
    for (const champ of ["nom", "localisation", "telephone", "agrement"]) {
      if (req.body[champ] !== undefined) {
        const v = chaine(req.body[champ]);
        if (!v) return res.status(400).json({ message: `${champ} ne peut pas être vide.` });
        data[champ] = v;
      }
    }
    if (req.body.email !== undefined) {
      const email = chaine(req.body.email).toLowerCase();
      if (!REGEX_EMAIL.test(email)) return res.status(400).json({ message: "email invalide." });
      data.email = email;
    }
    if (req.body.description !== undefined) data.description = chaine(req.body.description) || null;

    const paysCible = req.body.pays_id || existant.pays_id;
    const villeCible = req.body.ville_id || existant.ville_id;
    if (req.body.pays_id || req.body.ville_id) {
      const erreurLieu = await verifierPaysVille(paysCible, villeCible);
      if (erreurLieu) return res.status(400).json({ message: erreurLieu });
      data.pays_id = paysCible;
      data.ville_id = villeCible;
    }

    const estAdmin = estAdminOuSuperadmin(req.utilisateur);
    const { statut_verification } = req.body;
    if (estAdmin && statut_verification && !STATUTS_VERIFICATION.includes(statut_verification)) {
      return res.status(400).json({ message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION.join(", ")}.` });
    }
    let statut = existant.statut_verification;
    if (estAdmin && statut_verification) statut = statut_verification;
    else if (!estAdmin && existant.statut_verification === "non_publie") statut = "en_cours";
    data.statut_verification = statut;
    if (statut === "publie" && !existant.date_premiere_publication) data.date_premiere_publication = new Date();

    // Remplacement des fichiers : nouvel envoi AVANT suppression de l'ancien.
    const remplacements = [
      ["image_laboratoire", "image_nom", DOSSIER_CLOUDINARY],
      ["piece_identite", "piece_identite_nom", `${DOSSIER_CLOUDINARY}/pieces`],
      ["document_agrement", "document_agrement_nom", `${DOSSIER_CLOUDINARY}/pieces`],
    ];
    const anciens = [];
    for (const [champFichier, colonne, dossier] of remplacements) {
      const fichier = req.files?.[champFichier]?.[0];
      if (!fichier) continue;
      const upload = await televerserFichier(fichier.buffer, dossier);
      data[colonne] = upload.nom;
      anciens.push(existant[colonne]);
    }

    const labo = await prisma.laboratoire.update({
      where: { laboratoire_id: existant.laboratoire_id },
      data,
      include: INCLUDE_FICHE,
    });
    await Promise.all(anciens.map((nomFichier) => supprimerFichier(nomFichier)));

    const erreurGeo = await geoLaboratoire.appliquer(labo.laboratoire_id, req.body.latitude, req.body.longitude);
    if (erreurGeo) return res.status(400).json({ message: erreurGeo });
    const geolocalisation = await geoLaboratoire.recuperer(labo.laboratoire_id);

    return res.status(200).json({
      message: "Laboratoire mis à jour.",
      laboratoire: presenterFiche(labo, { geolocalisation, complete: true }),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/laboratoires/:id/statut — { statut_verification }
 * Publication / mise en vérification / retrait de la fiche (administration).
 */
export async function changerStatutLaboratoire(req, res, next) {
  try {
    const { statut_verification } = req.body ?? {};
    if (!STATUTS_VERIFICATION.includes(statut_verification)) {
      return res.status(400).json({ message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION.join(", ")}.` });
    }
    const existant = await prisma.laboratoire.findUnique({ where: { laboratoire_id: req.params.id } });
    if (!existant) return res.status(404).json(INTROUVABLE);
    const labo = await prisma.laboratoire.update({
      where: { laboratoire_id: existant.laboratoire_id },
      data: {
        statut_verification,
        ...(statut_verification === "publie" && !existant.date_premiere_publication && { date_premiere_publication: new Date() }),
      },
      select: { laboratoire_id: true, nom: true, statut_verification: true, date_premiere_publication: true },
    });
    return res.status(200).json({ message: "Statut du laboratoire mis à jour.", laboratoire: labo });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/laboratoires/:id — superadmin. Supprime la fiche, ses
 * contenus (examens, centres, médias, avis, statistiques) et les
 * rattachements d'agents (les COMPTES des agents sont conservés), puis les
 * fichiers Cloudinary (best effort).
 */
export async function supprimerLaboratoire(req, res, next) {
  try {
    const labo = await prisma.laboratoire.findUnique({
      where: { laboratoire_id: req.params.id },
      include: { medias: { select: { fichier_nom: true, type: true } } },
    });
    if (!labo) return res.status(404).json(INTROUVABLE);

    await prisma.$transaction([
      prisma.agentLaboratoire.deleteMany({ where: { laboratoire_id: labo.laboratoire_id } }),
      prisma.engagementLaboratoireVisiteur.deleteMany({ where: { laboratoire_id: labo.laboratoire_id } }),
      prisma.vueFiche.deleteMany({ where: { type_acteur: "laboratoire", acteur_id: labo.laboratoire_id } }),
      prisma.laboratoire.delete({ where: { laboratoire_id: labo.laboratoire_id } }),
    ]);

    await Promise.all([
      supprimerFichier(labo.image_nom),
      supprimerFichier(labo.piece_identite_nom),
      supprimerFichier(labo.document_agrement_nom),
      ...labo.medias.map((m) => supprimerFichier(m.fichier_nom, { resourceType: m.type === "video" ? "video" : "image" })),
    ]);
    return res.status(200).json({ message: "Laboratoire supprimé." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Lecture d'un contenu annexe (examens, centres, avis)
 * =================================================================== */

/**
 * Fiche lisible par l'appelant : publiée, ou gérée par lui. Répond 404 sinon.
 * @returns {Promise<{ labo: object, gestionnaire: boolean } | null>}
 */
async function ficheLisible(req, res, id) {
  const labo = await prisma.laboratoire.findUnique({
    where: { laboratoire_id: id },
    select: { laboratoire_id: true, statut_verification: true },
  });
  if (!labo) {
    res.status(404).json(INTROUVABLE);
    return null;
  }
  const gestionnaire = req.utilisateur ? await peutGererLaboratoire(req.utilisateur, id) : false;
  if (labo.statut_verification !== "publie" && !gestionnaire) {
    res.status(404).json(INTROUVABLE);
    return null;
  }
  return { labo, gestionnaire };
}

/* ===================================================================
 * Examens
 * =================================================================== */

/**
 * GET /api/laboratoires/:id/examens — PUBLIQUE (examens disponibles ;
 * le gestionnaire reçoit aussi les indisponibles). ?categorie=&recherche=
 */
export async function listerExamens(req, res, next) {
  try {
    const acces = await ficheLisible(req, res, req.params.id);
    if (!acces) return undefined;
    const where = { laboratoire_id: req.params.id };
    if (!acces.gestionnaire) where.disponible = true;
    const categorie = chaine(req.query.categorie);
    const recherche = chaine(req.query.recherche);
    if (categorie) where.categorie = categorie;
    if (recherche) where.nom = { contains: recherche, mode: "insensitive" };
    const examens = await prisma.examenLaboratoire.findMany({ where, orderBy: [{ categorie: "asc" }, { nom: "asc" }] });
    const categories = [...new Set(examens.map((e) => e.categorie).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
    return res.status(200).json({ examens: examens.map(presenterExamen), categories });
  } catch (err) {
    next(err);
  }
}

/** POST /api/laboratoires/:id/examens — agent de la fiche ou administration. */
export async function creerExamen(req, res, next) {
  try {
    const id = req.params.id;
    const labo = await prisma.laboratoire.findUnique({ where: { laboratoire_id: id }, select: { laboratoire_id: true } });
    if (!labo) return res.status(404).json(INTROUVABLE);
    if (!(await peutGererLaboratoire(req.utilisateur, id))) return res.status(403).json(REFUS_GESTION);
    const { erreur, data } = normaliserExamen(req.body);
    if (erreur) return res.status(400).json({ message: erreur });
    const examen = await prisma.examenLaboratoire.create({ data: { ...data, laboratoire_id: id } });
    return res.status(201).json({ message: "Examen ajouté.", examen: presenterExamen(examen) });
  } catch (err) {
    next(err);
  }
}

async function chargerGerable(req, res, modele, cle, libelle) {
  const ligne = await prisma[modele].findUnique({ where: { [cle]: req.params.id } });
  if (!ligne) {
    res.status(404).json({ message: `${libelle} introuvable.` });
    return null;
  }
  if (!(await peutGererLaboratoire(req.utilisateur, ligne.laboratoire_id))) {
    res.status(403).json(REFUS_GESTION);
    return null;
  }
  return ligne;
}

/** PUT /api/examens-laboratoire/:id */
export async function modifierExamen(req, res, next) {
  try {
    const existant = await chargerGerable(req, res, "examenLaboratoire", "examen_id", "Examen");
    if (!existant) return undefined;
    const { erreur, data } = normaliserExamen(req.body, { partiel: true });
    if (erreur) return res.status(400).json({ message: erreur });
    const examen = await prisma.examenLaboratoire.update({ where: { examen_id: existant.examen_id }, data });
    return res.status(200).json({ message: "Examen mis à jour.", examen: presenterExamen(examen) });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/examens-laboratoire/:id */
export async function supprimerExamen(req, res, next) {
  try {
    const existant = await chargerGerable(req, res, "examenLaboratoire", "examen_id", "Examen");
    if (!existant) return undefined;
    await prisma.examenLaboratoire.delete({ where: { examen_id: existant.examen_id } });
    return res.status(200).json({ message: "Examen supprimé." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Centres de prélèvement
 * =================================================================== */

async function listerCentresDe(laboratoireId) {
  const centres = await prisma.centreLaboratoire.findMany({
    where: { laboratoire_id: laboratoireId },
    include: { ville: { select: { ville_id: true, nom: true } } },
    orderBy: { nom: "asc" },
  });
  const points = await geoCentre.recupererPlusieurs(centres.map((c) => c.centre_id));
  return centres.map((c) => ({ ...c, gps: points.get(c.centre_id) ?? null }));
}

function normaliserCentre(corps = {}, { partiel = false } = {}) {
  const data = {};
  for (const [champ, max, requis] of [["nom", 150, true], ["localisation", 255, true], ["telephone", 20, false], ["horaires", 255, false]]) {
    if (partiel && corps[champ] === undefined) continue;
    const v = chaine(corps[champ]);
    if (requis && !v) return { erreur: `Le champ ${champ} est requis.` };
    if (v.length > max) return { erreur: `${champ} trop long (${max} caractères maximum).` };
    data[champ] = v || null;
  }
  if (corps.ville_id !== undefined) data.ville_id = corps.ville_id || null;
  return { data };
}

async function villeDuPays(villeId, laboratoireId) {
  if (!villeId) return null;
  const [ville, labo] = await Promise.all([
    prisma.ville.findUnique({ where: { ville_id: villeId }, select: { pays_id: true } }),
    prisma.laboratoire.findUnique({ where: { laboratoire_id: laboratoireId }, select: { pays_id: true } }),
  ]);
  if (!ville) return "ville_id introuvable.";
  if (ville.pays_id !== labo?.pays_id) return "La ville doit appartenir au pays du laboratoire.";
  return null;
}

/** GET /api/laboratoires/:id/centres — PUBLIQUE. */
export async function listerCentres(req, res, next) {
  try {
    const acces = await ficheLisible(req, res, req.params.id);
    if (!acces) return undefined;
    return res.status(200).json({ centres: await listerCentresDe(req.params.id) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/laboratoires/:id/centres — { nom, localisation, ville_id?, telephone?, horaires?, latitude?, longitude? } */
export async function creerCentre(req, res, next) {
  try {
    const id = req.params.id;
    const labo = await prisma.laboratoire.findUnique({ where: { laboratoire_id: id }, select: { laboratoire_id: true } });
    if (!labo) return res.status(404).json(INTROUVABLE);
    if (!(await peutGererLaboratoire(req.utilisateur, id))) return res.status(403).json(REFUS_GESTION);
    const { erreur, data } = normaliserCentre(req.body);
    if (erreur) return res.status(400).json({ message: erreur });
    const erreurVille = await villeDuPays(data.ville_id, id);
    if (erreurVille) return res.status(400).json({ message: erreurVille });
    const centre = await prisma.centreLaboratoire.create({ data: { ...data, laboratoire_id: id } });
    const erreurGps = await geoCentre.appliquer(centre.centre_id, req.body.latitude, req.body.longitude);
    return res.status(201).json({
      message: erreurGps ? `Centre ajouté. Avertissement : ${erreurGps}` : "Centre ajouté.",
      centre: { ...centre, gps: await geoCentre.recuperer(centre.centre_id) },
    });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/centres-laboratoire/:id */
export async function modifierCentre(req, res, next) {
  try {
    const existant = await chargerGerable(req, res, "centreLaboratoire", "centre_id", "Centre");
    if (!existant) return undefined;
    const { erreur, data } = normaliserCentre(req.body, { partiel: true });
    if (erreur) return res.status(400).json({ message: erreur });
    const erreurVille = await villeDuPays(data.ville_id, existant.laboratoire_id);
    if (erreurVille) return res.status(400).json({ message: erreurVille });
    const centre = await prisma.centreLaboratoire.update({ where: { centre_id: existant.centre_id }, data });
    const erreurGps = await geoCentre.appliquer(centre.centre_id, req.body.latitude, req.body.longitude);
    if (erreurGps) return res.status(400).json({ message: erreurGps });
    return res.status(200).json({ message: "Centre mis à jour.", centre: { ...centre, gps: await geoCentre.recuperer(centre.centre_id) } });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/centres-laboratoire/:id */
export async function supprimerCentre(req, res, next) {
  try {
    const existant = await chargerGerable(req, res, "centreLaboratoire", "centre_id", "Centre");
    if (!existant) return undefined;
    await prisma.centreLaboratoire.delete({ where: { centre_id: existant.centre_id } });
    return res.status(200).json({ message: "Centre supprimé." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Avis
 * =================================================================== */

const TRIS_AVIS = {
  recent: [{ date_creation: "desc" }],
  note_haute: [{ note: "desc" }, { date_creation: "desc" }],
  note_basse: [{ note: "asc" }, { date_creation: "desc" }],
};

const presenterAvisPublic = (a) => ({
  avis_id: a.avis_id,
  note: a.note,
  commentaire: a.commentaire,
  date_creation: a.date_creation,
  auteur: auteurPublic(a.utilisateur),
});

/**
 * GET /api/laboratoires/:id/avis — PUBLIQUE (jeton facultatif) : synthèse
 * et avis publiés (?page=&limite=&tri=&note=). `mon_avis` : l'avis du
 * compte connecté, quel que soit son statut.
 */
export async function listerAvisLaboratoire(req, res, next) {
  try {
    const acces = await ficheLisible(req, res, req.params.id);
    if (!acces) return undefined;
    const id = req.params.id;
    const limite = Math.min(Math.max(Number.parseInt(req.query.limite, 10) || 5, 1), 50);
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const note = Number.parseInt(req.query.note, 10);
    const where = { laboratoire_id: id, statut_moderation: "publie" };
    if (note >= NOTE_MIN && note <= NOTE_MAX) where.note = note;

    const [notes, total, avis, monAvis] = await Promise.all([
      prisma.avisLaboratoire.findMany({ where: { laboratoire_id: id, statut_moderation: "publie" }, select: { note: true } }),
      prisma.avisLaboratoire.count({ where }),
      prisma.avisLaboratoire.findMany({
        where,
        include: { utilisateur: { select: { nom: true, prenom: true } } },
        orderBy: TRIS_AVIS[req.query.tri] ?? TRIS_AVIS.recent,
        take: limite,
        skip: (page - 1) * limite,
      }),
      req.utilisateur
        ? prisma.avisLaboratoire.findUnique({
          where: { utilisateur_id_laboratoire_id: { utilisateur_id: req.utilisateur.utilisateur_id, laboratoire_id: id } },
        })
        : null,
    ]);
    return res.status(200).json({
      resume: resumeAvis(notes),
      avis: avis.map(presenterAvisPublic),
      pagination: { page, limite, total, pages: Math.max(1, Math.ceil(total / limite)) },
      mon_avis: monAvis
        ? { avis_id: monAvis.avis_id, note: monAvis.note, commentaire: monAvis.commentaire, statut_moderation: monAvis.statut_moderation, date_creation: monAvis.date_creation }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/laboratoires/:id/avis — { note, commentaire? }, compte connecté.
 * Un avis par compte : un nouvel envoi remplace le précédent et le renvoie
 * en modération. Le gestionnaire ne peut pas noter sa propre fiche.
 */
export async function deposerAvisLaboratoire(req, res, next) {
  try {
    const id = req.params.id;
    const labo = await prisma.laboratoire.findUnique({ where: { laboratoire_id: id }, select: { statut_verification: true } });
    if (!labo || labo.statut_verification !== "publie") return res.status(404).json(INTROUVABLE);
    if (estAdminOuSuperadmin(req.utilisateur) || (await estAgentDuLaboratoire(req.utilisateur, id))) {
      return res.status(403).json({ message: "Vous ne pouvez pas déposer d'avis sur ce laboratoire." });
    }
    const note = Number(req.body?.note);
    if (!Number.isInteger(note) || note < NOTE_MIN || note > NOTE_MAX) {
      return res.status(400).json({ message: `La note doit être un entier entre ${NOTE_MIN} et ${NOTE_MAX}.` });
    }
    const commentaire = chaine(req.body?.commentaire);
    if (commentaire.length > COMMENTAIRE_AVIS_MAX) {
      return res.status(400).json({ message: `Commentaire trop long (${COMMENTAIRE_AVIS_MAX} caractères maximum).` });
    }
    const cle = { utilisateur_id: req.utilisateur.utilisateur_id, laboratoire_id: id };
    const avis = await prisma.avisLaboratoire.upsert({
      where: { utilisateur_id_laboratoire_id: cle },
      create: { ...cle, note, commentaire: commentaire || null },
      update: { note, commentaire: commentaire || null, statut_moderation: "en_attente", date_creation: new Date() },
    });
    return res.status(201).json({
      message: "Merci ! Votre avis sera publié après vérification.",
      avis: { avis_id: avis.avis_id, note: avis.note, commentaire: avis.commentaire, statut_moderation: avis.statut_moderation },
    });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/avis-laboratoire/:id — auteur ou administration. */
export async function supprimerAvisLaboratoire(req, res, next) {
  try {
    const avis = await prisma.avisLaboratoire.findUnique({ where: { avis_id: req.params.id } });
    if (!avis) return res.status(404).json({ message: "Avis introuvable." });
    if (avis.utilisateur_id !== req.utilisateur.utilisateur_id && !estAdminOuSuperadmin(req.utilisateur)) {
      return res.status(403).json({ message: "Seul l'auteur de l'avis ou un administrateur peut le supprimer." });
    }
    await prisma.avisLaboratoire.delete({ where: { avis_id: avis.avis_id } });
    return res.status(200).json({ message: "Avis supprimé." });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/avis-laboratoire — modération (?statut_moderation=&laboratoire_id=&page=&limite=).
 */
export async function listerAvisLaboratoireAdmin(req, res, next) {
  try {
    const { statut_moderation, laboratoire_id } = req.query;
    if (statut_moderation && !STATUTS_MODERATION_AVIS.includes(statut_moderation)) {
      return res.status(400).json({ message: `statut_moderation invalide. Valeurs acceptées : ${STATUTS_MODERATION_AVIS.join(", ")}.` });
    }
    const limite = Math.min(Math.max(Number.parseInt(req.query.limite, 10) || 20, 1), 100);
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const where = {};
    if (statut_moderation) where.statut_moderation = statut_moderation;
    if (laboratoire_id) where.laboratoire_id = laboratoire_id;
    const [avis, total, parStatut] = await Promise.all([
      prisma.avisLaboratoire.findMany({
        where,
        include: {
          utilisateur: { select: { nom: true, prenom: true, email: true } },
          laboratoire: { select: { laboratoire_id: true, nom: true } },
        },
        orderBy: { date_creation: "desc" },
        take: limite,
        skip: (page - 1) * limite,
      }),
      prisma.avisLaboratoire.count({ where }),
      prisma.avisLaboratoire.groupBy({ by: ["statut_moderation"], where: laboratoire_id ? { laboratoire_id } : {}, _count: { _all: true } }),
    ]);
    const compteurs = Object.fromEntries(STATUTS_MODERATION_AVIS.map((s) => [s, 0]));
    for (const l of parStatut) compteurs[l.statut_moderation] = l._count._all;
    return res.status(200).json({ avis, total, page, limite, compteurs });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/avis-laboratoire/:id — { statut_moderation } */
export async function modererAvisLaboratoire(req, res, next) {
  try {
    const { statut_moderation } = req.body ?? {};
    if (!STATUTS_MODERATION_AVIS.includes(statut_moderation)) {
      return res.status(400).json({ message: `statut_moderation invalide. Valeurs acceptées : ${STATUTS_MODERATION_AVIS.join(", ")}.` });
    }
    const avis = await prisma.avisLaboratoire.findUnique({ where: { avis_id: req.params.id } });
    if (!avis) return res.status(404).json({ message: "Avis introuvable." });
    const maj = await prisma.avisLaboratoire.update({ where: { avis_id: avis.avis_id }, data: { statut_moderation } });
    return res.status(200).json({ message: "Avis modéré.", avis: maj });
  } catch (err) {
    next(err);
  }
}
