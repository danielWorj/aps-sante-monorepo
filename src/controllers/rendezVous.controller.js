// src/controllers/rendezVous.controller.js
// Module transverse "Gestion des médecins" — pivot rendez_vous +
// ordonnance (voir medecin.routes.js pour les règles d'accès résumées
// et schema.prisma pour le détail des champs).
//
// Donnée privée patient/médecin, jamais publique : toutes les routes
// exigent déjà "authentifier" (middleware). L'autorisation fine
// (patient concerné, médecin concerné, ou admin/superadmin) est
// appliquée ICI, au cas par cas.
//
// code_unique / qr_token_secret servent au contrôle de présence à
// l'accueil (scan/QR) : générés côté serveur à la création, jamais
// saisis par le client.

import crypto from "crypto";
import prisma from "../lib/prisma.js";

const TYPES_RDV = ["physique", "teleconsultation"];
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

// Sans cet `include`, l'API ne renvoyait que medecin_id / patient_id
// bruts (clés étrangères) : le front (RendezVous.jsx / medecinService.js)
// attend medecin.utilisateur.{nom,prenom} et patient.utilisateur.
// {nom,prenom} pour afficher des noms plutôt que des UUID dans le
// tableau et les filtres — même patron que SELECTION_UTILISATEUR_*
// dans medecin.controller.js.
// ⚠️ Hypothèse : le modèle `patient` porte une relation `utilisateur`
// du même type que `medecin.utilisateur` (schema.prisma non fourni) —
// à confirmer/ajuster si le nom de la relation diffère.
const INCLUSION_NOMS_RDV = {
  medecin: { include: { utilisateur: { select: { nom: true, prenom: true } } } },
  patient: { include: { utilisateur: { select: { nom: true, prenom: true } } } },
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
 * Génère un code_unique (8 caractères alphanumériques, majuscules) et
 * retire sur collision — extrêmement improbable vu l'espace de
 * recherche, mais code_unique porte une contrainte @unique en base.
 */
async function genererCodeUnique() {
  const genere = () =>
    crypto
      .randomBytes(6)
      .toString("base64")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 8)
      .toUpperCase();

  let code = genere();
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.rendezVous.findUnique({ where: { code_unique: code } })) {
    code = genere();
  }
  return code;
}

/**
 * Détermine si l'utilisateur courant a le droit de voir/agir sur ce
 * rendez-vous : le patient concerné, le médecin concerné, ou
 * admin/superadmin.
 */
async function estAutoriseSurRdv(rdv, utilisateurCourant) {
  if (estAdmin(utilisateurCourant)) return true;

  const patient = await profilPatientCourant(utilisateurCourant);
  if (patient && patient.patient_id === rdv.patient_id) return true;

  const medecin = await profilMedecinCourant(utilisateurCourant);
  if (medecin && medecin.medecin_id === rdv.medecin_id) return true;

  return false;
}

/* ===================================================================
 * Rendez-vous
 * =================================================================== */

/**
 * GET /api/rendez-vous
 * Filtres optionnels : ?statut=...&medecin_id=...&patient_id=...
 * Toujours scopé à l'utilisateur courant (patient ou médecin) sauf
 * pour admin/superadmin, qui peut consulter l'ensemble et utiliser
 * librement les filtres.
 */
