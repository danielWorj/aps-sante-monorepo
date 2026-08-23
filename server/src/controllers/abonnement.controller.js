// src/controllers/abonnement.controller.js
// Sous-module "Pharmacie — Abonnement" : gère abonnement_pharmacie et
// ses lignes d'avantages (ligne_abonnement_pharmacie).
//
// Lecture : réservée à l'agent de la pharmacie concernée ou à un
// admin/superadmin — contrairement à l'Annuaire (pharmacie elle-même),
// un abonnement est une donnée commerciale interne, pas destinée au
// grand public.
// Création : agent de la pharmacie ou admin/superadmin. Toujours
// adossée à une transaction_paiement déjà existante (voir
// transaction_paiement — table «ref» stubée dans schema.prisma,
// définition complète portée par le module 06_paiement_escrow) : le
// contrôleur ne fait ici que vérifier sa présence, jamais son statut
// de règlement (hors périmètre de ce module).
// Modification / Suppression : admin/superadmin uniquement (impact
// financier — on ne laisse pas un agent réécrire librement les
// conditions de son propre abonnement).

import prisma from "../lib/prisma.js";

const STATUTS_ABONNEMENT = ["actif", "expire", "annule"];

function estAdmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

/**
 * Un agent ne gère que la pharmacie à laquelle il est rattaché (table
 * agent_pharmacie, UK sur utilisateur_id — voir schema.prisma) ; un
 * admin/superadmin gère toutes les pharmacies.
 */
async function estAgentDeLaPharmacie(utilisateur, pharmacieId) {
  if (!utilisateur) return false;
  const agent = await prisma.agentPharmacie.findUnique({
    where: { utilisateur_id: utilisateur.utilisateur_id },
  });
  return !!agent && agent.pharmacie_id === pharmacieId;
}

async function autoriserAccesPharmacie(utilisateur, pharmacieId) {
  if (estAdmin(utilisateur)) return true;
  return estAgentDeLaPharmacie(utilisateur, pharmacieId);
}

/* ===================================================================
 * Abonnements
 * =================================================================== */

/**
 * GET /api/abonnements-pharmacie?pharmacie_id=...
 * pharmacie_id est obligatoire pour un agent (il ne peut interroger
 * que sa propre pharmacie) ; un admin/superadmin peut l'omettre pour
 * lister tous les abonnements, toutes pharmacies confondues.
 */
