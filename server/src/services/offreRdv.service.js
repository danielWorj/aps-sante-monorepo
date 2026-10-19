// src/services/offreRdv.service.js
// RDV ALÉATOIRE (terme technique : RDV sur offre) — règles métier.
//
// 1. Le patient publie une offre : spécialité, pays + ville, jour ET heure
//    souhaités (c'est lui qui fixe la date), type de RDV, motif. Pas de budget.
// 2. L'offre est signalée (notification in-app) à tous les médecins EN LIGNE
//    de cette spécialité, de ce pays et de cette ville (téléconsultation :
//    seulement ceux qui l'ont activée), dont la prise de RDV en ligne est
//    ouverte (abonnement de présence).
// 3. Chaque médecin éligible peut répondre, avec ses paramètres de profil
//    (tarif indicatif, etc.) : rien n'est saisi sur mesure, hormis un mot
//    facultatif. Il ne peut répondre que s'il est libre à l'heure demandée.
// 4. Le patient compare les profils des répondants et valide l'un d'eux :
//    un RDV classique « cree » est créé à la date de l'offre (même délai de
//    confirmation que les autres RDV, même paiement : honoraires = tarif
//    indicatif du médecin). La case d'agenda du médecin à cette heure, si
//    elle existe, est réservée.
// 5. Si ce RDV est annulé AVANT paiement (délai expiré, annulation par le
//    patient), l'offre redevient « ouverte » et les réponses restent
//    valables, tant que la date n'est pas passée.
// 6. Une offre ouverte dont la date est passée expire (cron).
//
// D8 : le médecin ne voit JAMAIS l'identité du patient sur une offre (il la
// découvre, comme pour tout RDV, une fois le paiement confirmé).

import crypto from "crypto";
import prisma from "../lib/prisma.js";
import { construireUrl } from "../lib/cloudinaryService.js";
import { genererCodeConsultation } from "../lib/codeConsultation.js";
import { echeanceConfirmation } from "../lib/delaiConfirmation.js";
import {
  caseDepuisInstant,
  fuseauOuDefaut,
  heureMuraleDepuisInstant,
  instantDepuisHeureMurale,
} from "../lib/fuseauHoraire.js";
import {
  droitsPresencePublics,
  filtrerMedecin,
  resoudreDroitsPresence,
  resoudreDroitsPresenceEnLot,
} from "../lib/droitsPresence.js";
import {
  ErreurCreneau,
  bornesCreneau,
  fuseauDuMedecin,
  horizonAgendaJours,
  reserverCreneau,
} from "./agendaCreneau.service.js";
import { resoudreDelaiConfirmationMedecin } from "./parametreDelaiConfirmation.service.js";
import { creerNotifications } from "./notification.service.js";
import { estViolationCreneauActif, MESSAGE_CRENEAU_PRIS } from "../utils/erreursPrisma.js";

const MS_PAR_MINUTE = 60_000;
const MS_PAR_JOUR = 86_400_000;

export const TYPES_RDV = ["physique", "teleconsultation"];
export const LONGUEUR_MAX_MOTIF = 1000;
export const LONGUEUR_MAX_MESSAGE = 500;

function entierPositifEnv(nom, defaut) {
  const n = Number(process.env[nom] ?? defaut);
  return Number.isInteger(n) && n >= 0 ? n : defaut;
}

// Délai minimum entre la publication et l'heure souhaitée : il faut laisser
// aux médecins le temps de répondre et au patient celui de payer.
export const DELAI_MIN_PUBLICATION_MINUTES = entierPositifEnv("OFFRE_RDV_DELAI_MIN_MINUTES", 120);
// Anti-abus : nombre maximal d'offres en cours (ouvertes ou attribuées) par patient.
export const MAX_OFFRES_EN_COURS = entierPositifEnv("OFFRE_RDV_MAX_EN_COURS", 3);

// Pages des clients web ouvertes au clic sur une notification (`donnees.lien`).
const LIEN_DEMANDES_PATIENT = "/portail/patient-demandes";
const LIEN_DEMANDES_MEDECIN = "/portail/medecin-demandes";

// Statuts de RDV qui occupent un médecin à une heure donnée (miroir de
// l'index partiel rendez_vous_medecin_creneau_actif_key).
const STATUTS_RDV_ACTIFS = ["cree", "confirme", "en_attente_presence", "a_reprogrammer"];

/** Refus métier attendu : traduit en réponse HTTP par le contrôleur. */
export class ErreurOffre extends Error {
  constructor(message, status = 409, code = undefined) {
    super(message);
    this.name = "ErreurOffre";
    this.status = status;
    this.code = code;
  }
}

/* -------------------------------------------------------------------
 * Éligibilité des médecins
 * ------------------------------------------------------------------- */

/**
 * Filtre Prisma des médecins éligibles à une offre (hors droits de présence,
 * vérifiés ensuite en lot) : même spécialité, pays et ville, fiche en ligne
 * (publiée, ou déjà publiée et en re-modération), compte actif.
 */