export async function listerRendezVous(req, res, next) {
  try {
    const { statut, medecin_id, patient_id } = req.query;

    if (statut && !STATUTS_RDV.includes(statut)) {
      return res.status(400).json({
        message: `statut invalide. Valeurs acceptées : ${STATUTS_RDV.join(", ")}.`,
      });
    }

    const where = {};

    if (estAdmin(req.utilisateur)) {
      if (statut) where.statut = statut;
      if (medecin_id) where.medecin_id = medecin_id;
      if (patient_id) where.patient_id = patient_id;
    } else {
      const patient = await profilPatientCourant(req.utilisateur);
      const medecin = await profilMedecinCourant(req.utilisateur);

      if (!patient && !medecin) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }

      // Un compte n'a normalement qu'un seul des deux profils ; on
      // scope sur celui qui existe (patient prioritaire si les deux
      // existaient, cas non prévu par le schéma).
      if (patient) where.patient_id = patient.patient_id;
      else if (medecin) where.medecin_id = medecin.medecin_id;

      if (statut) where.statut = statut;
    }

    const rendezVous = await prisma.rendezVous.findMany({
      where,
      include: INCLUSION_NOMS_RDV,
      orderBy: { date_creneau: "desc" },
    });

    return res.status(200).json({ rendez_vous: rendezVous });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/rendez-vous/:id
 */
export async function obtenirRendezVous(req, res, next) {
  try {
    const rdv = await prisma.rendezVous.findUnique({
      where: { rdv_id: req.params.id },
      include: INCLUSION_NOMS_RDV,
    });
    if (!rdv || !(await estAutoriseSurRdv(rdv, req.utilisateur))) {
      return res.status(404).json({ message: "Rendez-vous introuvable." });
    }

    return res.status(200).json({ rendez_vous: rdv });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rendez-vous
 * Réservé au patient qui réserve le créneau (patient_id déduit du
 * token, jamais saisi par le client). type_rdv "teleconsultation"
 * exige que le médecin ait activé teleconsultation_activee ;
 * structure_id n'a de sens que pour un rdv "physique" (sinon cabinet
 * libéral, structure_id reste null).
 */
export async function creerRendezVous(req, res, next) {
  try {
    const patient = await profilPatientCourant(req.utilisateur);
    if (!patient) {
      return res.status(403).json({ message: "Seul un compte patient peut réserver un rendez-vous." });
    }

    const { medecin_id, structure_id, type_rdv, date_creneau, motif } = req.body;

    if (!medecin_id || !type_rdv || !date_creneau) {
      return res.status(400).json({
        message: "Champs requis manquants : medecin_id, type_rdv, date_creneau.",
      });
    }

    let motifNettoye;
    if (motif !== undefined && motif !== null) {
      if (typeof motif !== "string") {
        return res.status(400).json({ message: "motif doit être une chaîne de caractères." });
      }
      motifNettoye = motif.trim();
      if (motifNettoye.length > 1000) {
        return res.status(400).json({ message: "motif trop long (1000 caractères maximum)." });
      }
    }

    if (!TYPES_RDV.includes(type_rdv)) {
      return res.status(400).json({
        message: `type_rdv invalide. Valeurs acceptées : ${TYPES_RDV.join(", ")}.`,
      });
    }

    const dateCreneau = new Date(date_creneau);
    if (Number.isNaN(dateCreneau.getTime())) {
      return res.status(400).json({ message: "date_creneau invalide." });
    }

    const medecin = await prisma.medecin.findUnique({ where: { medecin_id } });
    if (!medecin) {
      return res.status(400).json({ message: "medecin_id introuvable." });
    }
    if (type_rdv === "teleconsultation" && !medecin.teleconsultation_activee) {
      return res.status(400).json({
        message: "Ce médecin n'a pas activé la téléconsultation.",
      });
    }

    if (structure_id) {
      const structure = await prisma.structureSante.findUnique({ where: { structure_id } });
      if (!structure) {
        return res.status(400).json({ message: "structure_id introuvable." });
      }
    }

    const code_unique = await genererCodeUnique();
    const qr_token_secret = crypto.randomBytes(32).toString("hex");

    const rdv = await prisma.rendezVous.create({
      data: {
        patient_id: patient.patient_id,
        medecin_id,
        structure_id: structure_id || null,
        type_rdv,
        date_creneau: dateCreneau,
        statut: "cree",
        motif: motifNettoye ? motifNettoye : null,
        code_unique,
        qr_token_secret,
      },
    });

    return res.status(201).json({ message: "Rendez-vous créé.", rendez_vous: rdv });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/rendez-vous/:id
 * Ouvert au patient concerné, au médecin concerné, ou à
 * admin/superadmin — ex. confirmation, annulation, contestation.
 *   - date_creneau : reprogrammation, ouverte à toutes les parties
 *     autorisées.
 *   - motif : précision/correction du motif de consultation, ouverte à
 *     toutes les parties autorisées (envoyer une chaîne vide ou null
 *     efface le motif).
 *   - statut : doit rester une transition cohérente avec le rôle
 *     (un patient ne peut pas se déclarer "honore" lui-même, etc.) —
 *     validation volontairement permissive ici (valeur dans l'enum
 *     uniquement) ; le contrôle fin des transitions autorisées par
 *     rôle est laissé à la couche métier/produit si nécessaire.
 * DELETE reste interdit ici : un rendez-vous s'annule via statut, il
 * ne se supprime pas physiquement une fois créé (voir supprimerRendezVous).
 */
export async function modifierRendezVous(req, res, next) {
  try {
    const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id: req.params.id } });
    if (!rdv) {
      return res.status(404).json({ message: "Rendez-vous introuvable." });
    }

    if (!(await estAutoriseSurRdv(rdv, req.utilisateur))) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const { statut, date_creneau, structure_id, motif } = req.body;
    const donnees = {};

    if (statut !== undefined) {
      if (!STATUTS_RDV.includes(statut)) {
        return res.status(400).json({
          message: `statut invalide. Valeurs acceptées : ${STATUTS_RDV.join(", ")}.`,
        });
      }
      donnees.statut = statut;
    }

    if (date_creneau !== undefined) {
      const dateCreneau = new Date(date_creneau);
      if (Number.isNaN(dateCreneau.getTime())) {
        return res.status(400).json({ message: "date_creneau invalide." });
      }
      donnees.date_creneau = dateCreneau;
    }

    if (structure_id !== undefined) {
      if (structure_id) {
        const structure = await prisma.structureSante.findUnique({ where: { structure_id } });
        if (!structure) {
          return res.status(400).json({ message: "structure_id introuvable." });
        }
        donnees.structure_id = structure_id;
      } else {
        donnees.structure_id = null;
      }
    }

    if (motif !== undefined) {
      if (motif === null || motif === "") {
        donnees.motif = null;
      } else {
        if (typeof motif !== "string") {
          return res.status(400).json({ message: "motif doit être une chaîne de caractères." });
        }
        const motifNettoye = motif.trim();
        if (motifNettoye.length > 1000) {
          return res.status(400).json({ message: "motif trop long (1000 caractères maximum)." });
        }
        donnees.motif = motifNettoye;
      }
    }

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    const rdvMisAJour = await prisma.rendezVous.update({
      where: { rdv_id: req.params.id },
      data: donnees,
    });

    return res.status(200).json({ message: "Rendez-vous mis à jour.", rendez_vous: rdvMisAJour });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/rendez-vous/:id
 * Réservé à admin/superadmin (route déjà verrouillée par
 * autoriser("admin", "superadmin")) — un rendez-vous s'annule via PUT
 * (statut="annule"), il ne se supprime physiquement qu'en dernier
 * recours administratif (ordonnances et séquestre peuvent en dépendre).
 */
export async function supprimerRendezVous(req, res, next) {
  try {
    const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id: req.params.id } });
    if (!rdv) {
      return res.status(404).json({ message: "Rendez-vous introuvable." });
    }

    await prisma.rendezVous.delete({ where: { rdv_id: req.params.id } });
    return res.status(200).json({ message: "Rendez-vous supprimé." });
  } catch (err) {
    if (err.code === "P2003") {
      return res.status(409).json({
        message: "Impossible de supprimer ce rendez-vous : une ordonnance y est encore rattachée.",
      });
    }
    next(err);
  }
}

