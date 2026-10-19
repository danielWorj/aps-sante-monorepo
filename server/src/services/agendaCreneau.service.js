// src/services/agendaCreneau.service.js
// Agenda — POINT UNIQUE de gestion de l'occupation des cases d'agenda
// (CreneauAgenda) par les rendez-vous, et de leur génération à partir du
// gabarit hebdomadaire du médecin (DisponibiliteMedecin).
//
// Règles (voir aussi rendezVous.controller.js) :
//   - un patient ne peut réserver QUE une case « disponible », sans RDV
//     rattaché, et dont l'heure n'est pas passée ;
//   - dès la demande (RDV « cree », pas encore confirmé), la case passe à
//     « reserve » et n'apparaît plus dans la grille des autres patients ;
//   - elle reste « reserve » une fois le RDV confirmé ;
//   - elle redevient « disponible » si le RDV est annulé — y compris
//     l'annulation automatique d'un RDV resté sans confirmation au-delà du
//     délai du pays (expirationConfirmation.service.js).
//
// Gabarit -> cases : synchroniserCreneauxMedecin matérialise le gabarit
// sur un horizon glissant (AGENDA_HORIZON_JOURS, 60 jours par défaut). Elle
// est appelée à chaque modification du gabarit et chaque nuit (scheduler).
// Les cases réservées, bloquées ou ajoutées à la main ne sont jamais
// supprimées par la synchronisation.
//
// Heures murales / instants : voir lib/fuseauHoraire.js (fuseau du pays
// d'exercice du médecin).

import prisma from "../lib/prisma.js";
import {
  caseDepuisInstant,
  dateMuraleDuJour,
  fuseauOuDefaut,
  instantDeCase,
} from "../lib/fuseauHoraire.js";

const MS_PAR_JOUR = 86_400_000;

// Index JS natif (getUTCDay sur une date murale stockée à minuit UTC) ->
// valeur de l'enum JourSemaine.
export const JOUR_SEMAINE_PAR_INDEX_JS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

const HORIZON_MAX_JOURS = 90;
const HORIZON_PAR_DEFAUT_JOURS = 60;

/** Horizon de génération (jours), réglable sans redéploiement. */
export function horizonAgendaJours(env = process.env) {
  const n = Number(env.AGENDA_HORIZON_JOURS ?? HORIZON_PAR_DEFAUT_JOURS);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, HORIZON_MAX_JOURS) : HORIZON_PAR_DEFAUT_JOURS;
}

export const CODES_CRENEAU = Object.freeze({
  INTROUVABLE: "CRENEAU_INTROUVABLE",
  HORS_AGENDA: "CRENEAU_HORS_AGENDA",
  INDISPONIBLE: "CRENEAU_INDISPONIBLE",
  PASSE: "CRENEAU_PASSE",
});

/**
 * Refus métier attendu sur une case d'agenda : le contrôleur le traduit en
 * réponse HTTP ({ message, code }) via `status`.
 */
export class ErreurCreneau extends Error {
  constructor(message, status = 409, code = CODES_CRENEAU.INDISPONIBLE) {
    super(message);
    this.name = "ErreurCreneau";
    this.status = status;
    this.code = code;
  }
}

export const MESSAGE_CRENEAU_INDISPONIBLE =
  "Ce créneau n'est plus disponible : il vient d'être réservé par un autre patient ou fermé par le médecin. " +
  "Veuillez choisir un autre créneau.";
export const MESSAGE_CRENEAU_HORS_AGENDA =
  "Cette date ne correspond à aucun créneau disponible de l'agenda du médecin.";

/**
 * Fuseau horaire du pays d'exercice du médecin.
 * @param {string} medecin_id
 * @param {object} [db]
 * @returns {Promise<string>}
 */
export async function fuseauDuMedecin(medecin_id, db = prisma) {
  const medecin = await db.medecin.findUnique({
    where: { medecin_id },
    select: { pays_exercice: { select: { fuseau_horaire: true } } },
  });
  return fuseauOuDefaut(medecin?.pays_exercice?.fuseau_horaire);
}

/**
 * Instants de début et de fin d'une case (horaire inclus).
 * @param {{ date: Date, horaire: { heure_debut: Date, heure_fin: Date } }} creneau
 * @param {string} fuseau
 */
export function bornesCreneau(creneau, fuseau) {
  return {
    debut: instantDeCase(creneau.date, creneau.horaire.heure_debut, fuseau),
    fin: instantDeCase(creneau.date, creneau.horaire.heure_fin, fuseau),
  };
}

/**
 * Ajoute `debut` / `fin` (ISO, instants réels) à chaque case : les clients
 * affichent ces instants dans le fuseau de l'utilisateur et n'ont plus à
 * recomposer la date eux-mêmes.
 * @param {object[]} creneaux cases avec `horaire`
 * @param {string} fuseau
 */
