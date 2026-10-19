// src/services/tableauDeBordMedecin.service.js
// Tableau de bord du portail médecin : métriques de la fiche sur une
// période libre, découpées par jour, semaine ou mois, comparées à la
// période précédente de même durée.
//
// Trois familles :
//   - AUDIENCE   : vues et visiteurs de la fiche publique (vue_fiche),
//                  engagements (engagement_medecin). Soumise aux droits
//                  « statistiques » de l'abonnement de présence, comme
//                  partout ailleurs : sans droit, rien ; avec
//                  `statistiques`, les totaux ; avec
//                  `statistiques_detaillees`, les séries et le détail des
//                  engagements. L'admin voit tout.
//   - ACTIVITÉ   : RDV demandés, payés, consultations réalisées,
//                  annulations, nouveaux patients, créneaux les plus
//                  demandés. Données propres du médecin : toujours visibles.
//   - RÉPUTATION : avis publiés et note de la période, synthèse globale.
//                  Toujours visible.
//
// Découpage en jours calendaires UTC (comme vue_fiche) ; la carte des
// créneaux les plus demandés est en heure MURALE du pays d'exercice.
// Fonctions de calcul exportées et testables sans base.

import prisma from "../lib/prisma.js";
import { debutDuJourUtc } from "../lib/droitsAssurance.js";
import { ajouterJours, joursEntre } from "../lib/dates.js";
import { resoudreDroitsPresence } from "../lib/droitsPresence.js";
import { fuseauOuDefaut, heureMuraleDepuisInstant } from "../lib/fuseauHoraire.js";
import { TYPES_ENGAGEMENT_MEDECIN } from "./engagementMedecin.service.js";
import { resumeNotes } from "./avisMedecin.service.js";

export const GRANULARITES = Object.freeze(["jour", "semaine", "mois"]);
export const PERIODE_MAX_JOURS = 731;
// Au-delà, une série « jour » devient illisible (et lourde) : 400.
const SEAUX_JOUR_MAX = 120;

// Tranches de la journée (heure murale) — mêmes périodes que l'agenda.
export const TRANCHES_JOURNEE = Object.freeze([
  { cle: "matin", libelle: "Matin", avant: 12 },
  { cle: "apres_midi", libelle: "Après-midi", avant: 17 },
  { cle: "soiree", libelle: "Soirée", avant: 24 },
]);

const iso = (d) => d.toISOString().slice(0, 10);
const erreur = (message) => ({ erreur: { status: 400, message } });

