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
//
// DEMANDE DIRECTE (medecin_cible_id) : le médecin choisi par le patient n'a
// AUCUN créneau libre. Le patient lui propose un jour + une heure ; le médecin
// a 24 h (ou jusqu'à l'heure du RDV si elle est plus proche) pour accepter
// (RDV « cree » créé, le patient paie) ou refuser. Refus ou silence : l'offre
// passe « refusee », le patient est notifié et choisit de changer de médecin
// (offre « annulee ») ou de recevoir les candidatures des autres médecins
// (offre « ouverte », diffusée comme un RDV sur offre, sans le médecin cible).
//
// TÉLÉCONSULTATION : seulement avec un médecin qui a déjà reçu le patient en
// consultation physique effectuée (teleconsultationPrealable.service.js).

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
  aDesCreneauxLibres,
  bornesCreneau,
  fuseauDuMedecin,
  horizonAgendaJours,
  reserverCreneau,
} from "./agendaCreneau.service.js";
import { resoudreDelaiConfirmationMedecin } from "./parametreDelaiConfirmation.service.js";
import { creerNotifications } from "./notification.service.js";
import { estViolationCreneauActif, MESSAGE_CRENEAU_PRIS } from "../utils/erreursPrisma.js";
import {
  CODE_TELECONSULTATION_SANS_RDV_PHYSIQUE,
  FILTRE_RDV_PHYSIQUE_EFFECTUE,
  MESSAGE_TELECONSULTATION_SANS_RDV_PHYSIQUE,
  aEuRdvPhysiqueEffectue,
  medecinsAyantRecuLePatient,
  notifierRefusTeleconsultation,
} from "./teleconsultationPrealable.service.js";

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
// Demande directe : délai de réponse du médecin (heures).
export const DELAI_REPONSE_DIRECTE_HEURES = entierPositifEnv("DEMANDE_DIRECTE_DELAI_REPONSE_HEURES", 24);
const MS_PAR_HEURE = 3_600_000;
// Statuts qui comptent dans la limite d'offres en cours d'un patient.
const STATUTS_OFFRE_EN_COURS = ["ouverte", "attribuee", "en_attente_medecin"];

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
  medecin_cible: {
    select: {
      medecin_id: true,
      photo_url: true,
      utilisateur: { select: { nom: true, prenom: true } },
      specialite: { select: { nom: true } },
    },
  },
};

/** « Dr Prénom Nom » d'un médecin chargé avec `utilisateur`. */
function nomMedecin(m) {
  const u = m?.utilisateur;
  const nom = [u?.prenom, u?.nom].filter(Boolean).join(" ").trim();
  return nom ? `Dr ${nom}` : "Le médecin";
}

function erreurTeleconsultation(message = MESSAGE_TELECONSULTATION_SANS_RDV_PHYSIQUE) {
  return new ErreurOffre(message, 409, CODE_TELECONSULTATION_SANS_RDV_PHYSIQUE);
}

/**
 * Refus côté PATIENT : il est aussi notifié (in-app + push), puis l'erreur
 * est renvoyée à l'appelant pour être levée.
 */
