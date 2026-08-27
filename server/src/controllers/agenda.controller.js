// src/controllers/agenda.controller.js
// Module transverse "Agenda du médecin" — voir schema.prisma (section
// "APS — Module transverse : Agenda du médecin") pour le détail des
// trois tables concernées :
//   - Horaire              : référentiel PARTAGÉ des tranches de 30
//     minutes (07h00-07h30, ...), réutilisé par tous les médecins.
//     Lecture publique, écriture réservée à admin/superadmin — même
//     patron que Specialite/Langue/Devise/Pays/Ville dans
//     medecin.controller.js.
//   - DisponibiliteMedecin : le GABARIT récurrent déclaré par le
//     médecin lui-même ("je reçois tous les lundis sur ce créneau").
//     Table de jointure N-N medecin <-> horaire, portant en plus
//     jour_semaine.
//   - CreneauAgenda         : les instances CONCRÈTES par date réelle,
//     générées à partir du gabarit (genererCreneauxAgenda) ou ajoutées
//     manuellement hors gabarit. C'est cette table qui répond à
//     "le médecin X est-il libre le 6 octobre à 14h ?" et qui se
//     rattache au rendez-vous qui l'occupe le cas échéant (rdv_id).
//
// ─── Règle d'accès (voir aussi l'en-tête agenda.routes / medecin.routes) ───
// C'est le médecin PROPRIÉTAIRE (utilisateur_id déduit du token) qui
// gère lui-même son gabarit et ses créneaux, ou un admin/superadmin en
// délégation. La CONSULTATION (lecture des disponibilités et de
// l'agenda d'un médecin) est en revanche entièrement PUBLIQUE, sans
// authentification : c'est ce qui permet à un patient non connecté de
// voir les créneaux libres avant de choisir de prendre rendez-vous.
//
// ⚠️ statut "reserve" : jamais positionné à la main via ce module —
// c'est rendezVous.controller.js (creerRendezVous / changerStatutRendezVous)
// qui rattache/détache un CreneauAgenda à un rendez-vous et fait
// basculer son statut en conséquence. modifierCreneauAgenda ci-dessous
// refuse explicitement "reserve" et refuse toute modification d'un
// créneau déjà occupé (rdv_id renseigné) — voir plus bas.

import prisma from "../lib/prisma.js";

const JOURS_SEMAINE = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
];

// Index JS natif (Date.prototype.getDay()) → valeur de l'enum
// JourSemaine. getDay() renvoie 0 pour dimanche, contrairement à
// l'ordre "lundi en premier" utilisé dans le schema.prisma — cette
// table de correspondance sert uniquement à la génération des
// créneaux concrets à partir du gabarit (voir genererCreneauxAgenda).
const JOUR_SEMAINE_PAR_INDEX_JS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

// Un créneau généré à la main ne peut recevoir que ces deux statuts :
// "reserve" est exclusivement géré par rendezVous.controller.js au
// moment où un rendez-vous s'attache au créneau (creneau_agenda.rdv_id).
const STATUTS_CRENEAU_MODIFIABLES = ["disponible", "bloque"];

// Nombre de jours maximum pour un seul appel de génération — évite
// qu'un appel malencontreux (ou abusif) ne crée des dizaines de
// milliers de lignes en une requête.
const PLAGE_GENERATION_MAX_JOURS = 90;

function estAdmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

// Sélection publique d'un créneau — on n'expose jamais rdv_id (id
// interne du rendez-vous éventuellement rattaché) sur une route
// publique : le statut "reserve" suffit à indiquer qu'il n'est plus
// disponible, sans exposer l'identifiant du rendez-vous lui-même.
const SELECTION_CRENEAU_PUBLIC = {
  select: {
    creneau_id: true,
    medecin_id: true,
    horaire_id: true,
    date: true,
    statut: true,
    origine: true,
    horaire: { select: { horaire_id: true, heure_debut: true, heure_fin: true } },
  },
};

/**
 * Charge la fiche medecin visée par :medecinId et vérifie que
 * l'appelant a le droit d'agir dessus (propriétaire ou admin/
 * superadmin). Écrit directement la réponse d'erreur (404/403) et
 * renvoie `null` si l'appel doit s'arrêter là ; renvoie sinon
 * `{ medecin, estAdministrateur }`.
 */