function lireJour(valeur) {
  if (typeof valeur !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return null;
  const d = new Date(`${valeur}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || iso(d) !== valeur ? null : d;
}

/**
 * Période demandée -> bornes en jours UTC (incluses) et granularité.
 * Défaut : les 30 derniers jours, par jour. Sans granularité : jour
 * jusqu'à 31 jours, semaine jusqu'à 120, mois au-delà.
 * @returns {{ du: Date, au: Date, granularite: string, jours: number } | { erreur: object }}
 */
export function resoudrePeriode({ du, au, granularite } = {}, maintenant = new Date()) {
  const aujourdhui = debutDuJourUtc(maintenant);
  let fin = aujourdhui;
  if (au) {
    fin = lireJour(au);
    if (!fin) return erreur("Date de fin invalide (format AAAA-MM-JJ).");
    if (fin > aujourdhui) fin = aujourdhui;
  }
  let debut = ajouterJours(fin, -29);
  if (du) {
    debut = lireJour(du);
    if (!debut) return erreur("Date de début invalide (format AAAA-MM-JJ).");
  }
  if (debut > fin) return erreur("La date de début doit précéder la date de fin.");
  const jours = joursEntre(debut, fin) + 1;
  if (jours > PERIODE_MAX_JOURS) return erreur("La période ne peut pas dépasser deux ans.");

  if (granularite !== undefined && granularite !== "" && !GRANULARITES.includes(granularite)) {
    return erreur(`Granularité invalide. Valeurs acceptées : ${GRANULARITES.join(", ")}.`);
  }
  const g = granularite || (jours <= 31 ? "jour" : jours <= 120 ? "semaine" : "mois");
  if (g === "jour" && jours > SEAUX_JOUR_MAX) {
    return erreur(`Vue par jour limitée à ${SEAUX_JOUR_MAX} jours : choisissez la semaine ou le mois.`);
  }
  return { du: debut, au: fin, granularite: g, jours };
}

/** Période de même durée qui précède immédiatement `periode`. */
export function periodePrecedente({ du, jours, granularite }) {
  const au = ajouterJours(du, -1);
  return { du: ajouterJours(au, -(jours - 1)), au, jours, granularite };
}

/** Début du seau contenant `date` (lundi pour la semaine, le 1er pour le mois). */
export function debutSeau(date, granularite) {
  const d = debutDuJourUtc(date);
  if (granularite === "semaine") return ajouterJours(d, -((d.getUTCDay() + 6) % 7));
  if (granularite === "mois") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  return d;
}

function seauSuivant(debut, granularite) {
  if (granularite === "semaine") return ajouterJours(debut, 7);
  if (granularite === "mois") return new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() + 1, 1));
  return ajouterJours(debut, 1);
}

/**
 * Seaux ordonnés couvrant [du, au]. Un seau partiel (semaine ou mois
 * entamé) est borné à la période : `debut` / `fin` disent ce qu'il couvre.
 * @returns {{ cle: string, debut: string, fin: string }[]}
 */
export function construireSeaux(du, au, granularite) {
  const seaux = [];
  for (let c = debutSeau(du, granularite); c <= au; c = seauSuivant(c, granularite)) {
    const finSeau = ajouterJours(seauSuivant(c, granularite), -1);
    seaux.push({
      cle: iso(c),
      debut: iso(c < du ? du : c),
      fin: iso(finSeau > au ? au : finSeau),
    });
  }
  return seaux;
}

/** Série à zéro + fonction d'ajout par date. */
export function preparerSerie(seaux, granularite, champs) {
  const serie = seaux.map((s) => ({ ...s, ...Object.fromEntries(champs.map((c) => [c, 0])) }));
  const index = new Map(serie.map((s, i) => [s.cle, i]));
  const ajouter = (date, champ, valeur = 1) => {
    const i = index.get(iso(debutSeau(new Date(date), granularite)));
    if (i !== undefined) serie[i][champ] += valeur;
  };
  return { serie, ajouter };
}

/** Variation en % (arrondie) ; null si la période précédente est à zéro. */
export function variation(actuel, precedent) {
  if (actuel === null || precedent === null || actuel === undefined || precedent === undefined) return null;
  if (precedent === 0) return actuel === 0 ? 0 : null;
  return Math.round(((actuel - precedent) / precedent) * 100);
}

const pourcentage = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : null);
const moyenne1 = (somme, n) => (n ? Math.round((somme / n) * 10) / 10 : null);

/** Tranche de la journée et jour de la semaine (0 = lundi) en heure murale. */
export function caseHebdomadaire(instant, fuseau) {
  const m = heureMuraleDepuisInstant(instant, fuseau);
  const jourSemaine = (new Date(Date.UTC(m.annee, m.mois - 1, m.jour)).getUTCDay() + 6) % 7;
  const tranche = TRANCHES_JOURNEE.findIndex((t) => m.heures < t.avant);
  return { jourSemaine, tranche };
}

/* ================================ Collecte ================================ */

const AVEC_PAIEMENT = { compte_escrow: { isNot: null } };

async function collecter(medecin_id, { du, au }) {
  const auExclusif = ajouterJours(au, 1);
  const dans = { gte: du, lt: auExclusif };
  const [vues, engagements, rdvCrees, consultations, annulations, avis, premiersRdv] = await Promise.all([
    prisma.vueFiche.findMany({
      where: { type_acteur: "medecin", acteur_id: medecin_id, jour: { gte: du, lte: au } },
      select: { jour: true, vues: true, visiteurs: true },
    }),
    prisma.engagementMedecin.findMany({
      where: { medecin_id, jour: { gte: du, lte: au } },
      select: { jour: true, type: true, nombre: true },
    }),
    prisma.rendezVous.findMany({
      where: { medecin_id, date_creation: dans },
      select: { date_creation: true, type_rdv: true, compte_escrow: { select: { escrow_id: true } } },
    }),
    prisma.rendezVous.findMany({
      where: { medecin_id, termine_le: dans },
      select: { termine_le: true, type_rdv: true },
    }),
    prisma.rendezVous.findMany({
      where: { medecin_id, date_annulation: dans, ...AVEC_PAIEMENT },
      select: { date_annulation: true, annule_par: true },
    }),
    prisma.avisMedecin.findMany({
      where: { medecin_id, statut_moderation: "publie", date_creation: dans },
      select: { date_creation: true, note: true },
    }),
    // Premier RDV payé de chaque patient : « nouveau patient » si dans la période.
    prisma.rendezVous.groupBy({
      by: ["patient_id"],
      where: { medecin_id, ...AVEC_PAIEMENT },
      _min: { date_creation: true },
    }),
  ]);
  const nouveauxPatients = premiersRdv
    .map((g) => g._min.date_creation)
    .filter((d) => d && d >= du && d < auExclusif);
  return { vues, engagements, rdvCrees, consultations, annulations, avis, nouveauxPatients };
}

/** Totaux d'une collecte. */
export function totaliser(c) {
  const vues = c.vues.reduce((a, l) => a + l.vues, 0);
  const visiteurs = c.vues.reduce((a, l) => a + l.visiteurs, 0);
  const parType = Object.fromEntries(TYPES_ENGAGEMENT_MEDECIN.map((t) => [t, 0]));
  for (const e of c.engagements) parType[e.type] = (parType[e.type] ?? 0) + e.nombre;
  const engagements = Object.values(parType).reduce((a, n) => a + n, 0);

  const rdvDemandes = c.rdvCrees.length;
  const rdvPayes = c.rdvCrees.filter((r) => r.compte_escrow).length;
  const consultations = c.consultations.length;
  const teleconsultations = c.consultations.filter((r) => r.type_rdv === "teleconsultation").length;
  const sommeNotes = c.avis.reduce((a, x) => a + x.note, 0);

  return {
    audience: {
      vues,
      visiteurs,
      engagements,
      engagements_par_type: parType,
      taux_engagement: pourcentage(engagements, visiteurs),
    },
    activite: {
      rdv_demandes: rdvDemandes,
      rdv_payes: rdvPayes,
      taux_paiement: pourcentage(rdvPayes, rdvDemandes),
      consultations,
      teleconsultations,
      consultations_physiques: consultations - teleconsultations,
      annulations: c.annulations.length,
      annulations_par_vous: c.annulations.filter((r) => r.annule_par === "medecin").length,
      nouveaux_patients: c.nouveauxPatients.length,
      // RDV demandés pour 100 visiteurs de la fiche.
      taux_conversion: pourcentage(rdvDemandes, visiteurs),
    },
    reputation: {
      avis: c.avis.length,
      note_moyenne: moyenne1(sommeNotes, c.avis.length),
    },
  };
}

/** Séries par seau d'une collecte. */
export function construireSeries(c, seaux, granularite) {
  const audience = preparerSerie(seaux, granularite, ["vues", "visiteurs", "engagements", ...TYPES_ENGAGEMENT_MEDECIN]);
  for (const l of c.vues) {
    audience.ajouter(l.jour, "vues", l.vues);
    audience.ajouter(l.jour, "visiteurs", l.visiteurs);
  }
  for (const e of c.engagements) {
    audience.ajouter(e.jour, "engagements", e.nombre);
    audience.ajouter(e.jour, e.type, e.nombre);
  }

  const activite = preparerSerie(seaux, granularite, ["rdv_demandes", "rdv_payes", "consultations", "nouveaux_patients", "annulations"]);
  for (const r of c.rdvCrees) {
    activite.ajouter(r.date_creation, "rdv_demandes");
    if (r.compte_escrow) activite.ajouter(r.date_creation, "rdv_payes");
  }
  for (const r of c.consultations) activite.ajouter(r.termine_le, "consultations");
  for (const r of c.annulations) activite.ajouter(r.date_annulation, "annulations");
  for (const d of c.nouveauxPatients) activite.ajouter(d, "nouveaux_patients");

  const reputation = preparerSerie(seaux, granularite, ["avis", "somme_notes"]);
  for (const a of c.avis) {
    reputation.ajouter(a.date_creation, "avis");
    reputation.ajouter(a.date_creation, "somme_notes", a.note);
  }
  const serieReputation = reputation.serie.map(({ somme_notes, ...s }) => ({
    ...s,
    note_moyenne: moyenne1(somme_notes, s.avis),
  }));

  return { audience: audience.serie, activite: activite.serie, reputation: serieReputation };
}

/** Carte jour de la semaine × tranche de la journée des créneaux payés. */
async function carteCreneaux(medecin_id, { du, au }, fuseau) {
  const rdv = await prisma.rendezVous.findMany({
    where: {
      medecin_id,
      date_creneau: { gte: du, lt: ajouterJours(au, 1) },
      statut: { not: "annule" },
      ...AVEC_PAIEMENT,
    },
    select: { date_creneau: true },
  });
  const grille = Array.from({ length: 7 }, () => TRANCHES_JOURNEE.map(() => 0));
  for (const r of rdv) {
    const { jourSemaine, tranche } = caseHebdomadaire(r.date_creneau, fuseau);
    if (tranche >= 0) grille[jourSemaine][tranche] += 1;
  }
  return { tranches: TRANCHES_JOURNEE.map(({ cle, libelle }) => ({ cle, libelle })), grille, total: rdv.length };
}

/**
 * Tableau de bord complet d'un médecin.
 * @param {{ medecin: { medecin_id: string, pays_exercice?: { fuseau_horaire?: string } },
 *   periode: object, admin?: boolean }} p
 */
export async function tableauDeBordMedecin({ medecin, periode, admin = false }) {
  const { medecin_id } = medecin;
  const precedente = periodePrecedente(periode);
  const seaux = construireSeaux(periode.du, periode.au, periode.granularite);
  const fuseau = fuseauOuDefaut(medecin.pays_exercice?.fuseau_horaire);
  const maintenant = new Date();

  const [droitsResolus, actuelle, avant, carte, resume, aVenir] = await Promise.all([
    admin ? null : resoudreDroitsPresence("medecin", medecin_id),
    collecter(medecin_id, periode),
    collecter(medecin_id, precedente),
    carteCreneaux(medecin_id, periode, fuseau),
    resumeNotes(medecin_id),
    prisma.rendezVous.count({
      where: {
        medecin_id,
        statut: { in: ["confirme", "en_attente_presence"] },
        date_creneau: { gte: maintenant, lt: new Date(maintenant.getTime() + 7 * 86_400_000) },
      },
    }),
  ]);

  const droits = droitsResolus?.droits;
  const statsAudience = admin || droits?.statistiques === true;
  const statsDetaillees = admin || droits?.statistiques_detaillees === true;

  const totaux = totaliser(actuelle);
  const precedents = totaliser(avant);
  const series = construireSeries(actuelle, seaux, periode.granularite);

  const variations = (famille, cles) =>
    Object.fromEntries(cles.map((k) => [k, variation(totaux[famille][k], precedents[famille][k])]));

  // Sans droit « statistiques » : aucune donnée d'audience, ni dans les
  // totaux, ni dans les taux qui en dérivent (conversion).
  if (!statsAudience) totaux.activite.taux_conversion = null;

  return {
    periode: { du: iso(periode.du), au: iso(periode.au), granularite: periode.granularite, jours: periode.jours },
    precedente: { du: iso(precedente.du), au: iso(precedente.au) },
    seaux,
    audience: statsAudience
      ? {
          disponible: true,
          detaillees: statsDetaillees,
          totaux: statsDetaillees
            ? totaux.audience
            : { ...totaux.audience, engagements_par_type: null },
          precedents: { vues: precedents.audience.vues, visiteurs: precedents.audience.visiteurs, engagements: precedents.audience.engagements },
          variations: variations("audience", ["vues", "visiteurs", "engagements"]),
          serie: statsDetaillees ? series.audience : null,
        }
      : { disponible: false, detaillees: false },
    activite: {
      totaux: totaux.activite,
      precedents: precedents.activite,
      variations: variations("activite", ["rdv_demandes", "rdv_payes", "consultations", "nouveaux_patients", "annulations"]),
      serie: series.activite,
      a_venir_7_jours: aVenir,
      carte_creneaux: carte,
    },
    reputation: {
      periode: totaux.reputation,
      precedente: precedents.reputation,
      serie: series.reputation,
      resume,
    },
  };
}
