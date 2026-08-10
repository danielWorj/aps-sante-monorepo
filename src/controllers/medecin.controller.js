// src/controllers/medecin.controller.js
// Module transverse "Gestion des médecins" — fiche `medecin` (Annuaire
// public) : lecture, modification, suppression. Voir medecin.routes.js
// pour le détail des règles d'accès.
//
// ─── Pourquoi ce fichier ré-exporte aussi Avis / Abonnement /
//     Rendez-vous + Ordonnance ───────────────────────────────────────
// medecin.routes.js importe LES 27 handlers du module depuis un seul
// chemin : "../controllers/medecin.controller.js". Dans ce projet, ces
// handlers sont en réalité répartis dans trois fichiers dédiés (même
// découpage que le reste du code) :
//   - avis.controller.js            → listerAvisMedecin, etc.
//   - abonnementMedecin.controller.js → listerAbonnementsMedecin, etc.
//   - rendezVous.controller.js      → listerRendezVous / Ordonnances, etc.
// Plutôt que de dupliquer ce code ici (ou de faire porter à
// medecin.routes.js la connaissance de ce découpage interne, ce qui
// casserait le import { ... } from "../controllers/medecin.controller.js"
// tel qu'il est écrit), ce fichier :
//   1) implémente lui-même les 4 handlers propres à la fiche medecin
//      (listerMedecins, obtenirMedecin, modifierMedecin, supprimerMedecin) ;
//   2) ré-exporte tel quel le reste depuis les trois fichiers dédiés.
// Le seul point d'entrée pour medecin.routes.js reste donc bien
// medecin.controller.js, sans duplication de logique métier.
//
// ⚠️ schema.prisma n'a pas été fourni au moment de la rédaction : les
// noms de champs ci-dessous sont déduits des indices présents dans les
// autres contrôleurs (utilisateur_id, teleconsultation_activee,
// cni_url/attestation_url, statut_verification — voir
// medecin.routes.js et abonnementMedecin/rendezVous.controller.js) et
// de l'hypothèse standard "identité sur `utilisateur`, attributs
// professionnels sur `medecin`". À ajuster si le schéma réel diverge :
//   medecin { medecin_id, utilisateur_id, specialite_id, numero_ordre,
//     biographie, annees_experience, tarif_consultation,
//     teleconsultation_activee, adresse_cabinet, ville_id, pays_id,
//     langues_parlees, cni_url, attestation_url, statut_verification,
//     date_creation }
//   utilisateur { ..., nom, prenom } (relation "utilisateur" sur medecin)

import prisma from "../lib/prisma.js";

export {
  listerAvisMedecin,
  obtenirAvisMedecin,
  creerAvisMedecin,
  modifierAvisMedecin,
  supprimerAvisMedecin,
} from "./avis.controller.js";

export {
  listerAbonnementsMedecin,
  obtenirAbonnementMedecin,
  creerAbonnementMedecin,
  modifierAbonnementMedecin,
  supprimerAbonnementMedecin,
  ajouterLigneAbonnementMedecin,
  modifierLigneAbonnementMedecin,
  supprimerLigneAbonnementMedecin,
} from "./abonnementMedecin.controller.js";

export {
  listerRendezVous,
  obtenirRendezVous,
  creerRendezVous,
  modifierRendezVous,
  supprimerRendezVous,
  listerOrdonnances,
  obtenirOrdonnance,
  creerOrdonnance,
  modifierOrdonnance,
  supprimerOrdonnance,
} from "./rendezVous.controller.js";

const STATUTS_VERIFICATION_MEDECIN = ["en_cours", "verifie", "rejete"];

// Champs de fiche modifiables par le médecin lui-même ou un admin —
// statut_verification, cni_url et attestation_url sont traités à part
// ci-dessous (règles spécifiques).
const CHAMPS_MODIFIABLES_MEDECIN = [
  "specialite_id",
  "numero_ordre",
  "biographie",
  "annees_experience",
  "tarif_consultation",
  "teleconsultation_activee",
  "adresse_cabinet",
  "ville_id",
  "pays_id",
  "langues_parlees",
];

// Ne jamais exposer publiquement plus que l'identité de base du
// compte lié (pas d'email/téléphone dans l'Annuaire public).
const SELECTION_UTILISATEUR_PUBLIC = {
  select: { nom: true, prenom: true },
};

function estAdmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

/* ===================================================================
 * Médecins (fiche annuaire)
 * =================================================================== */

/**
 * GET /api/medecins
 * PUBLIQUE, sans authentification (route non protégée dans
 * medecin.routes.js — req.utilisateur est donc toujours indéfini ici,
 * il n'y a pas de vue "admin" élargie sur cette route).
 * Filtres optionnels : ?specialite_id=...&ville_id=...&pays_id=...&recherche=...
 * N'affiche que les fiches "verifie" — un professionnel pas encore
 * vérifié par un admin/superadmin n'apparaît pas dans l'Annuaire
 * public (même logique que le filtrage "publie" de avis.controller.js).
 */
