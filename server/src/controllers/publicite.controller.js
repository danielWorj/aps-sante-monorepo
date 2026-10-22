// src/controllers/publicite.controller.js
// Module autonome "Présence, publicité & boost commercial" (diagramme
// 09_presence_publicite_boost) : emplacement_publicitaire,
// forfait_publicitaire, ligne_forfait_publicitaire, publicite.
//
// v8 : ce module a été isolé de Pharmacie. Il ne référence plus
// AUCUNE fiche annuaire (pharmacie, structure_sante, ...) : une
// publicité est portée directement par l'utilisateur qui la dépose
// (utilisateur_id) et le pays où elle est diffusée (pays_id). Les
// anciennes tables page_website / publicite_pharmacie, ainsi que
// toute notion d'"agent de la pharmacie propriétaire", ont disparu —
// voir schema.prisma.
//
// ─── Emplacements publicitaires ─────────────────────────────────
// Référentiel transverse (même patron que Langue/Devise/Pays/Ville —
// voir referentiels.controller.js) :
// Lecture : PUBLIQUE.
// Écriture (POST/PUT) : admin ou superadmin.
// Suppression : superadmin uniquement (des forfaits peuvent encore
// référencer cet emplacement).
//
// ─── Forfaits publicitaires ──────────────────────────────────────
// Catalogue commercial (durée/prix packagés par emplacement) :
// Lecture : PUBLIQUE — un utilisateur doit pouvoir choisir un forfait
// avant de soumettre sa publicité.
// Écriture (POST/PUT) : admin ou superadmin.
// Suppression : superadmin uniquement (des publicités peuvent encore
// référencer ce forfait).
//
// ─── Lignes d'avantages (ligne_forfait_publicitaire) ─────────────
// Même autorisation que le forfait parent : admin/superadmin.
//
// ─── Publicités (v9 : réservation d'espace) ───────────────────────
// Règles du cycle dans services/publicite.service.js. En bref :
// Réservation (POST) : tout utilisateur authentifié. Emplacement, pays,
// rang et prix viennent du forfait choisi, jamais du client. Toujours
// créée « en_moderation » ; le visuel arrive en multipart (« visuel »)
// et est téléversé sur Cloudinary (visuel_url = public_id).
// Modération : POST /accepter (bloque la place jusqu'au paiement) ou
// /rejeter (motif obligatoire) — message WhatsApp à l'annonceur.
// Lecture publique : uniquement les publicités payées en cours de
// diffusion, sans les informations de l'annonceur.
// Annonceur : ses demandes, statistiques et factures (portail).

import bcrypt from "bcrypt";
import prisma from "../lib/prisma.js";
import { televerserFichier, supprimerFichier } from "../lib/cloudinaryService.js";
import {
  ErreurPublicite,
  repondreSiErreurPublicite,
  avecUrlVisuel,
  vuePublique,
  jourUtc,
  versJourIso,
  trouverEmplacementDePage,
  publicitesDiffusees,
  disponibiliteForfait,
  preparerSoumission,
  validerChampsReservation,
  accepterPublicite,
  rejeterPublicite,
  annulerPublicite,
  lienPaiementPublicite,
  notifierPublicite,
} from "../services/publicite.service.js";
import {
  empreinteVisiteur,
  enregistrerEvenements,
  serieStatistiques,
  totauxParPublicite,
} from "../services/statistiquesPublicite.service.js";
import {
  EMAIL_REGEX,
  normaliserEmail,
  ouvrirSession,
  SALT_ROUNDS,
  serialiserUtilisateur,
  validerMotDePasse,
} from "../services/compte.service.js";
import { MESSAGE_CGU_REFUSEES, cguRefusees, enregistrerAcceptationsAuteur, enregistrerAcceptationsLegales } from "../services/documentLegal.service.js";

const STATUTS_PUBLICITE = ["en_moderation", "rejetee", "en_attente_paiement", "expiree", "payee", "annulee"];
// Statuts où l'annonceur n'a encore rien payé : suppression possible.
const STATUTS_SUPPRIMABLES = ["en_moderation", "rejetee", "annulee", "expiree"];
const FORMAT_CODE_PAGE = /^[A-Za-z0-9_-]{1,50}$/;
const FORMAT_DEVISE = /^[a-z]{3}$/;

function estAdmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

/** pages, nombre_places, actif d'un emplacement (seuls les champs présents). */
function lireOptionsEmplacement(corps) {
  const data = {};
  if (corps.pages !== undefined) {
    const pages = Array.isArray(corps.pages) ? corps.pages : String(corps.pages ?? "").split(",");
    const nettoyees = [...new Set(pages.map((p) => String(p).trim()).filter(Boolean))];
    if (nettoyees.some((p) => !FORMAT_CODE_PAGE.test(p))) {
      return { erreur: "pages : codes de page invalides (lettres, chiffres, « _ » ou « - »)." };
    }
    data.pages = nettoyees;
  }
  if (corps.nombre_places !== undefined) {
    const n = Number(corps.nombre_places);
    if (!Number.isInteger(n) || n < 1 || n > 10) return { erreur: "nombre_places : entier de 1 à 10." };
    data.nombre_places = n;
  }
  if (corps.actif !== undefined) data.actif = corps.actif === true || corps.actif === "true";
  return { data };
}