export function avecInstants(creneaux, fuseau) {
  return creneaux.map((c) => {
    const { debut, fin } = bornesCreneau(c, fuseau);
    return { ...c, debut: debut.toISOString(), fin: fin.toISOString() };
  });
}

/**
 * Case de l'agenda du médecin qui commence à l'instant donné, ou null.
 * @param {string} medecin_id
 * @param {Date} instant
 * @param {object} [db]
 */
export async function trouverCreneauParInstant(medecin_id, instant, db = prisma) {
  const fuseau = await fuseauDuMedecin(medecin_id, db);
  const c = caseDepuisInstant(instant, fuseau);
  if (!c.alignee) return null;
  return db.creneauAgenda.findFirst({
    where: { medecin_id, date: c.date, horaire: { heure_debut: c.heure } },
    include: { horaire: true },
  });
}

/**
 * Résout et contrôle la case demandée par un patient (par `creneau_id`, ou à
 * défaut par la date exacte de début, pour les anciens clients).
 *
 * @param {{ medecin_id: string, creneau_id?: string, date_creneau?: string|Date, maintenant?: Date, rdvCourant?: string }} p
 *   rdvCourant : RDV qui déplace sa propre réservation (la case qu'il occupe
 *   déjà n'est pas une cible valide, mais pas « prise par un autre » non plus).
 * @param {object} [db]
 * @returns {Promise<{ creneau: object, debut: Date, fin: Date }>}
 * @throws {ErreurCreneau}
 */
export async function resoudreCreneauReservable(
  { medecin_id, creneau_id, date_creneau, maintenant = new Date(), rdvCourant } = {},
  db = prisma
) {
  let creneau;
  if (creneau_id) {
    creneau = await db.creneauAgenda.findUnique({ where: { creneau_id }, include: { horaire: true } });
    if (!creneau || creneau.medecin_id !== medecin_id) {
      throw new ErreurCreneau("Créneau introuvable pour ce médecin.", 404, CODES_CRENEAU.INTROUVABLE);
    }
  } else {
    const instant = new Date(date_creneau);
    if (Number.isNaN(instant.getTime())) {
      throw new ErreurCreneau("date_creneau invalide.", 400, CODES_CRENEAU.HORS_AGENDA);
    }
    creneau = await trouverCreneauParInstant(medecin_id, instant, db);
    if (!creneau) throw new ErreurCreneau(MESSAGE_CRENEAU_HORS_AGENDA, 409, CODES_CRENEAU.HORS_AGENDA);
  }

  if (rdvCourant && creneau.rdv_id === rdvCourant) {
    throw new ErreurCreneau("Le rendez-vous occupe déjà ce créneau.", 400, CODES_CRENEAU.INDISPONIBLE);
  }
  if (creneau.statut !== "disponible" || creneau.rdv_id) {
    throw new ErreurCreneau(MESSAGE_CRENEAU_INDISPONIBLE, 409, CODES_CRENEAU.INDISPONIBLE);
  }

  const fuseau = await fuseauDuMedecin(medecin_id, db);
  const { debut, fin } = bornesCreneau(creneau, fuseau);
  if (debut.getTime() <= maintenant.getTime()) {
    throw new ErreurCreneau("Ce créneau est déjà passé.", 409, CODES_CRENEAU.PASSE);
  }
  return { creneau, debut, fin };
}

/**
 * Rattache la case au RDV (statut « reserve »). UPDATE CONDITIONNEL : deux
 * patients qui visent la même case en même temps — un seul gagne, l'autre
 * reçoit ErreurCreneau (409). À appeler dans la transaction qui crée/déplace
 * le RDV, pour que l'échec annule tout.
 * @param {object} db client Prisma ou `tx`
 * @param {string} creneau_id
 * @param {string} rdv_id
 */
export async function reserverCreneau(db, creneau_id, rdv_id) {
  const { count } = await db.creneauAgenda.updateMany({
    where: { creneau_id, statut: "disponible", rdv_id: null },
    data: { statut: "reserve", rdv_id },
  });
  if (count !== 1) throw new ErreurCreneau(MESSAGE_CRENEAU_INDISPONIBLE, 409, CODES_CRENEAU.INDISPONIBLE);
}

/**
 * Libère la (ou les) case(s) tenue(s) par un RDV : elles redeviennent
 * « disponible » et réapparaissent dans la grille.
 * @param {string} rdv_id
 * @param {object} [db]
 * @returns {Promise<number>} nombre de cases libérées
 */
export async function libererCreneauxDuRdv(rdv_id, db = prisma) {
  const { count } = await db.creneauAgenda.updateMany({
    where: { rdv_id },
    data: { rdv_id: null, statut: "disponible" },
  });
  return count;
}