export async function listerMedecins(req, res, next) {
  try {
    const { specialite_id, ville_id, pays_id, recherche } = req.query;

    const where = { statut_verification: "verifie" };
    if (specialite_id) where.specialite_id = specialite_id;
    if (ville_id) where.ville_id = ville_id;
    if (pays_id) where.pays_id = pays_id;
    if (recherche) {
      where.utilisateur = {
        OR: [
          { nom: { contains: recherche, mode: "insensitive" } },
          { prenom: { contains: recherche, mode: "insensitive" } },
        ],
      };
    }

    const medecins = await prisma.medecin.findMany({
      where,
      include: { utilisateur: SELECTION_UTILISATEUR_PUBLIC },
      orderBy: { date_creation: "desc" },
    });

    return res.status(200).json({ medecins });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/medecins/:id
 * PUBLIQUE. Consultation directe par ID possible même hors "verifie"
 * (pas de fuite d'info supplémentaire par rapport à la liste), mais la
 * fiche n'apparaît dans /medecins que vérifiée.
 */
export async function obtenirMedecin(req, res, next) {
  try {
    const medecin = await prisma.medecin.findUnique({
      where: { medecin_id: req.params.id },
      include: { utilisateur: SELECTION_UTILISATEUR_PUBLIC },
    });
    if (!medecin) {
      return res.status(404).json({ message: "Médecin introuvable." });
    }

    return res.status(200).json({ medecin });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/medecins/:id
 * Ouvert au médecin concerné (utilisateur_id déduit du token) ou à
 * admin/superadmin (voir en-tête medecin.routes.js).
 *   - Le médecin lui-même : peut modifier ses champs de fiche
 *     (CHAMPS_MODIFIABLES_MEDECIN) et/ou remplacer cni_url/attestation_url
 *     (déjà téléversés par gererTeleversementMedecin dans req.body —
 *     voir upload.middleware.js). Il ne peut jamais choisir
 *     statut_verification lui-même : toute modification de sa fiche le
 *     repasse automatiquement à "en_cours" pour re-vérification.
 *   - admin/superadmin : peut en plus fixer statut_verification
 *     librement ; cela ne déclenche pas le repassage automatique à
 *     "en_cours".
 */
export async function modifierMedecin(req, res, next) {
  try {
    const medecin = await prisma.medecin.findUnique({ where: { medecin_id: req.params.id } });
    if (!medecin) {
      return res.status(404).json({ message: "Médecin introuvable." });
    }

    const estAdministrateur = estAdmin(req.utilisateur);
    const estProprietaire = req.utilisateur?.utilisateur_id === medecin.utilisateur_id;

    if (!estAdministrateur && !estProprietaire) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const donnees = {};

    for (const champ of CHAMPS_MODIFIABLES_MEDECIN) {
      if (req.body[champ] !== undefined) donnees[champ] = req.body[champ];
    }

    // Pièces jointes remplacées à cette occasion (optionnelles ici,
    // voir gererTeleversementMedecin).
    if (req.body.cni_url) donnees.cni_url = req.body.cni_url;
    if (req.body.attestation_url) donnees.attestation_url = req.body.attestation_url;

    if (estAdministrateur) {
      if (req.body.statut_verification !== undefined) {
        if (!STATUTS_VERIFICATION_MEDECIN.includes(req.body.statut_verification)) {
          return res.status(400).json({
            message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_MEDECIN.join(", ")}.`,
          });
        }
        donnees.statut_verification = req.body.statut_verification;
      }
    } else if (Object.keys(donnees).length > 0) {
      // Le médecin modifie sa propre fiche : repasse en vérification.
      donnees.statut_verification = "en_cours";
    }

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    const medecinMisAJour = await prisma.medecin.update({
      where: { medecin_id: req.params.id },
      data: donnees,
    });

    return res.status(200).json({ message: "Fiche médecin mise à jour.", medecin: medecinMisAJour });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/medecins/:id
 * Réservé à superadmin (route déjà verrouillée par
 * autoriser("superadmin")). Avis, abonnements, rendez-vous et
 * ordonnances référencent cette fiche (pas de cascade en base) : la
 * suppression échoue proprement si des dépendances existent encore.
 */
export async function supprimerMedecin(req, res, next) {
  try {
    const medecin = await prisma.medecin.findUnique({ where: { medecin_id: req.params.id } });
    if (!medecin) {
      return res.status(404).json({ message: "Médecin introuvable." });
    }

    await prisma.medecin.delete({ where: { medecin_id: req.params.id } });
    return res.status(200).json({ message: "Fiche médecin supprimée." });
  } catch (err) {
    if (err.code === "P2003") {
      return res.status(409).json({
        message:
          "Impossible de supprimer ce médecin : des avis, abonnements, rendez-vous ou ordonnances y sont encore rattachés.",
      });
    }
    next(err);
  }
}