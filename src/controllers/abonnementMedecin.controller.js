// src/controllers/abonnementMedecin.controller.js
// Module transverse "Gestion des médecins" — sous-module Abonnement
// (présence forfaitaire) : abonnement_medecin et ses lignes
// d'avantages (ligne_abonnement_medecin).
//
// v9 : abonnement_medecin n'a PLUS de medecin_id direct. C'est
// désormais une offre commerciale indépendante (ex. "Présence
// Premium 30 jours"), reliée aux médecins par la table de jointure
// N-N forfait_abonnement_medecin (voir schema.prisma) : un médecin
// peut souscrire à plusieurs abonnements, et un même abonnement peut
// être souscrit par plusieurs médecins (offre groupée, ex. tous les
// médecins d'un même cabinet). Toute vérification "ce médecin a-t-il
// le droit de voir/modifier cet abonnement" passe donc désormais par
// abonnement.forfaits.some(f => f.medecin_id === medecin.medecin_id)
// plutôt que par une comparaison directe de medecin_id.
//
// Un abonnement reste toujours adossé à une transaction_paiement déjà
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

/**
 * true si `medecinId` figure parmi les souscripteurs (forfaits) de
 * l'abonnement fourni. `abonnement` doit avoir été chargé avec son
 * include `forfaits`.
 */
