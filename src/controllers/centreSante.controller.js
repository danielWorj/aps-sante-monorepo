// src/controllers/centreSante.controller.js
// Composant "annuaire — centre de santé" : gère la table structure_sante
// (cliniques, hôpitaux, centres médicaux, dispensaires, laboratoires).
//
// Lecture : PUBLIQUE, sans authentification. L'Annuaire doit être
// consultable avant la création d'un compte ou une prise de RDV — même
// raisonnement que le référentiel géographique (voir referentiels.controller.js).
// Écriture (création/modification) : réservée à admin/superadmin.
// Suppression : réservée à superadmin (impact transverse : agents rattachés,
// avis, futurs modules pharmacie/RDV/urgences qui exposent la fiche).

import prisma from "../lib/prisma.js";

const STATUTS_VERIFICATION_STRUCTURE = ["non_publie", "en_cours", "publie"];
const TYPES_STRUCTURE = ["clinique", "hopital", "centre_medical", "dispensaire", "laboratoire"];

/* ===================================================================
 * Géolocalisation (GEOGRAPHY(POINT,4326))
 *
 * Non supporté nativement par Prisma Client (type "Unsupported" côté
 * schéma) : lecture/écriture passent par des requêtes SQL brutes,
 * isolées ici pour ne pas polluer le reste des contrôleurs.
 * =================================================================== */

async function recupererGeolocalisation(structureId) {
  const resultat = await prisma.$queryRaw`
    SELECT ST_Y(geolocalisation::geometry) AS latitude,
           ST_X(geolocalisation::geometry) AS longitude
    FROM structure_sante
    WHERE structure_id = ${structureId}::uuid
      AND geolocalisation IS NOT NULL
  `;

  if (!resultat.length) return null;

  const { latitude, longitude } = resultat[0];
  return latitude !== null && longitude !== null ? { latitude, longitude } : null;
}

async function definirGeolocalisation(structureId, latitude, longitude) {
  await prisma.$executeRaw`
    UPDATE structure_sante
    SET geolocalisation = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
    WHERE structure_id = ${structureId}::uuid
  `;
}

async function effacerGeolocalisation(structureId) {
  await prisma.$executeRaw`
    UPDATE structure_sante
    SET geolocalisation = NULL
    WHERE structure_id = ${structureId}::uuid
  `;
}

/**
 * Valide un couple latitude/longitude et applique le changement demandé :
 *   - les deux valeurs présentes  -> définit le point
 *   - les deux valeurs à null     -> efface le point
 *   - absentes du corps de requête -> ne touche pas au champ
 * Retourne un message d'erreur (string) en cas de valeurs invalides, sinon null.
 */
async function appliquerGeolocalisation(structureId, latitude, longitude) {
  const latFournie = latitude !== undefined;
  const lngFournie = longitude !== undefined;

  if (!latFournie && !lngFournie) return null;

  if (latFournie !== lngFournie) {
    return "latitude et longitude doivent être fournies ensemble.";
  }

  if (latitude === null && longitude === null) {
    await effacerGeolocalisation(structureId);
    return null;
  }

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return "latitude et longitude doivent être des nombres.";
  }
  if (latitude < -90 || latitude > 90) {
    return "latitude invalide (doit être comprise entre -90 et 90).";
  }
  if (longitude < -180 || longitude > 180) {
    return "longitude invalide (doit être comprise entre -180 et 180).";
  }

  await definirGeolocalisation(structureId, latitude, longitude);
  return null;
}

async function avecGeolocalisation(structure) {
  const geolocalisation = await recupererGeolocalisation(structure.structure_id);
  return { ...structure, geolocalisation };
}

/* ===================================================================
 * Centres de santé
 * =================================================================== */

/**
 * GET /api/centres-sante
 * Filtres optionnels : ?pays_id=...&ville_id=...&type_structure=...
 *                      &statut_verification=...&recherche=...(nom, insensible à la casse)
 */