/**
 * Filet de sécurité : libère toute case encore tenue par un RDV annulé
 * (annulation passée par un chemin qui n'aurait pas libéré la case, panne
 * entre l'annulation et la libération…). Les cases des RDV honorés / non
 * honorés restent rattachées : elles sont passées et gardent l'historique.
 * @param {object} [db]
 * @returns {Promise<number>}
 */
export async function libererCreneauxOrphelins(db = prisma) {
  const { count } = await db.creneauAgenda.updateMany({
    where: { rdv_id: { not: null }, rendez_vous: { statut: "annule" } },
    data: { rdv_id: null, statut: "disponible" },
  });
  return count;
}

/**
 * Matérialise le gabarit hebdomadaire du médecin en cases concrètes sur
 * [aujourd'hui, aujourd'hui + horizon[ (dates murales du médecin) :
 *   - crée les cases manquantes (origine « genere ») ;
 *   - supprime les cases À VENIR générées, libres et non modifiées à la
 *     main qui ne correspondent plus au gabarit (tranche retirée).
 * Idempotent.
 * @param {string} medecin_id
 * @param {{ maintenant?: Date, horizonJours?: number }} [options]
 * @param {object} [db]
 * @returns {Promise<{ crees: number, supprimes: number }>}
 */
export async function synchroniserCreneauxMedecin(
  medecin_id,
  { maintenant = new Date(), horizonJours = horizonAgendaJours() } = {},
  db = prisma
) {
  const fuseau = await fuseauDuMedecin(medecin_id, db);
  const aujourdhui = dateMuraleDuJour(fuseau, maintenant);

  const gabarit = await db.disponibiliteMedecin.findMany({
    where: { medecin_id },
    select: { jour_semaine: true, horaire_id: true },
  });
  const cles = new Set(gabarit.map((g) => `${g.jour_semaine}|${g.horaire_id}`));
  const parJour = {};
  for (const g of gabarit) (parJour[g.jour_semaine] ??= []).push(g.horaire_id);

  const aCreer = [];
  for (let i = 0; i < horizonJours; i++) {
    const date = new Date(aujourdhui.getTime() + i * MS_PAR_JOUR);
    const jour = JOUR_SEMAINE_PAR_INDEX_JS[date.getUTCDay()];
    for (const horaire_id of parJour[jour] || []) {
      aCreer.push({ medecin_id, horaire_id, date, statut: "disponible", origine: "genere" });
    }
  }
  const crees = aCreer.length
    ? (await db.creneauAgenda.createMany({ data: aCreer, skipDuplicates: true })).count
    : 0;

  const candidats = await db.creneauAgenda.findMany({
    where: { medecin_id, date: { gte: aujourdhui }, origine: "genere", statut: "disponible", rdv_id: null },
    select: { creneau_id: true, date: true, horaire_id: true },
  });
  const obsoletes = candidats
    .filter((c) => !cles.has(`${JOUR_SEMAINE_PAR_INDEX_JS[c.date.getUTCDay()]}|${c.horaire_id}`))
    .map((c) => c.creneau_id);
  const supprimes = obsoletes.length
    ? (
        await db.creneauAgenda.deleteMany({
          // Re-vérifié à l'écriture : une case réservée entre-temps n'est jamais supprimée.
          where: { creneau_id: { in: obsoletes }, statut: "disponible", rdv_id: null, origine: "genere" },
        })
      ).count
    : 0;

  return { crees, supprimes };
}

/**
 * Rendez-vous à venir que le gabarit ne couvre plus (tranche décochée alors
 * qu'un patient l'avait déjà réservée). La synchronisation ne les touche
 * jamais : ils sont maintenus, et l'écran agenda prévient le médecin.
 * @param {string} medecin_id
 * @param {{ maintenant?: Date }} [options]
 * @param {object} [db]
 * @returns {Promise<object[]>} cases réservées hors gabarit, avec `debut` / `fin`
 */
export async function rdvHorsGabarit(medecin_id, { maintenant = new Date() } = {}, db = prisma) {
  const fuseau = await fuseauDuMedecin(medecin_id, db);
  const aujourdhui = dateMuraleDuJour(fuseau, maintenant);
  const [gabarit, reservees] = await Promise.all([
    db.disponibiliteMedecin.findMany({ where: { medecin_id }, select: { jour_semaine: true, horaire_id: true } }),
    db.creneauAgenda.findMany({
      where: { medecin_id, date: { gte: aujourdhui }, rdv_id: { not: null } },
      select: { creneau_id: true, date: true, horaire_id: true, horaire: true },
      orderBy: [{ date: "asc" }, { horaire: { heure_debut: "asc" } }],
    }),
  ]);
  const cles = new Set(gabarit.map((g) => `${g.jour_semaine}|${g.horaire_id}`));
  return avecInstants(
    reservees.filter((c) => !cles.has(`${JOUR_SEMAINE_PAR_INDEX_JS[c.date.getUTCDay()]}|${c.horaire_id}`)),
    fuseau
  ).filter((c) => new Date(c.debut).getTime() > maintenant.getTime());
}

