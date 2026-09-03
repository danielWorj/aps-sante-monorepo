// src/controllers/moyenPaiement.controller.js
// Module transverse "Moyens de paiement du médecin" — Mobile Money & Compte Bancaire
//
// ─── Pourquoi ce fichier ───────────────────────────────────────────
// Ce contrôleur gère les coordonnées de paiement (Mobile Money et
// Comptes Bancaires) qu'un médecin peut enregistrer pour recevoir
// ses honoraires, ainsi que le référentiel des opérateurs Mobile
// Money (TypeMobileMoney) par pays.
//
// ─── Règles d'accès ────────────────────────────────────────────────
// - TypeMobileMoney (référentiel opérateurs par pays) :
//     Lecture publique (ou connectée), écriture réservée à admin/superadmin.
// - MobileMoney & CompteBancaire (coordonnées de paiement) :
//     Lecture et écriture réservées au médecin propriétaire (utilisateur_id
//     déduit du token) ou à admin/superadmin (back-office).
//
// Champs réels des modèles (voir schema.prisma) :
//   TypeMobileMoney { id, pays_id, libelle }
//   MobileMoney     { id, type_mobile_money_id, medecin_id, numero, titulaire }
//   CompteBancaire  { id, medecin_id, nom_banque, titulaire, iban }

import prisma from "../lib/prisma.js";

// Sélection publique pour le référentiel Pays (utilisée lors des includes)
const SELECTION_PAYS_PUBLIC = {
  select: { pays_id: true, nom: true },
};

function estAdmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

/* ===================================================================
TypeMobileMoney (Référentiel des opérateurs par pays)
=================================================================== */

/**
 * GET /api/types-mobile-money
 * PUBLIQUE. Filtre optionnel : ?pays_id=...
 */