/** rang, pays_id, devise, actif d'un forfait (seuls les champs présents). */
async function lireOptionsForfait(corps, emplacement, existant = null) {
  const data = {};
  if (corps.rang !== undefined) {
    const r = Number(corps.rang);
    if (!Number.isInteger(r) || r < 1) return { erreur: "rang : entier >= 1." };
    data.rang = r;
  }
  const rang = data.rang ?? existant?.rang ?? 1;
  if (rang > emplacement.nombre_places) {
    return { erreur: `rang ${rang} hors du slider de cet emplacement (${emplacement.nombre_places} place(s)).` };
  }
  if (corps.pays_id !== undefined) {
    if (corps.pays_id) {
      const pays = await prisma.pays.findUnique({ where: { pays_id: corps.pays_id } });
      if (!pays) return { erreur: "pays_id introuvable." };
    }
    data.pays_id = corps.pays_id || null;
  }
  if (corps.devise !== undefined) {
    const devise = String(corps.devise).trim().toLowerCase();
    if (!FORMAT_DEVISE.test(devise)) return { erreur: "devise : code ISO à 3 lettres (ex. xaf)." };
    data.devise = devise;
  }
  if (corps.actif !== undefined) data.actif = corps.actif === true || corps.actif === "true";
  return { data };
}

/* ===================================================================
 * Emplacements publicitaires
 * =================================================================== */

/**
 * GET /api/emplacements-publicitaires
 */
