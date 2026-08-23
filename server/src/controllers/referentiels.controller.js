// src/controllers/referentiels.controller.js
// Composant "référentiels" : gère les tables de référence transverses
// utilisées par tous les modules métier — Langue, Devise, Pays, Ville
// (référentiel géographique) et Role (IAM).
//
// Lecture : ouverte à tout utilisateur authentifié.
// Écriture (création/modification) : réservée à admin/superadmin.
// Suppression : réservée à superadmin (impact transverse élevé).

import prisma from "../lib/prisma.js";

const STATUTS_ACTIVATION_PAYS = ["pilote", "actif", "inactif"];

/* ===================================================================
 * Langues
 * =================================================================== */

/**
 * GET /api/referentiels/langues
 */
export async function listerLangues(_req, res, next) {
  try {
    const langues = await prisma.langue.findMany({ orderBy: { nom: "asc" } });
    return res.status(200).json({ langues });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/referentiels/langues/:id
 */
export async function obtenirLangue(req, res, next) {
  try {
    const langue = await prisma.langue.findUnique({
      where: { langue_id: req.params.id },
    });
    if (!langue) {
      return res.status(404).json({ message: "Langue introuvable." });
    }
    return res.status(200).json({ langue });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/referentiels/langues
 */
export async function creerLangue(req, res, next) {
  try {
    const { nom } = req.body;
    if (!nom) {
      return res.status(400).json({ message: "Champ requis manquant : nom." });
    }

    const langue = await prisma.langue.create({ data: { nom } });
    return res.status(201).json({ message: "Langue créée avec succès.", langue });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/referentiels/langues/:id
 */
export async function modifierLangue(req, res, next) {
  try {
    const { nom } = req.body;
    if (!nom) {
      return res.status(400).json({ message: "Champ requis manquant : nom." });
    }

    const existe = await prisma.langue.findUnique({
      where: { langue_id: req.params.id },
    });
    if (!existe) {
      return res.status(404).json({ message: "Langue introuvable." });
    }

    const langue = await prisma.langue.update({
      where: { langue_id: req.params.id },
      data: { nom },
    });
    return res.status(200).json({ message: "Langue mise à jour.", langue });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/referentiels/langues/:id
 */
export async function supprimerLangue(req, res, next) {
  try {
    const langue = await prisma.langue.findUnique({
      where: { langue_id: req.params.id },
    });
    if (!langue) {
      return res.status(404).json({ message: "Langue introuvable." });
    }

    const nbPaysAssocies = await prisma.pays.count({
      where: { langue_id: req.params.id },
    });
    if (nbPaysAssocies > 0) {
      return res.status(409).json({
        message: `Impossible de supprimer : ${nbPaysAssocies} pays référence(nt) encore cette langue.`,
      });
    }

    await prisma.langue.delete({ where: { langue_id: req.params.id } });
    return res.status(200).json({ message: "Langue supprimée." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Devises
 * =================================================================== */

/**
 * GET /api/referentiels/devises
 */
export async function listerDevises(_req, res, next) {
  try {
    const devises = await prisma.devise.findMany({ orderBy: { libelle: "asc" } });
    return res.status(200).json({ devises });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/referentiels/devises/:id
 */
export async function obtenirDevise(req, res, next) {
  try {
    const devise = await prisma.devise.findUnique({
      where: { devise_id: req.params.id },
    });
    if (!devise) {
      return res.status(404).json({ message: "Devise introuvable." });
    }
    return res.status(200).json({ devise });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/referentiels/devises
 */
export async function creerDevise(req, res, next) {
  try {
    const { libelle } = req.body;
    if (!libelle) {
      return res.status(400).json({ message: "Champ requis manquant : libelle." });
    }

    const devise = await prisma.devise.create({ data: { libelle } });
    return res.status(201).json({ message: "Devise créée avec succès.", devise });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/referentiels/devises/:id
 */
export async function modifierDevise(req, res, next) {
  try {
    const { libelle } = req.body;
    if (!libelle) {
      return res.status(400).json({ message: "Champ requis manquant : libelle." });
    }

    const existe = await prisma.devise.findUnique({
      where: { devise_id: req.params.id },
    });
    if (!existe) {
      return res.status(404).json({ message: "Devise introuvable." });
    }

    const devise = await prisma.devise.update({
      where: { devise_id: req.params.id },
      data: { libelle },
    });
    return res.status(200).json({ message: "Devise mise à jour.", devise });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/referentiels/devises/:id
 */
export async function supprimerDevise(req, res, next) {
  try {
    const devise = await prisma.devise.findUnique({
      where: { devise_id: req.params.id },
    });
    if (!devise) {
      return res.status(404).json({ message: "Devise introuvable." });
    }

    const nbPaysAssocies = await prisma.pays.count({
      where: { devise_id: req.params.id },
    });
    if (nbPaysAssocies > 0) {
      return res.status(409).json({
        message: `Impossible de supprimer : ${nbPaysAssocies} pays référence(nt) encore cette devise.`,
      });
    }

    await prisma.devise.delete({ where: { devise_id: req.params.id } });
    return res.status(200).json({ message: "Devise supprimée." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Pays
 * =================================================================== */

/**
 * GET /api/referentiels/pays
 */
export async function listerPays(req, res, next) {
  try {
    const { statut_activation } = req.query;

    const where = {};
    if (statut_activation) {
      if (!STATUTS_ACTIVATION_PAYS.includes(statut_activation)) {
        return res.status(400).json({
          message: `statut_activation invalide. Valeurs acceptées : ${STATUTS_ACTIVATION_PAYS.join(", ")}.`,
        });
      }
      where.statut_activation = statut_activation;
    }

    const pays = await prisma.pays.findMany({
      where,
      include: { devise: true, langue: true },
      orderBy: { nom: "asc" },
    });
    return res.status(200).json({ pays });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/referentiels/pays/:id
 */
export async function obtenirPays(req, res, next) {
  try {
    const pays = await prisma.pays.findUnique({
      where: { pays_id: req.params.id },
      include: { devise: true, langue: true, villes: true },
    });
    if (!pays) {
      return res.status(404).json({ message: "Pays introuvable." });
    }
    return res.status(200).json({ pays });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/referentiels/pays
 */
export async function creerPays(req, res, next) {
  try {
    const { code_iso2, nom, devise_id, langue_id, statut_activation } = req.body;

    if (!code_iso2 || !nom || !devise_id || !langue_id || !statut_activation) {
      return res.status(400).json({
        message:
          "Champs requis manquants : code_iso2, nom, devise_id, langue_id, statut_activation.",
      });
    }

    if (code_iso2.length !== 2) {
      return res.status(400).json({ message: "code_iso2 doit contenir exactement 2 caractères." });
    }

    if (!STATUTS_ACTIVATION_PAYS.includes(statut_activation)) {
      return res.status(400).json({
        message: `statut_activation invalide. Valeurs acceptées : ${STATUTS_ACTIVATION_PAYS.join(", ")}.`,
      });
    }

    const [devise, langue, paysExistant] = await Promise.all([
      prisma.devise.findUnique({ where: { devise_id } }),
      prisma.langue.findUnique({ where: { langue_id } }),
      prisma.pays.findUnique({ where: { code_iso2: code_iso2.toUpperCase() } }),
    ]);

    if (!devise) {
      return res.status(400).json({ message: "devise_id introuvable." });
    }
    if (!langue) {
      return res.status(400).json({ message: "langue_id introuvable." });
    }
    if (paysExistant) {
      return res.status(409).json({ message: "Un pays avec ce code_iso2 existe déjà." });
    }

    const pays = await prisma.pays.create({
      data: {
        code_iso2: code_iso2.toUpperCase(),
        nom,
        devise_id,
        langue_id,
        statut_activation,
      },
      include: { devise: true, langue: true },
    });

    return res.status(201).json({ message: "Pays créé avec succès.", pays });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/referentiels/pays/:id
 */
export async function modifierPays(req, res, next) {
  try {
    const { code_iso2, nom, devise_id, langue_id, statut_activation } = req.body;

    const existant = await prisma.pays.findUnique({ where: { pays_id: req.params.id } });
    if (!existant) {
      return res.status(404).json({ message: "Pays introuvable." });
    }

    if (statut_activation && !STATUTS_ACTIVATION_PAYS.includes(statut_activation)) {
      return res.status(400).json({
        message: `statut_activation invalide. Valeurs acceptées : ${STATUTS_ACTIVATION_PAYS.join(", ")}.`,
      });
    }

    if (devise_id) {
      const devise = await prisma.devise.findUnique({ where: { devise_id } });
      if (!devise) {
        return res.status(400).json({ message: "devise_id introuvable." });
      }
    }

    if (langue_id) {
      const langue = await prisma.langue.findUnique({ where: { langue_id } });
      if (!langue) {
        return res.status(400).json({ message: "langue_id introuvable." });
      }
    }

    if (code_iso2) {
      if (code_iso2.length !== 2) {
        return res.status(400).json({ message: "code_iso2 doit contenir exactement 2 caractères." });
      }
      const conflit = await prisma.pays.findUnique({
        where: { code_iso2: code_iso2.toUpperCase() },
      });
      if (conflit && conflit.pays_id !== req.params.id) {
        return res.status(409).json({ message: "Un pays avec ce code_iso2 existe déjà." });
      }
    }

    const pays = await prisma.pays.update({
      where: { pays_id: req.params.id },
      data: {
        ...(code_iso2 && { code_iso2: code_iso2.toUpperCase() }),
        ...(nom && { nom }),
        ...(devise_id && { devise_id }),
        ...(langue_id && { langue_id }),
        ...(statut_activation && { statut_activation }),
      },
      include: { devise: true, langue: true },
    });

    return res.status(200).json({ message: "Pays mis à jour.", pays });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/referentiels/pays/:id
 */
export async function supprimerPays(req, res, next) {
  try {
    const pays = await prisma.pays.findUnique({ where: { pays_id: req.params.id } });
    if (!pays) {
      return res.status(404).json({ message: "Pays introuvable." });
    }

    const [nbVilles, nbUtilisateurs, nbMedecins] = await Promise.all([
      prisma.ville.count({ where: { pays_id: req.params.id } }),
      prisma.utilisateur.count({ where: { pays_id: req.params.id } }),
      prisma.medecin.count({ where: { pays_exercice_id: req.params.id } }),
    ]);

    if (nbVilles > 0 || nbUtilisateurs > 0 || nbMedecins > 0) {
      return res.status(409).json({
        message:
          "Impossible de supprimer : ce pays est encore référencé (villes, utilisateurs ou médecins).",
      });
    }

    await prisma.pays.delete({ where: { pays_id: req.params.id } });
    return res.status(200).json({ message: "Pays supprimé." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Villes
 * =================================================================== */

/**
 * GET /api/referentiels/villes
 * Filtre optionnel : ?pays_id=...
 */
export async function listerVilles(req, res, next) {
  try {
    const { pays_id } = req.query;

    if (pays_id) {
      const pays = await prisma.pays.findUnique({ where: { pays_id } });
      if (!pays) {
        return res.status(400).json({ message: "pays_id introuvable." });
      }
    }

    const villes = await prisma.ville.findMany({
      where: pays_id ? { pays_id } : undefined,
      include: { pays: true },
      orderBy: { nom: "asc" },
    });
    return res.status(200).json({ villes });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/referentiels/villes/:id
 */
export async function obtenirVille(req, res, next) {
  try {
    const ville = await prisma.ville.findUnique({
      where: { ville_id: req.params.id },
      include: { pays: true },
    });
    if (!ville) {
      return res.status(404).json({ message: "Ville introuvable." });
    }
    return res.status(200).json({ ville });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/referentiels/villes
 */
export async function creerVille(req, res, next) {
  try {
    const { pays_id, nom, code_postal } = req.body; //recuperation des valeurs

    // s'il y'a pas de id du pays 
    if (!pays_id || !nom) {
      return res.status(400).json({ message: "Champs requis manquants : pays_id, nom." });
    }


    const pays = await prisma.pays.findUnique({ where: { pays_id } });
    if (!pays) {
      return res.status(400).json({ message: "pays_id introuvable." });
    }

    const ville = await prisma.ville.create({
      data: { pays_id, nom, code_postal: code_postal || null },
      include: { pays: true },
    });

    return res.status(201).json({ message: "Ville créée avec succès.", ville });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/referentiels/villes/:id
 */
export async function modifierVille(req, res, next) {
  try {
    const { pays_id, nom, code_postal } = req.body;

    const existante = await prisma.ville.findUnique({ where: { ville_id: req.params.id } });
    if (!existante) {
      return res.status(404).json({ message: "Ville introuvable." });
    }

    if (pays_id) {
      const pays = await prisma.pays.findUnique({ where: { pays_id } });
      if (!pays) {
        return res.status(400).json({ message: "pays_id introuvable." });
      }
    }

    const ville = await prisma.ville.update({
      where: { ville_id: req.params.id },
      data: {
        ...(pays_id && { pays_id }),
        ...(nom && { nom }),
        ...(code_postal !== undefined && { code_postal: code_postal || null }),
      },
      include: { pays: true },
    });

    return res.status(200).json({ message: "Ville mise à jour.", ville });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/referentiels/villes/:id
 */
export async function supprimerVille(req, res, next) {
  try {
    const ville = await prisma.ville.findUnique({ where: { ville_id: req.params.id } });
    if (!ville) {
      return res.status(404).json({ message: "Ville introuvable." });
    }

    const nbMedecins = await prisma.medecin.count({
      where: { ville_exercice_id: req.params.id },
    });
    if (nbMedecins > 0) {
      return res.status(409).json({
        message: `Impossible de supprimer : ${nbMedecins} médecin(s) exercent encore dans cette ville.`,
      });
    }

    await prisma.ville.delete({ where: { ville_id: req.params.id } });
    return res.status(200).json({ message: "Ville supprimée." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Rôles (IAM)
 * =================================================================== */

/**
 * GET /api/referentiels/roles
 */
export async function listerRoles(_req, res, next) {
  try {
    const roles = await prisma.role.findMany({ orderBy: { libelle: "asc" } });
    return res.status(200).json({ roles });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/referentiels/roles/:id
 */
export async function obtenirRole(req, res, next) {
  try {
    const role = await prisma.role.findUnique({ where: { role_id: req.params.id } });
    if (!role) {
      return res.status(404).json({ message: "Rôle introuvable." });
    }
    return res.status(200).json({ role });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/referentiels/roles
 */
export async function creerRole(req, res, next) {
  try {
    const { libelle } = req.body;
    if (!libelle) {
      return res.status(400).json({ message: "Champ requis manquant : libelle." });
    }

    const existant = await prisma.role.findUnique({ where: { libelle } });
    if (existant) {
      return res.status(409).json({ message: "Un rôle avec ce libellé existe déjà." });
    }

    const role = await prisma.role.create({ data: { libelle } });
    return res.status(201).json({ message: "Rôle créé avec succès.", role });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/referentiels/roles/:id
 */
export async function modifierRole(req, res, next) {
  try {
    const { libelle } = req.body;
    if (!libelle) {
      return res.status(400).json({ message: "Champ requis manquant : libelle." });
    }

    const existant = await prisma.role.findUnique({ where: { role_id: req.params.id } });
    if (!existant) {
      return res.status(404).json({ message: "Rôle introuvable." });
    }

    const conflit = await prisma.role.findUnique({ where: { libelle } });
    if (conflit && conflit.role_id !== req.params.id) {
      return res.status(409).json({ message: "Un rôle avec ce libellé existe déjà." });
    }

    const role = await prisma.role.update({
      where: { role_id: req.params.id },
      data: { libelle },
    });
    return res.status(200).json({ message: "Rôle mis à jour.", role });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/referentiels/roles/:id
 */
export async function supprimerRole(req, res, next) {
  try {
    const role = await prisma.role.findUnique({ where: { role_id: req.params.id } });
    if (!role) {
      return res.status(404).json({ message: "Rôle introuvable." });
    }

    const nbUtilisateurs = await prisma.utilisateur.count({
      where: { role_id: req.params.id },
    });
    if (nbUtilisateurs > 0) {
      return res.status(409).json({
        message: `Impossible de supprimer : ${nbUtilisateurs} utilisateur(s) ont encore ce rôle.`,
      });
    }

    await prisma.role.delete({ where: { role_id: req.params.id } });
    return res.status(200).json({ message: "Rôle supprimé." });
  } catch (err) {
    next(err);
  }
}