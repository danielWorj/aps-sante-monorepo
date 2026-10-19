// src/controllers/avis.controller.js
// Gère deux tables jumelles, avec exactement le même patron
// (modération manuelle, note bornée, auteur vs admin) :
//   - avis_pharmacie → sous-module "Pharmacie — Avis"
//   - avis_medecin   → module transverse "Gestion des médecins"
//     (voir medecin.routes.js, section "Avis médecin")
//
// Lecture : PUBLIQUE, mais un visiteur non authentifié (ou tout
// utilisateur qui n'est ni l'auteur ni admin/superadmin) ne voit que
// les avis au statut "publie" — un avis "en_attente"/"rejete" reste
// invisible tant qu'un admin/superadmin ne l'a pas validé (voir
// filtrerSelonVisibilite ci-dessous, réutilisée pour les deux tables :
// elle ne dépend que de statut_moderation/utilisateur_id, communs aux
// deux). Même logique de modération que statut_verification sur
// pharmacie.controller.js / medecin.controller.js.
// Création : tout utilisateur authentifié (patient inclus) peut
// déposer un avis sur une pharmacie ou sur un médecin. Toujours créé
// "en_attente", quelle que soit la valeur envoyée (aucun rôle ne peut
// publier directement son propre avis).
// Modification : l'auteur peut corriger note/commentaire tant que
// l'avis n'a pas encore été modéré (statut "en_attente" seulement —
// une fois publié/rejeté, seul un admin/superadmin peut encore agir,
// et uniquement sur statut_moderation, pas sur le contenu). Un
// admin/superadmin peut à tout moment changer statut_moderation.
// Suppression : l'auteur (quel que soit le statut) ou admin/superadmin.

import prisma from "../lib/prisma.js";
import {
  normaliserSaisieAvis,
  notifierAvisPublie,
  recalculerNoteMedecin,
  verifierEligibiliteAvis,
} from "../services/avisMedecin.service.js";

const NOTE_MIN = 1;
const NOTE_MAX = 5;
const STATUTS_MODERATION_AVIS = ["en_attente", "publie", "rejete"];

function estAdmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

/**
 * Un visiteur public (ou un utilisateur authentifié qui n'est ni
 * l'auteur ni admin/superadmin) ne doit jamais voir un avis non
 * encore validé — sinon un commentaire diffamatoire/à modérer
 * deviendrait visible avant tout contrôle.
 */
function filtrerSelonVisibilite(avis, utilisateurCourant) {
  if (avis.statut_moderation === "publie") return true;
  if (!utilisateurCourant) return false;
  if (estAdmin(utilisateurCourant)) return true;
  return avis.utilisateur_id === utilisateurCourant.utilisateur_id;
}

/* ===================================================================
 * Avis
 * =================================================================== */

/**
 * GET /api/avis-pharmacie
 * Filtres optionnels : ?pharmacie_id=...&statut_moderation=...
 * statut_moderation n'est pris en compte que pour un admin/superadmin
 * authentifié — un visiteur public reçoit toujours uniquement les
 * avis "publie", quel que soit le filtre envoyé.
 */
