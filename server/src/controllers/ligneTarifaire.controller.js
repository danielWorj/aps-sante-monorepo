// src/controllers/ligneTarifaire.controller.js
// Phase 0 — Gestion admin des lignes tarifaires (commission APS,
// taxes, frais d'agrégateur), versionnées par pays et par type de
// frais. Modèle générique : ajouter/renommer une taxe ne demande
// qu'une nouvelle ligne, jamais une migration.
//
// Champs réels du modèle (voir schema.prisma) :
//   LigneTarifaire { ligne_tarifaire_id, pays_id, type_frais, libelle,
//     taux, actif, date_debut_validite }
//   type_frais ∈ { commission, taxe, frais_agregateur }
//
// Réservé à admin/superadmin (voir routes/ligneTarifaire.routes.js) :
// ces taux engagent directement ce qui est facturé au patient et
// crédité au médecin, ce n'est pas un paramétrage ouvert au médecin.

import prisma from "../lib/prisma.js";

const TYPES_FRAIS_VALIDES = ["commission", "taxe", "frais_agregateur"];

function tauxValide(valeur) {
  const n = Number(valeur);
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

/**
 * GET /api/lignes-tarifaires
 * Filtrable par ?pays_id=... et/ou ?type_frais=...
 */
export async function listerLignesTarifaires(req, res, next) {
  try {
    const { pays_id, type_frais } = req.query;

    if (type_frais && !TYPES_FRAIS_VALIDES.includes(type_frais)) {
      return res.status(400).json({
        message: `type_frais invalide. Valeurs acceptées : ${TYPES_FRAIS_VALIDES.join(", ")}.`,
      });
    }

    const lignes = await prisma.ligneTarifaire.findMany({
      where: {
        ...(pays_id && { pays_id }),
        ...(type_frais && { type_frais }),
      },
      orderBy: [{ pays_id: "asc" }, { type_frais: "asc" }, { date_debut_validite: "desc" }],
      include: { pays: { select: { pays_id: true, nom: true, code_iso2: true } } },
    });

    return res.status(200).json({ lignes_tarifaires: lignes });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/lignes-tarifaires
 * Body: { pays_id, type_frais, libelle, taux }
 *
 * Ne fait JAMAIS d'update sur une ligne existante (principe directeur :
 * les transactions passées référencent la ligne en vigueur au moment
 * du paiement, la réécrire romprait leur cohérence historique).
 * Désactive, pour le même (pays_id, type_frais), toute ligne
 * actuellement active, puis crée la nouvelle — les deux dans une
 * transaction Prisma pour ne jamais avoir deux lignes actives
 * simultanément sur le même (pays_id, type_frais).
 */
export async function creerLigneTarifaire(req, res, next) {
  try {
    const { pays_id, type_frais, libelle, taux } = req.body;

    if (!pays_id) {
      return res.status(400).json({ message: "Champ requis manquant : pays_id." });
    }
    if (!TYPES_FRAIS_VALIDES.includes(type_frais)) {
      return res.status(400).json({
        message: `type_frais invalide. Valeurs acceptées : ${TYPES_FRAIS_VALIDES.join(", ")}.`,
      });
    }
    if (!libelle || !libelle.trim()) {
      return res.status(400).json({ message: "Champ requis manquant : libelle." });
    }
    if (!tauxValide(taux)) {
      return res.status(400).json({ message: "Champ invalide : taux doit être un nombre compris entre 0 et 1." });
    }

    const pays = await prisma.pays.findUnique({ where: { pays_id } });
    if (!pays) {
      return res.status(404).json({ message: "Pays introuvable." });
    }

    const nouvelleLigne = await prisma.$transaction(async (tx) => {
      // Désactive toute ligne active du même (pays_id, type_frais) —
      // c'est ce qui garantit qu'une seule ligne d'un type donné est
      // active à la fois pour un pays, même si plusieurs lignes
      // (historiques ou d'autres types) coexistent pour ce pays.
      await tx.ligneTarifaire.updateMany({
        where: { pays_id, type_frais, actif: true },
        data: { actif: false },
      });

      return tx.ligneTarifaire.create({
        data: { pays_id, type_frais, libelle: libelle.trim(), taux, actif: true },
      });
    });

    return res.status(201).json({
      message: "Nouvelle ligne tarifaire créée et activée.",
      ligne_tarifaire: nouvelleLigne,
    });
  } catch (err) {
    next(err);
  }
}