export async function listerEmplacementsPublicitaires(_req, res, next) {
  try {
    const emplacements = await prisma.emplacementPublicitaire.findMany({
      orderBy: { libelle: "asc" },
    });
    return res.status(200).json({ emplacements });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/emplacements-publicitaires/:id
 */
export async function obtenirEmplacementPublicitaire(req, res, next) {
  try {
    const emplacement = await prisma.emplacementPublicitaire.findUnique({
      where: { emplacement_publicitaire_id: req.params.id },
    });
    if (!emplacement) {
      return res.status(404).json({ message: "Emplacement publicitaire introuvable." });
    }
    return res.status(200).json({ emplacement });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/emplacements-publicitaires
 */
export async function creerEmplacementPublicitaire(req, res, next) {
  try {
    const { code, libelle, description } = req.body;

    if (!code || !code.trim() || !libelle || !libelle.trim()) {
      return res.status(400).json({
        message: "Champs requis manquants : code, libelle.",
      });
    }
    const options = lireOptionsEmplacement(req.body);
    if (options.erreur) return res.status(400).json({ message: options.erreur });

    const existant = await prisma.emplacementPublicitaire.findUnique({
      where: { code: code.trim() },
    });
    if (existant) {
      return res.status(409).json({ message: "Un emplacement avec ce code existe déjà." });
    }

    const emplacement = await prisma.emplacementPublicitaire.create({
      data: {
        code: code.trim(),
        libelle: libelle.trim(),
        description: description?.trim() || null,
        ...options.data,
      },
    });

    return res.status(201).json({ message: "Emplacement créé avec succès.", emplacement });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/emplacements-publicitaires/:id
 */
export async function modifierEmplacementPublicitaire(req, res, next) {
  try {
    const { code, libelle, description } = req.body;

    const existant = await prisma.emplacementPublicitaire.findUnique({
      where: { emplacement_publicitaire_id: req.params.id },
    });
    if (!existant) {
      return res.status(404).json({ message: "Emplacement publicitaire introuvable." });
    }

    if (code && code.trim() !== existant.code) {
      const conflit = await prisma.emplacementPublicitaire.findUnique({
        where: { code: code.trim() },
      });
      if (conflit) {
        return res.status(409).json({ message: "Un emplacement avec ce code existe déjà." });
      }
    }
    const options = lireOptionsEmplacement(req.body);
    if (options.erreur) return res.status(400).json({ message: options.erreur });
    // Réduire le slider ne doit pas orpheliner des forfaits ou publicités déjà vendus.
    if (options.data.nombre_places !== undefined && options.data.nombre_places < existant.nombre_places) {
      const horsSlider = await prisma.publicite.count({
        where: {
          emplacement_publicitaire_id: existant.emplacement_publicitaire_id,
          rang: { gt: options.data.nombre_places },
          statut: { in: ["en_moderation", "en_attente_paiement", "payee"] },
        },
      });
      if (horsSlider) {
        return res.status(409).json({
          message: `Impossible de réduire le nombre de places : ${horsSlider} publicité(s) en cours occupent un rang supérieur.`,
        });
      }
    }

    const emplacement = await prisma.emplacementPublicitaire.update({
      where: { emplacement_publicitaire_id: req.params.id },
      data: {
        ...(code && { code: code.trim() }),
        ...(libelle && { libelle: libelle.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...options.data,
      },
    });

    return res.status(200).json({ message: "Emplacement mis à jour.", emplacement });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/emplacements-publicitaires/:id
 */
export async function supprimerEmplacementPublicitaire(req, res, next) {
  try {
    const emplacement = await prisma.emplacementPublicitaire.findUnique({
      where: { emplacement_publicitaire_id: req.params.id },
    });
    if (!emplacement) {
      return res.status(404).json({ message: "Emplacement publicitaire introuvable." });
    }

    const nbForfaits = await prisma.forfaitPublicitaire.count({
      where: { emplacement_publicitaire_id: req.params.id },
    });
    if (nbForfaits > 0) {
      return res.status(409).json({
        message: `Impossible de supprimer : ${nbForfaits} forfait(s) référence(nt) encore cet emplacement.`,
      });
    }

    await prisma.emplacementPublicitaire.delete({
      where: { emplacement_publicitaire_id: req.params.id },
    });
    return res.status(200).json({ message: "Emplacement supprimé." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Forfaits publicitaires
 * =================================================================== */

/**
 * GET /api/forfaits-publicitaires?emplacement_publicitaire_id=...
 */
export async function listerForfaitsPublicitaires(req, res, next) {
  try {
    const { emplacement_publicitaire_id, pays_id, code_page } = req.query;

    const where = {};
    if (emplacement_publicitaire_id) where.emplacement_publicitaire_id = emplacement_publicitaire_id;
    if (pays_id) where.pays_id = pays_id;
    // Formulaire de réservation : forfaits vendables de l'emplacement d'une page.
    if (code_page) {
      const emplacement = await trouverEmplacementDePage(prisma, code_page);
      if (!emplacement) return res.status(200).json({ forfaits: [], emplacement: null });
      where.emplacement_publicitaire_id = emplacement.emplacement_publicitaire_id;
    }
    // Hors administration : seuls les forfaits vendables sont listés.
    if (!estAdmin(req.utilisateur)) {
      Object.assign(where, { actif: true, pays_id: pays_id ?? { not: null }, emplacement_publicitaire: { actif: true } });
    }

    const forfaits = await prisma.forfaitPublicitaire.findMany({
      where,
      include: {
        lignes: { orderBy: { ordre_affichage: "asc" } },
        emplacement_publicitaire: { select: { code: true, libelle: true, nombre_places: true, pages: true, actif: true } },
        pays: { select: { pays_id: true, nom: true, code_iso2: true } },
      },
      orderBy: [{ rang: "asc" }, { duree_jours: "asc" }, { libelle: "asc" }],
    });

    return res.status(200).json({ forfaits });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/forfaits-publicitaires/:id
 */
export async function obtenirForfaitPublicitaire(req, res, next) {
  try {
    const forfait = await prisma.forfaitPublicitaire.findUnique({
      where: { forfait_publicitaire_id: req.params.id },
      include: { lignes: { orderBy: { ordre_affichage: "asc" } } },
    });
    if (!forfait) {
      return res.status(404).json({ message: "Forfait publicitaire introuvable." });
    }
    return res.status(200).json({ forfait });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/forfaits-publicitaires
 * Champ optionnel : lignes (tableau de { libelle_avantage,
 * description?, ordre_affichage? }) — créées dans la même transaction
 * que le forfait (même patron que abonnement_pharmacie, voir
 * abonnement.controller.js).
 */
export async function creerForfaitPublicitaire(req, res, next) {
  try {
    const { emplacement_publicitaire_id, libelle, prix, duree_jours, lignes } = req.body;

    if (
      !emplacement_publicitaire_id || !libelle ||
      prix === undefined || prix === null ||
      duree_jours === undefined || duree_jours === null
    ) {
      return res.status(400).json({
        message: "Champs requis manquants : emplacement_publicitaire_id, libelle, prix, duree_jours.",
      });
    }

    const emplacement = await prisma.emplacementPublicitaire.findUnique({
      where: { emplacement_publicitaire_id },
    });
    if (!emplacement) {
      return res.status(400).json({ message: "emplacement_publicitaire_id introuvable." });
    }
    const options = await lireOptionsForfait(req.body, emplacement);
    if (options.erreur) return res.status(400).json({ message: options.erreur });
    if (!(Number(prix) >= 0) || !(Number(duree_jours) >= 1)) {
      return res.status(400).json({ message: "prix (>= 0) et duree_jours (>= 1) invalides." });
    }

    if (lignes !== undefined && !Array.isArray(lignes)) {
      return res.status(400).json({ message: "lignes doit être un tableau." });
    }
    for (const ligne of lignes || []) {
      if (!ligne.libelle_avantage || !ligne.libelle_avantage.trim()) {
        return res.status(400).json({ message: "Chaque ligne requiert libelle_avantage." });
      }
    }

    const forfait = await prisma.$transaction(async (tx) => {
      const cree = await tx.forfaitPublicitaire.create({
        data: {
          emplacement_publicitaire_id,
          libelle,
          prix,
          duree_jours: Number(duree_jours),
          ...options.data,
        },
      });

      if (lignes?.length) {
        await tx.ligneForfaitPublicitaire.createMany({
          data: lignes.map((ligne, index) => ({
            forfait_publicitaire_id: cree.forfait_publicitaire_id,
            libelle_avantage: ligne.libelle_avantage.trim(),
            description: ligne.description?.trim() || null,
            ordre_affichage: ligne.ordre_affichage ?? index,
          })),
        });
      }

      return tx.forfaitPublicitaire.findUnique({
        where: { forfait_publicitaire_id: cree.forfait_publicitaire_id },
        include: { lignes: { orderBy: { ordre_affichage: "asc" } } },
      });
    });

    return res.status(201).json({ message: "Forfait créé avec succès.", forfait });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/forfaits-publicitaires/:id
 */
export async function modifierForfaitPublicitaire(req, res, next) {
  try {
    const { libelle, prix, duree_jours, emplacement_publicitaire_id } = req.body;

    const existant = await prisma.forfaitPublicitaire.findUnique({
      where: { forfait_publicitaire_id: req.params.id },
    });
    if (!existant) {
      return res.status(404).json({ message: "Forfait publicitaire introuvable." });
    }

    const emplacement = await prisma.emplacementPublicitaire.findUnique({
      where: { emplacement_publicitaire_id: emplacement_publicitaire_id || existant.emplacement_publicitaire_id },
    });
    if (!emplacement) {
      return res.status(400).json({ message: "emplacement_publicitaire_id introuvable." });
    }
    const options = await lireOptionsForfait(req.body, emplacement, existant);
    if (options.erreur) return res.status(400).json({ message: options.erreur });
    if ((prix !== undefined && !(Number(prix) >= 0)) || (duree_jours !== undefined && !(Number(duree_jours) >= 1))) {
      return res.status(400).json({ message: "prix (>= 0) et duree_jours (>= 1) invalides." });
    }
    // Les réservations déjà faites gardent leur prix, rang et période figés :
    // seuls les forfaits sans réservation changent d'emplacement, de rang ou de pays.
    const change = (c, v) => v !== undefined && String(v ?? "") !== String(existant[c] ?? "");
    const structurel =
      change("emplacement_publicitaire_id", emplacement_publicitaire_id || undefined) ||
      ["rang", "pays_id", "devise"].some((c) => change(c, options.data[c]));
    if (structurel && (await prisma.publicite.count({ where: { forfait_publicitaire_id: existant.forfait_publicitaire_id } }))) {
      return res.status(409).json({
        message: "Ce forfait a déjà des réservations : créez un nouveau forfait (et désactivez celui-ci) pour changer emplacement, rang, pays ou devise.",
      });
    }

    const forfait = await prisma.forfaitPublicitaire.update({
      where: { forfait_publicitaire_id: req.params.id },
      data: {
        ...(emplacement_publicitaire_id && { emplacement_publicitaire_id }),
        ...(libelle && { libelle }),
        ...(prix !== undefined && { prix }),
        ...(duree_jours !== undefined && { duree_jours: Number(duree_jours) }),
        ...options.data,
      },
      include: { lignes: { orderBy: { ordre_affichage: "asc" } } },
    });

    return res.status(200).json({ message: "Forfait mis à jour.", forfait });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/forfaits-publicitaires/:id
 * Les lignes rattachées sont supprimées dans la même transaction (pas
 * de ON DELETE CASCADE au niveau du schéma — même choix que le reste
 * du dépôt).
 */
export async function supprimerForfaitPublicitaire(req, res, next) {
  try {
    const forfait = await prisma.forfaitPublicitaire.findUnique({
      where: { forfait_publicitaire_id: req.params.id },
    });
    if (!forfait) {
      return res.status(404).json({ message: "Forfait publicitaire introuvable." });
    }

    const nbPublicites = await prisma.publicite.count({
      where: { forfait_publicitaire_id: req.params.id },
    });
    if (nbPublicites > 0) {
      return res.status(409).json({
        message: `Impossible de supprimer : ${nbPublicites} publicité(s) référence(nt) encore ce forfait.`,
      });
    }

    await prisma.$transaction([
      prisma.ligneForfaitPublicitaire.deleteMany({ where: { forfait_publicitaire_id: req.params.id } }),
      prisma.forfaitPublicitaire.delete({ where: { forfait_publicitaire_id: req.params.id } }),
    ]);

    return res.status(200).json({ message: "Forfait supprimé." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Lignes d'avantages (ligne_forfait_publicitaire)
 * =================================================================== */

/**
 * POST /api/forfaits-publicitaires/:id/lignes
 */
export async function ajouterLigneForfait(req, res, next) {
  try {
    const { libelle_avantage, description, ordre_affichage } = req.body;

    if (!libelle_avantage || !libelle_avantage.trim()) {
      return res.status(400).json({ message: "Champ requis manquant : libelle_avantage." });
    }

    const forfait = await prisma.forfaitPublicitaire.findUnique({
      where: { forfait_publicitaire_id: req.params.id },
    });
    if (!forfait) {
      return res.status(404).json({ message: "Forfait publicitaire introuvable." });
    }

    const ligne = await prisma.ligneForfaitPublicitaire.create({
      data: {
        forfait_publicitaire_id: req.params.id,
        libelle_avantage: libelle_avantage.trim(),
        description: description?.trim() || null,
        ordre_affichage: ordre_affichage ?? 0,
      },
    });

    return res.status(201).json({ message: "Ligne ajoutée.", ligne });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/lignes-forfait-publicitaire/:ligneId
 */
export async function modifierLigneForfait(req, res, next) {
  try {
    const ligne = await prisma.ligneForfaitPublicitaire.findUnique({
      where: { ligne_id: req.params.ligneId },
    });
    if (!ligne) {
      return res.status(404).json({ message: "Ligne introuvable." });
    }

    const { libelle_avantage, description, ordre_affichage } = req.body;

    const ligneMiseAJour = await prisma.ligneForfaitPublicitaire.update({
      where: { ligne_id: req.params.ligneId },
      data: {
        ...(libelle_avantage && { libelle_avantage: libelle_avantage.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(ordre_affichage !== undefined && { ordre_affichage }),
      },
    });

    return res.status(200).json({ message: "Ligne mise à jour.", ligne: ligneMiseAJour });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/lignes-forfait-publicitaire/:ligneId
 */
export async function supprimerLigneForfait(req, res, next) {
  try {
    const ligne = await prisma.ligneForfaitPublicitaire.findUnique({
      where: { ligne_id: req.params.ligneId },
    });
    if (!ligne) {
      return res.status(404).json({ message: "Ligne introuvable." });
    }

    await prisma.ligneForfaitPublicitaire.delete({ where: { ligne_id: req.params.ligneId } });
    return res.status(200).json({ message: "Ligne supprimée." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Publicités (v9 : réservation d'espace)
 * =================================================================== */

const INCLUDE_DETAIL = {
  emplacement_publicitaire: { select: { code: true, libelle: true, nombre_places: true } },
  forfait_publicitaire: { select: { libelle: true, duree_jours: true, rang: true } },
  pays: { select: { pays_id: true, nom: true, code_iso2: true } },
  facture: { select: { facture_id: true, numero: true, date_emission: true } },
};

/** Vue complète (annonceur ou administration). */
function vueDetail(p, totaux) {
  return {
    ...avecUrlVisuel(p),
    date_debut: versJourIso(p.date_debut),
    date_fin: versJourIso(p.date_fin),
    statistiques: totaux ?? { impressions: 0, clics: 0 },
    lien_paiement: p.statut === "en_attente_paiement" ? lienPaiementPublicite(p.publicite_id) : null,
    en_diffusion: estDiffusee(p),
  };
}

function estDiffusee(p, maintenant = new Date()) {
  const j = jourUtc(maintenant);
  return p.statut === "payee" && jourUtc(p.date_debut) <= j && jourUtc(p.date_fin) > j;
}

/** Publicité lisible par l'utilisateur connecté (annonceur ou admin), sinon ErreurPublicite. */
async function chargerPubliciteAutorisee(req, include = INCLUDE_DETAIL) {
  const pub = await prisma.publicite.findUnique({ where: { publicite_id: req.params.id }, include });
  if (!pub) throw new ErreurPublicite(404, "PUBLICITE_INTROUVABLE", "Publicité introuvable.");
  if (!estAdmin(req.utilisateur) && pub.utilisateur_id !== req.utilisateur?.utilisateur_id) {
    throw new ErreurPublicite(403, "ACCES_REFUSE", "Cette publicité ne vous appartient pas.");
  }
  return pub;
}

function repondreErreur(err, res, next) {
  if (repondreSiErreurPublicite(err, res)) return;
  next(err);
}

/**
 * GET /api/publicites
 * Administration : toutes les réservations, filtres ?statut= &emplacement_publicitaire_id=
 * &pays_id= &forfait_publicitaire_id= &recherche= (titre, annonceur), avec compteurs par statut.
 * Public : uniquement les publicités en cours de diffusion (vue publique).
 */
export async function listerPublicites(req, res, next) {
  try {
    const { forfait_publicitaire_id, emplacement_publicitaire_id, pays_id, statut, recherche } = req.query;
    const where = {};
    if (forfait_publicitaire_id) where.forfait_publicitaire_id = forfait_publicitaire_id;
    if (emplacement_publicitaire_id) where.emplacement_publicitaire_id = emplacement_publicitaire_id;
    if (pays_id) where.pays_id = pays_id;

    if (!estAdmin(req.utilisateur)) {
      const j = jourUtc();
      const publicites = await prisma.publicite.findMany({
        where: { ...where, statut: "payee", date_debut: { lte: j }, date_fin: { gt: j } },
        orderBy: [{ rang: "asc" }, { date_debut: "asc" }],
      });
      return res.status(200).json({ publicites: publicites.map(vuePublique) });
    }

    if (statut) {
      if (!STATUTS_PUBLICITE.includes(statut)) {
        return res.status(400).json({ message: `statut invalide. Valeurs acceptées : ${STATUTS_PUBLICITE.join(", ")}.` });
      }
      where.statut = statut;
    }
    if (recherche) {
      const r = String(recherche).trim();
      where.OR = [
        { titre: { contains: r, mode: "insensitive" } },
        { annonceur_nom: { contains: r, mode: "insensitive" } },
        { annonceur_entreprise: { contains: r, mode: "insensitive" } },
      ];
    }

    const [publicites, groupes] = await Promise.all([
      prisma.publicite.findMany({
        where,
        include: { ...INCLUDE_DETAIL, utilisateur: { select: { utilisateur_id: true, nom: true, prenom: true, email: true, telephone: true } } },
        orderBy: { date_soumission: "desc" },
        take: 500,
      }),
      prisma.publicite.groupBy({ by: ["statut"], _count: { _all: true } }),
    ]);
    const totaux = await totauxParPublicite(publicites.map((p) => p.publicite_id));
    return res.status(200).json({
      publicites: publicites.map((p) => vueDetail(p, totaux.get(p.publicite_id))),
      compteurs: Object.fromEntries(groupes.map((g) => [g.statut, g._count._all])),
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/publicites/:id — annonceur/admin : détail complet ; public : publicité diffusée. */
export async function obtenirPublicite(req, res, next) {
  try {
    const pub = await prisma.publicite.findUnique({ where: { publicite_id: req.params.id }, include: INCLUDE_DETAIL });
    if (!pub) return res.status(404).json({ message: "Publicité introuvable." });
    if (estAdmin(req.utilisateur) || pub.utilisateur_id === req.utilisateur?.utilisateur_id) {
      const totaux = await totauxParPublicite([pub.publicite_id]);
      return res.status(200).json({ publicite: vueDetail(pub, totaux.get(pub.publicite_id)) });
    }
    if (!estDiffusee(pub)) return res.status(404).json({ message: "Publicité introuvable." });
    return res.status(200).json({ publicite: vuePublique(pub) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/publicites/par-page/:code?pays_id=
 * Slider d'une page : publicités diffusées aujourd'hui, par rang (1 = la
 * plus chère, affichée en premier), et si l'espace peut être réservé.
 * Le code peut être celui de l'emplacement ou une page de son groupe.
 */
export async function rechercherPublicitesParCodePage(req, res, next) {
  try {
    const resultat = await publicitesDiffusees({ code: req.params.code, pays_id: req.query.pays_id || null });
    if (!resultat) {
      return res.status(404).json({ message: "Aucun emplacement publicitaire ne correspond à ce code." });
    }
    return res.status(200).json(resultat);
  } catch (err) {
    next(err);
  }
}

/** GET /api/publicites/disponibilites?forfait_publicitaire_id= — périodes prises et prochaine date libre. */
export async function obtenirDisponibilites(req, res, next) {
  try {
    if (!req.query.forfait_publicitaire_id) {
      return res.status(400).json({ message: "Paramètre requis : forfait_publicitaire_id." });
    }
    return res.status(200).json(await disponibiliteForfait(req.query.forfait_publicitaire_id));
  } catch (err) {
    repondreErreur(err, res, next);
  }
}

/**
 * GET /api/publicites/profil-annonceur — pré-remplissage du formulaire :
 * informations de la dernière réservation, sinon celles du compte.
 */
export async function obtenirProfilAnnonceur(req, res, next) {
  try {
    const [derniere, compte] = await Promise.all([
      prisma.publicite.findFirst({
        where: { utilisateur_id: req.utilisateur.utilisateur_id, annonceur_nom: { not: null } },
        orderBy: { date_soumission: "desc" },
        select: { annonceur_nom: true, annonceur_entreprise: true, annonceur_telephone: true, annonceur_email: true },
      }),
      prisma.utilisateur.findUnique({
        where: { utilisateur_id: req.utilisateur.utilisateur_id },
        select: { nom: true, prenom: true, email: true, telephone: true, pays_id: true },
      }),
    ]);
    return res.status(200).json({
      annonceur: derniere ?? {
        annonceur_nom: [compte?.prenom, compte?.nom].filter(Boolean).join(" ") || null,
        annonceur_entreprise: null,
        annonceur_telephone: compte?.telephone ?? null,
        annonceur_email: compte?.email ?? null,
      },
      pays_id: compte?.pays_id ?? null,
    });
  } catch (err) {
    next(err);
  }
}

const MAX_EN_MODERATION_PAR_UTILISATEUR = 5;

/**
 * POST /api/publicites — réservation d'un espace (multipart/form-data).
 * Champs : forfait_publicitaire_id, date_debut (AAAA-MM-JJ), titre,
 * description, telephone_contact, email_contact?, localisation?,
 * annonceur_nom, annonceur_entreprise?, annonceur_telephone, annonceur_email?,
 * fichier « visuel » (flyer/image). Emplacement, pays, rang et prix sont
 * déduits du forfait (jamais fournis par le client). Toujours créée
 * « en_moderation » : rien n'est payé ni bloqué avant l'acceptation.
 */
export async function creerPublicite(req, res, next) {
  try {
    if (cguRefusees(req.body)) {
      return res.status(400).json({ message: MESSAGE_CGU_REFUSEES });
    }
    const champs = validerChampsReservation(req.body);
    const fichierVisuel = req.files?.visuel?.[0];
    if (!fichierVisuel) {
      return res.status(400).json({ code: "VISUEL_REQUIS", message: "Fichier requis manquant : visuel (flyer ou image)." });
    }
    const enCours = await prisma.publicite.count({
      where: { utilisateur_id: req.utilisateur.utilisateur_id, statut: "en_moderation" },
    });
    if (enCours >= MAX_EN_MODERATION_PAR_UTILISATEUR) {
      return res.status(429).json({
        code: "TROP_DE_DEMANDES",
        message: `Vous avez déjà ${enCours} demandes en cours d'examen : attendez leur traitement.`,
      });
    }

    const { forfait, debut, fin } = await preparerSoumission({
      forfait_publicitaire_id: req.body.forfait_publicitaire_id,
      date_debut: req.body.date_debut,
    });

    // Téléversement après les validations métier (même patron que pharmacie.controller.js).
    const upload = await televerserFichier(fichierVisuel.buffer, "publicites");

    const publicite = await prisma.publicite.create({
      data: {
        ...champs,
        forfait_publicitaire_id: forfait.forfait_publicitaire_id,
        emplacement_publicitaire_id: forfait.emplacement_publicitaire_id,
        pays_id: forfait.pays_id,
        rang: forfait.rang,
        utilisateur_id: req.utilisateur.utilisateur_id,
        visuel_url: upload.nom,
        date_debut: debut,
        date_fin: fin,
        montant: forfait.prix,
        devise: forfait.devise,
        statut: "en_moderation",
        statut_moderation: "en_attente",
      },
      include: INCLUDE_DETAIL,
    });

    // Accusé de réception WhatsApp : pas attendu (l'appel Meta peut durer
    // 15 s) ; notifierPublicite ne lève jamais et journalise l'échec.
    void notifierPublicite("publicite_soumise", publicite.publicite_id);

    await enregistrerAcceptationsAuteur(req, "reservation_publicite");

    return res.status(201).json({
      message: "Demande envoyée. Vous recevrez la décision par WhatsApp.",
      publicite: vueDetail(publicite),
    });
  } catch (err) {
    repondreErreur(err, res, next);
  }
}

// Rôle des comptes créés depuis le formulaire de réservation. Créé à la
// volée s'il manque (donnée de référence, idempotent) : la réservation ne
// doit pas échouer parce que la table `role` n'a pas encore été amorcée.
const LIBELLE_ROLE_ANNONCEUR = "annonceur";

/**
 * POST /api/publicites/reservation-avec-compte — PUBLIC (multipart/form-data).
 * Réservation par un visiteur sans compte : crée le compte « annonceur »
 * ET la demande de publicité dans une seule transaction, puis ouvre la
 * session (comme un login) pour qu'il suive sa demande dans son espace.
 * Champs : ceux de POST /api/publicites + compte_prenom, compte_nom,
 * compte_email, mot_de_passe. Le pays du compte est celui du forfait choisi ;
 * le téléphone du compte est le WhatsApp de l'annonceur.
 * Un email déjà utilisé → 409 COMPTE_EXISTANT : l'utilisateur doit se
 * connecter (« Rejoindre mon espace ») puis réserver depuis son compte.
 */
export async function reserverAvecCompte(req, res, next) {
  try {
    if (cguRefusees(req.body)) {
      return res.status(400).json({ message: MESSAGE_CGU_REFUSEES });
    }
    const prenom = String(req.body.compte_prenom ?? "").trim();
    const nom = String(req.body.compte_nom ?? "").trim();
    const emailBrut = String(req.body.compte_email ?? "").trim();
    if (!prenom || !nom || !emailBrut || !req.body.mot_de_passe) {
      return res.status(400).json({
        code: "CHAMPS_REQUIS",
        message: "Champs requis manquants pour le compte : prénom, nom, email et mot de passe.",
      });
    }
    if (prenom.length > 100 || nom.length > 100) {
      return res.status(400).json({ code: "CHAMP_TROP_LONG", message: "Nom et prénom : 100 caractères maximum." });
    }
    const email = normaliserEmail(emailBrut);
    if (!EMAIL_REGEX.test(email)) return res.status(400).json({ code: "EMAIL_INVALIDE", message: "Email du compte invalide." });
    const erreurMotDePasse = validerMotDePasse(req.body.mot_de_passe);
    if (erreurMotDePasse) return res.status(400).json({ code: "MOT_DE_PASSE_INVALIDE", message: erreurMotDePasse });

    const champs = validerChampsReservation({ ...req.body, annonceur_email: req.body.annonceur_email || email });
    const fichierVisuel = req.files?.visuel?.[0];
    if (!fichierVisuel) {
      return res.status(400).json({ code: "VISUEL_REQUIS", message: "Fichier requis manquant : visuel (flyer ou image)." });
    }

    const compteExistant = () => res.status(409).json({
      code: "COMPTE_EXISTANT",
      message: "Un compte existe déjà avec cet email : cliquez sur « Rejoindre mon espace » pour vous connecter.",
    });
    if (await prisma.utilisateur.findUnique({ where: { email }, select: { utilisateur_id: true } })) return compteExistant();

    const { forfait, debut, fin } = await preparerSoumission({
      forfait_publicitaire_id: req.body.forfait_publicitaire_id,
      date_debut: req.body.date_debut,
    });
    const motDePasseHash = await bcrypt.hash(req.body.mot_de_passe, SALT_ROUNDS);
    const visuelTeleverse = await televerserFichier(fichierVisuel.buffer, "publicites");

    let utilisateur;
    let publicite;
    try {
      ({ utilisateur, publicite } = await prisma.$transaction(async (tx) => {
        const role = await tx.role.upsert({
          where: { libelle: LIBELLE_ROLE_ANNONCEUR },
          update: {},
          create: { libelle: LIBELLE_ROLE_ANNONCEUR, description: "Annonceur (réservation d'espaces publicitaires)" },
        });
        const compte = await tx.utilisateur.create({
          data: {
            nom,
            prenom,
            email,
            telephone: champs.annonceur_telephone,
            mot_de_passe_hash: motDePasseHash,
            role_id: role.role_id,
            pays_id: forfait.pays_id,
            statut_compte: "actif",
          },
          include: { role: true },
        });
        const pub = await tx.publicite.create({
          data: {
            ...champs,
            forfait_publicitaire_id: forfait.forfait_publicitaire_id,
            emplacement_publicitaire_id: forfait.emplacement_publicitaire_id,
            pays_id: forfait.pays_id,
            rang: forfait.rang,
            utilisateur_id: compte.utilisateur_id,
            visuel_url: visuelTeleverse.nom,
            date_debut: debut,
            date_fin: fin,
            montant: forfait.prix,
            devise: forfait.devise,
            statut: "en_moderation",
            statut_moderation: "en_attente",
          },
          include: INCLUDE_DETAIL,
        });
        return { utilisateur: compte, publicite: pub };
      }));
    } catch (err) {
      // Course : le même email a été inscrit entre la vérification et la création.
      if (err?.code === "P2002") return compteExistant();
      throw err;
    } finally {
      // Rien n'a été créé : le visuel téléversé ne doit pas rester orphelin.
      if (!publicite) await supprimerFichier(visuelTeleverse.nom).catch(() => {});
    }

    void notifierPublicite("publicite_soumise", publicite.publicite_id);

    await enregistrerAcceptationsLegales({
      utilisateurId: utilisateur.utilisateur_id, req, contexte: "reservation_publicite",
    });

    const accessToken = await ouvrirSession(req, res, utilisateur);
    return res.status(201).json({
      message: "Compte créé et demande envoyée. Vous recevrez la décision par WhatsApp.",
      publicite: vueDetail(publicite),
      access_token: accessToken,
      utilisateur: serialiserUtilisateur(utilisateur),
    });
  } catch (err) {
    repondreErreur(err, res, next);
  }
}

/**
 * PUT /api/publicites/:id (multipart, « visuel » facultatif)
 *   - annonceur : contenu, contacts, date de début et visuel, tant que la
 *     demande est « en_moderation » ;
 *   - administration : correction du contenu affiché (titre, description,
 *     contacts) à tout moment. La décision passe par /accepter et /rejeter.
 */
export async function modifierPublicite(req, res, next) {
  try {
    if (req.body.statut_moderation !== undefined || req.body.statut !== undefined) {
      return res.status(400).json({
        code: "MODERATION_DEDIEE",
        message: "La modération se fait par POST /publicites/:id/accepter ou /rejeter.",
      });
    }
    const pub = await chargerPubliciteAutorisee(req);
    const admin = estAdmin(req.utilisateur);
    const auteur = pub.utilisateur_id === req.utilisateur.utilisateur_id;
    if (!admin && pub.statut !== "en_moderation") {
      return res.status(409).json({ message: "Cette demande a déjà été traitée : son contenu ne peut plus être modifié." });
    }

    const permis = ["titre", "description", "telephone_contact", "email_contact", "localisation",
      "annonceur_nom", "annonceur_entreprise", "annonceur_telephone", "annonceur_email"];
    const fournis = Object.fromEntries(permis.filter((c) => req.body[c] !== undefined).map((c) => [c, req.body[c]]));
    const donnees = validerChampsReservation(fournis, { partiel: true });

    if (req.body.date_debut && pub.statut === "en_moderation" && (auteur || admin)) {
      const { debut, fin } = await preparerSoumission({ forfait_publicitaire_id: pub.forfait_publicitaire_id, date_debut: req.body.date_debut });
      Object.assign(donnees, { date_debut: debut, date_fin: fin });
    }

    const fichierVisuel = req.files?.visuel?.[0];
    if (fichierVisuel) {
      const upload = await televerserFichier(fichierVisuel.buffer, "publicites");
      await supprimerFichier(pub.visuel_url);
      donnees.visuel_url = upload.nom;
    }
    if (!Object.keys(donnees).length) return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });

    const maj = await prisma.publicite.update({ where: { publicite_id: pub.publicite_id }, data: donnees, include: INCLUDE_DETAIL });
    return res.status(200).json({ message: "Publicité mise à jour.", publicite: vueDetail(maj) });
  } catch (err) {
    repondreErreur(err, res, next);
  }
}

/**
 * DELETE /api/publicites/:id
 *   - annonceur : demande jamais payée uniquement (en modération, rejetée,
 *     annulée ou expirée, sans transaction).
 *   - admin/superadmin : toute publicité. Sans historique de paiement, elle
 *     est effacée ; sinon (payée, ou paiement engagé) elle est retirée de la
 *     diffusion (statut « annulee ») et conservée avec sa facture.
 */
export async function supprimerPublicite(req, res, next) {
  try {
    const pub = await chargerPubliciteAutorisee(req);
    const admin = estAdmin(req.utilisateur);
    if (!admin && !STATUTS_SUPPRIMABLES.includes(pub.statut)) {
      return res.status(409).json({ message: `Une publicité au statut « ${pub.statut} » ne peut pas être supprimée.` });
    }
    const transactions = await prisma.transactionPaiement.count({ where: { publicite_id_cible: pub.publicite_id } });
    if (transactions || pub.facture) {
      if (!admin) {
        return res.status(409).json({ message: "Cette publicité a un historique de paiement : elle est conservée." });
      }
      if (pub.statut === "annulee") {
        return res.status(409).json({ message: "Publicité déjà retirée : son historique de paiement est conservé." });
      }
      await prisma.publicite.update({
        where: { publicite_id: pub.publicite_id },
        data: {
          statut: "annulee",
          date_limite_paiement: null,
          motif_rejet: pub.motif_rejet ?? "Retirée par l'administration.",
          moderateur_id: req.utilisateur.utilisateur_id,
          date_moderation: new Date(),
        },
      });
      return res.status(200).json({
        retiree: true,
        message: "Publicité retirée de la diffusion. Elle a un historique de paiement : elle est conservée (onglet Annulée) avec sa facture.",
      });
    }
    await prisma.publicite.delete({ where: { publicite_id: pub.publicite_id } });
    await supprimerFichier(pub.visuel_url);
    return res.status(200).json({ message: "Publicité supprimée." });
  } catch (err) {
    repondreErreur(err, res, next);
  }
}

/** POST /api/publicites/:id/accepter   body: { date_debut? } (admin) */
export async function accepterPubliciteCtrl(req, res, next) {
  try {
    await accepterPublicite({ publicite_id: req.params.id, admin_id: req.utilisateur.utilisateur_id, date_debut: req.body?.date_debut });
    const pub = await prisma.publicite.findUnique({ where: { publicite_id: req.params.id }, include: INCLUDE_DETAIL });
    return res.status(200).json({ message: "Publicité acceptée : l'annonceur a été notifié par WhatsApp.", publicite: vueDetail(pub) });
  } catch (err) {
    repondreErreur(err, res, next);
  }
}

/** POST /api/publicites/:id/rejeter   body: { motif } (admin) */
export async function rejeterPubliciteCtrl(req, res, next) {
  try {
    await rejeterPublicite({ publicite_id: req.params.id, admin_id: req.utilisateur.utilisateur_id, motif: req.body?.motif });
    const pub = await prisma.publicite.findUnique({ where: { publicite_id: req.params.id }, include: INCLUDE_DETAIL });
    return res.status(200).json({ message: "Publicité rejetée : le motif a été envoyé par WhatsApp.", publicite: vueDetail(pub) });
  } catch (err) {
    repondreErreur(err, res, next);
  }
}

/** POST /api/publicites/:id/annuler — l'annonceur retire sa demande avant paiement. */
export async function annulerPubliciteCtrl(req, res, next) {
  try {
    await annulerPublicite({ publicite_id: req.params.id, utilisateur_id: req.utilisateur.utilisateur_id });
    return res.status(200).json({ message: "Demande annulée." });
  } catch (err) {
    repondreErreur(err, res, next);
  }
}

/* ===================================================================
 * Portail annonceur et statistiques
 * =================================================================== */

/** GET /api/publicites/mes-publicites — réservations de l'utilisateur connecté, avec totaux. */
export async function listerMesPublicites(req, res, next) {
  try {
    const publicites = await prisma.publicite.findMany({
      where: { utilisateur_id: req.utilisateur.utilisateur_id },
      include: INCLUDE_DETAIL,
      orderBy: { date_soumission: "desc" },
    });
    const totaux = await totauxParPublicite(publicites.map((p) => p.publicite_id));
    const vues = publicites.map((p) => vueDetail(p, totaux.get(p.publicite_id)));
    return res.status(200).json({
      publicites: vues,
      resume: {
        total: vues.length,
        en_diffusion: vues.filter((p) => p.en_diffusion).length,
        a_payer: vues.filter((p) => p.statut === "en_attente_paiement").length,
        impressions: vues.reduce((s, p) => s + p.statistiques.impressions, 0),
        clics: vues.reduce((s, p) => s + p.statistiques.clics, 0),
      },
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/publicites/:id/statistiques — série jour par jour (annonceur ou admin). */
export async function obtenirStatistiquesPublicite(req, res, next) {
  try {
    const pub = await chargerPubliciteAutorisee(req);
    return res.status(200).json({ publicite_id: pub.publicite_id, ...(await serieStatistiques(pub)) });
  } catch (err) {
    repondreErreur(err, res, next);
  }
}

/**
 * POST /api/publicites/evenements   body: { type: "impression"|"clic", publicite_ids: [...] }
 * Public, sans réponse utile (204) : un suivi ne doit jamais gêner l'affichage.
 */
export async function enregistrerEvenementsPublicite(req, res) {
  try {
    await enregistrerEvenements({
      type: req.body?.type,
      publicite_ids: req.body?.publicite_ids,
      empreinte: empreinteVisiteur(req.ip, req.get("user-agent")),
    });
  } catch (err) {
    console.error("[publicite] Enregistrement d'événements impossible :", err.message);
  }
  return res.status(204).end();
}
