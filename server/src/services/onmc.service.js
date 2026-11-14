// src/services/onmc.service.js
//
// Tableau de l'Ordre National des Médecins du Cameroun (ONMC) :
//   - synchronisation du registre public dans la table onmc_medecin
//     (copie complète, remplacée en bloc) — planifiée chaque semaine et
//     déclenchable depuis le back-office ;
//   - vérification d'un numéro d'ordre (copie locale d'abord, puis
//     recherche en direct sur le site pour les inscriptions récentes) ;
//   - statut « appartient à l'Ordre » de chaque fiche Medecin
//     (medecin.statut_ordre), affiché en badge sur les listes.
//
// La lecture du site est dans lib/onmcScraper.js.
//
// Règles :
//   - seuls les médecins exerçant au Cameroun (pays code_iso2 "CM") sont
//     confrontés au registre ; les autres restent « non_verifie » ;
//   - le rapprochement se fait sur le numéro normalisé (normaliserNumeroOrdre) ;
//     le nom inscrit au tableau est conservé (ordre_nom_onmc) pour contrôle ;
//   - une synchronisation incomplète (site en panne, structure modifiée)
//     n'écrase JAMAIS la copie précédente ni les statuts : on ne doit pas
//     déclarer « hors de l'Ordre » des médecins réellement inscrits ;
//   - un échec de la recherche en direct n'est jamais converti en « non
//     inscrit » sans copie locale pour l'étayer.

import prisma from "../lib/prisma.js";
import { horsPerimetre } from "../lib/perimetrePays.js";
import {
  ErreurOnmc,
  lireTableauComplet,
  normaliserNom,
  normaliserNumeroOrdre,
  rechercherSurOnmc,
  scoreCorrespondanceNom,
  urlPhotoOnmc,
} from "../lib/onmcScraper.js";

export { ErreurOnmc, normaliserNumeroOrdre };

export const CODE_PAYS_ONMC = "CM";

// Part minimale du total annoncé par le site à récupérer pour accepter
// une synchronisation (protège contre une lecture tronquée).
const SEUIL_COMPLETUDE = Number(process.env.ONMC_SEUIL_COMPLETUDE || 0.9);
// Au-delà, une synchronisation « en_cours » est considérée comme abandonnée
// (processus redémarré pendant la lecture).
const DUREE_MAX_SYNCHRO_MS = 2 * 60 * 60 * 1000;
// Recherche en direct : mémorisée quelques heures (courtoisie envers le site).
const TTL_CACHE_DIRECT_MS = Number(process.env.ONMC_TTL_CACHE_DIRECT_MS || 6 * 60 * 60 * 1000);
// En dessous de ce score (part des mots du nom retrouvés au tableau), le
// numéro est jugé inscrit mais le nom signalé comme différent.
export const SEUIL_CORRESPONDANCE_NOM = 0.5;

const TAILLE_LOT_INSERTION = 1000;

let synchronisationEnCours = null; // Promise de la synchro du processus courant
const cacheDirect = new Map(); // numero_normalise -> { fiches, expire }

