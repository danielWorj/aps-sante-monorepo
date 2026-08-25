// src/controllers/patient.controller.js
// Module transverse "Gestion des médecins" — fiche `patient`.
//
// Contrairement à `medecin` (annuaire public), la fiche patient est une
// donnée PRIVÉE : jamais de route publique ici. Toutes les routes
// exigent déjà "authentifier" (voir patient.routes.js) ; l'autorisation
// fine (patient concerné, médecin ayant un rendez-vous avec lui, ou
// admin/superadmin) est appliquée ICI, au cas par cas — même patron que
// estAutoriseSurRdv dans rendezVous.controller.js.
//
// Champs réels du modèle Patient (voir schema.prisma) :
//   patient { patient_id, utilisateur_id (unique), date_naissance,
//     rendez_vous[], ordonnances[] }

import prisma from "../lib/prisma.js";

const STATUTS_RDV = [
  "cree",
  "confirme",
  "en_attente_presence",
  "honore",
  "non_honore",
  "annule",
  "conteste",
];

function estAdmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

// Champs utilisateur exposés sur une fiche patient : réservé au
// titulaire du compte et à admin/superadmin (jamais à un médecin tiers,
// qui n'a pas besoin de l'email/téléphone du patient pour consulter son
// dossier de rendez-vous).
const SELECTION_UTILISATEUR_PATIENT = {
  select: {
    utilisateur_id: true,
    nom: true,
    prenom: true,
    email: true,
    telephone: true,
    pays_id: true,
    statut_compte: true,
  },
};

// Vue restreinte utilisée quand le demandeur est un médecin tiers
// (autorisé à voir QUE le patient existe et son nom, pas ses
// coordonnées) : même logique que SELECTION_UTILISATEUR_PUBLIC dans
// medecin.controller.js, en miroir.
const SELECTION_UTILISATEUR_RESTREINTE = {
  select: {
    utilisateur_id: true,
    nom: true,
    prenom: true,
  },
};

async function profilPatientCourant(utilisateurCourant) {
  if (!utilisateurCourant) return null;
  return prisma.patient.findUnique({
    where: { utilisateur_id: utilisateurCourant.utilisateur_id },
  });
}

async function profilMedecinCourant(utilisateurCourant) {
  if (!utilisateurCourant) return null;
  return prisma.medecin.findUnique({
    where: { utilisateur_id: utilisateurCourant.utilisateur_id },
  });
}

/**
 * Un médecin ne peut consulter la fiche d'un patient que s'il a (ou a
 * eu) au moins un rendez-vous avec lui — pas d'accès libre à tout
 * l'annuaire patients.
 */
async function medecinAUnRendezVousAvecPatient(medecinId, patientId) {
  const rdv = await prisma.rendezVous.findFirst({
    where: { medecin_id: medecinId, patient_id: patientId },
    select: { rdv_id: true },
  });
  return Boolean(rdv);
}

/**
 * Détermine si l'utilisateur courant a le droit de voir la fiche /
 * les rendez-vous du patient `patientId` : le patient lui-même,
 * admin/superadmin, ou un médecin ayant au moins un rendez-vous avec
 * ce patient (accès restreint, voir SELECTION_UTILISATEUR_RESTREINTE).
 * Retourne un objet { autorise, niveau } où niveau vaut "complet"
 * (patient lui-même ou admin) ou "restreint" (médecin tiers).
 */
async function autorisationSurPatient(patientId, utilisateurCourant) {
  if (estAdmin(utilisateurCourant)) return { autorise: true, niveau: "complet" };

  const patient = await profilPatientCourant(utilisateurCourant);
  if (patient && patient.patient_id === patientId) {
    return { autorise: true, niveau: "complet" };
  }

  const medecin = await profilMedecinCourant(utilisateurCourant);
  if (medecin && (await medecinAUnRendezVousAvecPatient(medecin.medecin_id, patientId))) {
    return { autorise: true, niveau: "restreint" };
  }

  return { autorise: false, niveau: null };
}

/* ===================================================================
 * Profil patient
 * =================================================================== */

/**
 * GET /api/patients/mon-profil
 * AUTHENTIFIÉ uniquement (voir patient.routes.js).
 * Récupère le profil complet du patient connecté (déduit du token),
 * avec ses informations utilisateur et un résumé de son activité
 * (nombre de rendez-vous, prochain rendez-vous à venir, nombre
 * d'ordonnances). Même rôle que GET /api/medecins/mon-profil côté
 * médecin : dédiée à l'écran "Mon profil" du patient.
 */
