// src/controllers/abonnementMedecin.controller.js
// Module transverse "Gestion des médecins" — sous-module Abonnement
// (présence forfaitaire) : abonnement_medecin et ses lignes
// d'avantages (ligne_abonnement_medecin). Même patron exact que
// abonnement_pharmacie (voir abonnement.routes.js) : donnée commerciale
// interne, pas d'Annuaire public ici — TOUTES les routes exigent déjà
// "authentifier" (middleware), l'autorisation fine (le médecin
// concerné vs admin/superadmin) est appliquée ICI, au cas par cas, car
// elle dépend du médecin ciblé par l'abonnement.
//
// Un abonnement est toujours adossé à une transaction_paiement déjà
// réglée (module 06_paiement_escrow, table «ref» stubée dans
// schema.prisma) : on ne crée jamais un abonnement sans transaction_id
// valide. date_fin est dérivée de date_debut + duree_jours plutôt que
// laissée à la saisie libre, pour éviter toute incohérence.

import prisma from "../lib/prisma.js";

const STATUTS_ABONNEMENT_MEDECIN = ["actif", "expire", "annule"];

function estAdmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

/**
 * Retrouve la fiche `medecin` du titulaire du token, si le compte
 * connecté a bien un profil médecin. `null` sinon (patient, agent,
 * admin sans fiche médecin propre, etc.).
 */
async function profilMedecinCourant(utilisateurCourant) {
  if (!utilisateurCourant) return null;
  return prisma.medecin.findUnique({
    where: { utilisateur_id: utilisateurCourant.utilisateur_id },
  });
}

function ajouterJours(date, jours) {
  const resultat = new Date(date);
  resultat.setDate(resultat.getDate() + jours);
  return resultat;
}

/* ===================================================================
 * Abonnements médecin
 * =================================================================== */

/**
 * GET /api/abonnements-medecin
 * Filtres optionnels (admin/superadmin uniquement) : ?medecin_id=...&statut=...
 * Un médecin non-admin ne voit que ses propres abonnements, quel que
 * soit le filtre envoyé — il n'a pas accès aux abonnements des autres
 * médecins.
 */
