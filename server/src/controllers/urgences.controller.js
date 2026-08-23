// src/controllers/urgences.controller.js

import prisma from "../lib/prisma.js";

/* ===================================================================
 * Types d'Urgence
 * =================================================================== */

/**
 * GET /api/types-urgence
 */
export async function listerTypesUrgence(_req, res, next) {
  try {
    const types = await prisma.typeUrgence.findMany({
      orderBy: { libelle: "asc" },
    });
    return res.status(200).json({ types });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/types-urgence/:id
 */
export async function obtenirTypeUrgence(req, res, next) {
  try {
    const typeUrgence = await prisma.typeUrgence.findUnique({
      where: { type_urgence_id: req.params.id },
    });
    if (!typeUrgence) {
      return res.status(404).json({ message: "Type d'urgence introuvable." });
    }
    return res.status(200).json({ typeUrgence });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/types-urgence
 */
export async function creerTypeUrgence(req, res, next) {
  try {
    const { libelle, description } = req.body;

    if (!libelle || !libelle.trim()) {
      return res.status(400).json({
        message: "Champ requis manquant : libelle.",
      });
    }

    const typeUrgence = await prisma.typeUrgence.create({
      data: {
        libelle: libelle.trim(),
        description: description?.trim() || null,
      },
    });

    return res.status(201).json({ message: "Type d'urgence créé avec succès.", typeUrgence });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/types-urgence/:id
 */
export async function modifierTypeUrgence(req, res, next) {
  try {
    const { libelle, description } = req.body;

    const existant = await prisma.typeUrgence.findUnique({
      where: { type_urgence_id: req.params.id },
    });
    if (!existant) {
      return res.status(404).json({ message: "Type d'urgence introuvable." });
    }

    const typeUrgence = await prisma.typeUrgence.update({
      where: { type_urgence_id: req.params.id },
      data: {
        ...(libelle && { libelle: libelle.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
      },
    });

    return res.status(200).json({ message: "Type d'urgence mis à jour.", typeUrgence });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/types-urgence/:id
 */
export async function supprimerTypeUrgence(req, res, next) {
  try {
    const existant = await prisma.typeUrgence.findUnique({
      where: { type_urgence_id: req.params.id },
    });
    if (!existant) {
      return res.status(404).json({ message: "Type d'urgence introuvable." });
    }

    const nbUrgences = await prisma.urgence.count({
      where: { type_urgence_id: req.params.id },
    });
    if (nbUrgences > 0) {
      return res.status(409).json({
        message: `Impossible de supprimer : ${nbUrgences} numéro(s) d'urgence référence(nt) encore ce type.`,
      });
    }

    await prisma.typeUrgence.delete({
      where: { type_urgence_id: req.params.id },
    });
    return res.status(200).json({ message: "Type d'urgence supprimé." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Urgences
 * =================================================================== */

/**
 * GET /api/urgences
 * Filtres optionnels : ?pays_id=...&type_urgence_id=...
 */
export async function listerUrgences(req, res, next) {
  try {
    const { pays_id, type_urgence_id } = req.query;

    const where = {};
    if (pays_id) where.pays_id = pays_id;
    if (type_urgence_id) where.type_urgence_id = type_urgence_id;

    const urgences = await prisma.urgence.findMany({
      where,
      include: { type_urgence: true, pays: true },
      orderBy: { libelle: "asc" },
    });

    return res.status(200).json({ urgences });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/urgences/:id
 */
export async function obtenirUrgence(req, res, next) {
  try {
    const urgence = await prisma.urgence.findUnique({
      where: { urgence_id: req.params.id },
      include: { type_urgence: true, pays: true },
    });
    if (!urgence) {
      return res.status(404).json({ message: "Urgence introuvable." });
    }
    return res.status(200).json({ urgence });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/urgences
 */
export async function creerUrgence(req, res, next) {
  try {
    const { type_urgence_id, pays_id, libelle, description, telephone } = req.body;

    if (!type_urgence_id || !pays_id || !libelle || !telephone) {
      return res.status(400).json({
        message: "Champs requis manquants : type_urgence_id, pays_id, libelle, telephone.",
      });
    }

    // Validation de l'existence des clés étrangères
    const [typeUrgence, pays] = await Promise.all([
      prisma.typeUrgence.findUnique({ where: { type_urgence_id } }),
      prisma.pays.findUnique({ where: { pays_id } }),
    ]);

    if (!typeUrgence) return res.status(400).json({ message: "type_urgence_id introuvable." });
    if (!pays) return res.status(400).json({ message: "pays_id introuvable." });

    const urgence = await prisma.urgence.create({
      data: {
        type_urgence_id,
        pays_id,
        libelle: libelle.trim(),
        description: description?.trim() || null,
        telephone: telephone.trim(),
      },
    });

    return res.status(201).json({ message: "Numéro d'urgence créé avec succès.", urgence });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/urgences/:id
 */
export async function modifierUrgence(req, res, next) {
  try {
    const { type_urgence_id, pays_id, libelle, description, telephone } = req.body;

    const existant = await prisma.urgence.findUnique({
      where: { urgence_id: req.params.id },
    });
    if (!existant) {
      return res.status(404).json({ message: "Urgence introuvable." });
    }

    if (type_urgence_id) {
      const typeUrgence = await prisma.typeUrgence.findUnique({ where: { type_urgence_id } });
      if (!typeUrgence) return res.status(400).json({ message: "type_urgence_id introuvable." });
    }

    if (pays_id) {
      const pays = await prisma.pays.findUnique({ where: { pays_id } });
      if (!pays) return res.status(400).json({ message: "pays_id introuvable." });
    }

    const urgence = await prisma.urgence.update({
      where: { urgence_id: req.params.id },
      data: {
        ...(type_urgence_id && { type_urgence_id }),
        ...(pays_id && { pays_id }),
        ...(libelle && { libelle: libelle.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(telephone && { telephone: telephone.trim() }),
      },
    });

    return res.status(200).json({ message: "Urgence mise à jour.", urgence });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/urgences/:id
 */
export async function supprimerUrgence(req, res, next) {
  try {
    const existant = await prisma.urgence.findUnique({
      where: { urgence_id: req.params.id },
    });
    if (!existant) {
      return res.status(404).json({ message: "Urgence introuvable." });
    }

    await prisma.urgence.delete({
      where: { urgence_id: req.params.id },
    });
    
    return res.status(200).json({ message: "Urgence supprimée." });
  } catch (err) {
    next(err);
  }
}