/* ===================================================================
 * Ordonnances
 * =================================================================== */

/**
 * GET /api/ordonnances
 * Filtres optionnels : ?rdv_id=...&medecin_id=...&patient_id=...
 * Toujours scopée à l'utilisateur courant sauf admin/superadmin.
 */
export async function listerOrdonnances(req, res, next) {
  try {
    const { rdv_id, medecin_id, patient_id } = req.query;
    const where = {};

    if (estAdmin(req.utilisateur)) {
      if (rdv_id) where.rdv_id = rdv_id;
      if (medecin_id) where.medecin_id = medecin_id;
      if (patient_id) where.patient_id = patient_id;
    } else {
      const patient = await profilPatientCourant(req.utilisateur);
      const medecin = await profilMedecinCourant(req.utilisateur);

      if (!patient && !medecin) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }

      if (patient) where.patient_id = patient.patient_id;
      else if (medecin) where.medecin_id = medecin.medecin_id;

      if (rdv_id) where.rdv_id = rdv_id;
    }

    const ordonnances = await prisma.ordonnance.findMany({
      where,
      orderBy: { date_emission: "desc" },
    });

    return res.status(200).json({ ordonnances });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/ordonnances/:id
 * Le médecin auteur, le patient concerné, ou admin/superadmin.
 */
export async function obtenirOrdonnance(req, res, next) {
  try {
    const ordonnance = await prisma.ordonnance.findUnique({
      where: { ordonnance_id: req.params.id },
    });
    if (!ordonnance) {
      return res.status(404).json({ message: "Ordonnance introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const patient = await profilPatientCourant(req.utilisateur);
      const medecin = await profilMedecinCourant(req.utilisateur);
      const estPatientConcerne = patient && patient.patient_id === ordonnance.patient_id;
      const estMedecinAuteur = medecin && medecin.medecin_id === ordonnance.medecin_id;
      if (!estPatientConcerne && !estMedecinAuteur) {
        return res.status(404).json({ message: "Ordonnance introuvable." });
      }
    }

    return res.status(200).json({ ordonnance });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/ordonnances
 * Réservé au médecin du rendez-vous concerné, déduit de rdv_id
 * (jamais un autre médecin, même admin ne peut créer une ordonnance à
 * la place du médecin — pièce médicale nominative). identifiant_unique
 * est généré côté serveur (référence de vérification externe).
 */
export async function creerOrdonnance(req, res, next) {
  try {
    const medecin = await profilMedecinCourant(req.utilisateur);
    if (!medecin) {
      return res.status(403).json({ message: "Seul un compte médecin peut émettre une ordonnance." });
    }

    const { rdv_id, pays_emission_id, contenu } = req.body;
    if (!rdv_id || !pays_emission_id || !contenu) {
      return res.status(400).json({
        message: "Champs requis manquants : rdv_id, pays_emission_id, contenu.",
      });
    }

    const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id } });
    if (!rdv) {
      return res.status(400).json({ message: "rdv_id introuvable." });
    }
    if (rdv.medecin_id !== medecin.medecin_id) {
      return res.status(403).json({
        message: "Vous n'êtes pas le médecin de ce rendez-vous.",
      });
    }

    const pays = await prisma.pays.findUnique({ where: { pays_id: pays_emission_id } });
    if (!pays) {
      return res.status(400).json({ message: "pays_emission_id introuvable." });
    }

    const identifiant_unique = crypto.randomBytes(12).toString("hex").toUpperCase();

    const ordonnance = await prisma.ordonnance.create({
      data: {
        rdv_id,
        medecin_id: medecin.medecin_id,
        patient_id: rdv.patient_id,
        identifiant_unique,
        pays_emission_id,
        contenu: contenu.trim(),
      },
    });

    return res.status(201).json({ message: "Ordonnance émise.", ordonnance });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/ordonnances/:id
 * Le médecin auteur ou admin/superadmin — seul le contenu (et
 * pays_emission_id, en cas de correction) est modifiable ; rdv_id,
 * medecin_id, patient_id et identifiant_unique sont immuables après
 * émission.
 */
export async function modifierOrdonnance(req, res, next) {
  try {
    const ordonnance = await prisma.ordonnance.findUnique({
      where: { ordonnance_id: req.params.id },
    });
    if (!ordonnance) {
      return res.status(404).json({ message: "Ordonnance introuvable." });
    }

    if (!estAdmin(req.utilisateur)) {
      const medecin = await profilMedecinCourant(req.utilisateur);
      if (!medecin || medecin.medecin_id !== ordonnance.medecin_id) {
        return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
      }
    }

    const { contenu, pays_emission_id } = req.body;
    const donnees = {};

    if (contenu !== undefined) donnees.contenu = contenu.trim();

    if (pays_emission_id !== undefined) {
      const pays = await prisma.pays.findUnique({ where: { pays_id: pays_emission_id } });
      if (!pays) {
        return res.status(400).json({ message: "pays_emission_id introuvable." });
      }
      donnees.pays_emission_id = pays_emission_id;
    }

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    const ordonnanceMiseAJour = await prisma.ordonnance.update({
      where: { ordonnance_id: req.params.id },
      data: donnees,
    });

    return res.status(200).json({ message: "Ordonnance mise à jour.", ordonnance: ordonnanceMiseAJour });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/ordonnances/:id
 * Réservé à admin/superadmin (route déjà verrouillée par
 * autoriser("admin", "superadmin")) — pièce médicale, jamais supprimée
 * par un médecin après émission.
 */
export async function supprimerOrdonnance(req, res, next) {
  try {
    const ordonnance = await prisma.ordonnance.findUnique({
      where: { ordonnance_id: req.params.id },
    });
    if (!ordonnance) {
      return res.status(404).json({ message: "Ordonnance introuvable." });
    }

    await prisma.ordonnance.delete({ where: { ordonnance_id: req.params.id } });
    return res.status(200).json({ message: "Ordonnance supprimée." });
  } catch (err) {
    next(err);
  }
}