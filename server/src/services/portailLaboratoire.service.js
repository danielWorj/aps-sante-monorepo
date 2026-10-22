// src/services/portailLaboratoire.service.js
// Portail laboratoire : règles métier partagées par laboratoire.controller.js
// et portailLaboratoire.controller.js.
//
//   1. EXAMENS : validation / normalisation de la saisie (prix indicatif,
//      délai de résultat, préparation, disponibilité).
//   2. MÉDIATHÈQUE : quotas fixes (pas d'abonnement laboratoire pour
//      l'instant) — MAX_PHOTOS photos et MAX_VIDEOS vidéos par fiche.
//   3. AVIS : synthèse des notes publiées (moyenne, répartition).
//   4. ENGAGEMENTS : ce que les visiteurs FONT de la fiche publique (appel,
//      e-mail, itinéraire, partage, consultation des examens / des avis),
//      même garanties que engagementMedecin.service.js : ni le gestionnaire,
//      ni l'administration, ni les robots ; un visiteur compte au plus une
//      fois par jour et par type (empreinte HMAC du jour, purgée chaque nuit).
//   5. TABLEAU DE BORD : complétude de la fiche, séries jour par jour.
//
// Les fonctions pures sont testées sans base (tests/portailLaboratoire.test.js).

import prisma from "../lib/prisma.js";
import { debutDuJourUtc } from "../lib/droitsAssurance.js";
import { ajouterJours } from "../lib/dates.js";
import { empreinteVisiteur, estRobot, installationDe } from "./vuesFiche.service.js";

const jourIso = (d) => d.toISOString().slice(0, 10);

/* ============================ Examens ============================ */

export const LIMITES_EXAMEN = Object.freeze({
  nom: 200,
  categorie: 100,
  delai_resultat: 100,
  description: 4000,
  preparation: 2000,
});

const texte = (v) => (typeof v === "string" ? v.trim() : v === undefined || v === null ? v : String(v).trim());

/**
 * Valide la saisie d'un examen. `partiel` (modification) : seuls les champs
 * fournis sont contrôlés et renvoyés.
 * @returns {{ erreur?: string, data?: object }}
 */
export function normaliserExamen(corps = {}, { partiel = false } = {}) {
  const data = {};
  const nom = texte(corps.nom);
  if (!partiel || nom !== undefined) {
    if (!nom) return { erreur: "Le nom de l'examen est requis." };
    if (nom.length > LIMITES_EXAMEN.nom) return { erreur: `Nom trop long (${LIMITES_EXAMEN.nom} caractères maximum).` };
    data.nom = nom;
  }
  for (const champ of ["categorie", "delai_resultat", "description", "preparation"]) {
    const v = texte(corps[champ]);
    if (v === undefined) continue;
    if (v && v.length > LIMITES_EXAMEN[champ]) {
      return { erreur: `${champ} trop long (${LIMITES_EXAMEN[champ]} caractères maximum).` };
    }
    data[champ] = v || null;
  }
  if (corps.prix !== undefined) {
    if (corps.prix === null || corps.prix === "") {
      data.prix = null;
    } else {
      const prix = Number(String(corps.prix).replace(",", "."));
      if (!Number.isFinite(prix) || prix < 0 || prix > 1e10) return { erreur: "Prix invalide." };
      data.prix = Math.round(prix * 100) / 100;
    }
  }
  if (corps.disponible !== undefined) {
    data.disponible = corps.disponible === true || corps.disponible === "true";
  }
  return { data };
}

/** Examen prêt pour le client (prix Decimal -> nombre). */
export function presenterExamen(e) {
  return { ...e, prix: e.prix === null || e.prix === undefined ? null : Number(e.prix) };
}

/* ============================ Médiathèque ============================ */

export const MAX_PHOTOS = 20;
export const MAX_VIDEOS = 3;
export const TITRE_MEDIA_MAX = 150;

/** Quotas d'AJOUT dans la médiathèque. */
export function quotasMedias(medias) {
  return {
    photos: { utilise: medias.filter((m) => m.type === "image").length, max: MAX_PHOTOS },
    videos: { utilise: medias.filter((m) => m.type === "video").length, max: MAX_VIDEOS },
  };
}