export async function listerAbonnementsMedecin(req, res, next) {
  try {
    const { medecin_id, statut } = req.query;

    if (statut && !STATUTS_ABONNEMENT_MEDECIN.includes(statut)) {
      return res.status(400).json({
        message: `statut invalide. Valeurs acceptées : ${STATUTS_ABONNEMENT_MEDECIN.join(", ")}.`,
      });
    }

    const where = {};

    if (estAdmin(req.utilisateur)) {
      if (medecin_id) where.medecin_id = medecin_id;
      if (statut) where.statut = statut;
    } else {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!medecin) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }
      where.medecin_id = medecin.medecin_id;
      if (statut) where.statut = statut;
    }

    const abonnements = await prisma.abonnementMedecin.findMany({
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
 * GET /api/abonnements-medecin/:id
 */
export async function obtenirAbonnementMedecin(req, res, next) {
  try {
    const abonnement = await prisma.abonnementMedecin.findUnique({
      where: { abonnement_id: req.params.id },
      include: { lignes: { orderBy: { ordre_affichage: "asc" } } },
    });
    if (!abonnement) {
      return res.status(404).json({ message: "Abonnement introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!medecin || medecin.medecin_id !== abonnement.medecin_id) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }
    }

    return res.status(200).json({ abonnement });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/abonnements-medecin
 * Ouvert au médecin concerné (medecin_id déduit du token, ignoré s'il
 * est envoyé dans le corps) ou à admin/superadmin (qui doit alors
 * fournir explicitement medecin_id). statut est toujours forcé à
 * "actif" à la création — un abonnement n'est créé qu'une fois la
 * transaction réglée.
 */
export async function creerAbonnementMedecin(req, res, next) {
  try {
    const { libelle, montant, duree_jours, date_debut, transaction_id } = req.body;
    let { medecin_id } = req.body;

    if (estAdmin(req.utilisateur)) {
      if (!medecin_id) {
        return res.status(400).json({ message: "medecin_id requis pour un admin/superadmin." });
      }
    } else {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!medecin) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }
      medecin_id = medecin.medecin_id;
    }

    if (!libelle || montant === undefined || !duree_jours || !date_debut || !transaction_id) {
      return res.status(400).json({
        message: "Champs requis manquants : libelle, montant, duree_jours, date_debut, transaction_id.",
      });
    }

    const montantNombre = Number(montant);
    const dureeNombre = Number(duree_jours);
    if (Number.isNaN(montantNombre) || montantNombre < 0) {
      return res.status(400).json({ message: "montant invalide." });
    }
    if (!Number.isInteger(dureeNombre) || dureeNombre <= 0) {
      return res.status(400).json({ message: "duree_jours invalide (entier positif attendu)." });
    }

    const medecinCible = await prisma.medecin.findUnique({ where: { medecin_id } });
    if (!medecinCible) {
      return res.status(400).json({ message: "medecin_id introuvable." });
    }

    const transaction = await prisma.transactionPaiement.findUnique({
      where: { transaction_id },
    });
    if (!transaction) {
      return res.status(400).json({ message: "transaction_id introuvable." });
    }

    const dateDebut = new Date(date_debut);
    if (Number.isNaN(dateDebut.getTime())) {
      return res.status(400).json({ message: "date_debut invalide." });
    }
    const dateFin = ajouterJours(dateDebut, dureeNombre);

    const abonnement = await prisma.abonnementMedecin.create({
      data: {
        medecin_id,
        libelle: libelle.trim(),
        montant: montantNombre,
        duree_jours: dureeNombre,
        date_debut: dateDebut,
        date_fin: dateFin,
        transaction_id,
        statut: "actif",
      },
    });

    return res.status(201).json({ message: "Abonnement créé.", abonnement });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/abonnements-medecin/:id
 * Ouvert au médecin concerné ou à admin/superadmin. duree_jours et/ou
 * date_debut, si fournis, recalculent automatiquement date_fin.
 */
export async function modifierAbonnementMedecin(req, res, next) {
  try {
    const abonnement = await prisma.abonnementMedecin.findUnique({
      where: { abonnement_id: req.params.id },
    });
    if (!abonnement) {
      return res.status(404).json({ message: "Abonnement introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!medecin || medecin.medecin_id !== abonnement.medecin_id) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }
    }

    const { libelle, montant, duree_jours, date_debut, statut } = req.body;
    const donnees = {};

    if (libelle !== undefined) donnees.libelle = libelle.trim();

    if (montant !== undefined) {
      const montantNombre = Number(montant);
      if (Number.isNaN(montantNombre) || montantNombre < 0) {
        return res.status(400).json({ message: "montant invalide." });
      }
      donnees.montant = montantNombre;
    }

    if (statut !== undefined) {
      if (!STATUTS_ABONNEMENT_MEDECIN.includes(statut)) {
        return res.status(400).json({
          message: `statut invalide. Valeurs acceptées : ${STATUTS_ABONNEMENT_MEDECIN.join(", ")}.`,
        });
      }
      donnees.statut = statut;
    }

    if (duree_jours !== undefined || date_debut !== undefined) {
      const dureeNombre = Number(duree_jours ?? abonnement.duree_jours);
      if (!Number.isInteger(dureeNombre) || dureeNombre <= 0) {
        return res.status(400).json({ message: "duree_jours invalide (entier positif attendu)." });
      }
      const dateDebut = date_debut !== undefined ? new Date(date_debut) : abonnement.date_debut;
      if (Number.isNaN(dateDebut.getTime())) {
        return res.status(400).json({ message: "date_debut invalide." });
      }
      donnees.duree_jours = dureeNombre;
      donnees.date_debut = dateDebut;
      donnees.date_fin = ajouterJours(dateDebut, dureeNombre);
    }

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    const abonnementMisAJour = await prisma.abonnementMedecin.update({
      where: { abonnement_id: req.params.id },
      data: donnees,
    });

    return res.status(200).json({ message: "Abonnement mis à jour.", abonnement: abonnementMisAJour });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/abonnements-medecin/:id
 * Ouvert au médecin concerné ou à admin/superadmin.
 */
export async function supprimerAbonnementMedecin(req, res, next) {
  try {
    const abonnement = await prisma.abonnementMedecin.findUnique({
      where: { abonnement_id: req.params.id },
    });
    if (!abonnement) {
      return res.status(404).json({ message: "Abonnement introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!medecin || medecin.medecin_id !== abonnement.medecin_id) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }
    }

    // Supprime aussi les lignes d'avantages rattachées (pas de cascade
    // en base — voir schema.prisma) avant l'abonnement lui-même.
    await prisma.$transaction([
      prisma.ligneAbonnementMedecin.deleteMany({ where: { abonnement_id: req.params.id } }),
      prisma.abonnementMedecin.delete({ where: { abonnement_id: req.params.id } }),
    ]);

    return res.status(200).json({ message: "Abonnement supprimé." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Lignes d'avantages (ligne_abonnement_medecin)
 * =================================================================== */

/**
 * POST /api/abonnements-medecin/:id/lignes
 * Ouvert au médecin propriétaire de l'abonnement parent ou à
 * admin/superadmin.
 */
export async function ajouterLigneAbonnementMedecin(req, res, next) {
  try {
    const abonnement = await prisma.abonnementMedecin.findUnique({
      where: { abonnement_id: req.params.id },
    });
    if (!abonnement) {
      return res.status(404).json({ message: "Abonnement introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!medecin || medecin.medecin_id !== abonnement.medecin_id) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }
    }

    const { libelle_avantage, description, ordre_affichage } = req.body;
    if (!libelle_avantage || ordre_affichage === undefined) {
      return res.status(400).json({
        message: "Champs requis manquants : libelle_avantage, ordre_affichage.",
      });
    }

    const ordreNombre = Number(ordre_affichage);
    if (!Number.isInteger(ordreNombre) || ordreNombre < 0) {
      return res.status(400).json({ message: "ordre_affichage invalide (entier positif attendu)." });
    }

    const ligne = await prisma.ligneAbonnementMedecin.create({
      data: {
        abonnement_id: req.params.id,
        libelle_avantage: libelle_avantage.trim(),
        description: description?.trim() || null,
        ordre_affichage: ordreNombre,
      },
    });

    return res.status(201).json({ message: "Ligne d'avantage ajoutée.", ligne });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/lignes-abonnement-medecin/:ligneId
 */
export async function modifierLigneAbonnementMedecin(req, res, next) {
  try {
    const ligne = await prisma.ligneAbonnementMedecin.findUnique({
      where: { ligne_id: req.params.ligneId },
      include: { abonnement: true },
    });
    if (!ligne) {
      return res.status(404).json({ message: "Ligne d'avantage introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!medecin || medecin.medecin_id !== ligne.abonnement.medecin_id) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }
    }

    const { libelle_avantage, description, ordre_affichage } = req.body;
    const donnees = {};

    if (libelle_avantage !== undefined) donnees.libelle_avantage = libelle_avantage.trim();
    if (description !== undefined) donnees.description = description?.trim() || null;
    if (ordre_affichage !== undefined) {
      const ordreNombre = Number(ordre_affichage);
      if (!Number.isInteger(ordreNombre) || ordreNombre < 0) {
        return res.status(400).json({ message: "ordre_affichage invalide (entier positif attendu)." });
      }
      donnees.ordre_affichage = ordreNombre;
    }

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    const ligneMiseAJour = await prisma.ligneAbonnementMedecin.update({
      where: { ligne_id: req.params.ligneId },
      data: donnees,
    });

    return res.status(200).json({ message: "Ligne d'avantage mise à jour.", ligne: ligneMiseAJour });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/lignes-abonnement-medecin/:ligneId
 */
export async function supprimerLigneAbonnementMedecin(req, res, next) {
  try {
    const ligne = await prisma.ligneAbonnementMedecin.findUnique({
      where: { ligne_id: req.params.ligneId },
      include: { abonnement: true },
    });
    if (!ligne) {
      return res.status(404).json({ message: "Ligne d'avantage introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!medecin || medecin.medecin_id !== ligne.abonnement.medecin_id) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }
    }

    await prisma.ligneAbonnementMedecin.delete({ where: { ligne_id: req.params.ligneId } });
    return res.status(200).json({ message: "Ligne d'avantage supprimée." });
  } catch (err) {
    next(err);
  }
}