function estSouscripteur(medecinId, abonnement) {
  if (!medecinId || !abonnement?.forfaits) return false;
  return abonnement.forfaits.some((f) => f.medecin_id === medecinId);
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
 * Un médecin non-admin ne voit que les abonnements auxquels il est
 * rattaché via forfait_abonnement_medecin, quel que soit le filtre
 * envoyé — il n'a pas accès aux abonnements des autres médecins.
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
      if (medecin_id) where.forfaits = { some: { medecin_id } };
      if (statut) where.statut = statut;
    } else {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!medecin) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }
      where.forfaits = { some: { medecin_id: medecin.medecin_id } };
      if (statut) where.statut = statut;
    }

    const abonnements = await prisma.abonnementMedecin.findMany({
      where,
      include: {
        lignes: { orderBy: { ordre_affichage: "asc" } },
        forfaits: true,
      },
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
      include: {
        lignes: { orderBy: { ordre_affichage: "asc" } },
        forfaits: true,
      },
    });
    if (!abonnement) {
      return res.status(404).json({ message: "Abonnement introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!estSouscripteur(medecin?.medecin_id, abonnement)) {
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
 * Ouvert au médecin concerné (souscription pour lui-même, déduite du
 * token — tout medecin_id/medecin_ids envoyé dans le corps est
 * ignoré) ou à admin/superadmin, qui doit alors fournir explicitement
 * un ou plusieurs médecins à rattacher :
 *   - medecin_id   : souscription individuelle
 *   - medecin_ids  : offre groupée (ex. tous les médecins d'un même
 *                    cabinet souscrivent au même abonnement)
 * statut est toujours forcé à "actif" à la création — un abonnement
 * n'est créé qu'une fois la transaction réglée. La création de
 * l'abonnement et le rattachement du/des médecin(s) (table de
 * jointure forfait_abonnement_medecin) se font dans une seule
 * transaction Prisma.
 */
export async function creerAbonnementMedecin(req, res, next) {
  try {
    const { libelle, montant, duree_jours, date_debut, transaction_id } = req.body;

    let medecinIds;
    if (estAdmin(req.utilisateur)) {
      const { medecin_id, medecin_ids } = req.body;
      if (Array.isArray(medecin_ids) && medecin_ids.length > 0) {
        medecinIds = [...new Set(medecin_ids)];
      } else if (medecin_id) {
        medecinIds = [medecin_id];
      } else {
        return res.status(400).json({
          message: "medecin_id (ou medecin_ids pour une offre groupée) requis pour un admin/superadmin.",
        });
      }
    } else {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!medecin) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }
      medecinIds = [medecin.medecin_id];
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

    const medecinsTrouves = await prisma.medecin.findMany({
      where: { medecin_id: { in: medecinIds } },
    });
    if (medecinsTrouves.length !== medecinIds.length) {
      return res.status(400).json({ message: "Un ou plusieurs medecin_id sont introuvables." });
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

    const abonnement = await prisma.$transaction(async (tx) => {
      const nouvelAbonnement = await tx.abonnementMedecin.create({
        data: {
          libelle: libelle.trim(),
          montant: montantNombre,
          duree_jours: dureeNombre,
          date_debut: dateDebut,
          date_fin: dateFin,
          transaction_id,
          statut: "actif",
        },
      });

      await tx.forfaitAbonnementMedecin.createMany({
        data: medecinIds.map((medecin_id) => ({
          medecin_id,
          abonnement_id: nouvelAbonnement.abonnement_id,
        })),
      });

      return tx.abonnementMedecin.findUnique({
        where: { abonnement_id: nouvelAbonnement.abonnement_id },
        include: { forfaits: true },
      });
    });

    return res.status(201).json({ message: "Abonnement créé.", abonnement });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/abonnements-medecin/:id
 * Ouvert à tout médecin souscripteur (rattaché via un forfait) ou à
 * admin/superadmin. duree_jours et/ou date_debut, si fournis,
 * recalculent automatiquement date_fin. La composition des
 * souscripteurs (ajout/retrait de médecins) ne passe plus par cette
 * route — voir ajouterMedecinAbonnement / retirerMedecinAbonnement.
 */
export async function modifierAbonnementMedecin(req, res, next) {
  try {
    const abonnement = await prisma.abonnementMedecin.findUnique({
      where: { abonnement_id: req.params.id },
      include: { forfaits: true },
    });
    if (!abonnement) {
      return res.status(404).json({ message: "Abonnement introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!estSouscripteur(medecin?.medecin_id, abonnement)) {
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
 * Ouvert à tout médecin souscripteur ou à admin/superadmin.
 */
export async function supprimerAbonnementMedecin(req, res, next) {
  try {
    const abonnement = await prisma.abonnementMedecin.findUnique({
      where: { abonnement_id: req.params.id },
      include: { forfaits: true },
    });
    if (!abonnement) {
      return res.status(404).json({ message: "Abonnement introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!estSouscripteur(medecin?.medecin_id, abonnement)) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }
    }

    // Supprime aussi les lignes d'avantages et les rattachements
    // médecin (forfaits) — pas de cascade en base, voir schema.prisma
    // — avant l'abonnement lui-même.
    await prisma.$transaction([
      prisma.ligneAbonnementMedecin.deleteMany({ where: { abonnement_id: req.params.id } }),
      prisma.forfaitAbonnementMedecin.deleteMany({ where: { abonnement_id: req.params.id } }),
      prisma.abonnementMedecin.delete({ where: { abonnement_id: req.params.id } }),
    ]);

    return res.status(200).json({ message: "Abonnement supprimé." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Souscripteurs (forfait_abonnement_medecin) — composition N-N
 * =================================================================== */

/**
 * POST /api/abonnements-medecin/:id/medecins
 * Réservé à admin/superadmin : rattache un médecin supplémentaire à
 * un abonnement existant (offre groupée, ex. plusieurs médecins d'un
 * même cabinet souscrivant au même abonnement). Un médecin ne peut
 * pas s'auto-ajouter à un abonnement après coup — seul admin/
 * superadmin gère la composition d'un abonnement groupé, la
 * souscription initiale se fait à la création (voir
 * creerAbonnementMedecin).
 */
export async function ajouterMedecinAbonnement(req, res, next) {
  try {
    if (!estAdmin(req.utilisateur)) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const abonnement = await prisma.abonnementMedecin.findUnique({
      where: { abonnement_id: req.params.id },
    });
    if (!abonnement) {
      return res.status(404).json({ message: "Abonnement introuvable." });
    }

    const { medecin_id } = req.body;
    if (!medecin_id) {
      return res.status(400).json({ message: "medecin_id requis." });
    }

    const medecin = await prisma.medecin.findUnique({ where: { medecin_id } });
    if (!medecin) {
      return res.status(400).json({ message: "medecin_id introuvable." });
    }

    const dejaRattache = await prisma.forfaitAbonnementMedecin.findUnique({
      where: {
        medecin_id_abonnement_id: { medecin_id, abonnement_id: req.params.id },
      },
    });
    if (dejaRattache) {
      return res.status(409).json({ message: "Ce médecin est déjà rattaché à cet abonnement." });
    }

    const forfait = await prisma.forfaitAbonnementMedecin.create({
      data: { medecin_id, abonnement_id: req.params.id },
    });

    return res.status(201).json({ message: "Médecin rattaché à l'abonnement.", forfait });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/abonnements-medecin/:id/medecins/:medecinId
 * Réservé à admin/superadmin.
 */
export async function retirerMedecinAbonnement(req, res, next) {
  try {
    if (!estAdmin(req.utilisateur)) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const forfait = await prisma.forfaitAbonnementMedecin.findUnique({
      where: {
        medecin_id_abonnement_id: {
          medecin_id: req.params.medecinId,
          abonnement_id: req.params.id,
        },
      },
    });
    if (!forfait) {
      return res.status(404).json({ message: "Ce médecin n'est pas rattaché à cet abonnement." });
    }

    await prisma.forfaitAbonnementMedecin.delete({
      where: { forfait_abonnement_medecin_id: forfait.forfait_abonnement_medecin_id },
    });

    return res.status(200).json({ message: "Médecin retiré de l'abonnement." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Lignes d'avantages (ligne_abonnement_medecin)
 * =================================================================== */

/**
 * POST /api/abonnements-medecin/:id/lignes
 * Ouvert à tout médecin souscripteur de l'abonnement parent ou à
 * admin/superadmin.
 */
export async function ajouterLigneAbonnementMedecin(req, res, next) {
  try {
    const abonnement = await prisma.abonnementMedecin.findUnique({
      where: { abonnement_id: req.params.id },
      include: { forfaits: true },
    });
    if (!abonnement) {
      return res.status(404).json({ message: "Abonnement introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!estSouscripteur(medecin?.medecin_id, abonnement)) {
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
      include: { abonnement: { include: { forfaits: true } } },
    });
    if (!ligne) {
      return res.status(404).json({ message: "Ligne d'avantage introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!estSouscripteur(medecin?.medecin_id, ligne.abonnement)) {
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
      include: { abonnement: { include: { forfaits: true } } },
    });
    if (!ligne) {
      return res.status(404).json({ message: "Ligne d'avantage introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!estSouscripteur(medecin?.medecin_id, ligne.abonnement)) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }
    }

    await prisma.ligneAbonnementMedecin.delete({ where: { ligne_id: req.params.ligneId } });
    return res.status(200).json({ message: "Ligne d'avantage supprimée." });
  } catch (err) {
    next(err);
  }
}