async function autoriserGestionAgenda(req, res, medecinId) {
  const medecin = await prisma.medecin.findUnique({ where: { medecin_id: medecinId } });
  if (!medecin) {
    res.status(404).json({ message: "Médecin introuvable." });
    return null;
  }

  const estAdministrateur = estAdmin(req.utilisateur);
  const estProprietaire = req.utilisateur?.utilisateur_id === medecin.utilisateur_id;

  if (!estAdministrateur && !estProprietaire) {
    res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    return null;
  }

  return { medecin, estAdministrateur };
}

/* ===================================================================
 * Horaire (référentiel partagé des tranches)
 * =================================================================== */

/**
 * GET /api/horaires
 * PUBLIQUE. Liste triée par heure de début — sert à peupler le
 * sélecteur d'horaire lors de la déclaration d'une disponibilité.
 */
export async function listerHoraires(req, res, next) {
  try {
    const horaires = await prisma.horaire.findMany({ orderBy: { heure_debut: "asc" } });
    return res.status(200).json({ horaires });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/horaires/:id
 * PUBLIQUE.
 */
export async function obtenirHoraire(req, res, next) {
  try {
    const horaire = await prisma.horaire.findUnique({ where: { horaire_id: req.params.id } });
    if (!horaire) {
      return res.status(404).json({ message: "Horaire introuvable." });
    }
    return res.status(200).json({ horaire });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/horaires
 * Réservé à admin/superadmin. Champs : heure_debut, heure_fin (format
 * "HH:mm", convertis en DateTime @db.Time côté Prisma). Référentiel
 * partagé par tous les médecins — pas de création libre par un
 * médecin, pour éviter la prolifération de tranches non alignées.
 */
export async function creerHoraire(req, res, next) {
  try {
    const { heure_debut, heure_fin } = req.body;
    if (!heure_debut || !heure_fin) {
      return res.status(400).json({ message: "Champs obligatoires manquants : heure_debut, heure_fin." });
    }

    const horaire = await prisma.horaire.create({
      data: {
        heure_debut: new Date(`1970-01-01T${heure_debut}:00Z`),
        heure_fin: new Date(`1970-01-01T${heure_fin}:00Z`),
      },
    });

    return res.status(201).json({ message: "Horaire créé.", horaire });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "Cet horaire existe déjà." });
    }
    next(err);
  }
}

/**
 * DELETE /api/horaires/:id
 * Réservé à superadmin. Des disponibilités ou créneaux d'agenda
 * peuvent encore référencer cet horaire — suppression bloquée dans ce
 * cas (409), même patron que supprimerSpecialite.
 */
export async function supprimerHoraire(req, res, next) {
  try {
    const horaire = await prisma.horaire.findUnique({ where: { horaire_id: req.params.id } });
    if (!horaire) {
      return res.status(404).json({ message: "Horaire introuvable." });
    }

    await prisma.horaire.delete({ where: { horaire_id: req.params.id } });
    return res.status(200).json({ message: "Horaire supprimé." });
  } catch (err) {
    if (err.code === "P2003") {
      return res.status(409).json({
        message: "Impossible de supprimer cet horaire : des disponibilités ou créneaux y sont encore rattachés.",
      });
    }
    next(err);
  }
}

/* ===================================================================
 * DisponibiliteMedecin (gabarit récurrent)
 * =================================================================== */

/**
 * GET /api/medecins/:medecinId/disponibilites
 * PUBLIQUE — consultation du gabarit récurrent d'un médecin (ex.
 * afficher "reçoit le lundi/mercredi de 9h à 12h" sur sa fiche
 * annuaire, avant même de regarder l'agenda daté). Filtre optionnel
 * ?jour_semaine=lundi.
 */
export async function listerDisponibilitesMedecin(req, res, next) {
  try {
    const { jour_semaine } = req.query;

    if (jour_semaine !== undefined && !JOURS_SEMAINE.includes(jour_semaine)) {
      return res.status(400).json({
        message: `jour_semaine invalide. Valeurs acceptées : ${JOURS_SEMAINE.join(", ")}.`,
      });
    }

    const disponibilites = await prisma.disponibiliteMedecin.findMany({
      where: {
        medecin_id: req.params.medecinId,
        ...(jour_semaine ? { jour_semaine } : {}),
      },
      include: { horaire: { select: { horaire_id: true, heure_debut: true, heure_fin: true } } },
      orderBy: [{ jour_semaine: "asc" }, { horaire: { heure_debut: "asc" } }],
    });

    return res.status(200).json({ disponibilites });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/medecins/:medecinId/disponibilites
 * Médecin propriétaire (utilisateur_id déduit du token) ou
 * admin/superadmin. Déclare une tranche récurrente : "disponible le
 * {jour_semaine} sur {horaire_id}". Champs requis : horaire_id,
 * jour_semaine. Ne crée AUCUN créneau concret : voir
 * genererCreneauxAgenda pour matérialiser ce gabarit sur une période
 * de dates réelles.
 */
export async function creerDisponibiliteMedecin(req, res, next) {
  try {
    const autorisation = await autoriserGestionAgenda(req, res, req.params.medecinId);
    if (!autorisation) return;

    const { horaire_id, jour_semaine } = req.body;
    if (!horaire_id || !jour_semaine) {
      return res.status(400).json({ message: "Champs obligatoires manquants : horaire_id, jour_semaine." });
    }
    if (!JOURS_SEMAINE.includes(jour_semaine)) {
      return res.status(400).json({
        message: `jour_semaine invalide. Valeurs acceptées : ${JOURS_SEMAINE.join(", ")}.`,
      });
    }

    const horaire = await prisma.horaire.findUnique({ where: { horaire_id } });
    if (!horaire) {
      return res.status(400).json({ message: "horaire_id invalide : horaire introuvable." });
    }

    const disponibilite = await prisma.disponibiliteMedecin.create({
      data: { medecin_id: req.params.medecinId, horaire_id, jour_semaine },
      include: { horaire: { select: { horaire_id: true, heure_debut: true, heure_fin: true } } },
    });

    return res.status(201).json({ message: "Disponibilité ajoutée.", disponibilite });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "Cette disponibilité existe déjà pour ce médecin." });
    }
    next(err);
  }
}