// Fiche en ligne (publiée, ou déjà publiée et en re-modération) et compte actif.
const FILTRE_FICHE_EN_LIGNE = {
  utilisateur: { statut_compte: "actif" },
  OR: [
    { statut_verification: "publie" },
    { statut_verification: "en_cours", date_premiere_publication: { not: null } },
  ],
};

function filtreMedecinsEligibles(offre) {
  return {
    specialite_id: offre.specialite_id,
    pays_exercice_id: offre.pays_id,
    ville_exercice_id: offre.ville_id,
    ...(offre.type_rdv === "teleconsultation" ? { teleconsultation_activee: true } : {}),
    ...FILTRE_FICHE_EN_LIGNE,
  };
}

/**
 * Raison pour laquelle ce médecin ne reçoit AUCUNE demande (fiche hors
 * ligne, profil incomplet, abonnement sans RDV en ligne), ou null. La liste
 * des demandes ouvertes et le droit de répondre reposent sur les mêmes
 * règles : un médecin ne voit jamais une demande à laquelle il ne peut pas
 * répondre.
 * @returns {Promise<string|null>}
 */
async function raisonSansDemandes(medecin, db = prisma) {
  const enLigne = await db.medecin.count({ where: { medecin_id: medecin.medecin_id, ...FILTRE_FICHE_EN_LIGNE } });
  if (!enLigne) {
    return "Votre fiche n'est pas encore publiée : les demandes des patients vous seront signalées dès sa validation.";
  }
  if (!medecin.specialite_id || !medecin.pays_exercice_id || !medecin.ville_exercice_id) {
    return "Renseignez votre spécialité et votre ville d'exercice sur votre profil pour recevoir les demandes des patients.";
  }
  const { droits } = await resoudreDroitsPresence("medecin", medecin.medecin_id);
  if (!droits.prise_rdv_en_ligne) {
    return "La prise de rendez-vous en ligne n'est pas incluse dans votre abonnement de présence actuel.";
  }
  return null;
}

/**
 * Raison pour laquelle ce médecin ne peut pas répondre à l'offre, ou null.
 * @returns {Promise<string|null>}
 */
async function raisonInegibilite(medecin, offre, db = prisma) {
  const generale = await raisonSansDemandes(medecin, db);
  if (generale) return generale;
  const eligible = await db.medecin.count({
    where: { medecin_id: medecin.medecin_id, ...filtreMedecinsEligibles(offre) },
  });
  if (!eligible) {
    return offre.type_rdv === "teleconsultation" && !medecin.teleconsultation_activee
      ? "Cette demande est une téléconsultation : activez la téléconsultation sur votre profil pour y répondre."
      : "Cette demande ne correspond pas à votre spécialité ou à votre ville d'exercice.";
  }
  return null;
}

/**
 * Le médecin est-il libre à cet instant ? Il ne l'est pas s'il a déjà un RDV
 * actif à la même heure, ou si une case de son agenda couvrant cet instant
 * est réservée ou fermée. Retourne la case libre qui commence exactement à
 * cet instant (à réserver lors de la validation), ou null s'il n'y en a pas
 * (heure hors agenda : le médecin a accepté l'heure en répondant).
 * @param {string} medecin_id
 * @param {Date} instant
 * @param {{ rdvIgnore?: string }} [options]
 * @param {object} [db]
 * @returns {Promise<object|null>}
 * @throws {ErreurOffre} 409 MEDECIN_INDISPONIBLE
 */
export async function verifierMedecinLibre(medecin_id, instant, { rdvIgnore } = {}, db = prisma) {
  const indisponible = () =>
    new ErreurOffre(
      "Ce médecin n'est plus disponible à l'heure demandée (rendez-vous déjà pris ou créneau fermé).",
      409,
      "MEDECIN_INDISPONIBLE"
    );

  const rdvExistant = await db.rendezVous.findFirst({
    where: {
      medecin_id,
      date_creneau: instant,
      statut: { in: STATUTS_RDV_ACTIFS },
      ...(rdvIgnore ? { rdv_id: { not: rdvIgnore } } : {}),
    },
    select: { rdv_id: true },
  });
  if (rdvExistant) throw indisponible();

  // Cases de la journée murale (et de la veille, pour une case à cheval sur minuit).
  const fuseau = await fuseauDuMedecin(medecin_id, db);
  const { date } = caseDepuisInstant(instant, fuseau);
  const cases = await db.creneauAgenda.findMany({
    where: { medecin_id, date: { in: [date, new Date(date.getTime() - MS_PAR_JOUR)] } },
    include: { horaire: true },
  });
  let caseExacte = null;
  for (const c of cases) {
    const { debut, fin } = bornesCreneau(c, fuseau);
    const couvre = debut.getTime() <= instant.getTime() && instant.getTime() < fin.getTime();
    if (!couvre) continue;
    const libre = c.statut === "disponible" && !c.rdv_id;
    if (!libre) throw indisponible();
    if (debut.getTime() === instant.getTime()) caseExacte = c;
  }
  return caseExacte;
}

