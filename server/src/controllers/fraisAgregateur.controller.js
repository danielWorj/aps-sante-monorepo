// src/controllers/fraisAgregateur.controller.js
// Politique de fonds v2 §1-2 — Gestion admin des frais d'agrégateur
// (Stripe / CamPay), par agrégateur et par type (envoi / remboursement),
// versionnés. Saisis par un administrateur : AUCUNE valeur par défaut
// ni seed ; sans ligne active, le paiement échoue explicitement.
//
// Champs réels du modèle (voir schema.prisma) :
//   FraisAgregateur { frais_agregateur_id, agregateur, type_frais,
//     libelle, taux, montant_fixe, actif, date_debut_validite }
//
// Frais = honoraires × taux + montant_fixe (voir fraisAgregateur.service).
// Même mécanique que ligneTarifaire.controller.js : jamais d'update sur
// une ligne existante (les transactions passées la référencent) ; on
// désactive la ligne active puis on en crée une nouvelle, dans une
// transaction SQL. Réservé à admin/superadmin (voir les routes).

import prisma from "../lib/prisma.js";

const AGREGATEURS_VALIDES = ["stripe", "campay"];
const TYPES_VALIDES = ["envoi", "remboursement"];

const tauxValide = (v) => {
  const n = Number(v);
  // Colonne Decimal(5, 4) : au plus 4 décimales, sinon Postgres arrondirait en silence.
  return Number.isFinite(n) && n >= 0 && n <= 1 && Math.abs(n * 1e4 - Math.round(n * 1e4)) < 1e-9;
};
const montantFixeValide = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e10; // Decimal(12, 2)
};
const estRenseigne = (v) => v !== undefined && v !== null && v !== "";

/**
 * GET /api/frais-agregateur
 * Filtrable par ?agregateur=stripe|campay, ?type_frais=envoi|remboursement
 * et ?actif=true|false.
 */
export async function listerFraisAgregateur(req, res, next) {
  try {
    const { agregateur, type_frais, actif } = req.query;

    if (agregateur && !AGREGATEURS_VALIDES.includes(agregateur)) {
      return res.status(400).json({ message: `agregateur invalide. Valeurs acceptées : ${AGREGATEURS_VALIDES.join(", ")}.` });
    }
    if (type_frais && !TYPES_VALIDES.includes(type_frais)) {
      return res.status(400).json({ message: `type_frais invalide. Valeurs acceptées : ${TYPES_VALIDES.join(", ")}.` });
    }
    if (actif !== undefined && actif !== "true" && actif !== "false") {
      return res.status(400).json({ message: "actif invalide. Valeurs acceptées : true, false." });
    }

    const frais = await prisma.fraisAgregateur.findMany({
      where: {
        ...(agregateur && { agregateur }),
        ...(type_frais && { type_frais }),
        ...(actif !== undefined && { actif: actif === "true" }),
      },
      orderBy: [{ agregateur: "asc" }, { type_frais: "asc" }, { date_debut_validite: "desc" }],
    });

    return res.status(200).json({ frais_agregateur: frais });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/frais-agregateur
 * Body: { agregateur, type_frais, libelle, taux?, montant_fixe? }
 * Au moins un de `taux` / `montant_fixe` doit être fourni explicitement
 * (l'autre vaut 0) : un barème vide par oubli est refusé, un barème à
 * 0 doit être saisi volontairement.
 */
export async function creerFraisAgregateur(req, res, next) {
  try {
    const { agregateur, type_frais, libelle, taux, montant_fixe } = req.body ?? {};

    if (!AGREGATEURS_VALIDES.includes(agregateur)) {
      return res.status(400).json({ message: `agregateur invalide. Valeurs acceptées : ${AGREGATEURS_VALIDES.join(", ")}.` });
    }
    if (!TYPES_VALIDES.includes(type_frais)) {
      return res.status(400).json({ message: `type_frais invalide. Valeurs acceptées : ${TYPES_VALIDES.join(", ")}.` });
    }
    if (typeof libelle !== "string" || !libelle.trim()) {
      return res.status(400).json({ message: "Champ requis manquant : libelle." });
    }
    if (libelle.trim().length > 100) {
      return res.status(400).json({ message: "libelle trop long (100 caractères maximum)." });
    }
    if (!estRenseigne(taux) && !estRenseigne(montant_fixe)) {
      return res.status(400).json({ message: "Renseignez au moins un des champs : taux, montant_fixe (0 accepté)." });
    }
    if (estRenseigne(taux) && !tauxValide(taux)) {
      return res.status(400).json({ message: "Champ invalide : taux doit être un nombre compris entre 0 et 1, avec au plus 4 décimales (ex. 0.025 pour 2,5 %)." });
    }
    if (estRenseigne(montant_fixe) && !montantFixeValide(montant_fixe)) {
      return res.status(400).json({ message: "Champ invalide : montant_fixe doit être un nombre positif ou nul." });
    }

    const nouvelle = await prisma.$transaction(async (tx) => {
      // Une seule ligne active par (agregateur, type_frais) — garanti en
      // plus par l'index unique partiel WHERE actif (voir la migration).
      await tx.fraisAgregateur.updateMany({
        where: { agregateur, type_frais, actif: true },
        data: { actif: false },
      });
      return tx.fraisAgregateur.create({
        data: {
          agregateur,
          type_frais,
          libelle: libelle.trim(),
          taux: estRenseigne(taux) ? taux : 0,
          montant_fixe: estRenseigne(montant_fixe) ? montant_fixe : 0,
          actif: true,
        },
      });
    });

    return res.status(201).json({
      message: "Nouveaux frais d'agrégateur créés et activés.",
      frais_agregateur: nouvelle,
    });
  } catch (err) {
    if (err.code === "P2002") {
      // Deux admins simultanés : l'index unique partiel a tranché.
      return res.status(409).json({ message: "Une autre modification des mêmes frais vient d'avoir lieu. Réessayez." });
    }
    next(err);
  }
}
