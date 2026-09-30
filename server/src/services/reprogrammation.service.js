// src/services/reprogrammation.service.js
// Politique de fonds v2 §5 (étape 6) — Reprogrammation d'un RDV « deux
// absents » (statut « a_reprogrammer »).
//
// Protocole : dans les 48h suivant le passage à « a_reprogrammer »
// (a_reprogrammer_le), le patient OU le médecin PROPOSE une nouvelle date ;
// l'AUTRE partie l'ACCEPTE. Une nouvelle proposition remplace la précédente
// sans jamais prolonger le délai. À l'acceptation, le RDV prend le nouveau
// créneau et redevient « confirme » ; l'escrow reste en séquestre (aucun
// nouveau paiement). Sans acceptation à l'échéance, le cron rembourse
// (absence.service.js -> traiterDeuxAbsentsSansReprogrammation).
//
// La nouvelle date doit être (a) dans le futur, (b) une case LIBRE de
// l'agenda du médecin (CreneauAgenda « disponible », sans RDV rattaché),
// (c) sans autre RDV actif du médecin à la même date et heure.
//
// Concurrence : proposition et acceptation sont des UPDATE conditionnels
// (statut, cycle, proposition lue) — pas de proposition remplacée sous les
// pieds de l'accepteur, pas d'acceptation d'un RDV déjà remboursé. Les
// règles d'état vivent dans reglesPresenceReprogrammation.service.js (pur).
//
// Limite connue : à la milliseconde de l'échéance des 48h, une acceptation
// et le passage du cron peuvent se croiser ; l'UPDATE d'acceptation exige
// « délai non écoulé » côté base, mais le cron ne re-vérifie pas le statut
// à l'écriture finale (traitementFonds.service.js). Fenêtre théorique,
// signalée au rapport final.

import prisma from "../lib/prisma.js";
import { STATUTS_RDV_ACTIFS, DELAI_REPROGRAMMATION_H } from "./politiqueFonds.service.js";
import { estViolationCreneauActif, MESSAGE_CRENEAU_PRIS } from "../utils/erreursPrisma.js";
import { notifierAcceptation, notifierProposition } from "./notification.service.js";
import {
  creneauAgendaDepuisDate,
  echeanceReprogrammation,
  evaluerAcceptation,
  evaluerProposition,
  partieDeUtilisateur,
  validerDateProposee,
} from "./reglesPresenceReprogrammation.service.js";

const INCLUSION_PARTIES = {
  patient: { select: { utilisateur_id: true } },
  medecin: { select: { utilisateur_id: true } },
};

const MESSAGE_HORS_AGENDA =
  "Cette date ne correspond à aucun créneau disponible de l'agenda du médecin.";

/** Le secret du QR ne quitte jamais ces réponses. */
function sansSecret(rdv) {
  const { qr_token_secret, ...reste } = rdv; // eslint-disable-line no-unused-vars
  return reste;
}

/**
 * La date est-elle une case libre de l'agenda du médecin ? (voir en-tête)
 * @returns {Promise<{ libre: true } | { libre: false, message: string }>}
 */
async function verifierCreneauLibre(rdv, dateCreneau, db = prisma) {
  const c = creneauAgendaDepuisDate(dateCreneau);
  if (!c.alignee) return { libre: false, message: MESSAGE_HORS_AGENDA };

  const creneau = await db.creneauAgenda.findFirst({
    where: {
      medecin_id: rdv.medecin_id,
      date: c.date,
      statut: "disponible",
      rdv_id: null,
      horaire: { heure_debut: c.heure },
    },
    select: { creneau_id: true },
  });
  if (!creneau) return { libre: false, message: MESSAGE_HORS_AGENDA };

  // Le rattachement RDV <-> CreneauAgenda n'étant pas tenu à jour par
  // rendezVous.controller.js (point ouvert J), la table des RDV fait foi
  // pour l'occupation réelle du créneau.
  const occupe = await db.rendezVous.findFirst({
    where: {
      medecin_id: rdv.medecin_id,
      date_creneau: dateCreneau,
      statut: { in: [...STATUTS_RDV_ACTIFS] },
      rdv_id: { not: rdv.rdv_id },
    },
    select: { rdv_id: true },
  });
  if (occupe) return { libre: false, message: MESSAGE_CRENEAU_PRIS };

  return { libre: true };
}

async function chargerRdv(rdv_id) {
  return prisma.rendezVous.findUnique({ where: { rdv_id }, include: INCLUSION_PARTIES });
}

/**
 * Propose (ou remplace) une nouvelle date.
 * @param {string} rdv_id
 * @param {{ utilisateur_id: string }} utilisateur
 * @param {string|Date} dateBrute
 * @param {{ maintenant?: Date }} [options]
 * @returns {Promise<{ erreur: {status:number,message:string} } | { rdv: object, echeance: Date }>}
 */