export async function listerAbonnementsPharmacie(req, res, next) {
  try {
    const { pharmacie_id, statut } = req.query;

    if (statut && !STATUTS_ABONNEMENT.includes(statut)) {
      return res.status(400).json({
        message: `statut invalide. Valeurs acceptées : ${STATUTS_ABONNEMENT.join(", ")}.`,
      });
    }

    if (!pharmacie_id && !estAdmin(req.utilisateur)) {
      return res.status(400).json({
        message: "pharmacie_id est requis (un agent ne peut consulter que sa propre pharmacie).",
      });
    }

    if (pharmacie_id) {
      const autorise = await autoriserAccesPharmacie(req.utilisateur, pharmacie_id);
      if (!autorise) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }
    }

    const where = {};
    if (pharmacie_id) where.pharmacie_id = pharmacie_id;
    if (statut) where.statut = statut;

    const abonnements = await prisma.abonnementPharmacie.findMany({
      where,
      include: { lignes: { orderBy: { ordre_affichage: "asc" } } },
      orderBy: { date_debut: "desc" },
    });

    return res.status(200).json({ abonnements });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/abonnements-pharmacie/:id
 */
export async function obtenirAbonnementPharmacie(req, res, next) {
  try {
    const abonnement = await prisma.abonnementPharmacie.findUnique({
      where: { abonnement_id: req.params.id },
      include: { lignes: { orderBy: { ordre_affichage: "asc" } } },
    });
    if (!abonnement) {
      return res.status(404).json({ message: "Abonnement introuvable." });
    }

    const autorise = await autoriserAccesPharmacie(req.utilisateur, abonnement.pharmacie_id);
    if (!autorise) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    return res.status(200).json({ abonnement });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/abonnements-pharmacie
 * Champs requis : pharmacie_id, libelle, montant, duree_jours,
 * date_debut, date_fin, transaction_id, statut.
 * Champ optionnel : lignes (tableau de { libelle_avantage,
 * description?, ordre_affichage? }) — créées dans la même transaction
 * que l'abonnement.
 */
export async function creerAbonnementPharmacie(req, res, next) {
  try {
    const {
      pharmacie_id,
      libelle,
      montant,
      duree_jours,
      date_debut,
      date_fin,
      transaction_id,
      statut,
      lignes,
    } = req.body;

    if (
      !pharmacie_id || !libelle || montant === undefined || montant === null ||
      duree_jours === undefined || duree_jours === null ||
      !date_debut || !date_fin || !transaction_id || !statut
    ) {
      return res.status(400).json({
        message:
          "Champs requis manquants : pharmacie_id, libelle, montant, duree_jours, date_debut, date_fin, transaction_id, statut.",
      });
    }

    if (!STATUTS_ABONNEMENT.includes(statut)) {
      return res.status(400).json({
        message: `statut invalide. Valeurs acceptées : ${STATUTS_ABONNEMENT.join(", ")}.`,
      });
    }

    const autorise = await autoriserAccesPharmacie(req.utilisateur, pharmacie_id);
    if (!autorise) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const [pharmacie, transaction] = await Promise.all([
      prisma.pharmacie.findUnique({ where: { pharmacie_id } }),
      prisma.transactionPaiement.findUnique({ where: { transaction_id } }),
    ]);
    if (!pharmacie) {
      return res.status(400).json({ message: "pharmacie_id introuvable." });
    }
    if (!transaction) {
      return res.status(400).json({ message: "transaction_id introuvable." });
    }

    if (lignes !== undefined && !Array.isArray(lignes)) {
      return res.status(400).json({ message: "lignes doit être un tableau." });
    }
    for (const ligne of lignes || []) {
      if (!ligne.libelle_avantage || !ligne.libelle_avantage.trim()) {
        return res.status(400).json({ message: "Chaque ligne requiert libelle_avantage." });
      }
    }

    const abonnement = await prisma.$transaction(async (tx) => {
      const cree = await tx.abonnementPharmacie.create({
        data: {
          pharmacie_id,
          libelle,
          montant,
          duree_jours: Number(duree_jours),
          date_debut: new Date(date_debut),
          date_fin: new Date(date_fin),
          transaction_id,
          statut,
        },
      });

      if (lignes?.length) {
        await tx.ligneAbonnementPharmacie.createMany({
          data: lignes.map((ligne, index) => ({
            abonnement_id: cree.abonnement_id,
            libelle_avantage: ligne.libelle_avantage.trim(),
            description: ligne.description?.trim() || null,
            ordre_affichage: ligne.ordre_affichage ?? index,
          })),
        });
      }

      return tx.abonnementPharmacie.findUnique({
        where: { abonnement_id: cree.abonnement_id },
        include: { lignes: { orderBy: { ordre_affichage: "asc" } } },
      });
    });

    return res.status(201).json({ message: "Abonnement créé avec succès.", abonnement });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/abonnements-pharmacie/:id
 * Réservé à admin/superadmin (voir en-tête de fichier).
 */
export async function modifierAbonnementPharmacie(req, res, next) {
  try {
    if (!estAdmin(req.utilisateur)) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const { libelle, montant, duree_jours, date_debut, date_fin, statut } = req.body;

    const existant = await prisma.abonnementPharmacie.findUnique({
      where: { abonnement_id: req.params.id },
    });
    if (!existant) {
      return res.status(404).json({ message: "Abonnement introuvable." });
    }

    if (statut && !STATUTS_ABONNEMENT.includes(statut)) {
      return res.status(400).json({
        message: `statut invalide. Valeurs acceptées : ${STATUTS_ABONNEMENT.join(", ")}.`,
      });
    }

    const abonnement = await prisma.abonnementPharmacie.update({
      where: { abonnement_id: req.params.id },
      data: {
        ...(libelle && { libelle }),
        ...(montant !== undefined && { montant }),
        ...(duree_jours !== undefined && { duree_jours: Number(duree_jours) }),
        ...(date_debut && { date_debut: new Date(date_debut) }),
        ...(date_fin && { date_fin: new Date(date_fin) }),
        ...(statut && { statut }),
      },
      include: { lignes: { orderBy: { ordre_affichage: "asc" } } },
    });

    return res.status(200).json({ message: "Abonnement mis à jour.", abonnement });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/abonnements-pharmacie/:id
 * Réservé à admin/superadmin. Les lignes rattachées sont supprimées
 * dans la même transaction (pas de ON DELETE CASCADE au niveau du
 * schéma — cohérent avec le reste du dépôt, qui gère ces suppressions
 * explicitement plutôt qu'implicitement).
 */
export async function supprimerAbonnementPharmacie(req, res, next) {
  try {
    if (!estAdmin(req.utilisateur)) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const abonnement = await prisma.abonnementPharmacie.findUnique({
      where: { abonnement_id: req.params.id },
    });
    if (!abonnement) {
      return res.status(404).json({ message: "Abonnement introuvable." });
    }

    await prisma.$transaction([
      prisma.ligneAbonnementPharmacie.deleteMany({ where: { abonnement_id: req.params.id } }),
      prisma.abonnementPharmacie.delete({ where: { abonnement_id: req.params.id } }),
    ]);

    return res.status(200).json({ message: "Abonnement supprimé." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Lignes d'avantages (ligne_abonnement_pharmacie)
 * Même autorisation que la gestion de l'abonnement parent : agent de
 * la pharmacie concernée ou admin/superadmin.
 * =================================================================== */

/**
 * POST /api/abonnements-pharmacie/:id/lignes
 */
export async function ajouterLigneAbonnement(req, res, next) {
  try {
    const { libelle_avantage, description, ordre_affichage } = req.body;

    if (!libelle_avantage || !libelle_avantage.trim()) {
      return res.status(400).json({ message: "Champ requis manquant : libelle_avantage." });
    }

    const abonnement = await prisma.abonnementPharmacie.findUnique({
      where: { abonnement_id: req.params.id },
    });
    if (!abonnement) {
      return res.status(404).json({ message: "Abonnement introuvable." });
    }

    const autorise = await autoriserAccesPharmacie(req.utilisateur, abonnement.pharmacie_id);
    if (!autorise) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const ligne = await prisma.ligneAbonnementPharmacie.create({
      data: {
        abonnement_id: req.params.id,
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
 * PUT /api/abonnements-pharmacie/lignes/:ligneId
 */
export async function modifierLigneAbonnement(req, res, next) {
  try {
    const ligne = await prisma.ligneAbonnementPharmacie.findUnique({
      where: { ligne_id: req.params.ligneId },
      include: { abonnement: true },
    });
    if (!ligne) {
      return res.status(404).json({ message: "Ligne introuvable." });
    }

    const autorise = await autoriserAccesPharmacie(req.utilisateur, ligne.abonnement.pharmacie_id);
    if (!autorise) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const { libelle_avantage, description, ordre_affichage } = req.body;

    const ligneMiseAJour = await prisma.ligneAbonnementPharmacie.update({
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
 * DELETE /api/abonnements-pharmacie/lignes/:ligneId
 */
export async function supprimerLigneAbonnement(req, res, next) {
  try {
    const ligne = await prisma.ligneAbonnementPharmacie.findUnique({
      where: { ligne_id: req.params.ligneId },
      include: { abonnement: true },
    });
    if (!ligne) {
      return res.status(404).json({ message: "Ligne introuvable." });
    }

    const autorise = await autoriserAccesPharmacie(req.utilisateur, ligne.abonnement.pharmacie_id);
    if (!autorise) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    await prisma.ligneAbonnementPharmacie.delete({ where: { ligne_id: req.params.ligneId } });
    return res.status(200).json({ message: "Ligne supprimée." });
  } catch (err) {
    next(err);
  }
}