/* -------------------------------------------------------------------
 * Projections
 * ------------------------------------------------------------------- */

const SELECTION_MEDECIN_REPONSE = {
  medecin_id: true,
  utilisateur_id: true,
  specialite_id: true,
  numero_ordre: true,
  teleconsultation_activee: true,
  tarif_indicatif: true,
  biographie: true,
  linkedInUrl: true,
  cv_url: true,
  photo_url: true,
  utilisateur: { select: { nom: true, prenom: true } },
  specialite: { select: { specialite_id: true, nom: true } },
  ville_exercice: { select: { ville_id: true, nom: true } },
  pays_exercice: { select: { pays_id: true, nom: true } },
};

const INCLUSION_OFFRE = {
  specialite: { select: { specialite_id: true, nom: true } },
  ville: { select: { ville_id: true, nom: true } },
  pays: { select: { pays_id: true, nom: true, fuseau_horaire: true } },
  rendez_vous: { select: { rdv_id: true, statut: true, medecin_id: true, date_creneau: true } },
};

const deuxChiffres = (n) => String(n).padStart(2, "0");

/**
 * Ajoute `date_murale` : le jour et l'heure de l'offre dans le fuseau de son
 * pays, tels que le patient les a choisis. Les clients affichent ces valeurs
 * telles quelles, jamais `date_souhaitee` convertie dans le fuseau de
 * l'appareil (un patient à Paris et un médecin à Douala lisent la même heure).
 */
function avecDateMurale(offre) {
  const fuseau = fuseauOuDefaut(offre.pays?.fuseau_horaire);
  const m = heureMuraleDepuisInstant(offre.date_souhaitee, fuseau);
  return {
    ...offre,
    date_murale: {
      jour: `${m.annee}-${deuxChiffres(m.mois)}-${deuxChiffres(m.jour)}`,
      heure: `${deuxChiffres(m.heures)}:${deuxChiffres(m.minutes)}`,
      fuseau,
    },
  };
}

const RE_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Instant souhaité : de préférence `jour` (AAAA-MM-JJ) + `heure` (HH:mm),
 * heure murale du pays de la ville ; sinon `date_souhaitee` (ISO, ancien
 * contrat, conservé pour les clients non mis à jour).
 */
function instantSouhaite({ jour, heure, date_souhaitee }, fuseau) {
  if (jour !== undefined || heure !== undefined) {
    const j = typeof jour === "string" ? RE_JOUR.exec(jour) : null;
    const h = typeof heure === "string" ? RE_HEURE.exec(heure) : null;
    if (!j || !h) throw new ErreurOffre("jour (AAAA-MM-JJ) ou heure (HH:mm) invalide.", 400);
    return instantDepuisHeureMurale(
      { annee: Number(j[1]), mois: Number(j[2]), jour: Number(j[3]), heures: Number(h[1]), minutes: Number(h[2]) },
      fuseau
    );
  }
  const date = new Date(date_souhaitee);
  if (Number.isNaN(date.getTime())) throw new ErreurOffre("date_souhaitee invalide.", 400);
  date.setUTCSeconds(0, 0);
  return date;
}

/** Fiche publique d'un répondant (droits de présence appliqués, URLs construites). */
function ficheMedecinPublique(m, droits, avis) {
  const fiche = filtrerMedecin(m, droits);
  delete fiche.utilisateur_id;
  return {
    ...fiche,
    photo_url: fiche.photo_url ? construireUrl(fiche.photo_url) : null,
    cv_url: fiche.cv_url ? construireUrl(fiche.cv_url) : null,
    droits: droitsPresencePublics(droits),
    note_moyenne: avis?.moyenne ?? null,
    total_avis: avis?.total ?? 0,
  };
}

/** Moyenne et nombre d'avis publiés, par médecin (une requête). */
async function avisParMedecin(ids) {
  if (!ids.length) return new Map();
  const lignes = await prisma.avisMedecin.groupBy({
    by: ["medecin_id"],
    where: { medecin_id: { in: ids }, statut_moderation: "publie" },
    _avg: { note: true },
    _count: { _all: true },
  });
  return new Map(
    lignes.map((l) => [
      l.medecin_id,
      { moyenne: l._avg.note == null ? null : Math.round(l._avg.note * 10) / 10, total: l._count._all },
    ])
  );
}

/** Offre vue par le médecin : jamais l'identité du patient (D8). */
function offrePourMedecin(offre, maReponse) {
  const { patient_id: _p, patient: _pa, reponses: _r, rendez_vous: rdv, rdv_id: _id, ...reste } = avecDateMurale(offre);
  return {
    ...reste,
    // Le médecin sait seulement si l'offre lui a été attribuée, jamais à qui d'autre.
    attribuee_a_moi: Boolean(rdv && maReponse && rdv.medecin_id === maReponse.medecin_id),
    nombre_reponses: offre._count?.reponses ?? undefined,
    ma_reponse: maReponse
      ? {
          reponse_id: maReponse.reponse_id,
          statut: maReponse.statut,
          message: maReponse.message,
          date_creation: maReponse.date_creation,
        }
      : null,
  };
}