export async function listerTypesMobileMoney(req, res, next) {
  try {
    const { pays_id } = req.query;
    const where = {};
    if (pays_id) where.pays_id = pays_id;

    const types = await prisma.typeMobileMoney.findMany({
      where,
      include: {
        pays: SELECTION_PAYS_PUBLIC,
      },
      orderBy: { libelle: "asc" },
    });
    return res.status(200).json({ typesMobileMoney: types });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/types-mobile-money/:id
 * PUBLIQUE.
 */
export async function obtenirTypeMobileMoney(req, res, next) {
  try {
    const type = await prisma.typeMobileMoney.findUnique({
      where: { id: req.params.id },
      include: {
        pays: SELECTION_PAYS_PUBLIC,
      },
    });
    if (!type) {
      return res.status(404).json({ message: "Type de Mobile Money introuvable." });
    }
    return res.status(200).json({ typeMobileMoney: type });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/types-mobile-money
 * Réservé à admin/superadmin.
 */
export async function creerTypeMobileMoney(req, res, next) {
  try {
    if (!estAdmin(req.utilisateur)) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const { pays_id, libelle } = req.body;
    if (!pays_id || !libelle) {
      return res.status(400).json({ message: "Les champs pays_id et libelle sont obligatoires." });
    }

    const pays = await prisma.pays.findUnique({ where: { pays_id } });
    if (!pays) {
      return res.status(400).json({ message: "pays_id invalide : pays introuvable." });
    }

    const type = await prisma.typeMobileMoney.create({
      data: { pays_id, libelle },
      include: { pays: SELECTION_PAYS_PUBLIC },
    });
    return res.status(201).json({ message: "Type de Mobile Money créé.", typeMobileMoney: type });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/types-mobile-money/:id
 * Réservé à admin/superadmin.
 */
export async function modifierTypeMobileMoney(req, res, next) {
  try {
    if (!estAdmin(req.utilisateur)) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const type = await prisma.typeMobileMoney.findUnique({ where: { id: req.params.id } });
    if (!type) {
      return res.status(404).json({ message: "Type de Mobile Money introuvable." });
    }

    const donnees = {};
    if (req.body.libelle !== undefined) donnees.libelle = req.body.libelle;
    if (req.body.pays_id !== undefined) {
      const pays = await prisma.pays.findUnique({ where: { pays_id: req.body.pays_id } });
      if (!pays) return res.status(400).json({ message: "pays_id invalide : pays introuvable." });
      donnees.pays_id = req.body.pays_id;
    }

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    const typeMisAJour = await prisma.typeMobileMoney.update({
      where: { id: req.params.id },
      data: donnees,
      include: { pays: SELECTION_PAYS_PUBLIC },
    });
    return res.status(200).json({ message: "Type de Mobile Money mis à jour.", typeMobileMoney: typeMisAJour });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/types-mobile-money/:id
 * Réservé à superadmin.
 */
export async function supprimerTypeMobileMoney(req, res, next) {
  try {
    if (req.utilisateur?.role !== "superadmin") {
      return res.status(403).json({ message: "Accès refusé : réservé aux superadmins." });
    }

    const type = await prisma.typeMobileMoney.findUnique({ where: { id: req.params.id } });
    if (!type) {
      return res.status(404).json({ message: "Type de Mobile Money introuvable." });
    }

    await prisma.typeMobileMoney.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: "Type de Mobile Money supprimé." });
  } catch (err) {
    if (err.code === "P2003") {
      return res.status(409).json({
        message: "Impossible de supprimer ce type : des moyens de paiement Mobile Money y sont encore rattachés.",
      });
    }
    next(err);
  }
}

/* ===================================================================
MobileMoney (Coordonnées de paiement mobile d'un médecin)
=================================================================== */

/**
 * GET /api/medecins/:medecin_id/mobile-moneys (ou ?medecin_id=...)
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export async function listerMobileMoneyMedecin(req, res, next) {
  try {
    const medecin_id = req.params.medecin_id || req.query.medecin_id;
    if (!medecin_id) {
      return res.status(400).json({ message: "medecin_id requis." });
    }

    const medecin = await prisma.medecin.findUnique({ where: { medecin_id } });
    if (!medecin) {
      return res.status(404).json({ message: "Médecin introuvable." });
    }

    const estAdministrateur = estAdmin(req.utilisateur);
    const estProprietaire = req.utilisateur?.utilisateur_id === medecin.utilisateur_id;
    if (!estAdministrateur && !estProprietaire) {
      return res.status(403).json({ message: "Accès refusé : vous ne pouvez consulter que vos propres moyens de paiement." });
    }

    const mobileMoneys = await prisma.mobileMoney.findMany({
      where: { medecin_id },
      include: {
        type_mobile_money: {
          include: { pays: SELECTION_PAYS_PUBLIC },
        },
      },
    });
    return res.status(200).json({ mobileMoneys });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/mobile-moneys/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export async function obtenirMobileMoney(req, res, next) {
  try {
    const mm = await prisma.mobileMoney.findUnique({
      where: { id: req.params.id },
      include: {
        type_mobile_money: {
          include: { pays: SELECTION_PAYS_PUBLIC },
        },
        medecin: { select: { medecin_id: true, utilisateur_id: true } },
      },
    });
    if (!mm) {
      return res.status(404).json({ message: "Moyen de paiement Mobile Money introuvable." });
    }

    const estAdministrateur = estAdmin(req.utilisateur);
    const estProprietaire = req.utilisateur?.utilisateur_id === mm.medecin.utilisateur_id;
    if (!estAdministrateur && !estProprietaire) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    return res.status(200).json({ mobileMoney: mm });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/mobile-moneys
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export async function creerMobileMoney(req, res, next) {
  try {
    const { medecin_id, type_mobile_money_id, numero, titulaire } = req.body;
    if (!medecin_id || !type_mobile_money_id || !numero || !titulaire) {
      return res.status(400).json({
        message: "Champs obligatoires manquants : medecin_id, type_mobile_money_id, numero, titulaire.",
      });
    }

    const medecin = await prisma.medecin.findUnique({ where: { medecin_id } });
    if (!medecin) {
      return res.status(404).json({ message: "Médecin introuvable." });
    }

    const estAdministrateur = estAdmin(req.utilisateur);
    const estProprietaire = req.utilisateur?.utilisateur_id === medecin.utilisateur_id;
    if (!estAdministrateur && !estProprietaire) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    const typeMM = await prisma.typeMobileMoney.findUnique({ where: { id: type_mobile_money_id } });
    if (!typeMM) {
      return res.status(400).json({ message: "type_mobile_money_id invalide : opérateur introuvable." });
    }

    const mm = await prisma.mobileMoney.create({
      data: { medecin_id, type_mobile_money_id, numero, titulaire },
    });
    return res.status(201).json({ message: "Moyen de paiement Mobile Money ajouté.", mobileMoney: mm });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/mobile-moneys/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export async function modifierMobileMoney(req, res, next) {
  try {
    const mm = await prisma.mobileMoney.findUnique({
      where: { id: req.params.id },
      include: { medecin: { select: { utilisateur_id: true } } },
    });
    if (!mm) {
      return res.status(404).json({ message: "Moyen de paiement Mobile Money introuvable." });
    }

    const estAdministrateur = estAdmin(req.utilisateur);
    const estProprietaire = req.utilisateur?.utilisateur_id === mm.medecin.utilisateur_id;
    if (!estAdministrateur && !estProprietaire) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    const donnees = {};
    if (req.body.numero !== undefined) donnees.numero = req.body.numero;
    if (req.body.titulaire !== undefined) donnees.titulaire = req.body.titulaire;
    if (req.body.type_mobile_money_id !== undefined) {
      const typeMM = await prisma.typeMobileMoney.findUnique({ where: { id: req.body.type_mobile_money_id } });
      if (!typeMM) return res.status(400).json({ message: "type_mobile_money_id invalide : opérateur introuvable." });
      donnees.type_mobile_money_id = req.body.type_mobile_money_id;
    }

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    const mmMisAJour = await prisma.mobileMoney.update({
      where: { id: req.params.id },
      data: donnees,
    });
    return res.status(200).json({ message: "Moyen de paiement Mobile Money mis à jour.", mobileMoney: mmMisAJour });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/mobile-moneys/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export async function supprimerMobileMoney(req, res, next) {
  try {
    const mm = await prisma.mobileMoney.findUnique({
      where: { id: req.params.id },
      include: { medecin: { select: { utilisateur_id: true } } },
    });
    if (!mm) {
      return res.status(404).json({ message: "Moyen de paiement Mobile Money introuvable." });
    }

    const estAdministrateur = estAdmin(req.utilisateur);
    const estProprietaire = req.utilisateur?.utilisateur_id === mm.medecin.utilisateur_id;
    if (!estAdministrateur && !estProprietaire) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    await prisma.mobileMoney.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: "Moyen de paiement Mobile Money supprimé." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
CompteBancaire (Coordonnées bancaires d'un médecin)
=================================================================== */

/**
 * GET /api/medecins/:medecin_id/comptes-bancaires (ou ?medecin_id=...)
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export async function listerComptesBancairesMedecin(req, res, next) {
  try {
    const medecin_id = req.params.medecin_id || req.query.medecin_id;
    if (!medecin_id) {
      return res.status(400).json({ message: "medecin_id requis." });
    }

    const medecin = await prisma.medecin.findUnique({ where: { medecin_id } });
    if (!medecin) {
      return res.status(404).json({ message: "Médecin introuvable." });
    }

    const estAdministrateur = estAdmin(req.utilisateur);
    const estProprietaire = req.utilisateur?.utilisateur_id === medecin.utilisateur_id;
    if (!estAdministrateur && !estProprietaire) {
      return res.status(403).json({ message: "Accès refusé : vous ne pouvez consulter que vos propres moyens de paiement." });
    }

    const comptes = await prisma.compteBancaire.findMany({
      where: { medecin_id },
    });
    return res.status(200).json({ comptesBancaires: comptes });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/comptes-bancaires/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export async function obtenirCompteBancaire(req, res, next) {
  try {
    const cb = await prisma.compteBancaire.findUnique({
      where: { id: req.params.id },
      include: { medecin: { select: { medecin_id: true, utilisateur_id: true } } },
    });
    if (!cb) {
      return res.status(404).json({ message: "Compte bancaire introuvable." });
    }

    const estAdministrateur = estAdmin(req.utilisateur);
    const estProprietaire = req.utilisateur?.utilisateur_id === cb.medecin.utilisateur_id;
    if (!estAdministrateur && !estProprietaire) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    return res.status(200).json({ compteBancaire: cb });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/comptes-bancaires
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export async function creerCompteBancaire(req, res, next) {
  try {
    const { medecin_id, nom_banque, titulaire, iban } = req.body;
    if (!medecin_id || !nom_banque || !titulaire || !iban) {
      return res.status(400).json({
        message: "Champs obligatoires manquants : medecin_id, nom_banque, titulaire, iban.",
      });
    }

    const medecin = await prisma.medecin.findUnique({ where: { medecin_id } });
    if (!medecin) {
      return res.status(404).json({ message: "Médecin introuvable." });
    }

    const estAdministrateur = estAdmin(req.utilisateur);
    const estProprietaire = req.utilisateur?.utilisateur_id === medecin.utilisateur_id;
    if (!estAdministrateur && !estProprietaire) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    const cb = await prisma.compteBancaire.create({
      data: { medecin_id, nom_banque, titulaire, iban },
    });
    return res.status(201).json({ message: "Compte bancaire ajouté.", compteBancaire: cb });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/comptes-bancaires/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export async function modifierCompteBancaire(req, res, next) {
  try {
    const cb = await prisma.compteBancaire.findUnique({
      where: { id: req.params.id },
      include: { medecin: { select: { utilisateur_id: true } } },
    });
    if (!cb) {
      return res.status(404).json({ message: "Compte bancaire introuvable." });
    }

    const estAdministrateur = estAdmin(req.utilisateur);
    const estProprietaire = req.utilisateur?.utilisateur_id === cb.medecin.utilisateur_id;
    if (!estAdministrateur && !estProprietaire) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    const donnees = {};
    if (req.body.nom_banque !== undefined) donnees.nom_banque = req.body.nom_banque;
    if (req.body.titulaire !== undefined) donnees.titulaire = req.body.titulaire;
    if (req.body.iban !== undefined) donnees.iban = req.body.iban;

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    const cbMisAJour = await prisma.compteBancaire.update({
      where: { id: req.params.id },
      data: donnees,
    });
    return res.status(200).json({ message: "Compte bancaire mis à jour.", compteBancaire: cbMisAJour });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/comptes-bancaires/:id
 * Réservé au médecin propriétaire ou admin/superadmin.
 */
export async function supprimerCompteBancaire(req, res, next) {
  try {
    const cb = await prisma.compteBancaire.findUnique({
      where: { id: req.params.id },
      include: { medecin: { select: { utilisateur_id: true } } },
    });
    if (!cb) {
      return res.status(404).json({ message: "Compte bancaire introuvable." });
    }

    const estAdministrateur = estAdmin(req.utilisateur);
    const estProprietaire = req.utilisateur?.utilisateur_id === cb.medecin.utilisateur_id;
    if (!estAdministrateur && !estProprietaire) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    await prisma.compteBancaire.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: "Compte bancaire supprimé." });
  } catch (err) {
    next(err);
  }
}