/** @returns {null | { code: string, message: string }} */
export function refusAjoutMedia(type, quotas) {
  const q = type === "video" ? quotas.videos : quotas.photos;
  if (q.utilise < q.max) return null;
  return type === "video"
    ? { code: "QUOTA_VIDEOS_ATTEINT", message: `Vous avez atteint le nombre maximal de vidéos (${q.max}).` }
    : { code: "QUOTA_PHOTOS_ATTEINT", message: `Vous avez atteint le nombre maximal de photos (${q.max}).` };
}

export function listerMediasDeLaFiche(laboratoire_id) {
  return prisma.mediaLaboratoire.findMany({
    where: { laboratoire_id },
    orderBy: [{ type: "asc" }, { ordre: "asc" }, { date_creation: "asc" }],
  });
}

/* ============================ Avis ============================ */

export const NOTE_MIN = 1;
export const NOTE_MAX = 5;
export const COMMENTAIRE_AVIS_MAX = 2000;
export const STATUTS_MODERATION_AVIS = ["en_attente", "publie", "rejete"];

/**
 * Synthèse des avis PUBLIÉS : nombre, moyenne (1 décimale), répartition.
 * @param {{ note: number }[]} avis
 */
export function resumeAvis(avis) {
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let somme = 0;
  for (const a of avis) {
    const n = Number(a.note);
    if (n >= NOTE_MIN && n <= NOTE_MAX) {
      distribution[n] += 1;
      somme += n;
    }
  }
  const nombre = Object.values(distribution).reduce((x, y) => x + y, 0);
  return { nombre, moyenne: nombre ? Math.round((somme / nombre) * 10) / 10 : null, distribution };
}

/** Auteur affiché publiquement : « Prénom N. » (jamais le nom complet ni l'e-mail). */
export function auteurPublic(utilisateur) {
  if (!utilisateur) return "Utilisateur";
  const prenom = (utilisateur.prenom ?? "").trim();
  const initiale = (utilisateur.nom ?? "").trim().charAt(0);
  return [prenom, initiale ? `${initiale.toUpperCase()}.` : ""].filter(Boolean).join(" ") || "Utilisateur";
}

/* ============================ Engagements ============================ */

export const TYPES_ENGAGEMENT_LABORATOIRE = Object.freeze([
  "clic_telephone",
  "clic_email",
  "clic_itineraire",
  "partage",
  "lecture_examens",
  "lecture_avis",
]);

export const LIBELLES_ENGAGEMENT_LABORATOIRE = Object.freeze({
  clic_telephone: "Appels",
  clic_email: "E-mails",
  clic_itineraire: "Itinéraires",
  partage: "Partages",
  lecture_examens: "Consultations des examens",
  lecture_avis: "Lectures des avis",
});

/**
 * Enregistre un engagement (une requête SQL, atomique). Ne lève jamais.
 * @param {{ req: object, laboratoire_id: string, type: string, gestionnaire?: boolean }} p
 */
export async function enregistrerEngagementLaboratoire({ req, laboratoire_id, type, gestionnaire = false }) {
  try {
    if (gestionnaire || !TYPES_ENGAGEMENT_LABORATOIRE.includes(type) || !laboratoire_id) return { compte: false };
    const role = req.utilisateur?.role;
    if (role === "admin" || role === "superadmin") return { compte: false };
    const userAgent = req.get?.("user-agent") ?? req.headers?.["user-agent"];
    if (estRobot(userAgent)) return { compte: false };

    const jour = debutDuJourUtc();
    const empreinte = empreinteVisiteur({
      type: `engagement-laboratoire:${type}`, acteur_id: laboratoire_id, jour,
      utilisateur_id: req.utilisateur?.utilisateur_id, installation: installationDe(req), ip: req.ip, userAgent,
    });
    const lignes = await prisma.$executeRawUnsafe(
      `WITH v AS (
         INSERT INTO engagement_laboratoire_visiteur (laboratoire_id, jour, type, empreinte)
         VALUES ($1::uuid, $2::date, $3::"TypeEngagementLaboratoire", $4)
         ON CONFLICT DO NOTHING
         RETURNING 1
       )
       INSERT INTO engagement_laboratoire (laboratoire_id, jour, type, nombre)
       SELECT $1::uuid, $2::date, $3::"TypeEngagementLaboratoire", 1 FROM v
       ON CONFLICT (laboratoire_id, jour, type) DO UPDATE SET nombre = engagement_laboratoire.nombre + 1`,
      laboratoire_id, jourIso(jour), type, empreinte
    );
    return { compte: lignes > 0 };
  } catch (err) {
    console.error(`[engagement-laboratoire] Non enregistré (${type} ${laboratoire_id}) :`, err.message);
    return { compte: false };
  }
}