/**
 * Exception datée : fixe les tranches OUVERTES aux patients pour une date
 * précise, indépendamment de la semaine type (congé, demi-journée, ouverture
 * exceptionnelle). Pour chaque tranche du jour :
 *   - réservée par un RDV : jamais touchée (comptée dans `maintenus` si elle
 *     n'est plus voulue) ;
 *   - voulue : ouverte (case créée « manuel » si absente, rouverte si fermée) ;
 *   - non voulue : fermée (« bloque », origine « manuel » pour que la
 *     synchronisation ne la rouvre pas) ; une case ajoutée à la main et
 *     libre est simplement supprimée.
 * @param {{ medecin_id: string, date: Date, horaire_ids: string[] }} p
 *   date : date murale du médecin à minuit UTC.
 * @param {object} [db]
 * @returns {Promise<{ ouverts: number, fermes: number, maintenus: number }>}
 */
export async function definirTranchesDuJour({ medecin_id, date, horaire_ids }, db = prisma) {
  const voulues = new Set(horaire_ids);
  const bilan = { ouverts: 0, fermes: 0, maintenus: 0 };

  await db.$transaction(async (tx) => {
    const existantes = await tx.creneauAgenda.findMany({ where: { medecin_id, date } });
    const presentes = new Set(existantes.map((c) => c.horaire_id));

    for (const c of existantes) {
      if (c.rdv_id || c.statut === "reserve") {
        if (!voulues.has(c.horaire_id)) bilan.maintenus += 1;
        continue;
      }
      const voulue = voulues.has(c.horaire_id);
      if (voulue && c.statut === "bloque") {
        // eslint-disable-next-line no-await-in-loop
        await tx.creneauAgenda.updateMany({
          where: { creneau_id: c.creneau_id, rdv_id: null },
          data: { statut: "disponible", origine: "manuel" },
        });
        bilan.ouverts += 1;
      } else if (!voulue && c.statut === "disponible") {
        // eslint-disable-next-line no-await-in-loop
        await (c.origine === "manuel"
          ? tx.creneauAgenda.deleteMany({ where: { creneau_id: c.creneau_id, rdv_id: null, statut: "disponible" } })
          : tx.creneauAgenda.updateMany({
              where: { creneau_id: c.creneau_id, rdv_id: null, statut: "disponible" },
              data: { statut: "bloque", origine: "manuel" },
            }));
        bilan.fermes += 1;
      }
    }

    const aCreer = [...voulues]
      .filter((horaire_id) => !presentes.has(horaire_id))
      .map((horaire_id) => ({ medecin_id, horaire_id, date, statut: "disponible", origine: "manuel" }));
    if (aCreer.length) {
      bilan.ouverts += (await tx.creneauAgenda.createMany({ data: aCreer, skipDuplicates: true })).count;
    }
  });

  return bilan;
}

/**
 * Annule l'exception d'une date : les cases libres ou fermées de ce jour sont
 * effacées puis régénérées depuis la semaine type. Les cases réservées restent.
 * @param {{ medecin_id: string, date: Date }} p
 * @param {object} [db]
 * @returns {Promise<{ crees: number, supprimes: number }>}
 */
export async function retablirJourDepuisGabarit({ medecin_id, date }, db = prisma) {
  const { count } = await db.creneauAgenda.deleteMany({
    where: { medecin_id, date, rdv_id: null, statut: { in: ["disponible", "bloque"] } },
  });
  const r = await synchroniserCreneauxMedecin(medecin_id, {}, db);
  return { crees: r.crees, supprimes: count };
}

/**
 * Passage nocturne : prolonge l'horizon de chaque médecin qui a un gabarit.
 * Une erreur sur un médecin n'empêche pas les autres.
 * @param {{ maintenant?: Date }} [options]
 * @returns {Promise<{ medecins: number, crees: number, supprimes: number, echecs: number }>}
 */
export async function synchroniserTousLesAgendas({ maintenant = new Date() } = {}) {
  const medecins = await prisma.disponibiliteMedecin.findMany({
    distinct: ["medecin_id"],
    select: { medecin_id: true },
  });
  const bilan = { medecins: medecins.length, crees: 0, supprimes: 0, echecs: 0 };
  for (const { medecin_id } of medecins) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await synchroniserCreneauxMedecin(medecin_id, { maintenant });
      bilan.crees += r.crees;
      bilan.supprimes += r.supprimes;
    } catch (err) {
      bilan.echecs += 1;
      console.error(`[agenda] Synchronisation impossible pour le médecin ${medecin_id} :`, err.message);
    }
  }
  return bilan;
}