/* -------------------------------------------------------------------
 * Validation des entrées
 * ------------------------------------------------------------------- */

function nettoyerTexte(valeur, nom, max) {
  if (valeur === undefined || valeur === null) return null;
  if (typeof valeur !== "string") throw new ErreurOffre(`${nom} doit être une chaîne de caractères.`, 400);
  const t = valeur.trim();
  if (t.length > max) throw new ErreurOffre(`${nom} trop long (${max} caractères maximum).`, 400);
  return t || null;
}

/* -------------------------------------------------------------------
 * Patient
 * ------------------------------------------------------------------- */

/**
 * Publie une offre et la signale aux médecins éligibles.
 * @param {{ patient_id: string }} patient
 * @param {object} corps { specialite_id, ville_id, type_rdv, jour + heure (heure murale du pays de la ville) ou date_souhaitee (ISO), motif }
 * @returns {Promise<{ offre: object, medecins_notifies: number }>}
 */
export async function publierOffre(patient, corps = {}, maintenant = new Date()) {
  const { specialite_id, ville_id, type_rdv } = corps;
  if (!specialite_id || !ville_id || !type_rdv || (!corps.date_souhaitee && !(corps.jour && corps.heure))) {
    throw new ErreurOffre("Champs requis manquants : specialite_id, ville_id, type_rdv, jour et heure.", 400);
  }
  if (!TYPES_RDV.includes(type_rdv)) {
    throw new ErreurOffre(`type_rdv invalide. Valeurs acceptées : ${TYPES_RDV.join(", ")}.`, 400);
  }
  const motif = nettoyerTexte(corps.motif, "motif", LONGUEUR_MAX_MOTIF);

  const [specialite, ville] = await Promise.all([
    prisma.specialite.findUnique({ where: { specialite_id }, select: { specialite_id: true, nom: true } }),
    prisma.ville.findUnique({
      where: { ville_id },
      select: { ville_id: true, pays_id: true, nom: true, pays: { select: { fuseau_horaire: true } } },
    }),
  ]);
  if (!specialite) throw new ErreurOffre("specialite_id introuvable.", 400);
  if (!ville) throw new ErreurOffre("ville_id introuvable.", 400);

  const date = instantSouhaite(corps, fuseauOuDefaut(ville.pays?.fuseau_horaire));
  if (date.getTime() < maintenant.getTime() + DELAI_MIN_PUBLICATION_MINUTES * MS_PAR_MINUTE) {
    throw new ErreurOffre(
      `La date souhaitée doit être au moins ${DELAI_MIN_PUBLICATION_MINUTES / 60} h après la publication, ` +
        "pour laisser aux médecins le temps de répondre.",
      400,
      "DATE_TROP_PROCHE"
    );
  }
  if (date.getTime() > maintenant.getTime() + horizonAgendaJours() * MS_PAR_JOUR) {
    throw new ErreurOffre(`La date souhaitée ne peut pas dépasser ${horizonAgendaJours()} jours.`, 400, "DATE_TROP_LOINTAINE");
  }

  const enCours = await prisma.offreRdv.count({
    where: { patient_id: patient.patient_id, statut: { in: ["ouverte", "attribuee"] }, date_souhaitee: { gt: maintenant } },
  });
  if (enCours >= MAX_OFFRES_EN_COURS) {
    throw new ErreurOffre(
      `Vous avez déjà ${enCours} demandes en cours : annulez-en une ou attendez qu'elle aboutisse.`,
      409,
      "TROP_D_OFFRES"
    );
  }

  const offre = await prisma.offreRdv.create({
    data: {
      patient_id: patient.patient_id,
      specialite_id,
      pays_id: ville.pays_id,
      ville_id,
      type_rdv,
      date_souhaitee: date,
      motif,
    },
    include: INCLUSION_OFFRE,
  });

  let medecins_notifies = 0;
  try {
    medecins_notifies = await notifierMedecinsEligibles(offre);
  } catch (err) {
    // L'offre reste publiée : les médecins la voient dans leur liste.
    console.error(`[offre-rdv] Notification des médecins impossible (offre ${offre.offre_id}) :`, err.message);
  }
  return { offre: { ...avecDateMurale(offre), reponses: [] }, medecins_notifies };
}