function erreurStatut(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/* -------------------------------------------------------------------
 * État du registre
 * ------------------------------------------------------------------- */

async function derniereSynchroReussie() {
  return prisma.synchronisationOnmc.findFirst({
    where: { statut: "reussie" },
    orderBy: { demarree_le: "desc" },
  });
}

/**
 * Vue d'ensemble pour le back-office : dernières synchronisations, taille
 * de la copie locale, répartition des médecins par statut.
 */
export async function etatRegistreOnmc() {
  return horsPerimetre(async () => {
    const [historique, totalRegistre, repartition, derniere] = await Promise.all([
      prisma.synchronisationOnmc.findMany({ orderBy: { demarree_le: "desc" }, take: 10 }),
      prisma.onmcMedecin.count(),
      prisma.medecin.groupBy({ by: ["statut_ordre"], _count: { _all: true } }),
      derniereSynchroReussie(),
    ]);
    const statuts = { inscrit: 0, non_inscrit: 0, non_verifie: 0 };
    for (const ligne of repartition) statuts[ligne.statut_ordre] = ligne._count._all;
    return {
      synchronisation_en_cours: Boolean(synchronisationEnCours) || historique[0]?.statut === "en_cours",
      derniere_synchronisation_reussie: derniere?.terminee_le ?? null,
      total_registre: totalRegistre,
      medecins: statuts,
      historique,
    };
  });
}

/**
 * Recherche dans la copie locale (back-office).
 * @param {{ recherche?: string, page?: number, parPage?: number }} criteres
 */
export async function rechercherDansRegistre({ recherche = "", page = 1, parPage = 25 } = {}) {
  const taille = Math.min(Math.max(Number(parPage) || 25, 1), 100);
  const numeroPage = Math.max(Number(page) || 1, 1);
  const terme = String(recherche || "").trim();

  const where = {};
  if (terme) {
    const numero = normaliserNumeroOrdre(terme);
    const nom = normaliserNom(terme);
    where.OR = [
      ...(/\d/.test(numero) ? [{ numero_normalise: { startsWith: numero } }] : []),
      ...(nom ? [{ nom_normalise: { contains: nom } }] : []),
    ];
    if (!where.OR.length) delete where.OR;
  }

  const [total, fiches] = await Promise.all([
    prisma.onmcMedecin.count({ where }),
    prisma.onmcMedecin.findMany({
      where,
      orderBy: { nom_normalise: "asc" },
      skip: (numeroPage - 1) * taille,
      take: taille,
    }),
  ]);
  return {
    total,
    page: numeroPage,
    par_page: taille,
    fiches: fiches.map((f) => ({
      numero_ordre: f.numero_ordre,
      nom_complet: f.nom_complet,
      qualite: f.qualite,
      photo_url: urlPhotoOnmc(f.photo_chemin),
      date_synchronisation: f.date_synchronisation,
    })),
  };
}

/* -------------------------------------------------------------------
 * Synchronisation
 * ------------------------------------------------------------------- */

/** Marque comme échouées les synchronisations abandonnées (redémarrage). */
export async function clorerSynchronisationsAbandonnees() {
  await prisma.synchronisationOnmc.updateMany({
    where: { statut: "en_cours", demarree_le: { lt: new Date(Date.now() - DUREE_MAX_SYNCHRO_MS) } },
    data: { statut: "echouee", terminee_le: new Date(), erreur: "Synchronisation interrompue (processus arrêté)." },
  });
}

async function executerSynchronisation(synchroId) {
  let pagesLues = 0;
  try {
    const { medecins, totalAnnonce } = await lireTableauComplet({
      surPage: async ({ page, recuperes }) => {
        pagesLues = page;
        // Avancement visible depuis le back-office (une écriture toutes les 5 pages).
        if (page % 5 === 0) {
          await prisma.synchronisationOnmc.update({
            where: { synchronisation_onmc_id: synchroId },
            data: { pages_lues: page, total_recupere: recuperes },
          });
        }
      },
    });

    if (totalAnnonce && medecins.length < totalAnnonce * SEUIL_COMPLETUDE) {
      throw new ErreurOnmc(
        `Lecture incomplète : ${medecins.length} fiches lues pour ${totalAnnonce} annoncées. Copie précédente conservée.`
      );
    }

    const maintenant = new Date();
    const lignes = medecins.map((m) => ({
      numero_ordre: m.numero_ordre,
      numero_normalise: m.numero_normalise,
      nom_complet: m.nom_complet,
      nom_normalise: normaliserNom(m.nom_complet).slice(0, 255),
      qualite: m.qualite,
      photo_chemin: m.photo_chemin,
      date_synchronisation: maintenant,
    }));

    await prisma.$transaction(
      async (tx) => {
        await tx.onmcMedecin.deleteMany({});
        for (let i = 0; i < lignes.length; i += TAILLE_LOT_INSERTION) {
          await tx.onmcMedecin.createMany({ data: lignes.slice(i, i + TAILLE_LOT_INSERTION) });
        }
      },
      { timeout: 120000, maxWait: 10000 }
    );
    cacheDirect.clear();

    const bilan = await recalculerStatutsOrdre();

    return prisma.synchronisationOnmc.update({
      where: { synchronisation_onmc_id: synchroId },
      data: {
        statut: "reussie",
        total_annonce: totalAnnonce,
        total_recupere: medecins.length,
        pages_lues: pagesLues,
        medecins_inscrits: bilan.inscrits,
        medecins_non_inscrits: bilan.non_inscrits,
        terminee_le: new Date(),
      },
    });
  } catch (err) {
    console.error("[onmc] Échec de la synchronisation du registre :", err);
    await prisma.synchronisationOnmc.update({
      where: { synchronisation_onmc_id: synchroId },
      data: {
        statut: "echouee",
        pages_lues: pagesLues,
        erreur: String(err?.message || err).slice(0, 2000),
        terminee_le: new Date(),
      },
    });
    throw err;
  }
}

/**
 * Lance une synchronisation complète du registre (une seule à la fois).
 * La promesse se résout à la fin de la synchronisation ; pour une réponse
 * HTTP immédiate, utiliser demarrerSynchronisationOnmc.
 * @param {{ declencheePar?: string }} [options] "planifiee" ou utilisateur_id
 */
export function synchroniserRegistreOnmc({ declencheePar = "planifiee" } = {}) {
  if (synchronisationEnCours) return synchronisationEnCours;

  // Registre national : jamais restreint au pays d'un admin.
  synchronisationEnCours = horsPerimetre(async () => {
    await clorerSynchronisationsAbandonnees();
    const enCours = await prisma.synchronisationOnmc.findFirst({ where: { statut: "en_cours" } });
    if (enCours) {
      throw erreurStatut("Une synchronisation du registre ONMC est déjà en cours.", 409);
    }
    const synchro = await prisma.synchronisationOnmc.create({
      data: { statut: "en_cours", declenchee_par: String(declencheePar).slice(0, 64) },
    });
    return executerSynchronisation(synchro.synchronisation_onmc_id);
  }).finally(() => {
    synchronisationEnCours = null;
  });

  return synchronisationEnCours;
}

/**
 * Démarre une synchronisation sans l'attendre. Rejette tout de suite si une
 * synchronisation tourne déjà (409).
 */
export async function demarrerSynchronisationOnmc({ declencheePar }) {
  if (synchronisationEnCours) {
    throw erreurStatut("Une synchronisation du registre ONMC est déjà en cours.", 409);
  }
  const enCours = await horsPerimetre(() =>
    prisma.synchronisationOnmc.findFirst({
      where: { statut: "en_cours", demarree_le: { gte: new Date(Date.now() - DUREE_MAX_SYNCHRO_MS) } },
    })
  );
  if (enCours) {
    throw erreurStatut("Une synchronisation du registre ONMC est déjà en cours.", 409);
  }
  synchroniserRegistreOnmc({ declencheePar }).catch(() => {
    // Déjà journalisée dans executerSynchronisation.
  });
}

/**
 * Synchronise si aucune synchronisation réussie n'a eu lieu depuis
 * `ageMaxJours` (démarrage du serveur).
 */
export async function synchroniserSiPerime(ageMaxJours = 7) {
  const derniere = await horsPerimetre(derniereSynchroReussie);
  const limite = Date.now() - ageMaxJours * 24 * 60 * 60 * 1000;
  if (derniere?.terminee_le && derniere.terminee_le.getTime() > limite) return null;
  return synchroniserRegistreOnmc({ declencheePar: "planifiee" });
}

/* -------------------------------------------------------------------
 * Statut des fiches Medecin
 * ------------------------------------------------------------------- */

async function idsPaysOnmc() {
  const pays = await prisma.pays.findMany({ where: { code_iso2: CODE_PAYS_ONMC }, select: { pays_id: true } });
  return pays.map((p) => p.pays_id);
}

/**
 * Recalcule medecin.statut_ordre de toutes les fiches à partir de la copie
 * locale. Appelé après chaque synchronisation réussie.
 * @returns {Promise<{ inscrits: number, non_inscrits: number }>}
 */
export async function recalculerStatutsOrdre() {
  return horsPerimetre(async () => {
    const paysCm = await idsPaysOnmc();
    const maintenant = new Date();

    // Hors Cameroun : non vérifiable par ce registre.
    await prisma.medecin.updateMany({
      where: { pays_exercice_id: { notIn: paysCm }, statut_ordre: { not: "non_verifie" } },
      data: { statut_ordre: "non_verifie", ordre_nom_onmc: null, ordre_verifie_le: null },
    });
    if (!paysCm.length) return { inscrits: 0, non_inscrits: 0 };

    const medecins = await prisma.medecin.findMany({
      where: { pays_exercice_id: { in: paysCm } },
      select: { medecin_id: true, numero_ordre: true, statut_ordre: true, ordre_nom_onmc: true },
    });
    const numeros = [...new Set(medecins.map((m) => normaliserNumeroOrdre(m.numero_ordre)).filter(Boolean))];
    const fiches = numeros.length
      ? await prisma.onmcMedecin.findMany({
          where: { numero_normalise: { in: numeros } },
          select: { numero_normalise: true, nom_complet: true },
        })
      : [];
    const nomParNumero = new Map();
    for (const f of fiches) if (!nomParNumero.has(f.numero_normalise)) nomParNumero.set(f.numero_normalise, f.nom_complet);

    const nonInscrits = [];
    let inscrits = 0;
    for (const m of medecins) {
      const nom = nomParNumero.get(normaliserNumeroOrdre(m.numero_ordre));
      if (nom) {
        inscrits += 1;
        await prisma.medecin.update({
          where: { medecin_id: m.medecin_id },
          data: { statut_ordre: "inscrit", ordre_nom_onmc: nom, ordre_verifie_le: maintenant },
        });
      } else {
        nonInscrits.push(m.medecin_id);
      }
    }
    if (nonInscrits.length) {
      await prisma.medecin.updateMany({
        where: { medecin_id: { in: nonInscrits } },
        data: { statut_ordre: "non_inscrit", ordre_nom_onmc: null, ordre_verifie_le: maintenant },
      });
    }
    return { inscrits, non_inscrits: nonInscrits.length };
  });
}

/* -------------------------------------------------------------------
 * Vérification d'un numéro
 * ------------------------------------------------------------------- */

async function rechercheDirecte(numeroNormalise) {
  const enCache = cacheDirect.get(numeroNormalise);
  if (enCache && enCache.expire > Date.now()) return enCache.fiches;

  const fiches = (await rechercherSurOnmc({ numeroOrdre: numeroNormalise })).filter(
    (f) => f.numero_normalise === numeroNormalise
  );
  cacheDirect.set(numeroNormalise, { fiches, expire: Date.now() + TTL_CACHE_DIRECT_MS });
  return fiches;
}

/**
 * Vérifie l'inscription d'un numéro d'ordre au Tableau de l'ONMC.
 *
 * 1. Copie locale (dernière synchronisation).
 * 2. Introuvable localement (ou copie vide) : recherche en direct sur le
 *    site, pour couvrir les inscriptions postérieures à la synchronisation.
 * 3. Site injoignable : réponse de la copie locale si elle existe,
 *    signalée par `verification_directe_indisponible` ; sinon ErreurOnmc.
 *
 * @param {{ numeroOrdre: string, nom?: string, direct?: boolean }} params
 *   direct=true : ignore la copie locale et interroge le site.
 */
export async function verifierNumeroOrdre({ numeroOrdre, nom = "", direct = false }) {
  const numeroNormalise = normaliserNumeroOrdre(numeroOrdre);
  if (!numeroNormalise || !/\d/.test(numeroNormalise)) {
    throw erreurStatut("Numéro d'ordre invalide (format attendu : 0000/0000).", 400);
  }

  const { fiches, source, registreSynchroniseLe, directIndisponible } = await horsPerimetre(async () => {
    const derniere = await derniereSynchroReussie();
    const copieDisponible = Boolean(derniere) && (await prisma.onmcMedecin.count({ take: 1 })) > 0;

    if (copieDisponible && !direct) {
      const locales = await prisma.onmcMedecin.findMany({ where: { numero_normalise: numeroNormalise } });
      if (locales.length) {
        return { fiches: locales, source: "registre_local", registreSynchroniseLe: derniere.terminee_le };
      }
    }
    try {
      return {
        fiches: await rechercheDirecte(numeroNormalise),
        source: "onmc_direct",
        registreSynchroniseLe: derniere?.terminee_le ?? null,
      };
    } catch (err) {
      if (!copieDisponible) throw err;
      const locales = await prisma.onmcMedecin.findMany({ where: { numero_normalise: numeroNormalise } });
      return {
        fiches: locales,
        source: "registre_local",
        registreSynchroniseLe: derniere.terminee_le,
        directIndisponible: true,
      };
    }
  });

  const correspondances = fiches.map((f) => ({
    numero_ordre: f.numero_ordre,
    nom_complet: f.nom_complet,
    qualite: f.qualite,
    photo_url: urlPhotoOnmc(f.photo_chemin),
    ...(nom ? { correspondance_nom: Math.round(scoreCorrespondanceNom(nom, f.nom_complet) * 100) / 100 } : {}),
  }));
  // Avec un nom fourni, la fiche la plus ressemblante passe en tête.
  if (nom) correspondances.sort((a, b) => b.correspondance_nom - a.correspondance_nom);
  const meilleure = correspondances[0];

  return {
    numero_ordre: String(numeroOrdre).trim(),
    numero_normalise: numeroNormalise,
    appartient_ordre: correspondances.length > 0,
    ...(meilleure
      ? {
          nom_complet: meilleure.nom_complet,
          numero_ordre_onmc: meilleure.numero_ordre,
          ...(nom ? { nom_correspond: meilleure.correspondance_nom >= SEUIL_CORRESPONDANCE_NOM } : {}),
        }
      : {}),
    correspondances,
    source,
    registre_synchronise_le: registreSynchroniseLe,
    ...(directIndisponible ? { verification_directe_indisponible: true } : {}),
  };
}

/**
 * Vérifie une fiche Medecin et enregistre son statut_ordre.
 * @param {string} medecinId
 * @param {{ direct?: boolean }} [options]
 * @returns {Promise<{ medecin: object, verification: object|null }>}
 */
export async function verifierEtMettreAJourMedecin(medecinId, { direct = false } = {}) {
  const medecin = await prisma.medecin.findUnique({
    where: { medecin_id: medecinId },
    select: {
      medecin_id: true,
      numero_ordre: true,
      utilisateur: { select: { nom: true, prenom: true } },
      pays_exercice: { select: { code_iso2: true } },
    },
  });
  if (!medecin) throw erreurStatut("Médecin introuvable.", 404);

  const selection = { medecin_id: true, statut_ordre: true, ordre_verifie_le: true, ordre_nom_onmc: true, numero_ordre: true };

  if (medecin.pays_exercice?.code_iso2 !== CODE_PAYS_ONMC) {
    const fiche = await prisma.medecin.update({
      where: { medecin_id: medecinId },
      data: { statut_ordre: "non_verifie", ordre_nom_onmc: null, ordre_verifie_le: null },
      select: selection,
    });
    return { medecin: fiche, verification: null };
  }

  if (!normaliserNumeroOrdre(medecin.numero_ordre)) {
    const fiche = await prisma.medecin.update({
      where: { medecin_id: medecinId },
      data: { statut_ordre: "non_inscrit", ordre_nom_onmc: null, ordre_verifie_le: new Date() },
      select: selection,
    });
    return { medecin: fiche, verification: null };
  }

  const nom = [medecin.utilisateur?.nom, medecin.utilisateur?.prenom].filter(Boolean).join(" ");
  const verification = await verifierNumeroOrdre({ numeroOrdre: medecin.numero_ordre, nom, direct });

  // Site injoignable et numéro absent de la copie locale : on ne déclasse
  // pas une fiche sur une information incomplète.
  if (!verification.appartient_ordre && verification.verification_directe_indisponible) {
    const fiche = await prisma.medecin.findUnique({ where: { medecin_id: medecinId }, select: selection });
    return { medecin: fiche, verification };
  }

  const fiche = await prisma.medecin.update({
    where: { medecin_id: medecinId },
    data: {
      statut_ordre: verification.appartient_ordre ? "inscrit" : "non_inscrit",
      ordre_nom_onmc: verification.appartient_ordre ? verification.nom_complet.slice(0, 255) : null,
      ordre_verifie_le: new Date(),
    },
    select: selection,
  });
  return { medecin: fiche, verification };
}

/**
 * Vérification en tâche de fond après création / modification d'une fiche
 * (n'échoue jamais : la fiche est déjà enregistrée).
 */
export function verifierMedecinEnArrierePlan(medecinId) {
  horsPerimetre(() => verifierEtMettreAJourMedecin(medecinId)).catch((err) => {
    console.error(`[onmc] Vérification du médecin ${medecinId} impossible :`, err?.message || err);
  });
}