/**
 * DELETE /api/disponibilites/:disponibiliteId
 * Médecin propriétaire ou admin/superadmin. Retire une tranche du
 * gabarit récurrent. ⚠️ N'a AUCUN effet rétroactif sur les créneaux
 * déjà générés (creneau_agenda) : ils restent en base tels quels
 * (l'UI peut proposer un futur bouton "réinitialiser cette semaine au
 * gabarit" — voir schema.prisma, commentaire sur OrigineCreneauAgenda
 * — mais ce n'est pas encore branché ici).
 */
export async function supprimerDisponibiliteMedecin(req, res, next) {
  try {
    const disponibilite = await prisma.disponibiliteMedecin.findUnique({
      where: { disponibilite_id: req.params.disponibiliteId },
    });
    if (!disponibilite) {
      return res.status(404).json({ message: "Disponibilité introuvable." });
    }

    const autorisation = await autoriserGestionAgenda(req, res, disponibilite.medecin_id);
    if (!autorisation) return;

    await prisma.disponibiliteMedecin.delete({ where: { disponibilite_id: req.params.disponibiliteId } });
    return res.status(200).json({ message: "Disponibilité supprimée." });
  } catch (err) {
    next(err);
  }
}

/* ===================================================================
 * CreneauAgenda (instances concrètes)
 * =================================================================== */

/**
 * GET /api/medecins/:medecinId/agenda
 * PUBLIQUE — c'est cette route qu'un patient (connecté ou non)
 * consulte pour voir les créneaux réellement libres avant de prendre
 * rendez-vous. Filtres optionnels :
 *   ?date_debut=AAAA-MM-JJ&date_fin=AAAA-MM-JJ (bornes incluses)
 *   ?statut=disponible|reserve|bloque
 * rdv_id n'est jamais exposé ici (voir SELECTION_CRENEAU_PUBLIC).
 */