export async function obtenirMonProfil(req, res, next) {
  try {
    const utilisateurId = req.utilisateur?.utilisateur_id;
    if (!utilisateurId) {
      return res.status(401).json({ message: "Utilisateur non authentifié." });
    }

    const patient = await prisma.patient.findUnique({
      where: { utilisateur_id: utilisateurId },
      include: {
        utilisateur: SELECTION_UTILISATEUR_PATIENT,
      },
    });

    if (!patient) {
      return res.status(404).json({
        message: "Aucun profil patient associé à ce compte.",
      });
    }

    const maintenant = new Date();

    const [totalRendezVous, prochainRendezVous, totalOrdonnances] = await Promise.all([
      prisma.rendezVous.count({ where: { patient_id: patient.patient_id } }),
      prisma.rendezVous.findFirst({
        where: {
          patient_id: patient.patient_id,
          date_creneau: { gte: maintenant },
          statut: { in: ["cree", "confirme"] },
        },
        orderBy: { date_creneau: "asc" },
        include: {
          medecin: { include: { utilisateur: { select: { nom: true, prenom: true } } } },
        },
      }),
      prisma.ordonnance.count({ where: { patient_id: patient.patient_id } }),
    ]);

    return res.status(200).json({
      patient,
      statistiques: {
        total_rendez_vous: totalRendezVous,
        total_ordonnances: totalOrdonnances,
        prochain_rendez_vous: prochainRendezVous,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/patients/:id
 * Ouvert au patient concerné, à admin/superadmin (vue complète,
 * coordonnées incluses), ou à un médecin ayant au moins un rendez-vous
 * avec ce patient (vue restreinte : nom/prénom uniquement, voir
 * autorisationSurPatient ci-dessus).
 */
export async function obtenirPatient(req, res, next) {
  try {
    const { autorise, niveau } = await autorisationSurPatient(req.params.id, req.utilisateur);
    if (!autorise) {
      return res.status(404).json({ message: "Patient introuvable." });
    }

    const patient = await prisma.patient.findUnique({
      where: { patient_id: req.params.id },
      include: {
        utilisateur:
          niveau === "complet" ? SELECTION_UTILISATEUR_PATIENT : SELECTION_UTILISATEUR_RESTREINTE,
      },
    });

    if (!patient) {
      return res.status(404).json({ message: "Patient introuvable." });
    }

    return res.status(200).json({ patient });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * Rendez-vous d'un patient
 * =================================================================== */

/**
 * GET /api/patients/:id/rendez-vous
 * Liste des rendez-vous du patient `:id`.
 * Filtre optionnel : ?statut=...
 * Accès : le patient lui-même, admin/superadmin, ou un médecin ayant
 * au moins un rendez-vous avec ce patient — dans ce dernier cas, seuls
 * SES PROPRES rendez-vous avec ce patient sont renvoyés (pas ceux pris
 * avec d'autres médecins), pour ne pas exposer le dossier complet du
 * patient à un tiers.
 */
export async function listerRendezVousPatient(req, res, next) {
  try {
    const patientId = req.params.id;
    const { statut } = req.query;

    if (statut && !STATUTS_RDV.includes(statut)) {
      return res.status(400).json({
        message: `statut invalide. Valeurs acceptées : ${STATUTS_RDV.join(", ")}.`,
      });
    }

    const { autorise, niveau } = await autorisationSurPatient(patientId, req.utilisateur);
    if (!autorise) {
      return res.status(404).json({ message: "Patient introuvable." });
    }

    const where = { patient_id: patientId };
    if (statut) where.statut = statut;

    if (niveau === "restreint") {
      const medecin = await profilMedecinCourant(req.utilisateur);
      where.medecin_id = medecin.medecin_id;
    }

    const rendezVous = await prisma.rendezVous.findMany({
      where,
      include: {
        medecin: { include: { utilisateur: { select: { nom: true, prenom: true } } } },
        structure: { select: { structure_id: true, nom: true } },
      },
      orderBy: { date_creneau: "desc" },
    });

    return res.status(200).json({ rendez_vous: rendezVous });
  } catch (err) {
    next(err);
  }
}