async function notifierMedecinsEligibles(offre) {
  const candidats = await prisma.medecin.findMany({
    where: filtreMedecinsEligibles(offre),
    select: { medecin_id: true, utilisateur_id: true },
  });
  const droits = await resoudreDroitsPresenceEnLot("medecin", candidats.map((m) => m.medecin_id));
  const destinataires = candidats.filter((m) => droits.get(m.medecin_id)?.droits.prise_rdv_en_ligne);
  const { count } = await creerNotifications(
    destinataires.map((m) => ({
      utilisateur_id: m.utilisateur_id,
      type: "offre_rdv_nouvelle",
      titre: `Nouvelle demande de rendez-vous : ${offre.specialite.nom}`,
      message:
        `Un patient de ${offre.ville.nom} cherche un médecin (${offre.specialite.nom}, ` +
        `${offre.type_rdv === "teleconsultation" ? "téléconsultation" : "consultation physique"}). ` +
        "Répondez si vous êtes disponible à l'heure demandée : le patient choisira parmi les médecins qui ont répondu.",
      donnees: {
        offre_id: offre.offre_id,
        date_souhaitee: offre.date_souhaitee.toISOString(),
        type_rdv: offre.type_rdv,
        lien: LIEN_DEMANDES_MEDECIN,
      },
      cle: `offre_rdv_nouvelle:${offre.offre_id}:${m.utilisateur_id}`,
    }))
  );
  return count;
}

/**
 * Offres du patient avec, pour chacune, les médecins qui ont répondu
 * (réponses actives et retenue), leur fiche publique et leur note.
 */
export async function listerOffresPatient(patient, { statut, offre_id } = {}) {
  const offres = await prisma.offreRdv.findMany({
    where: { patient_id: patient.patient_id, ...(statut ? { statut } : {}), ...(offre_id ? { offre_id } : {}) },
    orderBy: { date_creation: "desc" },
    include: {
      ...INCLUSION_OFFRE,
      reponses: {
        where: { statut: { in: ["proposee", "retenue"] } },
        orderBy: { date_creation: "asc" },
        include: { medecin: { select: SELECTION_MEDECIN_REPONSE } },
      },
    },
  });

  const ids = [...new Set(offres.flatMap((o) => o.reponses.map((r) => r.medecin_id)))];
  const [droitsParId, avis] = await Promise.all([resoudreDroitsPresenceEnLot("medecin", ids), avisParMedecin(ids)]);
  return offres.map((o) => ({
    ...avecDateMurale(o),
    reponses: o.reponses.map((r) => ({
      reponse_id: r.reponse_id,
      statut: r.statut,
      message: r.message,
      date_creation: r.date_creation,
      medecin: ficheMedecinPublique(r.medecin, droitsParId.get(r.medecin_id).droits, avis.get(r.medecin_id)),
    })),
  }));
}

export async function obtenirOffrePatient(patient, offre_id) {
  const [offre] = await listerOffresPatient(patient, { offre_id });
  if (!offre) throw new ErreurOffre("Offre introuvable.", 404);
  return offre;
}

/** Le patient retire son offre (seulement tant qu'aucun médecin n'est validé). */
export async function annulerOffre(patient, offre_id, maintenant = new Date()) {
  const { count } = await prisma.offreRdv.updateMany({
    where: { offre_id, patient_id: patient.patient_id, statut: "ouverte" },
    data: { statut: "annulee", date_annulation: maintenant },
  });
  if (count === 1) return;
  const offre = await prisma.offreRdv.findFirst({ where: { offre_id, patient_id: patient.patient_id } });
  if (!offre) throw new ErreurOffre("Offre introuvable.", 404);
  throw new ErreurOffre(
    offre.statut === "attribuee"
      ? "Un médecin a déjà été validé : annulez le rendez-vous lui-même depuis vos rendez-vous."
      : `Cette offre ne peut plus être annulée (statut : ${offre.statut}).`,
    409
  );
}

/**
 * « Valider ce médecin » : crée le RDV classique (« cree ») à la date de
 * l'offre et réserve la case d'agenda correspondante si elle existe. Le
 * patient doit ensuite payer (même flux et même délai que tout RDV).
 * @returns {Promise<{ rdv: object, delai: { heures: number }, echeance: Date }>}
 */