async function refusTeleconsultation(patient_id, medecin_id, message = MESSAGE_TELECONSULTATION_SANS_RDV_PHYSIQUE) {
  await notifierRefusTeleconsultation(patient_id, { medecin_id, message });
  return erreurTeleconsultation(message);
}

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
function offrePourMedecin(offre, maReponse, medecin_id = maReponse?.medecin_id) {
  const {
    patient_id: _p,
    patient: _pa,
    reponses: _r,
    rendez_vous: rdv,
    rdv_id: _id,
    // Demande directe : un autre médecin ne sait jamais qui a été sollicité ni pourquoi il a refusé.
    medecin_cible: _mc,
    medecin_cible_id: cible,
    motif_refus: _mr,
    sans_reponse: _sr,
    refusee_le: _rl,
    ...reste
  } = avecDateMurale(offre);
  return {
    ...reste,
    // Vrai si CE médecin est celui à qui le patient a adressé la demande directe.
    demande_directe: Boolean(cible && medecin_id && cible === medecin_id),
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

  await verifierLimiteOffres(patient, maintenant);

  // Téléconsultation : au moins un médecin éligible doit déjà avoir reçu le
  // patient en consultation physique (seuls ceux-là verront la demande).
  if (type_rdv === "teleconsultation") {
    const recus = await medecinsEligiblesAyantRecu(patient.patient_id, {
      specialite_id,
      pays_id: ville.pays_id,
      ville_id,
      type_rdv,
    });
    if (!recus.length) {
      throw await refusTeleconsultation(patient.patient_id, null,
        "Une téléconsultation n'est possible qu'avec un médecin qui vous a déjà reçu en consultation physique. " +
          `Aucun médecin (${specialite.nom}, ${ville.nom}) ne vous a encore reçu : publiez une demande de consultation physique.`
      );
    }
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

async function verifierLimiteOffres(patient, maintenant) {
  const enCours = await prisma.offreRdv.count({
    where: { patient_id: patient.patient_id, statut: { in: STATUTS_OFFRE_EN_COURS }, date_souhaitee: { gt: maintenant } },
  });
  if (enCours >= MAX_OFFRES_EN_COURS) {
    throw new ErreurOffre(
      `Vous avez déjà ${enCours} demandes en cours : annulez-en une ou attendez qu'elle aboutisse.`,
      409,
      "TROP_D_OFFRES"
    );
  }
}

/** Identifiants des médecins éligibles à l'offre qui ont déjà reçu ce patient (consultation physique effectuée). */
async function medecinsEligiblesAyantRecu(patient_id, offre, { exclure = null } = {}) {
  const candidats = await prisma.medecin.findMany({
    where: { ...filtreMedecinsEligibles(offre), ...(exclure ? { medecin_id: { not: exclure } } : {}) },
    select: { medecin_id: true },
  });
  const recus = await medecinsAyantRecuLePatient(patient_id, candidats.map((m) => m.medecin_id));
  return [...recus];
}

/**
 * Signale l'offre aux médecins éligibles. Jamais au médecin cible d'une
 * demande directe (il l'a refusée) ; pour une téléconsultation, seulement à
 * ceux qui ont déjà reçu le patient en consultation physique.
 */
async function notifierMedecinsEligibles(offre) {
  const candidats = await prisma.medecin.findMany({
    where: {
      ...filtreMedecinsEligibles(offre),
      ...(offre.medecin_cible_id ? { medecin_id: { not: offre.medecin_cible_id } } : {}),
    },
    select: { medecin_id: true, utilisateur_id: true },
  });
  const droits = await resoudreDroitsPresenceEnLot("medecin", candidats.map((m) => m.medecin_id));
  let destinataires = candidats.filter((m) => droits.get(m.medecin_id)?.droits.prise_rdv_en_ligne);
  if (offre.type_rdv === "teleconsultation") {
    const recus = await medecinsAyantRecuLePatient(offre.patient_id, destinataires.map((m) => m.medecin_id));
    destinataires = destinataires.filter((m) => recus.has(m.medecin_id));
  }
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
    // Demande directe : médecin sollicité (nom, photo) pour l'affichage.
    medecin_cible: o.medecin_cible
      ? { ...o.medecin_cible, photo_url: o.medecin_cible.photo_url ? construireUrl(o.medecin_cible.photo_url) : null }
      : null,
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

/**
 * Candidatures (réponses actives) d'une offre qui vient d'être tranchée :
 * le médecin retenu apprend que le patient l'a choisi ; les autres que leur
 * candidature n'est pas retenue (autre médecin choisi, demande annulée ou
 * expirée). Ne lève jamais : journalise.
 * @param {string} offre_id
 * Appelée une seule fois par issue (chaque appelant a gagné sa mise à jour
 * conditionnelle) : l'instant dans la clé distingue une nouvelle attribution
 * après réouverture de l'offre.
 * @param {{ issue: "attribuee"|"annulee"|"expiree", reponseRetenueId?: string, maintenant?: Date }} p
 */
async function notifierCandidats(offre_id, { issue, reponseRetenueId = null, maintenant = new Date() }) {
  try {
    const offre = await prisma.offreRdv.findUnique({
      where: { offre_id },
      select: {
        offre_id: true,
        date_souhaitee: true,
        type_rdv: true,
        specialite: { select: { nom: true } },
        ville: { select: { nom: true } },
        reponses: {
          where: { statut: { in: ["proposee", "retenue"] } },
          select: { reponse_id: true, statut: true, medecin: { select: { utilisateur_id: true } } },
        },
      },
    });
    if (!offre?.reponses.length) return;

    const contexte = `${offre.specialite.nom}, ${offre.ville.nom}`;
    const raisons = {
      attribuee: "Le patient a choisi un autre médecin pour cette demande.",
      annulee: "Le patient a annulé cette demande.",
      expiree: "Cette demande a expiré sans que le patient ne choisisse de médecin.",
    };
    await creerNotifications(
      offre.reponses.map((r) => {
        const retenue = r.reponse_id === reponseRetenueId;
        return {
          utilisateur_id: r.medecin.utilisateur_id,
          type: retenue ? "offre_rdv_candidature_retenue" : "offre_rdv_candidature_non_retenue",
          titre: retenue ? "Votre candidature est retenue" : "Candidature non retenue",
          message: retenue
            ? `Le patient vous a choisi pour sa demande (${contexte}). Le rendez-vous sera confirmé dès son paiement : vous en serez prévenu.`
            : `${raisons[issue]} (${contexte}). Merci pour votre disponibilité.`,
          donnees: {
            offre_id: offre.offre_id,
            date_souhaitee: offre.date_souhaitee.toISOString(),
            type_rdv: offre.type_rdv,
            lien: LIEN_DEMANDES_MEDECIN,
          },
          cle: `offre_rdv_candidature:${offre.offre_id}:${issue}:${maintenant.toISOString()}:${r.reponse_id}`,
        };
      })
    );
  } catch (err) {
    console.error(`[offre-rdv] Notification des candidats impossible (offre ${offre_id}) :`, err.message);
  }
}

/**
 * Le patient retire son offre (seulement tant qu'aucun médecin n'est validé).
 * Demande directe : il peut la retirer pendant l'attente du médecin, ou après
 * son refus (choix « changer de médecin »).
 */
export async function annulerOffre(patient, offre_id, maintenant = new Date()) {
  const { count } = await prisma.offreRdv.updateMany({
    where: { offre_id, patient_id: patient.patient_id, statut: { in: ["ouverte", "en_attente_medecin", "refusee"] } },
    data: { statut: "annulee", date_annulation: maintenant },
  });
  if (count === 1) {
    await notifierCandidats(offre_id, { issue: "annulee", maintenant });
    return;
  }
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
  if (offre.type_rdv === "teleconsultation" && !(await aEuRdvPhysiqueEffectue(patient.patient_id, medecin.medecin_id))) {
    throw await refusTeleconsultation(patient.patient_id, medecin.medecin_id);
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

  await notifierCandidats(offre_id, { issue: "attribuee", reponseRetenueId: reponse_id, maintenant });
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
    return { offres: reponses.map((r) => offrePourMedecin(r.offre, r, medecin.medecin_id)), raison: null };
  }
  if (vue === "directes") {
    // Demandes directes en attente de SA réponse (les plus urgentes d'abord).
    const directes = await prisma.offreRdv.findMany({
      where: {
        medecin_cible_id: medecin.medecin_id,
        statut: "en_attente_medecin",
        echeance_reponse_medecin: { gt: maintenant },
      },
      orderBy: { echeance_reponse_medecin: "asc" },
      include: INCLUSION_OFFRE,
    });
    return { offres: directes.map((o) => offrePourMedecin(o, null, medecin.medecin_id)), raison: null };
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
      // Une demande directe qu'il a refusée (ou laissée sans réponse) puis
      // diffusée aux autres ne lui est plus proposée.
      OR: [{ medecin_cible_id: null }, { medecin_cible_id: { not: medecin.medecin_id } }],
    },
    orderBy: { date_souhaitee: "asc" },
    include: {
      ...INCLUSION_OFFRE,
      reponses: { where: { medecin_id: medecin.medecin_id } },
      _count: { select: { reponses: { where: { statut: { in: ["proposee", "retenue"] } } } } },
    },
  });
  // Téléconsultation : seulement les patients qu'il a déjà reçus en consultation physique.
  const patientsTele = [...new Set(offres.filter((o) => o.type_rdv === "teleconsultation").map((o) => o.patient_id))];
  let patientsRecus = new Set();
  if (patientsTele.length) {
    const lignes = await prisma.rendezVous.findMany({
      where: { medecin_id: medecin.medecin_id, patient_id: { in: patientsTele }, ...FILTRE_RDV_PHYSIQUE_EFFECTUE },
      select: { patient_id: true },
      distinct: ["patient_id"],
    });
    patientsRecus = new Set(lignes.map((l) => l.patient_id));
  }
  const visibles = offres.filter((o) => o.type_rdv !== "teleconsultation" || patientsRecus.has(o.patient_id));
  return {
    offres: visibles.map((o) => offrePourMedecin(o, o.reponses[0] ?? null, medecin.medecin_id)),
    raison: null,
  };
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
  if (offre.medecin_cible_id === medecin.medecin_id) {
    throw new ErreurOffre("Vous avez déjà décliné cette demande.", 409, "DEMANDE_DECLINEE");
  }
  const raison = await raisonInegibilite(medecin, offre);
  if (raison) throw new ErreurOffre(raison, 403, "MEDECIN_INELIGIBLE");
  if (offre.type_rdv === "teleconsultation" && !(await aEuRdvPhysiqueEffectue(offre.patient_id, medecin.medecin_id))) {
    throw erreurTeleconsultation(
      "Cette téléconsultation est réservée aux médecins qui ont déjà reçu ce patient en consultation physique."
    );
  }
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
    // Demande directe jamais diffusée : elle ne concernait que ce médecin, elle
    // ne devient pas une offre publique sans l'accord du patient.
    const directeNonDiffusee = Boolean(offre.medecin_cible_id && !offre.diffusee_le);
    await prisma.$transaction([
      prisma.offreRdv.updateMany({
        where: { offre_id: offre.offre_id, statut: "attribuee", rdv_id },
        data: { statut: encoreAVenir && !directeNonDiffusee ? "ouverte" : "expiree", rdv_id: null },
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
  const { sans_reponse } = await expirerDemandesDirectesSansReponse({ maintenant });
  // Demande refusée dont le patient n'a rien décidé avant l'heure : expirée, sans note.
  const { count: refuseesEchues } = await prisma.offreRdv.updateMany({
    where: { statut: "refusee", date_souhaitee: { lte: maintenant } },
    data: { statut: "expiree" },
  });
  const { expirees } = await expirerOffresOuvertesEchues({ maintenant });
  return { expirees: expirees + refuseesEchues, demandes_directes_sans_reponse: sans_reponse };
}

async function expirerOffresOuvertesEchues({ maintenant }) {
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
    // eslint-disable-next-line no-await-in-loop
    await notifierCandidats(o.offre_id, { issue: "expiree", maintenant });
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
 * Demande directe (médecin sans créneau libre)
 * ------------------------------------------------------------------- */

/**
 * Le patient propose un jour + une heure à un médecin qui n'a AUCUN créneau
 * libre. Le médecin a DELAI_REPONSE_DIRECTE_HEURES (24 h) pour répondre, ou
 * jusqu'à l'heure demandée si elle est plus proche.
 * @param {{ patient_id: string }} patient
 * @param {object} corps { medecin_id, type_rdv, jour (AAAA-MM-JJ), heure (HH:mm, heure murale du pays du médecin), motif? }
 * @returns {Promise<{ offre: object }>}
 */
export async function publierDemandeDirecte(patient, corps = {}, maintenant = new Date()) {
  const { medecin_id, type_rdv } = corps;
  if (!medecin_id || !type_rdv || !corps.jour || !corps.heure) {
    throw new ErreurOffre("Champs requis manquants : medecin_id, type_rdv, jour et heure.", 400);
  }
  if (!TYPES_RDV.includes(type_rdv)) {
    throw new ErreurOffre(`type_rdv invalide. Valeurs acceptées : ${TYPES_RDV.join(", ")}.`, 400);
  }
  const motif = nettoyerTexte(corps.motif, "motif", LONGUEUR_MAX_MOTIF);

  const medecin = await prisma.medecin.findUnique({
    where: { medecin_id },
    include: {
      utilisateur: { select: { nom: true, prenom: true } },
      specialite: { select: { nom: true } },
      pays_exercice: { select: { fuseau_horaire: true } },
    },
  });
  if (!medecin) throw new ErreurOffre("Médecin introuvable.", 404);
  if (await raisonSansDemandes(medecin)) {
    throw new ErreurOffre(
      "Ce médecin ne peut pas recevoir de demande de rendez-vous pour le moment.",
      409,
      "MEDECIN_INELIGIBLE"
    );
  }
  if (type_rdv === "teleconsultation" && !medecin.teleconsultation_activee) {
    throw new ErreurOffre("Ce médecin n'a pas activé la téléconsultation.", 400, "TELECONSULTATION_INACTIVE");
  }
  if (await aDesCreneauxLibres(medecin_id, { maintenant })) {
    throw new ErreurOffre(
      "Ce médecin a des créneaux disponibles : choisissez-en un dans son agenda.",
      409,
      "MEDECIN_A_DES_CRENEAUX"
    );
  }
  if (type_rdv === "teleconsultation" && !(await aEuRdvPhysiqueEffectue(patient.patient_id, medecin_id))) {
    throw await refusTeleconsultation(patient.patient_id, medecin_id);
  }

  const date = instantSouhaite(corps, fuseauOuDefaut(medecin.pays_exercice?.fuseau_horaire));
  if (date.getTime() < maintenant.getTime() + DELAI_MIN_PUBLICATION_MINUTES * MS_PAR_MINUTE) {
    throw new ErreurOffre(
      `L'heure proposée doit être au moins ${DELAI_MIN_PUBLICATION_MINUTES / 60} h après votre demande, ` +
        "pour laisser au médecin le temps de répondre.",
      400,
      "DATE_TROP_PROCHE"
    );
  }
  if (date.getTime() > maintenant.getTime() + horizonAgendaJours() * MS_PAR_JOUR) {
    throw new ErreurOffre(`La date proposée ne peut pas dépasser ${horizonAgendaJours()} jours.`, 400, "DATE_TROP_LOINTAINE");
  }
  await verifierMedecinLibre(medecin_id, date);

  const dejaEnAttente = await prisma.offreRdv.count({
    where: { patient_id: patient.patient_id, medecin_cible_id: medecin_id, statut: "en_attente_medecin" },
  });
  if (dejaEnAttente) {
    throw new ErreurOffre(
      "Vous avez déjà une demande en attente auprès de ce médecin : patientez jusqu'à sa réponse.",
      409,
      "DEMANDE_DEJA_EN_COURS"
    );
  }
  await verifierLimiteOffres(patient, maintenant);

  const echeance = new Date(Math.min(maintenant.getTime() + DELAI_REPONSE_DIRECTE_HEURES * MS_PAR_HEURE, date.getTime()));
  const offre = await prisma.offreRdv.create({
    data: {
      patient_id: patient.patient_id,
      specialite_id: medecin.specialite_id,
      pays_id: medecin.pays_exercice_id,
      ville_id: medecin.ville_exercice_id,
      type_rdv,
      date_souhaitee: date,
      motif,
      statut: "en_attente_medecin",
      medecin_cible_id: medecin_id,
      echeance_reponse_medecin: echeance,
    },
    include: INCLUSION_OFFRE,
  });

  try {
    await creerNotifications([
      {
        utilisateur_id: medecin.utilisateur_id,
        type: "demande_rdv_directe",
        titre: "Nouvelle demande de rendez-vous",
        message:
          `Un patient souhaite vous consulter (${type_rdv === "teleconsultation" ? "téléconsultation" : "consultation physique"}) ` +
          `à une date de son choix, car votre agenda n'a plus de créneau libre. ` +
          `Acceptez ou refusez sous ${DELAI_REPONSE_DIRECTE_HEURES} h.`,
        donnees: {
          offre_id: offre.offre_id,
          date_souhaitee: offre.date_souhaitee.toISOString(),
          echeance_reponse: echeance.toISOString(),
          type_rdv,
          lien: `${LIEN_DEMANDES_MEDECIN}?vue=directes`,
        },
        cle: `demande_rdv_directe:${offre.offre_id}`,
      },
    ]);
  } catch (err) {
    console.error(`[offre-rdv] Notification du médecin impossible (demande ${offre.offre_id}) :`, err.message);
  }
  return { offre: { ...avecDateMurale(offre), reponses: [] } };
}

async function demandeDirecteDuMedecin(medecin, offre_id) {
  const offre = await prisma.offreRdv.findFirst({
    where: { offre_id, medecin_cible_id: medecin.medecin_id },
    include: INCLUSION_OFFRE,
  });
  if (!offre) throw new ErreurOffre("Demande introuvable.", 404);
  return offre;
}

function verifierEnAttente(offre, maintenant) {
  if (offre.statut !== "en_attente_medecin") {
    throw new ErreurOffre("Cette demande n'attend plus votre réponse.", 409, "DEMANDE_NON_EN_ATTENTE");
  }
  if (offre.echeance_reponse_medecin && offre.echeance_reponse_medecin.getTime() <= maintenant.getTime()) {
    throw new ErreurOffre("Le délai de réponse à cette demande est dépassé.", 409, "DELAI_REPONSE_DEPASSE");
  }
}

async function utilisateurDuPatient(patient_id) {
  const p = await prisma.patient.findUnique({ where: { patient_id }, select: { utilisateur_id: true } });
  return p?.utilisateur_id ?? null;
}

/**
 * Le médecin accepte la demande directe : RDV « cree » à la date demandée
 * (case d'agenda réservée si elle existe), offre « attribuee ». Le patient
 * est notifié et doit payer (même délai de confirmation que tout RDV).
 * @returns {Promise<{ rdv: object }>}
 */
export async function accepterDemandeDirecte(medecin, offre_id, maintenant = new Date()) {
  const offre = await demandeDirecteDuMedecin(medecin, offre_id);
  verifierEnAttente(offre, maintenant);
  if (offre.date_souhaitee.getTime() <= maintenant.getTime()) {
    throw new ErreurOffre("L'heure de cette demande est passée.", 409, "OFFRE_PASSEE");
  }
  if (!(Number(medecin.tarif_indicatif) > 0)) {
    throw new ErreurOffre(
      "Définissez votre tarif sur votre profil avant d'accepter : le patient doit pouvoir payer en ligne.",
      409,
      "TARIF_ABSENT"
    );
  }
  if (offre.type_rdv === "teleconsultation") {
    if (!medecin.teleconsultation_activee) {
      throw new ErreurOffre("Activez la téléconsultation sur votre profil pour accepter cette demande.", 409, "TELECONSULTATION_INACTIVE");
    }
    if (!(await aEuRdvPhysiqueEffectue(offre.patient_id, medecin.medecin_id))) throw erreurTeleconsultation();
  }

  const delai = await resoudreDelaiConfirmationMedecin(medecin.medecin_id);
  const code_unique = await genererCodeUnique();

  let rdv;
  try {
    rdv = await prisma.$transaction(async (tx) => {
      const { count } = await tx.offreRdv.updateMany({
        where: { offre_id, statut: "en_attente_medecin", medecin_cible_id: medecin.medecin_id },
        data: { statut: "attribuee" },
      });
      if (count !== 1) throw new ErreurOffre("Cette demande n'attend plus votre réponse.", 409, "DEMANDE_NON_EN_ATTENTE");

      const caseLibre = await verifierMedecinLibre(medecin.medecin_id, offre.date_souhaitee, {}, tx);
      const cree = await tx.rendezVous.create({
        data: {
          patient_id: offre.patient_id,
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
      // Trace la réponse du médecin (onglet « Mes réponses »).
      await tx.reponseOffreRdv.upsert({
        where: { offre_id_medecin_id: { offre_id, medecin_id: medecin.medecin_id } },
        create: { offre_id, medecin_id: medecin.medecin_id, statut: "retenue" },
        update: { statut: "retenue", date_retrait: null },
      });
      return cree;
    });
  } catch (err) {
    if (err instanceof ErreurCreneau) throw new ErreurOffre(err.message, err.status, "MEDECIN_INDISPONIBLE");
    if (estViolationCreneauActif(err)) throw new ErreurOffre(MESSAGE_CRENEAU_PRIS, 409, "MEDECIN_INDISPONIBLE");
    throw err;
  }

  try {
    const utilisateur_id = await utilisateurDuPatient(offre.patient_id);
    const medecinComplet = await prisma.medecin.findUnique({
      where: { medecin_id: medecin.medecin_id },
      select: { utilisateur: { select: { nom: true, prenom: true } } },
    });
    if (utilisateur_id) {
      await creerNotifications([
        {
          utilisateur_id,
          type: "demande_rdv_directe_acceptee",
          titre: "Demande de rendez-vous acceptée",
          message:
            `${nomMedecin(medecinComplet)} a accepté votre demande de rendez-vous. ` +
            `Payez dans les ${delai.heures} h pour le confirmer.`,
          donnees: {
            offre_id,
            rdv_id: rdv.rdv_id,
            date_souhaitee: offre.date_souhaitee.toISOString(),
            echeance_confirmation: echeanceConfirmation(rdv).toISOString(),
            lien: LIEN_DEMANDES_PATIENT,
          },
          cle: `demande_rdv_directe_acceptee:${offre_id}:${rdv.rdv_id}`,
        },
      ]);
    }
  } catch (err) {
    console.error(`[offre-rdv] Notification d'acceptation impossible (demande ${offre_id}) :`, err.message);
  }
  return { rdv };
}

/**
 * Note au patient : le médecin a refusé, ou n'a pas répondu à temps. Le
 * patient choisit ensuite : changer de médecin ou recevoir d'autres
 * candidatures. Ne lève jamais : journalise.
 */
async function notifierPatientRefus(offre, { sansReponse }) {
  try {
    const utilisateur_id = await utilisateurDuPatient(offre.patient_id);
    if (!utilisateur_id) return;
    const qui = nomMedecin(offre.medecin_cible);
    await creerNotifications([
      {
        utilisateur_id,
        type: "demande_rdv_directe_refusee",
        titre: sansReponse ? "Pas de réponse du médecin" : "Demande de rendez-vous déclinée",
        message:
          (sansReponse
            ? `${qui} n'a pas répondu à votre demande dans les ${DELAI_REPONSE_DIRECTE_HEURES} h. `
            : `${qui} ne peut pas vous recevoir à l'heure demandée. `) +
          "Souhaitez-vous changer de médecin, ou recevoir les candidatures d'autres médecins pour la même date ?",
        donnees: {
          offre_id: offre.offre_id,
          date_souhaitee: offre.date_souhaitee.toISOString(),
          sans_reponse: sansReponse,
          lien: LIEN_DEMANDES_PATIENT,
        },
        cle: `demande_rdv_directe_refusee:${offre.offre_id}`,
      },
    ]);
  } catch (err) {
    console.error(`[offre-rdv] Notification de refus impossible (demande ${offre.offre_id}) :`, err.message);
  }
}

/** Le médecin refuse la demande directe (motif facultatif, transmis au patient). */
export async function refuserDemandeDirecte(medecin, offre_id, { motif } = {}, maintenant = new Date()) {
  const texte = nettoyerTexte(motif, "motif", LONGUEUR_MAX_MESSAGE);
  const offre = await demandeDirecteDuMedecin(medecin, offre_id);
  verifierEnAttente(offre, maintenant);
  const { count } = await prisma.offreRdv.updateMany({
    where: { offre_id, statut: "en_attente_medecin", medecin_cible_id: medecin.medecin_id },
    data: { statut: "refusee", refusee_le: maintenant, motif_refus: texte, sans_reponse: false },
  });
  if (count !== 1) throw new ErreurOffre("Cette demande n'attend plus votre réponse.", 409, "DEMANDE_NON_EN_ATTENTE");
  await notifierPatientRefus(offre, { sansReponse: false });
}

/**
 * Cron : les demandes directes dont le délai de réponse est échu passent
 * « refusee » (sans réponse) ; le patient est notifié.
 * @returns {Promise<{ sans_reponse: number }>}
 */
async function expirerDemandesDirectesSansReponse({ maintenant }) {
  const echues = await prisma.offreRdv.findMany({
    where: { statut: "en_attente_medecin", echeance_reponse_medecin: { lte: maintenant } },
    include: INCLUSION_OFFRE,
  });
  let sans_reponse = 0;
  for (const o of echues) {
    // eslint-disable-next-line no-await-in-loop
    const { count } = await prisma.offreRdv.updateMany({
      where: { offre_id: o.offre_id, statut: "en_attente_medecin" },
      data: { statut: "refusee", refusee_le: maintenant, sans_reponse: true },
    });
    if (count !== 1) continue;
    sans_reponse += 1;
    // L'heure du RDV est déjà passée : inutile de proposer d'autres médecins.
    // eslint-disable-next-line no-await-in-loop
    if (o.date_souhaitee.getTime() > maintenant.getTime()) await notifierPatientRefus(o, { sansReponse: true });
  }
  return { sans_reponse };
}

/**
 * Après un refus (ou un silence) du médecin, le patient choisit de recevoir
 * les candidatures des AUTRES médecins : la demande devient une offre
 * « ouverte » classique (même spécialité, ville, date), signalée aux médecins
 * éligibles, sauf le médecin qui a refusé.
 * @returns {Promise<{ offre: object, medecins_notifies: number }>}
 */
export async function diffuserDemande(patient, offre_id, maintenant = new Date()) {
  const offre = await prisma.offreRdv.findFirst({
    where: { offre_id, patient_id: patient.patient_id },
    include: INCLUSION_OFFRE,
  });
  if (!offre) throw new ErreurOffre("Demande introuvable.", 404);
  if (offre.statut !== "refusee") {
    throw new ErreurOffre(
      `Seule une demande déclinée par le médecin peut être proposée aux autres médecins (statut : ${offre.statut}).`,
      409,
      "DEMANDE_NON_REFUSEE"
    );
  }
  if (offre.date_souhaitee.getTime() <= maintenant.getTime()) {
    throw new ErreurOffre("L'heure de cette demande est passée : publiez une nouvelle demande.", 409, "OFFRE_PASSEE");
  }
  if (offre.type_rdv === "teleconsultation") {
    const recus = await medecinsEligiblesAyantRecu(offre.patient_id, offre, { exclure: offre.medecin_cible_id });
    if (!recus.length) {
      throw await refusTeleconsultation(offre.patient_id, null,
        "Aucun autre médecin ne vous a encore reçu en consultation physique : la téléconsultation n'est pas possible avec eux. " +
          "Publiez plutôt une demande de consultation physique."
      );
    }
  }

  const { count } = await prisma.offreRdv.updateMany({
    where: { offre_id, statut: "refusee" },
    data: { statut: "ouverte", diffusee_le: maintenant },
  });
  if (count !== 1) throw new ErreurOffre("Cette demande vient de changer de statut.", 409, "DEMANDE_NON_REFUSEE");

  const ouverte = { ...offre, statut: "ouverte", diffusee_le: maintenant };
  let medecins_notifies = 0;
  try {
    medecins_notifies = await notifierMedecinsEligibles(ouverte);
  } catch (err) {
    console.error(`[offre-rdv] Notification des médecins impossible (offre ${offre_id}) :`, err.message);
  }
  return { offre: { ...avecDateMurale(ouverte), reponses: [] }, medecins_notifies };
}

/* -------------------------------------------------------------------
 * Administration (back-office)
 * ------------------------------------------------------------------- */

export const STATUTS_OFFRE = ["ouverte", "attribuee", "expiree", "annulee", "en_attente_medecin", "refusee"];
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
