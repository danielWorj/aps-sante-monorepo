// src/services/portailAssurance.service.js
// Portail assurance : l'espace où l'agent d'une compagnie / d'un courtier
// gère sa fiche. Ce service porte ce qui n'existait pas avant le portail :
//
//   1. SUIVI DES DEMANDES (mises en relation reçues) : statut + note
//      interne. Le suivi exige le droit `suivi_demandes` de l'abonnement ;
//      la LECTURE des demandes reçues reste toujours ouverte à l'agent
//      (elles lui ont été adressées).
//   2. MÉDIATHÈQUE (photos / vidéos Cloudinary) : quotas d'ajout et
//      visibilité publique selon les droits (`max_photos`, null = illimité ;
//      `video_presentation`). Comme les agences, rien n'est jamais supprimé
//      à l'expiration : les médias au-delà des droits sont masqués au public
//      et réapparaissent à la réactivation.
//   3. TABLEAU DE BORD : métriques de la fiche (demandes, vues, contenus,
//      complétude). La courbe jour par jour exige `stats_completes`.
//
// Les fonctions pures (validerChangementStatut, mediasVisibles,
// quotasMedias, completudeFiche, serieQuotidienne) sont testées sans base
// (tests/portailAssurance.test.js).

import prisma from "../lib/prisma.js";
import { construireUrl, construireVignetteVideo } from "../lib/cloudinaryService.js";
import { debutDuJourUtc } from "../lib/droitsAssurance.js";
import { ajouterJours } from "../lib/dates.js";
import { creerNotifications } from "./notification.service.js";

/* ============================ Demandes ============================ */

export const STATUTS_DEMANDE = ["nouvelle", "en_cours", "traitee", "archivee"];
const STATUTS_CLOS = ["traitee", "archivee"];
export const NOTE_INTERNE_MAX = 2000;

/**
 * Règles de changement de statut d'une demande :
 *   - on ne revient jamais à « nouvelle » (elle a été vue) ;
 *   - toute autre transition est permise (réouverture comprise) ;
 *   - date_traitement est posée à la clôture (traitee | archivee) et
 *     effacée à la réouverture.
 * @returns {{ erreur?: string, data?: object }}
 */
export function validerChangementStatut(ancien, nouveau, maintenant = new Date()) {
  if (!STATUTS_DEMANDE.includes(nouveau)) {
    return { erreur: `statut invalide. Valeurs acceptées : ${STATUTS_DEMANDE.join(", ")}.` };
  }
  if (nouveau === "nouvelle" && ancien !== "nouvelle") {
    return { erreur: "Une demande déjà ouverte ne peut pas redevenir « nouvelle »." };
  }
  if (nouveau === ancien) return { data: {} };
  if (STATUTS_CLOS.includes(nouveau)) return { data: { statut: nouveau, date_traitement: maintenant } };
  return { data: { statut: nouveau, date_traitement: null } };
}

/** Agents (comptes utilisateurs) rattachés à une fiche. */
export async function agentsDeLaFiche(service_assurance_id) {
  const agents = await prisma.agentAssurance.findMany({
    where: { service_assurance_id },
    select: { utilisateur_id: true },
  });
  return agents.map((a) => a.utilisateur_id);
}

/**
 * Nouvelle demande reçue : les agents de la fiche sont prévenus (cloche
 * in-app). Le message du demandeur n'est pas recopié dans la notification
 * (il reste dans la demande, consultable dans le portail). Idempotent (clé).
 * Ne lève jamais : une notification ne doit pas faire échouer l'envoi.
 */
export async function notifierDemandeRecue(miseEnRelation) {
  try {
    const destinataires = (await agentsDeLaFiche(miseEnRelation.service_assurance_id))
      .filter((id) => id !== miseEnRelation.utilisateur_id);
    if (!destinataires.length) return { creees: 0 };
    const demandeur = await prisma.utilisateur.findUnique({
      where: { utilisateur_id: miseEnRelation.utilisateur_id },
      select: { nom: true, prenom: true },
    });
    const qui = [demandeur?.prenom, demandeur?.nom].filter(Boolean).join(" ") || "Un utilisateur";
    const { count } = await creerNotifications(
      destinataires.map((utilisateur_id) => ({
        utilisateur_id,
        type: "mise_en_relation_recue",
        titre: "Nouvelle demande de mise en relation",
        message: `${qui} souhaite être contacté(e) par votre compagnie. Retrouvez sa demande dans votre portail.`,
        donnees: {
          mise_en_relation_id: miseEnRelation.mise_en_relation_id,
          service_assurance_id: miseEnRelation.service_assurance_id,
        },
        cle: `mise_en_relation_recue:${miseEnRelation.mise_en_relation_id}:${utilisateur_id}`,
      }))
    );
    return { creees: count };
  } catch (err) {
    console.error("[portail-assurance] Notification de demande non créée :", err.message);
    return { creees: 0 };
  }
}