export async function listerAvisPharmacie(req, res, next) {
  try {
    const { pharmacie_id, statut_moderation } = req.query;

    if (statut_moderation && !STATUTS_MODERATION_AVIS.includes(statut_moderation)) {
      return res.status(400).json({
        message: `statut_moderation invalide. Valeurs acceptées : ${STATUTS_MODERATION_AVIS.join(", ")}.`,
      });
    }

    const where = {};
    if (pharmacie_id) where.pharmacie_id = pharmacie_id;

    if (estAdmin(req.utilisateur)) {
      if (statut_moderation) where.statut_moderation = statut_moderation;
    } else {
      where.statut_moderation = "publie";
    }

    const avis = await prisma.avisPharmacie.findMany({
      where,
      orderBy: { date_creation: "desc" },
    });

    return res.status(200).json({ avis });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/avis-pharmacie/:id
 */
export async function obtenirAvisPharmacie(req, res, next) {
  try {
    const avis = await prisma.avisPharmacie.findUnique({
      where: { avis_id: req.params.id },
    });
    if (!avis || !filtrerSelonVisibilite(avis, req.utilisateur)) {
      return res.status(404).json({ message: "Avis introuvable." });
    }

    return res.status(200).json({ avis });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/avis-pharmacie
 * Réservé aux utilisateurs authentifiés. statut_moderation est
 * toujours forcé à "en_attente" à la création, quel que soit le rôle.
 */
export async function creerAvisPharmacie(req, res, next) {
  try {
    const { pharmacie_id, note, commentaire } = req.body;

    if (!pharmacie_id || note === undefined || note === null) {
      return res.status(400).json({ message: "Champs requis manquants : pharmacie_id, note." });
    }

    const noteNombre = Number(note);
    if (!Number.isInteger(noteNombre) || noteNombre < NOTE_MIN || noteNombre > NOTE_MAX) {
      return res.status(400).json({
        message: `note invalide (doit être un entier entre ${NOTE_MIN} et ${NOTE_MAX}).`,
      });
    }

    const pharmacie = await prisma.pharmacie.findUnique({ where: { pharmacie_id } });
    if (!pharmacie) {
      return res.status(400).json({ message: "pharmacie_id introuvable." });
    }

    const avis = await prisma.avisPharmacie.create({
      data: {
        utilisateur_id: req.utilisateur.utilisateur_id,
        pharmacie_id,
        note: noteNombre,
        commentaire: commentaire?.trim() || null,
        statut_moderation: "en_attente",
      },
    });

    return res.status(201).json({
      message: "Avis déposé avec succès. Il sera visible après modération.",
      avis,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/avis-pharmacie/:id
 *   - L'auteur peut modifier note/commentaire, uniquement tant que
 *     l'avis est encore "en_attente" (un avis déjà modéré ne peut
 *     plus être réécrit après coup par son auteur).
 *   - Un admin/superadmin peut à tout moment modifier
 *     statut_moderation (modération à proprement parler), et
 *     seulement ce champ.
 */
export async function modifierAvisPharmacie(req, res, next) {
  try {
    const avis = await prisma.avisPharmacie.findUnique({ where: { avis_id: req.params.id } });
    if (!avis) {
      return res.status(404).json({ message: "Avis introuvable." });
    }

    const estAuteur = req.utilisateur?.utilisateur_id === avis.utilisateur_id;
    if (!estAuteur && !estAdmin(req.utilisateur)) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const donnees = {};

    if (estAdmin(req.utilisateur) && req.body.statut_moderation !== undefined) {
      if (!STATUTS_MODERATION_AVIS.includes(req.body.statut_moderation)) {
        return res.status(400).json({
          message: `statut_moderation invalide. Valeurs acceptées : ${STATUTS_MODERATION_AVIS.join(", ")}.`,
        });
      }
      donnees.statut_moderation = req.body.statut_moderation;
    }

    if (estAuteur) {
      if (avis.statut_moderation !== "en_attente") {
        return res.status(409).json({
          message: "Cet avis a déjà été modéré : son contenu ne peut plus être modifié.",
        });
      }
      if (req.body.note !== undefined) {
        const noteNombre = Number(req.body.note);
        if (!Number.isInteger(noteNombre) || noteNombre < NOTE_MIN || noteNombre > NOTE_MAX) {
          return res.status(400).json({
            message: `note invalide (doit être un entier entre ${NOTE_MIN} et ${NOTE_MAX}).`,
          });
        }
        donnees.note = noteNombre;
      }
      if (req.body.commentaire !== undefined) {
        donnees.commentaire = req.body.commentaire?.trim() || null;
      }
    }

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    const avisMisAJour = await prisma.avisPharmacie.update({
      where: { avis_id: req.params.id },
      data: donnees,
    });

    return res.status(200).json({ message: "Avis mis à jour.", avis: avisMisAJour });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/avis-pharmacie/:id
 * Réservé à l'auteur de l'avis ou à un admin/superadmin.
 */
export async function supprimerAvisPharmacie(req, res, next) {
  try {
    const avis = await prisma.avisPharmacie.findUnique({ where: { avis_id: req.params.id } });
    if (!avis) {
      return res.status(404).json({ message: "Avis introuvable." });
    }

    const estAuteur = req.utilisateur?.utilisateur_id === avis.utilisateur_id;
    if (!estAuteur && !estAdmin(req.utilisateur)) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    await prisma.avisPharmacie.delete({ where: { avis_id: req.params.id } });
    return res.status(200).json({ message: "Avis supprimé." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Avis médecin — même patron de modération que les avis pharmacie
 * (estAdmin, filtrerSelonVisibilite, STATUTS_MODERATION_AVIS), avec les
 * règles de la réputation médecin (services/avisMedecin.service.js) :
 * avis rattaché à une consultation terminée du patient (rdv_id, un avis
 * par RDV), critères facultatifs, note moyenne de la fiche recalculée à
 * chaque modération / suppression. Réponse et signalement du médecin,
 * avis publics et tableau de bord : reputationMedecin.controller.js.
 * =================================================================== */

/** Vue back-office : auteur, médecin, RDV, réponse et signalement. */
const INCLUSION_AVIS_ADMIN = {
  utilisateur: { select: { utilisateur_id: true, prenom: true, nom: true, email: true } },
  medecin: {
    select: {
      medecin_id: true,
      utilisateur: { select: { prenom: true, nom: true } },
      specialite: { select: { nom: true } },
    },
  },
  rendez_vous: { select: { rdv_id: true, type_rdv: true, date_creneau: true, termine_le: true } },
};

/**
 * GET /api/avis-medecin
 * Filtres optionnels : ?medecin_id=...&statut_moderation=...&signale=true
 * statut_moderation / signale ne sont pris en compte que pour un
 * admin/superadmin authentifié (qui reçoit aussi auteur, médecin et RDV) —
 * un visiteur public reçoit toujours uniquement les avis "publie".
 * Pour l'affichage public, préférer GET /medecins/:id/avis (synthèse,
 * pagination, identité de l'auteur réduite à « Prénom N. »).
 */
export async function listerAvisMedecin(req, res, next) {
  try {
    const { medecin_id, statut_moderation, signale } = req.query;

    if (statut_moderation && !STATUTS_MODERATION_AVIS.includes(statut_moderation)) {
      return res.status(400).json({
        message: `statut_moderation invalide. Valeurs acceptées : ${STATUTS_MODERATION_AVIS.join(", ")}.`,
      });
    }

    const where = {};
    if (medecin_id) where.medecin_id = medecin_id;

    const admin = estAdmin(req.utilisateur);
    if (admin) {
      if (statut_moderation) where.statut_moderation = statut_moderation;
      if (signale === "true") where.signale_le = { not: null };
    } else {
      where.statut_moderation = "publie";
    }

    const avis = await prisma.avisMedecin.findMany({
      where,
      orderBy: { date_creation: "desc" },
      ...(admin ? { include: INCLUSION_AVIS_ADMIN } : {}),
    });

    return res.status(200).json({ avis });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/avis-medecin/:id
 */
export async function obtenirAvisMedecin(req, res, next) {
  try {
    const avis = await prisma.avisMedecin.findUnique({
      where: { avis_id: req.params.id },
      ...(estAdmin(req.utilisateur) ? { include: INCLUSION_AVIS_ADMIN } : {}),
    });
    if (!avis || !filtrerSelonVisibilite(avis, req.utilisateur)) {
      return res.status(404).json({ message: "Avis introuvable." });
    }

    return res.status(200).json({ avis });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/avis-medecin
 * Body : { rdv_id, note, note_ponctualite?, note_ecoute?, note_explications?,
 *          recommande?, commentaire?, anonyme? }
 * Réservé au PATIENT d'une consultation terminée (voir
 * verifierEligibiliteAvis) ; le médecin est déduit du RDV. Toujours créé
 * "en_attente" (modération), quel que soit le rôle.
 */
export async function creerAvisMedecin(req, res, next) {
  try {
    const { rdv_id } = req.body ?? {};
    if (!rdv_id) {
      return res.status(400).json({
        message: "rdv_id est requis : un avis porte sur une consultation que vous avez eue avec ce médecin.",
      });
    }

    const saisie = normaliserSaisieAvis(req.body);
    if (saisie.erreur) return res.status(saisie.erreur.status).json(saisie.erreur);

    const rdv = await prisma.rendezVous.findUnique({
      where: { rdv_id },
      select: {
        rdv_id: true, medecin_id: true, statut: true, termine_le: true, date_creneau: true,
        patient: { select: { utilisateur_id: true } },
        avis_medecin: { select: { avis_id: true } },
      },
    });
    const refus = verifierEligibiliteAvis(rdv, req.utilisateur.utilisateur_id);
    if (refus) return res.status(refus.erreur.status).json(refus.erreur);

    let avis;
    try {
      avis = await prisma.avisMedecin.create({
        data: {
          ...saisie.donnees,
          utilisateur_id: req.utilisateur.utilisateur_id,
          medecin_id: rdv.medecin_id,
          rdv_id: rdv.rdv_id,
          statut_moderation: "en_attente",
        },
      });
    } catch (err) {
      // Deux envois simultanés : l'index unique sur rdv_id tranche.
      if (err?.code === "P2002") {
        return res.status(409).json({ message: "Vous avez déjà donné votre avis sur cette consultation.", code: "AVIS_DEJA_DEPOSE" });
      }
      throw err;
    }

    return res.status(201).json({
      message: "Merci ! Votre avis sera visible après une rapide vérification par notre équipe.",
      avis,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/avis-medecin/:id
 *   - L'auteur peut corriger note, critères, recommandation, commentaire
 *     et anonymat, uniquement tant que l'avis est "en_attente".
 *   - Un admin/superadmin peut à tout moment modifier statut_moderation
 *     (et lever un signalement : { signalement_traite: true }).
 * La note moyenne de la fiche est recalculée quand le statut change.
 */
export async function modifierAvisMedecin(req, res, next) {
  try {
    const avis = await prisma.avisMedecin.findUnique({ where: { avis_id: req.params.id } });
    if (!avis) {
      return res.status(404).json({ message: "Avis introuvable." });
    }

    const estAuteur = req.utilisateur?.utilisateur_id === avis.utilisateur_id;
    const admin = estAdmin(req.utilisateur);
    if (!estAuteur && !admin) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    let donnees = {};

    if (admin) {
      if (req.body.statut_moderation !== undefined) {
        if (!STATUTS_MODERATION_AVIS.includes(req.body.statut_moderation)) {
          return res.status(400).json({
            message: `statut_moderation invalide. Valeurs acceptées : ${STATUTS_MODERATION_AVIS.join(", ")}.`,
          });
        }
        if (req.body.statut_moderation !== avis.statut_moderation) {
          donnees.statut_moderation = req.body.statut_moderation;
          donnees.date_moderation = new Date();
        }
      }
      if (req.body.signalement_traite === true) {
        donnees.signale_le = null;
        donnees.motif_signalement = null;
      }
    }

    if (estAuteur && !admin) {
      if (avis.statut_moderation !== "en_attente") {
        return res.status(409).json({
          message: "Cet avis a déjà été modéré : son contenu ne peut plus être modifié.",
        });
      }
      const saisie = normaliserSaisieAvis(req.body, { partiel: true });
      if (saisie.erreur) return res.status(saisie.erreur.status).json(saisie.erreur);
      donnees = saisie.donnees;
    }

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    const avisMisAJour = await prisma.avisMedecin.update({
      where: { avis_id: req.params.id },
      data: donnees,
    });

    if (donnees.statut_moderation) {
      await recalculerNoteMedecin(avis.medecin_id);
      if (donnees.statut_moderation === "publie") notifierAvisPublie(avisMisAJour);
    }

    return res.status(200).json({ message: "Avis mis à jour.", avis: avisMisAJour });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/avis-medecin/:id
 * Réservé à l'auteur de l'avis ou à un admin/superadmin.
 */
export async function supprimerAvisMedecin(req, res, next) {
  try {
    const avis = await prisma.avisMedecin.findUnique({ where: { avis_id: req.params.id } });
    if (!avis) {
      return res.status(404).json({ message: "Avis introuvable." });
    }

    const estAuteur = req.utilisateur?.utilisateur_id === avis.utilisateur_id;
    if (!estAuteur && !estAdmin(req.utilisateur)) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    await prisma.avisMedecin.delete({ where: { avis_id: req.params.id } });
    if (avis.statut_moderation === "publie") await recalculerNoteMedecin(avis.medecin_id);
    return res.status(200).json({ message: "Avis supprimé." });
  } catch (err) {
    next(err);
  }
}