export async function validerMedecin(patient, offre_id, reponse_id, maintenant = new Date()) {
  const offre = await prisma.offreRdv.findFirst({ where: { offre_id, patient_id: patient.patient_id } });
  if (!offre) throw new ErreurOffre("Offre introuvable.", 404);
  if (offre.statut !== "ouverte") {
    throw new ErreurOffre(
      offre.statut === "attribuee"
        ? "Vous avez déjà validé un médecin pour cette demande."
        : `Cette offre n'est plus ouverte (statut : ${offre.statut}).`,
      409,
      "OFFRE_NON_OUVERTE"
    );
  }
  if (offre.date_souhaitee.getTime() <= maintenant.getTime()) {
    throw new ErreurOffre("La date de cette demande est passée : publiez une nouvelle demande.", 409, "OFFRE_PASSEE");
  }

  const reponse = await prisma.reponseOffreRdv.findFirst({
    where: { reponse_id, offre_id },
    include: { medecin: true },
  });
  if (!reponse || reponse.statut !== "proposee") {
    throw new ErreurOffre("Ce médecin n'a pas (ou plus) de réponse active sur cette demande.", 409, "REPONSE_INACTIVE");
  }
  const medecin = reponse.medecin;
  if (await raisonInegibilite(medecin, offre)) {
    throw new ErreurOffre("Ce médecin ne peut plus être retenu pour cette demande.", 409, "MEDECIN_INELIGIBLE");
  }
  if (!(Number(medecin.tarif_indicatif) > 0)) {
    throw new ErreurOffre("Ce médecin n'a pas de tarif défini : le paiement en ligne est impossible.", 409, "TARIF_ABSENT");
  }

  const delai = await resoudreDelaiConfirmationMedecin(medecin.medecin_id);
  const code_unique = await genererCodeUnique();

  let rdv;
  try {
    rdv = await prisma.$transaction(async (tx) => {
      // Verrou : une seule validation par offre (double clic, deux onglets).
      const { count } = await tx.offreRdv.updateMany({
        where: { offre_id, statut: "ouverte" },
        data: { statut: "attribuee" },
      });
      if (count !== 1) throw new ErreurOffre("Cette demande vient d'être attribuée.", 409, "OFFRE_NON_OUVERTE");

      const caseLibre = await verifierMedecinLibre(medecin.medecin_id, offre.date_souhaitee, {}, tx);
      const cree = await tx.rendezVous.create({
        data: {
          patient_id: patient.patient_id,
          medecin_id: medecin.medecin_id,
          type_rdv: offre.type_rdv,
          date_creneau: offre.date_souhaitee,
          statut: "cree",
          motif: offre.motif,
          code_unique,
          qr_token_secret: crypto.randomBytes(32).toString("hex"),
          delai_confirmation_heures: delai.heures,
        },
      });
      if (caseLibre) await reserverCreneau(tx, caseLibre.creneau_id, cree.rdv_id);
      await tx.offreRdv.update({ where: { offre_id }, data: { rdv_id: cree.rdv_id } });
      await tx.reponseOffreRdv.update({ where: { reponse_id }, data: { statut: "retenue" } });
      return cree;
    });
  } catch (err) {
    if (err instanceof ErreurCreneau) throw new ErreurOffre(err.message, err.status, "MEDECIN_INDISPONIBLE");
    if (estViolationCreneauActif(err)) throw new ErreurOffre(MESSAGE_CRENEAU_PRIS, 409, "MEDECIN_INDISPONIBLE");
    throw err;
  }

  return { rdv, delai, echeance: echeanceConfirmation(rdv) };
}

async function genererCodeUnique() {
  for (;;) {
    const code = genererCodeConsultation();
    // eslint-disable-next-line no-await-in-loop
    const existe = await prisma.rendezVous.findUnique({ where: { code_unique: code }, select: { rdv_id: true } });
    if (!existe) return code;
  }
}

/* -------------------------------------------------------------------
 * Médecin
 * ------------------------------------------------------------------- */

/**
 * Offres visibles par le médecin :
 *   - « ouvertes » : offres ouvertes, à venir, auxquelles il est éligible
 *     (mêmes règles que pour répondre) ; s'il ne peut en recevoir aucune,
 *     `raison` dit pourquoi ;
 *   - « mes_reponses » : offres auxquelles il a répondu (tout statut).
 * @returns {Promise<{ offres: object[], raison: string|null }>}
 */
export async function listerOffresMedecin(medecin, { vue = "ouvertes" } = {}, maintenant = new Date()) {
  if (vue === "mes_reponses") {
    const reponses = await prisma.reponseOffreRdv.findMany({
      where: { medecin_id: medecin.medecin_id },
      orderBy: { date_creation: "desc" },
      include: { offre: { include: INCLUSION_OFFRE } },
    });
    return { offres: reponses.map((r) => offrePourMedecin(r.offre, r)), raison: null };
  }

  const raison = await raisonSansDemandes(medecin);
  if (raison) return { offres: [], raison };
  const offres = await prisma.offreRdv.findMany({
    where: {
      statut: "ouverte",
      date_souhaitee: { gt: maintenant },
      specialite_id: medecin.specialite_id,
      pays_id: medecin.pays_exercice_id,
      ville_id: medecin.ville_exercice_id,
      ...(medecin.teleconsultation_activee ? {} : { type_rdv: "physique" }),
    },
    orderBy: { date_souhaitee: "asc" },
    include: {
      ...INCLUSION_OFFRE,
      reponses: { where: { medecin_id: medecin.medecin_id } },
      _count: { select: { reponses: { where: { statut: { in: ["proposee", "retenue"] } } } } },
    },
  });
  return { offres: offres.map((o) => offrePourMedecin(o, o.reponses[0] ?? null)), raison: null };
}

/**
 * Le médecin répond à une offre (ou réactive une réponse retirée).
 * @returns {Promise<object>} la réponse
 */
