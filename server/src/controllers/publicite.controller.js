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
// ─── Publicités ───────────────────────────────────────────────────
// Même patron de modération que avis_pharmacie (voir
// avis.controller.js) :
// Lecture : PUBLIQUE, mais un visiteur non authentifié (ou tout
// utilisateur qui n'est ni l'auteur ni admin/superadmin) ne voit que
// les publicités au statut "validee".
// Création : tout utilisateur authentifié, quel que soit son rôle.
// Toujours créée "en_attente", quelle que soit la valeur envoyée
// (aucun rôle ne peut publier directement sa propre publicité).
// L'utilisateur fournit DIRECTEMENT emplacement_publicitaire_id (plus
// d'enum zone_affichage — emplacement_publicitaire est une table pure
// de référence, voir schema.prisma), en plus de forfait_publicitaire_id
// (qui fixe prix/durée) : les deux doivent correspondre au même
// emplacement, vérifié à la création.
// Le visuel n'est plus un champ texte libre : il est envoyé en
// multipart/form-data (champ "visuel") et téléversé sur
// Cloudinary (voir lib/cloudinaryService.js, même patron que
// pharmacie.controller.js) ; le "nom" (public_id) renvoyé par
// Cloudinary est stocké dans visuel_url.
// Modification : l'auteur peut corriger titre/visuel (nouveau
// fichier)/dates tant que la publicité n'a pas encore
// été modérée (statut "en_attente" seulement). Un admin/superadmin
// peut à tout moment changer statut_moderation.
// Suppression : l'auteur (quel que soit le statut) ou admin/superadmin.

import prisma from "../lib/prisma.js";
import { televerserFichier, supprimerFichier, construireUrl } from "../lib/cloudinaryService.js";

const STATUTS_MODERATION_PUBLICITE = ["en_attente", "validee", "rejetee"];

/**
 * Convertit le "nom" Cloudinary (public_id, ex.
 * "aps/structures-sante/publicites/xxx.jpg") stocké tel quel dans la
 * colonne `visuel_url` en une véritable URL publique
 * (https://res.cloudinary.com/…) exploitable directement par le
 * frontend (`<img src={publicite.visuel_url}>`).
 *
 * Même principe que `avecUrlsFichiers()` dans pharmacie.controller.js
 * (et le même besoin existe pour centre_sante) : le frontend ne doit
 * jamais avoir à connaître la logique Cloudinary, seulement consommer
 * une URL prête à l'emploi. Sans cette étape, l'API renvoyait le
 * public_id brut, pas une URL — d'où le visuel jamais affiché
 * (icône d'image brisée) malgré un téléversement Cloudinary réussi.
 *
 * À appliquer uniquement juste avant de sérialiser une publicité en
 * JSON pour la réponse HTTP : en interne (suppression de l'ancien
 * fichier, etc.) on continue de manipuler le "nom" brut tel que lu en
 * base.
 */
function avecUrlVisuel(publicite) {
  return { ...publicite, visuel_url: construireUrl(publicite.visuel_url) };
}

function estAdmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

/**
 * Un visiteur public (ou un utilisateur authentifié qui n'est ni
 * l'auteur ni admin/superadmin) ne doit jamais voir une publicité non
 * encore validée.
 */