/* ============================ Médiathèque ============================ */

// Nombre maximal de vidéos stockées par fiche (même avec video_presentation).
export const MAX_VIDEOS_PAR_FICHE = 3;
export const TITRE_MEDIA_MAX = 150;

const parOrdre = (a, b) => a.ordre - b.ordre || new Date(a.date_creation) - new Date(b.date_creation);

/** Média prêt pour le client : URL (et vignette pour une vidéo) reconstruites. */
export function presenterMedia(m) {
  const resourceType = m.type === "video" ? "video" : "image";
  return {
    media_id: m.media_id,
    type: m.type,
    titre: m.titre,
    ordre: m.ordre,
    taille_octets: m.taille_octets ?? null,
    date_creation: m.date_creation,
    url: construireUrl(m.fichier_nom, { resourceType }),
    vignette_url: m.type === "video" ? construireVignetteVideo(m.fichier_nom) : construireUrl(m.fichier_nom),
  };
}

/**
 * Médias visibles du PUBLIC selon les droits : les `max_photos` premières
 * photos (ordre choisi par l'agent ; null = toutes) et les vidéos si
 * `video_presentation`. Les autres sont conservés mais masqués.
 */
export function mediasVisibles(medias, droits) {
  const tries = [...medias].sort(parOrdre);
  const images = tries.filter((m) => m.type === "image");
  const max = droits.max_photos;
  const photos = max === null || max === undefined ? images : images.slice(0, Math.max(0, max));
  const videos = droits.video_presentation ? tries.filter((m) => m.type === "video") : [];
  return [...photos, ...videos];
}

/** Quotas d'AJOUT dans la médiathèque (null = illimité). */
export function quotasMedias(medias, droits) {
  const nbPhotos = medias.filter((m) => m.type === "image").length;
  const nbVideos = medias.filter((m) => m.type === "video").length;
  const maxPhotos = droits.max_photos === undefined ? 0 : droits.max_photos;
  const maxVideos = droits.video_presentation ? MAX_VIDEOS_PAR_FICHE : 0;
  return {
    photos: { utilise: nbPhotos, max: maxPhotos },
    videos: { utilise: nbVideos, max: maxVideos },
  };
}

/**
 * L'ajout d'un média de ce type est-il permis ?
 * @returns {null | { code: string, message: string }}
 */
export function refusAjoutMedia(type, quotas) {
  const q = type === "video" ? quotas.videos : quotas.photos;
  if (q.max === null || q.utilise < q.max) return null;
  if (q.max === 0) {
    return type === "video"
      ? { code: "VIDEOS_NON_INCLUSES", message: "Votre abonnement n'inclut pas les vidéos de présentation." }
      : { code: "PHOTOS_NON_INCLUSES", message: "Votre abonnement n'inclut pas de photos. Souscrivez un abonnement pour en ajouter." };
  }
  return type === "video"
    ? { code: "QUOTA_VIDEOS_ATTEINT", message: `Vous avez atteint le nombre maximal de vidéos (${q.max}).` }
    : { code: "QUOTA_PHOTOS_ATTEINT", message: `Vous avez atteint le nombre maximal de photos de votre abonnement (${q.max}).` };
}

/** Médias de la fiche, triés (vue propriétaire). */
export function listerMediasDeLaFiche(service_assurance_id) {
  return prisma.mediaAssurance.findMany({
    where: { service_assurance_id },
    orderBy: [{ type: "asc" }, { ordre: "asc" }, { date_creation: "asc" }],
  });
}

/* ============================ Tableau de bord ============================ */

const jourIso = (d) => d.toISOString().slice(0, 10);

/**
 * Série jour par jour sur `jours` jours se terminant aujourd'hui (UTC),
 * jours vides inclus à 0.
 * @param {Date[]} dates
 */