/** Purge des empreintes : seule la veille est conservée (cron quotidien). */
export async function purgerVisiteursEngagementLaboratoire() {
  const { count } = await prisma.engagementLaboratoireVisiteur.deleteMany({
    where: { jour: { lt: ajouterJours(debutDuJourUtc(), -1) } },
  });
  return { purgees: count };
}

/**
 * Agrège des lignes { jour, type, nombre } : totaux par type (période et
 * 7 derniers jours) et série jour par jour (jours vides inclus à 0).
 */
export function agregerEngagements(lignes, jours, aujourdhui = debutDuJourUtc()) {
  const debut = ajouterJours(aujourdhui, -(jours - 1));
  const debutSemaine = ajouterJours(aujourdhui, -6);
  const parType = Object.fromEntries(
    TYPES_ENGAGEMENT_LABORATOIRE.map((t) => [t, { libelle: LIBELLES_ENGAGEMENT_LABORATOIRE[t], periode: 0, sept_jours: 0 }])
  );
  const parJour = new Map();
  for (const l of lignes) {
    const d = new Date(l.jour);
    if (d < debut || d > aujourdhui || !parType[l.type]) continue;
    parType[l.type].periode += l.nombre;
    if (d >= debutSemaine) parType[l.type].sept_jours += l.nombre;
    const cle = jourIso(d);
    parJour.set(cle, (parJour.get(cle) ?? 0) + l.nombre);
  }
  const serie = [];
  for (let d = debut; d <= aujourdhui; d = ajouterJours(d, 1)) {
    serie.push({ jour: jourIso(d), engagements: parJour.get(jourIso(d)) ?? 0 });
  }
  const total = Object.values(parType).reduce((a, t) => a + t.periode, 0);
  const septJours = Object.values(parType).reduce((a, t) => a + t.sept_jours, 0);
  return { total_periode: total, sept_jours: septJours, par_type: parType, serie };
}

export async function statistiquesEngagements(laboratoire_id, jours) {
  const aujourdhui = debutDuJourUtc();
  const [lignes, total] = await Promise.all([
    prisma.engagementLaboratoire.findMany({
      where: { laboratoire_id, jour: { gte: ajouterJours(aujourdhui, -(jours - 1)), lte: aujourdhui } },
      select: { jour: true, type: true, nombre: true },
    }),
    prisma.engagementLaboratoire.aggregate({ where: { laboratoire_id }, _sum: { nombre: true } }),
  ]);
  return { ...agregerEngagements(lignes, jours, aujourdhui), depuis_le_debut: total._sum.nombre ?? 0 };
}

/* ============================ Tableau de bord ============================ */

/**
 * Taux de conversion vues -> engagements sur la période (en %), null sans vue.
 */
export function tauxEngagement(vues, engagements) {
  if (!vues) return null;
  return Math.round((engagements / vues) * 1000) / 10;
}

/** Ce qui rend une fiche laboratoire utile au public. */
export function completudeFiche({ fiche, nbExamens, nbCentres, nbPhotos, aGeolocalisation }) {
  const elements = [
    { cle: "description", libelle: "Présentation du laboratoire", ok: !!fiche.description?.trim() },
    { cle: "logo", libelle: "Logo ou photo principale", ok: !!fiche.image_nom },
    { cle: "geolocalisation", libelle: "Position du laboratoire sur la carte", ok: aGeolocalisation },
    { cle: "examens", libelle: "Au moins un examen proposé", ok: nbExamens > 0 },
    { cle: "centres", libelle: "Au moins un centre de prélèvement", ok: nbCentres > 0 },
    { cle: "photos", libelle: "Au moins une photo dans la médiathèque", ok: nbPhotos > 0 },
  ];
  const faits = elements.filter((e) => e.ok).length;
  return { score: Math.round((faits / elements.length) * 100), elements };
}
