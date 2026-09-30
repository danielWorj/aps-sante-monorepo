// src/controllers/parametreAmende.controller.js
// Politique de fonds v2 §7 — Gestion admin du taux d'amende du médecin,
// par pays et versionné (même mécanique que les lignes tarifaires).
// Saisi par un administrateur : AUCUNE valeur par défaut ni seed ; sans
// ligne active pour le pays du médecin, la création d'une amende échoue
// explicitement (voir amende.service.js, étape 4).
//
// Champs réels du modèle (voir schema.prisma) :
//   ParametreAmende { parametre_amende_id, pays_id, libelle, taux,
//     actif, date_debut_validite }
//   taux = part (0–1) du crédit de la prochaine libération du médecin.
//
// Jamais d'update sur une ligne existante : les amendes déjà créées la
// référencent (taux_applique y est figé). Réservé à admin/superadmin.

import prisma from "../lib/prisma.js";

const tauxValide = (v) => {
  const n = Number(v);
  // Colonne Decimal(5, 4) : au plus 4 décimales, sinon Postgres arrondirait en silence.
  return Number.isFinite(n) && n >= 0 && n <= 1 && Math.abs(n * 1e4 - Math.round(n * 1e4)) < 1e-9;
};

/**
 * GET /api/parametres-amende
 * Filtrable par ?pays_id=... et ?actif=true|false.
 */
export async function listerParametresAmende(req, res, next) {
  try {
    const { pays_id, actif } = req.query;
    if (actif !== undefined && actif !== "true" && actif !== "false") {
      return res.status(400).json({ message: "actif invalide. Valeurs acceptées : true, false." });
    }

    const parametres = await prisma.parametreAmende.findMany({
      where: {
        ...(pays_id && { pays_id }),
        ...(actif !== undefined && { actif: actif === "true" }),
      },
      orderBy: [{ pays_id: "asc" }, { date_debut_validite: "desc" }],
      include: { pays: { select: { pays_id: true, nom: true, code_iso2: true } } },
    });

    return res.status(200).json({ parametres_amende: parametres });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/parametres-amende
 * Body: { pays_id, libelle, taux }
 * Désactive le paramètre actif du pays puis crée le nouveau, dans une
 * transaction SQL (index unique partiel WHERE actif sur pays_id).
 */
export async function creerParametreAmende(req, res, next) {
  try {
    const { pays_id, libelle, taux } = req.body ?? {};

    if (!pays_id) {
      return res.status(400).json({ message: "Champ requis manquant : pays_id." });
    }
    if (typeof libelle !== "string" || !libelle.trim()) {
      return res.status(400).json({ message: "Champ requis manquant : libelle." });
    }
    if (libelle.trim().length > 100) {
      return res.status(400).json({ message: "libelle trop long (100 caractères maximum)." });
    }
    if (!tauxValide(taux)) {
      return res.status(400).json({ message: "Champ invalide : taux doit être un nombre compris entre 0 et 1, avec au plus 4 décimales (ex. 0.10 pour 10 %)." });
    }

    const pays = await prisma.pays.findUnique({ where: { pays_id } });
    if (!pays) {
      return res.status(404).json({ message: "Pays introuvable." });
    }

    const nouveau = await prisma.$transaction(async (tx) => {
      await tx.parametreAmende.updateMany({
        where: { pays_id, actif: true },
        data: { actif: false },
      });
      return tx.parametreAmende.create({
        data: { pays_id, libelle: libelle.trim(), taux, actif: true },
      });
    });

    return res.status(201).json({
      message: "Nouveau taux d'amende créé et activé.",
      parametre_amende: nouveau,
    });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "Une autre modification du même paramètre vient d'avoir lieu. Réessayez." });
    }
    next(err);
  }
}