export async function listerCentresSante(req, res, next) {
  try {
    const { pays_id, ville_id, type_structure, statut_verification, recherche } = req.query;

    if (type_structure && !TYPES_STRUCTURE.includes(type_structure)) {
      return res.status(400).json({
        message: `type_structure invalide. Valeurs acceptées : ${TYPES_STRUCTURE.join(", ")}.`,
      });
    }
    if (statut_verification && !STATUTS_VERIFICATION_STRUCTURE.includes(statut_verification)) {
      return res.status(400).json({
        message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_STRUCTURE.join(", ")}.`,
      });
    }

    const where = {};
    if (pays_id) where.pays_id = pays_id;
    if (ville_id) where.ville_id = ville_id;
    if (type_structure) where.type_structure = type_structure;
    if (statut_verification) where.statut_verification = statut_verification;
    if (recherche) where.nom = { contains: recherche, mode: "insensitive" };

    const structures = await prisma.structureSante.findMany({
      where,
      include: { pays: true, ville: true },
      orderBy: { nom: "asc" },
    });

    const centresSante = await Promise.all(structures.map(avecGeolocalisation));

    return res.status(200).json({ centresSante });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/centres-sante/:id
 */
export async function obtenirCentreSante(req, res, next) {
  try {
    const structure = await prisma.structureSante.findUnique({
      where: { structure_id: req.params.id },
      include: { pays: true, ville: true },
    });
    if (!structure) {
      return res.status(404).json({ message: "Centre de santé introuvable." });
    }

    const centreSante = await avecGeolocalisation(structure);
    return res.status(200).json({ centreSante });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/centres-sante
 * Champs latitude / longitude optionnels (voir appliquerGeolocalisation).
 */
export async function creerCentreSante(req, res, next) {
  try {
    const {
      nom,
      pays_id,
      ville_id,
      telephone,
      statut_verification,
      type_structure,
      latitude,
      longitude,
    } = req.body;

    if (!nom || !pays_id || !ville_id || !telephone || !statut_verification || !type_structure) {
      return res.status(400).json({
        message:
          "Champs requis manquants : nom, pays_id, ville_id, telephone, statut_verification, type_structure.",
      });
    }

    if (!STATUTS_VERIFICATION_STRUCTURE.includes(statut_verification)) {
      return res.status(400).json({
        message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_STRUCTURE.join(", ")}.`,
      });
    }
    if (!TYPES_STRUCTURE.includes(type_structure)) {
      return res.status(400).json({
        message: `type_structure invalide. Valeurs acceptées : ${TYPES_STRUCTURE.join(", ")}.`,
      });
    }

    const [pays, ville] = await Promise.all([
      prisma.pays.findUnique({ where: { pays_id } }),
      prisma.ville.findUnique({ where: { ville_id } }),
    ]);

    if (!pays) {
      return res.status(400).json({ message: "pays_id introuvable." });
    }
    if (!ville) {
      return res.status(400).json({ message: "ville_id introuvable." });
    }
    if (ville.pays_id !== pays_id) {
      return res.status(400).json({ message: "ville_id n'appartient pas à pays_id." });
    }

    const structure = await prisma.structureSante.create({
      data: { nom, pays_id, ville_id, telephone, statut_verification, type_structure },
      include: { pays: true, ville: true },
    });

    const erreurGeo = await appliquerGeolocalisation(structure.structure_id, latitude, longitude);
    if (erreurGeo) {
      // La structure est créée mais la géolocalisation fournie est invalide :
      // on informe le client sans annuler la création.
      const centreSante = await avecGeolocalisation(structure);
      return res.status(201).json({
        message: `Centre de santé créé avec succès. Avertissement : ${erreurGeo}`,
        centreSante,
      });
    }

    const centreSante = await avecGeolocalisation(structure);
    return res.status(201).json({ message: "Centre de santé créé avec succès.", centreSante });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/centres-sante/:id
 */
export async function modifierCentreSante(req, res, next) {
  try {
    const {
      nom,
      pays_id,
      ville_id,
      telephone,
      statut_verification,
      type_structure,
      latitude,
      longitude,
    } = req.body;

    const existante = await prisma.structureSante.findUnique({
      where: { structure_id: req.params.id },
    });
    if (!existante) {
      return res.status(404).json({ message: "Centre de santé introuvable." });
    }

    if (statut_verification && !STATUTS_VERIFICATION_STRUCTURE.includes(statut_verification)) {
      return res.status(400).json({
        message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_STRUCTURE.join(", ")}.`,
      });
    }
    if (type_structure && !TYPES_STRUCTURE.includes(type_structure)) {
      return res.status(400).json({
        message: `type_structure invalide. Valeurs acceptées : ${TYPES_STRUCTURE.join(", ")}.`,
      });
    }

    const paysCibleId = pays_id || existante.pays_id;
    const villeCibleId = ville_id || existante.ville_id;

    if (pays_id) {
      const pays = await prisma.pays.findUnique({ where: { pays_id } });
      if (!pays) {
        return res.status(400).json({ message: "pays_id introuvable." });
      }
    }
    if (ville_id) {
      const ville = await prisma.ville.findUnique({ where: { ville_id } });
      if (!ville) {
        return res.status(400).json({ message: "ville_id introuvable." });
      }
    }
    if (pays_id || ville_id) {
      const ville = await prisma.ville.findUnique({ where: { ville_id: villeCibleId } });
      if (ville.pays_id !== paysCibleId) {
        return res.status(400).json({ message: "ville_id n'appartient pas à pays_id." });
      }
    }

    const structure = await prisma.structureSante.update({
      where: { structure_id: req.params.id },
      data: {
        ...(nom && { nom }),
        ...(pays_id && { pays_id }),
        ...(ville_id && { ville_id }),
        ...(telephone && { telephone }),
        ...(statut_verification && { statut_verification }),
        ...(type_structure && { type_structure }),
      },
      include: { pays: true, ville: true },
    });

    const erreurGeo = await appliquerGeolocalisation(structure.structure_id, latitude, longitude);
    if (erreurGeo) {
      return res.status(400).json({ message: erreurGeo });
    }

    const centreSante = await avecGeolocalisation(structure);
    return res.status(200).json({ message: "Centre de santé mis à jour.", centreSante });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/centres-sante/:id
 */
export async function supprimerCentreSante(req, res, next) {
  try {
    const structure = await prisma.structureSante.findUnique({
      where: { structure_id: req.params.id },
    });
    if (!structure) {
      return res.status(404).json({ message: "Centre de santé introuvable." });
    }

    const nbAgents = await prisma.agentStructureSante.count({
      where: { structure_id: req.params.id },
    });
    if (nbAgents > 0) {
      return res.status(409).json({
        message: `Impossible de supprimer : ${nbAgents} agent(s) sont encore rattaché(s) à ce centre de santé.`,
      });
    }

    await prisma.structureSante.delete({ where: { structure_id: req.params.id } });
    return res.status(200).json({ message: "Centre de santé supprimé." });
  } catch (err) {
    next(err);
  }
}