export async function repondreOffre(medecin, offre_id, { message } = {}, maintenant = new Date()) {
  const texte = nettoyerTexte(message, "message", LONGUEUR_MAX_MESSAGE);
  const offre = await prisma.offreRdv.findUnique({ where: { offre_id }, include: INCLUSION_OFFRE });
  if (!offre) throw new ErreurOffre("Offre introuvable.", 404);
  if (offre.statut !== "ouverte" || offre.date_souhaitee.getTime() <= maintenant.getTime()) {
    throw new ErreurOffre("Cette demande n'accepte plus de réponses.", 409, "OFFRE_NON_OUVERTE");
  }
  const raison = await raisonInegibilite(medecin, offre);
  if (raison) throw new ErreurOffre(raison, 403, "MEDECIN_INELIGIBLE");
  await verifierMedecinLibre(medecin.medecin_id, offre.date_souhaitee);

  const existante = await prisma.reponseOffreRdv.findUnique({
    where: { offre_id_medecin_id: { offre_id, medecin_id: medecin.medecin_id } },
  });
  if (existante?.statut === "proposee" || existante?.statut === "retenue") {
    throw new ErreurOffre("Vous avez déjà répondu à cette demande.", 409, "DEJA_REPONDU");
  }
  const reponse = existante
    ? await prisma.reponseOffreRdv.update({
        where: { reponse_id: existante.reponse_id },
        data: { statut: "proposee", message: texte, date_retrait: null, date_creation: maintenant },
      })
    : await prisma.reponseOffreRdv.create({
        data: { offre_id, medecin_id: medecin.medecin_id, message: texte },
      });

  try {
    await notifierPatientReponse(offre, reponse);
  } catch (err) {
    console.error(`[offre-rdv] Notification patient impossible (offre ${offre_id}) :`, err.message);
  }
  return reponse;
}

async function notifierPatientReponse(offre, reponse) {
  const patient = await prisma.patient.findUnique({
    where: { patient_id: offre.patient_id },
    select: { utilisateur_id: true },
  });
  if (!patient) return;
  await creerNotifications([
    {
      utilisateur_id: patient.utilisateur_id,
      type: "offre_rdv_reponse",
      titre: "Un médecin a répondu à votre demande",
      message:
        `Un médecin (${offre.specialite.nom}) est disponible pour votre demande. ` +
        "Consultez son profil et son tarif, puis validez le médecin de votre choix.",
      donnees: { offre_id: offre.offre_id, date_souhaitee: offre.date_souhaitee.toISOString(), lien: LIEN_DEMANDES_PATIENT },
      // Une réponse retirée puis renvoyée produit une nouvelle note (date de réponse dans la clé).
      cle: `offre_rdv_reponse:${reponse.reponse_id}:${reponse.date_creation.toISOString()}`,
    },
  ]);
}

/** Le médecin retire sa réponse, tant que le patient ne l'a pas validée. */
export async function retirerReponse(medecin, offre_id, maintenant = new Date()) {
  const { count } = await prisma.reponseOffreRdv.updateMany({
    where: { offre_id, medecin_id: medecin.medecin_id, statut: "proposee" },
    data: { statut: "retiree", date_retrait: maintenant },
  });
  if (count === 1) return;
  const reponse = await prisma.reponseOffreRdv.findUnique({
    where: { offre_id_medecin_id: { offre_id, medecin_id: medecin.medecin_id } },
  });
  if (!reponse) throw new ErreurOffre("Vous n'avez pas répondu à cette demande.", 404);
  throw new ErreurOffre(
    reponse.statut === "retenue"
      ? "Le patient vous a déjà retenu : la demande est devenue un rendez-vous."
      : "Votre réponse est déjà retirée.",
    409
  );
}

/* -------------------------------------------------------------------
 * Cycle de vie (annulation du RDV, expiration)
 * ------------------------------------------------------------------- */

/**
 * À appeler APRÈS l'annulation d'un RDV qui n'avait pas été payé (« cree ») :
 * si ce RDV venait d'une offre, l'offre redevient « ouverte » (les réponses
 * restent valables, celle du médecin retenu redevient « proposee ») tant que
 * sa date n'est pas passée ; sinon elle expire. Sans effet pour un RDV qui
 * ne vient pas d'une offre. Ne lève jamais : journalise.
 * @param {string} rdv_id
 */
export async function rouvrirOffreApresAnnulationRdv(rdv_id, maintenant = new Date()) {
  try {
    const offre = await prisma.offreRdv.findUnique({
      where: { rdv_id },
      include: { rendez_vous: { select: { statut: true, compte_escrow: { select: { rdv_id: true } } } } },
    });
    if (!offre || offre.statut !== "attribuee") return;
    // Un RDV payé puis annulé ne rouvre jamais l'offre (remboursement classique).
    if (offre.rendez_vous?.statut !== "annule" || offre.rendez_vous?.compte_escrow) return;

    const encoreAVenir = offre.date_souhaitee.getTime() > maintenant.getTime();
    await prisma.$transaction([
      prisma.offreRdv.updateMany({
        where: { offre_id: offre.offre_id, statut: "attribuee", rdv_id },
        data: { statut: encoreAVenir ? "ouverte" : "expiree", rdv_id: null },
      }),
      prisma.reponseOffreRdv.updateMany({
        where: { offre_id: offre.offre_id, statut: "retenue" },
        data: { statut: "proposee" },
      }),
    ]);
  } catch (err) {
    console.error(`[offre-rdv] Réouverture de l'offre impossible (rdv ${rdv_id}) :`, err.message);
  }
}