export async function listerCreneauxAgenda(req, res, next) {
  try {
    const { date_debut, date_fin, statut } = req.query;

    if (statut !== undefined && !["disponible", "reserve", "bloque"].includes(statut)) {
      return res.status(400).json({
        message: "statut invalide. Valeurs acceptées : disponible, reserve, bloque.",
      });
    }

    const filtreDate = {};
    if (date_debut) filtreDate.gte = new Date(date_debut);
    if (date_fin) filtreDate.lte = new Date(date_fin);

    const creneaux = await prisma.creneauAgenda.findMany({
      where: {
        medecin_id: req.params.medecinId,
        ...(Object.keys(filtreDate).length > 0 ? { date: filtreDate } : {}),
        ...(statut ? { statut } : {}),
      },
      orderBy: [{ date: "asc" }, { horaire: { heure_debut: "asc" } }],
      ...SELECTION_CRENEAU_PUBLIC,
    });

    return res.status(200).json({ creneaux });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/creneaux-agenda/:id
 * PUBLIQUE.
 */
export async function obtenirCreneauAgenda(req, res, next) {
  try {
    const creneau = await prisma.creneauAgenda.findUnique({
      where: { creneau_id: req.params.id },
      ...SELECTION_CRENEAU_PUBLIC,
    });
    if (!creneau) {
      return res.status(404).json({ message: "Créneau introuvable." });
    }
    return res.status(200).json({ creneau });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/medecins/:medecinId/agenda/generer
 * Médecin propriétaire ou admin/superadmin. Matérialise le gabarit
 * (DisponibiliteMedecin) en créneaux concrets (CreneauAgenda,
 * origine="genere") sur une période [date_debut, date_fin] (bornes
 * incluses, ${PLAGE_GENERATION_MAX_JOURS} jours maximum). Idempotent :
 * les créneaux déjà existants pour une date/horaire donnés sont
 * silencieusement ignorés (contrainte unique [medecin_id, horaire_id,
 * date], skipDuplicates) — on peut donc rappeler cette route sans
 * risque pour étendre l'agenda semaine après semaine.
 */
export async function genererCreneauxAgenda(req, res, next) {
  try {
    const autorisation = await autoriserGestionAgenda(req, res, req.params.medecinId);
    if (!autorisation) return;

    const { date_debut, date_fin } = req.body;
    if (!date_debut || !date_fin) {
      return res.status(400).json({ message: "Champs obligatoires manquants : date_debut, date_fin." });
    }

    const debut = new Date(`${date_debut}T00:00:00Z`);
    const fin = new Date(`${date_fin}T00:00:00Z`);
    if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) {
      return res.status(400).json({ message: "date_debut / date_fin invalides (attendu AAAA-MM-JJ)." });
    }
    if (debut > fin) {
      return res.status(400).json({ message: "date_debut doit être antérieure ou égale à date_fin." });
    }

    const nombreJours = Math.round((fin - debut) / 86_400_000) + 1;
    if (nombreJours > PLAGE_GENERATION_MAX_JOURS) {
      return res.status(400).json({
        message: `Plage trop large : ${PLAGE_GENERATION_MAX_JOURS} jours maximum par appel.`,
      });
    }

    const gabarit = await prisma.disponibiliteMedecin.findMany({
      where: { medecin_id: req.params.medecinId },
    });

    // Regroupement du gabarit par jour_semaine pour un lookup direct
    // pendant la boucle sur les dates (évite de refiltrer le tableau
    // à chaque itération).
    const gabaritParJour = {};
    for (const dispo of gabarit) {
      (gabaritParJour[dispo.jour_semaine] ??= []).push(dispo.horaire_id);
    }

    const aCreer = [];
    for (let i = 0; i < nombreJours; i++) {
      const date = new Date(debut.getTime() + i * 86_400_000);
      const jourSemaine = JOUR_SEMAINE_PAR_INDEX_JS[date.getUTCDay()];
      for (const horaire_id of gabaritParJour[jourSemaine] || []) {
        aCreer.push({
          medecin_id: req.params.medecinId,
          horaire_id,
          date,
          statut: "disponible",
          origine: "genere",
        });
      }
    }

    if (aCreer.length === 0) {
      return res.status(200).json({
        message: "Aucun créneau à générer sur cette période (gabarit vide ou aucun jour correspondant).",
        nombre_crees: 0,
      });
    }

    const resultat = await prisma.creneauAgenda.createMany({ data: aCreer, skipDuplicates: true });

    return res.status(201).json({
      message: "Créneaux générés à partir du gabarit.",
      nombre_crees: resultat.count,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/medecins/:medecinId/agenda
 * Médecin propriétaire ou admin/superadmin. Ajoute un créneau
 * ponctuel HORS gabarit (origine="manuel" — ex. ouverture
 * exceptionnelle un jour normalement non couvert). Champs requis :
 * horaire_id, date (AAAA-MM-JJ). statut optionnel, restreint à
 * "disponible" ou "bloque" (jamais "reserve" — voir en-tête de
 * fichier), par défaut "disponible".
 */
export async function creerCreneauAgenda(req, res, next) {
  try {
    const autorisation = await autoriserGestionAgenda(req, res, req.params.medecinId);
    if (!autorisation) return;

    const { horaire_id, date, statut } = req.body;
    if (!horaire_id || !date) {
      return res.status(400).json({ message: "Champs obligatoires manquants : horaire_id, date." });
    }

    if (statut !== undefined && !STATUTS_CRENEAU_MODIFIABLES.includes(statut)) {
      return res.status(400).json({
        message: `statut invalide. Valeurs acceptées : ${STATUTS_CRENEAU_MODIFIABLES.join(", ")}.`,
      });
    }

    const dateCreneau = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(dateCreneau.getTime())) {
      return res.status(400).json({ message: "date invalide (attendu AAAA-MM-JJ)." });
    }

    const horaire = await prisma.horaire.findUnique({ where: { horaire_id } });
    if (!horaire) {
      return res.status(400).json({ message: "horaire_id invalide : horaire introuvable." });
    }

    const creneau = await prisma.creneauAgenda.create({
      data: {
        medecin_id: req.params.medecinId,
        horaire_id,
        date: dateCreneau,
        statut: statut || "disponible",
        origine: "manuel",
      },
      ...SELECTION_CRENEAU_PUBLIC,
    });

    return res.status(201).json({ message: "Créneau ajouté.", creneau });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "Un créneau existe déjà pour ce médecin, cet horaire et cette date." });
    }
    next(err);
  }
}

/**
 * PUT /api/creneaux-agenda/:id
 * Médecin propriétaire ou admin/superadmin. Ne permet de changer que
 * le statut, entre "disponible" et "bloque" (ex. bloquer une tranche
 * pour congé/urgence). Un créneau déjà occupé par un rendez-vous
 * (rdv_id renseigné, statut "reserve") ne peut pas être modifié
 * directement ici — passer par PATCH /rendez-vous/:id/statut côté
 * module Rendez-vous, seul point d'entrée autorisé à libérer/occuper
 * un créneau. Une modification manuelle marque le créneau
 * origine="manuel", même s'il avait été généré depuis le gabarit (voir
 * schema.prisma, commentaire sur OrigineCreneauAgenda).
 */
export async function modifierCreneauAgenda(req, res, next) {
  try {
    const creneau = await prisma.creneauAgenda.findUnique({ where: { creneau_id: req.params.id } });
    if (!creneau) {
      return res.status(404).json({ message: "Créneau introuvable." });
    }

    const autorisation = await autoriserGestionAgenda(req, res, creneau.medecin_id);
    if (!autorisation) return;

    if (creneau.rdv_id) {
      return res.status(409).json({
        message: "Ce créneau est occupé par un rendez-vous : passer par PATCH /rendez-vous/:id/statut pour le libérer.",
      });
    }

    const { statut } = req.body;
    if (!statut) {
      return res.status(400).json({ message: "Le champ statut est obligatoire." });
    }
    if (!STATUTS_CRENEAU_MODIFIABLES.includes(statut)) {
      return res.status(400).json({
        message: `statut invalide. Valeurs acceptées : ${STATUTS_CRENEAU_MODIFIABLES.join(", ")}.`,
      });
    }

    const creneauMisAJour = await prisma.creneauAgenda.update({
      where: { creneau_id: req.params.id },
      data: { statut, origine: "manuel" },
      ...SELECTION_CRENEAU_PUBLIC,
    });

    return res.status(200).json({ message: "Créneau mis à jour.", creneau: creneauMisAJour });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/creneaux-agenda/:id
 * Médecin propriétaire ou admin/superadmin. Retrait pur et simple du
 * créneau (ex. nettoyer un ajout manuel erroné). Refusé si un
 * rendez-vous y est rattaché (rdv_id) : il faut d'abord annuler le
 * rendez-vous via le module Rendez-vous, jamais supprimer le créneau
 * sous ses pieds.
 */
export async function supprimerCreneauAgenda(req, res, next) {
  try {
    const creneau = await prisma.creneauAgenda.findUnique({ where: { creneau_id: req.params.id } });
    if (!creneau) {
      return res.status(404).json({ message: "Créneau introuvable." });
    }

    const autorisation = await autoriserGestionAgenda(req, res, creneau.medecin_id);
    if (!autorisation) return;

    if (creneau.rdv_id) {
      return res.status(409).json({
        message: "Ce créneau est occupé par un rendez-vous : annulez le rendez-vous avant de le supprimer.",
      });
    }

    await prisma.creneauAgenda.delete({ where: { creneau_id: req.params.id } });
    return res.status(200).json({ message: "Créneau supprimé." });
  } catch (err) {
    next(err);
  }
}