export async function proposerNouvelleDate(rdv_id, utilisateur, dateBrute, { maintenant = new Date() } = {}) {
  const rdv = await chargerRdv(rdv_id);
  if (!rdv) return { erreur: { status: 404, message: "Rendez-vous introuvable." } };

  const partie = partieDeUtilisateur(rdv, utilisateur?.utilisateur_id);
  const etat = evaluerProposition({ rdv, partie, maintenant });
  if (etat.erreur) return etat;

  const valide = validerDateProposee(dateBrute, maintenant);
  if (valide.erreur) return valide;

  if (valide.date.getTime() === rdv.date_creneau.getTime()) {
    return { erreur: { status: 400, message: "La nouvelle date doit être différente de l'ancienne." } };
  }

  const libre = await verifierCreneauLibre(rdv, valide.date);
  if (!libre.libre) return { erreur: { status: 409, message: libre.message } };

  // UPDATE conditionnel : le RDV doit encore être dans le MÊME cycle de
  // reprogrammation (pas remboursé, ni reprogrammé, ni ré-entré entre-temps).
  const { count } = await prisma.rendezVous.updateMany({
    where: { rdv_id, statut: "a_reprogrammer", a_reprogrammer_le: rdv.a_reprogrammer_le },
    data: { nouvelle_date_proposee: valide.date, proposee_par: partie, date_proposition: maintenant },
  });
  if (count === 0) {
    return { erreur: { status: 409, message: "Ce rendez-vous a changé entre-temps : la proposition n'a pas été enregistrée." } };
  }

  // Notification : best effort, jamais bloquante (voir notification.service.js).
  try {
    await notifierProposition(rdv, { auteur: partie, dateProposee: valide.date, dateProposition: maintenant });
  } catch (err) {
    console.error(`[reprogrammation] notification de proposition non envoyée (rdv ${rdv_id}) :`, err);
  }

  const rdvMisAJour = await prisma.rendezVous.findUnique({ where: { rdv_id } });
  return { rdv: sansSecret(rdvMisAJour), echeance: echeanceReprogrammation(rdv.a_reprogrammer_le) };
}

/**
 * Accepte la proposition en cours (par l'autre partie).
 * @param {string} rdv_id
 * @param {{ utilisateur_id: string }} utilisateur
 * @param {{ nouvelle_date_proposee?: string|Date, maintenant?: Date }} [options]
 *   nouvelle_date_proposee : date vue par le client ; si fournie, elle doit
 *   correspondre à la proposition en base (sinon 409 : elle a été remplacée).
 */
export async function accepterProposition(rdv_id, utilisateur, { nouvelle_date_proposee, maintenant = new Date() } = {}) {
  const rdv = await chargerRdv(rdv_id);
  if (!rdv) return { erreur: { status: 404, message: "Rendez-vous introuvable." } };

  const partie = partieDeUtilisateur(rdv, utilisateur?.utilisateur_id);
  const etat = evaluerAcceptation({ rdv, partie, maintenant });
  if (etat.erreur) return etat;

  if (nouvelle_date_proposee !== undefined && nouvelle_date_proposee !== null && nouvelle_date_proposee !== "") {
    const vue = new Date(nouvelle_date_proposee);
    if (Number.isNaN(vue.getTime()) || vue.getTime() !== rdv.nouvelle_date_proposee.getTime()) {
      return {
        erreur: { status: 409, message: "La proposition a été modifiée depuis que vous l'avez consultée : relisez-la avant de l'accepter." },
      };
    }
  }

  // Le créneau a pu être pris ou fermé depuis la proposition.
  const libre = await verifierCreneauLibre(rdv, rdv.nouvelle_date_proposee);
  if (!libre.libre) {
    return { erreur: { status: 409, message: `${libre.message} Une nouvelle proposition est nécessaire.` } };
  }

  const limiteDelai = new Date(maintenant.getTime() - DELAI_REPROGRAMMATION_H * 60 * 60 * 1000);
  let count;
  try {
    ({ count } = await prisma.rendezVous.updateMany({
      where: {
        rdv_id,
        statut: "a_reprogrammer",
        // Délai NON écoulé, à l'exact complément de delaiReprogrammationEcoule (>= 48h).
        a_reprogrammer_le: { gt: limiteDelai },
        // La proposition lue est bien celle qu'on accepte.
        nouvelle_date_proposee: rdv.nouvelle_date_proposee,
        proposee_par: rdv.proposee_par,
      },
      data: {
        date_creneau: rdv.nouvelle_date_proposee,
        statut: "confirme",
        // Nouveau créneau : aucune présence, aucune proposition, plus de cycle.
        medecin_present_le: null,
        patient_present_le: null,
        a_reprogrammer_le: null,
        nouvelle_date_proposee: null,
        proposee_par: null,
        date_proposition: null,
      },
    }));
  } catch (err) {
    // Index unique partiel (médecin, créneau) pour les RDV actifs : course avec une réservation.
    if (estViolationCreneauActif(err)) return { erreur: { status: 409, message: MESSAGE_CRENEAU_PRIS } };
    throw err;
  }
  if (count === 0) {
    return { erreur: { status: 409, message: "Ce rendez-vous a changé entre-temps (délai écoulé, proposition remplacée ou RDV traité) : rien n'a été modifié." } };
  }

  try {
    await notifierAcceptation(rdv, {
      auteurProposition: rdv.proposee_par,
      nouvelleDate: rdv.nouvelle_date_proposee,
      cycle: rdv.a_reprogrammer_le,
    });
  } catch (err) {
    console.error(`[reprogrammation] notification d'acceptation non envoyée (rdv ${rdv_id}) :`, err);
  }

  const rdvMisAJour = await prisma.rendezVous.findUnique({ where: { rdv_id } });
  return { rdv: sansSecret(rdvMisAJour) };
}