/**
 * Cron : les offres ouvertes dont la date est passée expirent ; le patient
 * est prévenu.
 * @returns {Promise<{ expirees: number }>}
 */
export async function expirerOffresEchues({ maintenant = new Date() } = {}) {
  const echues = await prisma.offreRdv.findMany({
    where: { statut: "ouverte", date_souhaitee: { lte: maintenant } },
    select: {
      offre_id: true,
      date_souhaitee: true,
      specialite: { select: { nom: true } },
      patient: { select: { utilisateur_id: true } },
    },
  });
  let expirees = 0;
  for (const o of echues) {
    // eslint-disable-next-line no-await-in-loop
    const { count } = await prisma.offreRdv.updateMany({
      where: { offre_id: o.offre_id, statut: "ouverte" },
      data: { statut: "expiree" },
    });
    if (count !== 1) continue;
    expirees += 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      await creerNotifications([
        {
          utilisateur_id: o.patient.utilisateur_id,
          type: "offre_rdv_expiree",
          titre: "Demande de rendez-vous expirée",
          message:
            `Votre demande (${o.specialite.nom}) a expiré sans médecin validé. ` +
            "Vous pouvez publier une nouvelle demande ou réserver directement un médecin.",
          donnees: { offre_id: o.offre_id, date_souhaitee: o.date_souhaitee.toISOString(), lien: LIEN_DEMANDES_PATIENT },
          cle: `offre_rdv_expiree:${o.offre_id}:${o.patient.utilisateur_id}`,
        },
      ]);
    } catch (err) {
      console.error(`[offre-rdv] Notification d'expiration impossible (offre ${o.offre_id}) :`, err.message);
    }
  }
  return { expirees };
}

/* -------------------------------------------------------------------
 * Administration (back-office)
 * ------------------------------------------------------------------- */

export const STATUTS_OFFRE = ["ouverte", "attribuee", "expiree", "annulee"];
const LIMITE_ADMIN_MAX = 100;

/**
 * Liste paginée de toutes les offres (identité du patient et des
 * répondants comprise), avec le nombre d'offres par statut pour le filtre
 * pays courant.
 * @param {{ statut?: string, pays_id?: string, page?: number, limite?: number }} filtres
 */
export async function listerOffresAdmin({ statut, pays_id, page = 1, limite = 25 } = {}) {
  const taille = Math.min(Math.max(Number.parseInt(limite, 10) || 25, 1), LIMITE_ADMIN_MAX);
  const numero = Math.max(Number.parseInt(page, 10) || 1, 1);
  const base = pays_id ? { pays_id } : {};
  const where = { ...base, ...(statut ? { statut } : {}) };

  const [offres, total, parStatut] = await Promise.all([
    prisma.offreRdv.findMany({
      where,
      orderBy: { date_creation: "desc" },
      skip: (numero - 1) * taille,
      take: taille,
      include: {
        ...INCLUSION_OFFRE,
        patient: { select: { patient_id: true, utilisateur: { select: { nom: true, prenom: true, email: true, telephone: true } } } },
        reponses: {
          orderBy: { date_creation: "asc" },
          include: {
            medecin: {
              select: { medecin_id: true, tarif_indicatif: true, utilisateur: { select: { nom: true, prenom: true } } },
            },
          },
        },
      },
    }),
    prisma.offreRdv.count({ where }),
    prisma.offreRdv.groupBy({ by: ["statut"], where: base, _count: { _all: true } }),
  ]);

  const statistiques = Object.fromEntries(STATUTS_OFFRE.map((s) => [s, 0]));
  for (const l of parStatut) statistiques[l.statut] = l._count._all;
  return { offres: offres.map(avecDateMurale), total, page: numero, limite: taille, statistiques };
}

/** Modération : un admin retire une offre encore ouverte. */
export async function annulerOffreAdmin(offre_id, maintenant = new Date()) {
  const { count } = await prisma.offreRdv.updateMany({
    where: { offre_id, statut: "ouverte" },
    data: { statut: "annulee", date_annulation: maintenant },
  });
  if (count === 1) return;
  const offre = await prisma.offreRdv.findUnique({ where: { offre_id }, select: { statut: true } });
  if (!offre) throw new ErreurOffre("Offre introuvable.", 404);
  throw new ErreurOffre(`Seule une offre ouverte peut être retirée (statut : ${offre.statut}).`, 409);
}