export function serieQuotidienne(dates, jours, aujourdhui = debutDuJourUtc()) {
  const debut = ajouterJours(aujourdhui, -(jours - 1));
  const compte = new Map();
  for (const d of dates) {
    const j = jourIso(debutDuJourUtc(new Date(d)));
    compte.set(j, (compte.get(j) ?? 0) + 1);
  }
  const serie = [];
  for (let d = debut; d <= aujourdhui; d = ajouterJours(d, 1)) {
    serie.push({ jour: jourIso(d), demandes: compte.get(jourIso(d)) ?? 0 });
  }
  return serie;
}

/**
 * Complétude de la fiche : ce qui rend une fiche utile au public. Chaque
 * élément est indépendant de l'abonnement (on encourage à remplir, la
 * visibilité dépend ensuite des droits).
 */
export function completudeFiche({ fiche, nbActivites, nbAgences, nbPhotos, aGeolocalisation }) {
  const elements = [
    { cle: "description", libelle: "Présentation de la compagnie", ok: !!fiche.description?.trim() },
    { cle: "logo", libelle: "Logo ou photo principale", ok: !!fiche.file_url },
    { cle: "geolocalisation", libelle: "Position du siège sur la carte", ok: aGeolocalisation },
    { cle: "activites", libelle: "Au moins une activité / un produit", ok: nbActivites > 0 },
    { cle: "agences", libelle: "Au moins une agence", ok: nbAgences > 0 },
    { cle: "photos", libelle: "Au moins une photo dans la médiathèque", ok: nbPhotos > 0 },
  ];
  const faits = elements.filter((e) => e.ok).length;
  return { score: Math.round((faits / elements.length) * 100), elements };
}

/**
 * Métriques des demandes d'une fiche.
 * @returns {Promise<object>}
 */
export async function metriquesDemandes(service_assurance_id, { detaillees = false, jours = 30 } = {}) {
  const aujourdhui = debutDuJourUtc();
  const debutPeriode = ajouterJours(aujourdhui, -(jours - 1));
  const debutSemaine = ajouterJours(aujourdhui, -6);

  const [parStatut, recentes, traitees, dernieres] = await Promise.all([
    prisma.miseEnRelation.groupBy({
      by: ["statut"],
      where: { service_assurance_id },
      _count: { _all: true },
    }),
    prisma.miseEnRelation.findMany({
      where: { service_assurance_id, date_creation: { gte: debutPeriode } },
      select: { date_creation: true },
    }),
    prisma.miseEnRelation.findMany({
      where: { service_assurance_id, statut: { in: STATUTS_CLOS }, date_traitement: { not: null } },
      select: { date_creation: true, date_traitement: true },
      orderBy: { date_traitement: "desc" },
      take: 200,
    }),
    prisma.miseEnRelation.findMany({
      where: { service_assurance_id },
      include: { utilisateur: { select: { nom: true, prenom: true } } },
      orderBy: { date_creation: "desc" },
      take: 5,
    }),
  ]);

  const compteurs = Object.fromEntries(STATUTS_DEMANDE.map((s) => [s, 0]));
  for (const l of parStatut) compteurs[l.statut] = l._count._all;
  const total = Object.values(compteurs).reduce((a, b) => a + b, 0);
  const clos = compteurs.traitee + compteurs.archivee;

  const delais = traitees.map((t) => (t.date_traitement - t.date_creation) / 3_600_000).filter((h) => h >= 0);
  const delaiMoyen = delais.length ? Math.round((delais.reduce((a, b) => a + b, 0) / delais.length) * 10) / 10 : null;

  return {
    total,
    par_statut: compteurs,
    a_traiter: compteurs.nouvelle + compteurs.en_cours,
    sept_jours: recentes.filter((r) => r.date_creation >= debutSemaine).length,
    periode: { jours, total: recentes.length },
    taux_traitement: total ? Math.round((clos / total) * 100) : null,
    delai_moyen_traitement_heures: delaiMoyen,
    dernieres: dernieres.map((d) => ({
      mise_en_relation_id: d.mise_en_relation_id,
      statut: d.statut,
      date_creation: d.date_creation,
      extrait: d.message.length > 120 ? `${d.message.slice(0, 117)}…` : d.message,
      demandeur: d.utilisateur ? `${d.utilisateur.prenom ?? ""} ${d.utilisateur.nom ?? ""}`.trim() : null,
    })),
    serie: detaillees ? serieQuotidienne(recentes.map((r) => r.date_creation), jours, aujourdhui) : null,
  };
}
