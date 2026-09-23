// src/controllers/configurationTarifaire.controller.js
// Phase 0 — Gestion admin de la configuration tarifaire (commission
// APS, taxes, frais d'agrégateur) versionnée par pays.
//
// Champs réels du modèle (voir schema.prisma) :
//   ConfigurationTarifaire { configuration_id, pays_id, taux_commission,
//     taux_taxes, taux_frais_agregateur, actif, date_debut_validite }
//
// Réservé à admin/superadmin (voir routes/configurationTarifaire.routes.js) :
// ces taux engagent directement ce qui est facturé au patient et
// crédité au médecin, ce n'est pas un paramétrage ouvert au médecin.

import prisma from "../lib/prisma.js";

const CHAMPS_TAUX = ["taux_commission", "taux_taxes", "taux_frais_agregateur"];

function tauxValide(valeur) {
  const n = Number(valeur);
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

/**
 * GET /api/configurations-tarifaires
 * Filtrable par ?pays_id=...
 */
export async function listerConfigurationsTarifaires(req, res, next) {
  try {
    const { pays_id } = req.query;

    const configurations = await prisma.configurationTarifaire.findMany({
      where: pays_id ? { pays_id } : undefined,
      orderBy: [{ pays_id: "asc" }, { date_debut_validite: "desc" }],
      include: { pays: { select: { pays_id: true, nom: true, code_iso2: true } } },
    });

    return res.status(200).json({ configurations_tarifaires: configurations });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/configurations-tarifaires
 * Body: { pays_id, taux_commission, taux_taxes, taux_frais_agregateur }
 *
 * Ne fait JAMAIS d'update sur une ligne existante (principe directeur :
 * les transactions passées référencent la ligne en vigueur au moment
 * du paiement, la réécrire romprait leur cohérence historique).
 * Désactive l'ancienne config active du même pays, puis crée la
 * nouvelle — les deux dans une transaction Prisma pour ne jamais avoir
 * deux configs actives simultanément pour un même pays.
 */
export async function creerConfigurationTarifaire(req, res, next) {
  try {
    const { pays_id, taux_commission, taux_taxes, taux_frais_agregateur } = req.body;

    if (!pays_id) {
      return res.status(400).json({ message: "Champ requis manquant : pays_id." });
    }
    for (const champ of CHAMPS_TAUX) {
      if (!tauxValide(req.body[champ])) {
        return res.status(400).json({
          message: `Champ invalide : ${champ} doit être un nombre compris entre 0 et 1.`,
        });
      }
    }

    const pays = await prisma.pays.findUnique({ where: { pays_id } });
    if (!pays) {
      return res.status(404).json({ message: "Pays introuvable." });
    }

    const nouvelleConfiguration = await prisma.$transaction(async (tx) => {
      await tx.configurationTarifaire.updateMany({
        where: { pays_id, actif: true },
        data: { actif: false },
      });

      return tx.configurationTarifaire.create({
        data: {
          pays_id,
          taux_commission,
          taux_taxes,
          taux_frais_agregateur,
          actif: true,
        },
      });
    });

    return res.status(201).json({
      message: "Nouvelle configuration tarifaire créée et activée.",
      configuration_tarifaire: nouvelleConfiguration,
    });
  } catch (err) {
    next(err);
  }
}