function filtrerSelonVisibilite(publicite, utilisateurCourant) {
  if (publicite.statut_moderation === "validee") return true;
  if (!utilisateurCourant) return false;
  if (estAdmin(utilisateurCourant)) return true;
  return publicite.utilisateur_id === utilisateurCourant.utilisateur_id;
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

    const emplacement = await prisma.emplacementPublicitaire.update({
      where: { emplacement_publicitaire_id: req.params.id },
      data: {
        ...(code && { code: code.trim() }),
        ...(libelle && { libelle: libelle.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
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
    const { emplacement_publicitaire_id } = req.query;

    const where = {};
    if (emplacement_publicitaire_id) where.emplacement_publicitaire_id = emplacement_publicitaire_id;

    const forfaits = await prisma.forfaitPublicitaire.findMany({
      where,
      include: { lignes: { orderBy: { ordre_affichage: "asc" } } },
      orderBy: { libelle: "asc" },
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

    if (emplacement_publicitaire_id) {
      const emplacement = await prisma.emplacementPublicitaire.findUnique({
        where: { emplacement_publicitaire_id },
      });
      if (!emplacement) {
        return res.status(400).json({ message: "emplacement_publicitaire_id introuvable." });
      }
    }

    const forfait = await prisma.forfaitPublicitaire.update({
      where: { forfait_publicitaire_id: req.params.id },
      data: {
        ...(emplacement_publicitaire_id && { emplacement_publicitaire_id }),
        ...(libelle && { libelle }),
        ...(prix !== undefined && { prix }),
        ...(duree_jours !== undefined && { duree_jours: Number(duree_jours) }),
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
 * Publicités
 * =================================================================== */

/**
 * GET /api/publicites
 * Filtres optionnels : ?forfait_publicitaire_id=...&emplacement_publicitaire_id=...&pays_id=...&statut_moderation=...
 * statut_moderation n'est pris en compte que pour un admin/superadmin
 * authentifié — un visiteur public reçoit toujours uniquement les
 * publicités "validee", quel que soit le filtre envoyé.
 */
export async function listerPublicites(req, res, next) {
  try {
    const { forfait_publicitaire_id, emplacement_publicitaire_id, pays_id, statut_moderation } = req.query;

    if (statut_moderation && !STATUTS_MODERATION_PUBLICITE.includes(statut_moderation)) {
      return res.status(400).json({
        message: `statut_moderation invalide. Valeurs acceptées : ${STATUTS_MODERATION_PUBLICITE.join(", ")}.`,
      });
    }

    const where = {};
    if (forfait_publicitaire_id) where.forfait_publicitaire_id = forfait_publicitaire_id;
    if (emplacement_publicitaire_id) where.emplacement_publicitaire_id = emplacement_publicitaire_id;
    if (pays_id) where.pays_id = pays_id;

    if (estAdmin(req.utilisateur)) {
      if (statut_moderation) where.statut_moderation = statut_moderation;
    } else {
      where.statut_moderation = "validee";
    }

    const publicites = await prisma.publicite.findMany({
      where,
      orderBy: { date_debut: "desc" },
    });

    return res.status(200).json({ publicites: publicites.map(avecUrlVisuel) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/publicites/:id
 */
export async function obtenirPublicite(req, res, next) {
  try {
    const publicite = await prisma.publicite.findUnique({
      where: { publicite_id: req.params.id },
    });
    if (!publicite || !filtrerSelonVisibilite(publicite, req.utilisateur)) {
      return res.status(404).json({ message: "Publicité introuvable." });
    }

    return res.status(200).json({ publicite: avecUrlVisuel(publicite) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/publicites
 * multipart/form-data — champ fichier "visuel" obligatoire
 * (voir publicite.routes.js, middleware gererTeleversementPublicite),
 * en plus des champs texte habituels. Réservé aux utilisateurs
 * authentifiés, quel que soit leur rôle. statut_moderation est
 * toujours forcé à "en_attente" à la création, quel que soit le rôle —
 * aucun utilisateur ne peut publier directement sa propre publicité
 * (même patron que avis.controller.js).
 */
export async function creerPublicite(req, res, next) {
  try {
    const {
      forfait_publicitaire_id,
      emplacement_publicitaire_id,
      pays_id,
      titre,
      date_debut,
      date_fin,
    } = req.body;

    if (
      !forfait_publicitaire_id || !emplacement_publicitaire_id || !pays_id || !titre ||
      !date_debut || !date_fin
    ) {
      return res.status(400).json({
        message:
          "Champs requis manquants : forfait_publicitaire_id, emplacement_publicitaire_id, pays_id, titre, date_debut, date_fin.",
      });
    }

    // Le visuel est obligatoire et arrive en multipart/form-data —
    // jamais en texte libre depuis le client (voir en-tête de fichier).
    const fichierVisuel = req.files?.visuel?.[0];
    if (!fichierVisuel) {
      return res.status(400).json({
        message: "Fichier requis manquant : visuel (image de la publicité).",
      });
    }

    const [forfait, emplacement, pays] = await Promise.all([
      prisma.forfaitPublicitaire.findUnique({ where: { forfait_publicitaire_id } }),
      prisma.emplacementPublicitaire.findUnique({ where: { emplacement_publicitaire_id } }),
      prisma.pays.findUnique({ where: { pays_id } }),
    ]);
    if (!forfait) {
      return res.status(400).json({ message: "forfait_publicitaire_id introuvable." });
    }
    if (!emplacement) {
      return res.status(400).json({ message: "emplacement_publicitaire_id introuvable." });
    }
    if (!pays) {
      return res.status(400).json({ message: "pays_id introuvable." });
    }
    // Cohérence : le forfait choisi packages déjà un emplacement précis
    // (voir forfait_publicitaire.emplacement_publicitaire_id) — on
    // refuse qu'un client fasse diverger les deux.
    if (forfait.emplacement_publicitaire_id !== emplacement_publicitaire_id) {
      return res.status(400).json({
        message: "emplacement_publicitaire_id ne correspond pas à l'emplacement du forfait choisi.",
      });
    }

    // Téléversement Cloudinary — après les validations métier, pour ne
    // pas envoyer inutilement le fichier si la requête est invalide
    // (même patron que pharmacie.controller.js).
    const uploadVisuel = await televerserFichier(fichierVisuel.buffer, "publicites");

    const publicite = await prisma.publicite.create({
      data: {
        forfait_publicitaire_id,
        emplacement_publicitaire_id,
        utilisateur_id: req.utilisateur.utilisateur_id,
        pays_id,
        titre: titre.trim(),
        visuel_url: uploadVisuel.nom,
        date_debut: new Date(date_debut),
        date_fin: new Date(date_fin),
        statut_moderation: "en_attente",
      },
    });

    return res.status(201).json({
      message: "Publicité créée avec succès. Elle sera diffusée après validation.",
      publicite: avecUrlVisuel(publicite),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/publicites/:id
 * multipart/form-data — champ fichier "visuel" optionnel
 * pour remplacer le visuel existant.
 *   - L'auteur peut modifier titre/visuel/dates,
 *     uniquement tant que la publicité est encore "en_attente" (une
 *     publicité déjà modérée ne peut plus être réécrite après coup
 *     par son auteur). emplacement_publicitaire_id et
 *     forfait_publicitaire_id ne sont pas modifiables après création
 *     (mêmes garde-fous que l'ensemble du dépôt : on ne réécrit pas
 *     silencieusement le forfait souscrit).
 *   - Un admin/superadmin peut à tout moment modifier
 *     statut_moderation (modération à proprement parler), et
 *     seulement ce champ.
 */
export async function modifierPublicite(req, res, next) {
  try {
    const publicite = await prisma.publicite.findUnique({ where: { publicite_id: req.params.id } });
    if (!publicite) {
      return res.status(404).json({ message: "Publicité introuvable." });
    }

    const estAuteur = req.utilisateur?.utilisateur_id === publicite.utilisateur_id;
    if (!estAuteur && !estAdmin(req.utilisateur)) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const donnees = {};

    if (estAdmin(req.utilisateur) && req.body.statut_moderation !== undefined) {
      if (!STATUTS_MODERATION_PUBLICITE.includes(req.body.statut_moderation)) {
        return res.status(400).json({
          message: `statut_moderation invalide. Valeurs acceptées : ${STATUTS_MODERATION_PUBLICITE.join(", ")}.`,
        });
      }
      donnees.statut_moderation = req.body.statut_moderation;
    }

    if (estAuteur) {
      if (publicite.statut_moderation !== "en_attente") {
        return res.status(409).json({
          message: "Cette publicité a déjà été modérée : son contenu ne peut plus être modifié.",
        });
      }
      if (req.body.titre !== undefined) donnees.titre = req.body.titre.trim();
      if (req.body.date_debut) donnees.date_debut = new Date(req.body.date_debut);
      if (req.body.date_fin) donnees.date_fin = new Date(req.body.date_fin);

      // Remplacement optionnel du visuel : upload du nouveau fichier
      // AVANT suppression de l'ancien sur Cloudinary (même patron que
      // pharmacie.controller.js) pour ne jamais laisser la publicité
      // sans visuel valide en cas d'échec d'upload.
      const fichierVisuel = req.files?.visuel?.[0];
      if (fichierVisuel) {
        const upload = await televerserFichier(fichierVisuel.buffer, "publicites");
        await supprimerFichier(publicite.visuel_url);
        donnees.visuel_url = upload.nom;
      }
    }

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    const publiciteMiseAJour = await prisma.publicite.update({
      where: { publicite_id: req.params.id },
      data: donnees,
    });

    return res.status(200).json({ message: "Publicité mise à jour.", publicite: avecUrlVisuel(publiciteMiseAJour) });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/publicites/:id
 * Réservé à l'auteur de la publicité ou à un admin/superadmin.
 */
export async function supprimerPublicite(req, res, next) {
  try {
    const publicite = await prisma.publicite.findUnique({ where: { publicite_id: req.params.id } });
    if (!publicite) {
      return res.status(404).json({ message: "Publicité introuvable." });
    }

    const estAuteur = req.utilisateur?.utilisateur_id === publicite.utilisateur_id;
    if (!estAuteur && !estAdmin(req.utilisateur)) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    await prisma.publicite.delete({ where: { publicite_id: req.params.id } });

    // Nettoyage Cloudinary après suppression réussie en base (best
    // effort — voir supprimerFichier, même patron que
    // pharmacie.controller.js). On ne bloque jamais la suppression DB
    // pour un souci Cloudinary.
    await supprimerFichier(publicite.visuel_url);

    return res.status(200).json({ message: "Publicité supprimée." });
  } catch (err) {
    next(err);
  }
}