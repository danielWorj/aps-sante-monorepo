// src/services/vuesFiche.service.js
// Compteur de vues des fiches (pharmacies, centres de santé, médecins,
// assurances) —
// « statistiques de consultation » des abonnements de présence.
//
// Une vue = un affichage de la fiche DÉTAILLÉE (GET /pharmacies/:id,
// /centres-sante/:id, /medecins/:id), web ou mobile. Pour que le chiffre
// soit honnête :
//   - ne comptent pas : l'administration, le gestionnaire de la fiche lui-
//     même, les robots (User-Agent) ;
//   - un même visiteur compte UNE fois par jour comme visiteur unique, et
//     une nouvelle vue au plus toutes les 30 minutes (rechargements,
//     double appel d'un écran, navigation aller-retour) ;
//   - le visiteur n'est connu que par une empreinte HMAC du jour (compte
//     connecté, sinon identifiant d'installation envoyé par l'application
//     — en-tête X-Installation-Id —, sinon IP + navigateur), non
//     réversible, purgée chaque nuit. L'identifiant d'installation évite
//     de confondre les mobiles qui partagent une IP d'opérateur (NAT) et
//     le même User-Agent (« Dart/x (dart:io) »).
// Le compteur tourne pour TOUTES les fiches ; son affichage au
// gestionnaire dépend des droits « statistiques » de son abonnement.
// Jours calendaires UTC, comme le reste du module.

import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { debutDuJourUtc } from "../lib/droitsAssurance.js";
import { ajouterJours } from "../lib/dates.js";
import { TYPES_ACTEUR_PRESENCE } from "../lib/acteursPresence.js";

const FENETRE_REVUE_MINUTES = 30;

// Fiches comptées : celles des abonnements de présence, plus les fiches
// assurance (tableau de bord du portail assurance — moteur d'abonnement
// distinct, même compteur).
const TYPES_COMPTES = [...TYPES_ACTEUR_PRESENCE, "assurance"];
const ROBOTS = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|curl|wget|python-requests|httpclient|monitor|uptime/i;

// Secret de l'empreinte : à fixer en production (sinon un secret
// éphémère est tiré au démarrage — le dédoublonnage du jour en cours
// recommence alors après un redémarrage, rien de plus).
const SECRET = process.env.VUES_FICHE_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.VUES_FICHE_SECRET && process.env.NODE_ENV === "production") {
  console.warn("[vues-fiche] VUES_FICHE_SECRET absent : secret éphémère, dédoublonnage remis à zéro à chaque redémarrage.");
}

// Identifiant d'installation accepté (UUID ou équivalent) ; tout le reste
// est ignoré (repli sur IP + navigateur).
const INSTALLATION_VALIDE = /^[A-Za-z0-9-]{16,64}$/;

export function installationDe(req) {
  const id = req.get?.("x-installation-id") ?? req.headers?.["x-installation-id"];
  return typeof id === "string" && INSTALLATION_VALIDE.test(id) ? id : null;
}

const jourIso = (d) => d.toISOString().slice(0, 10);

/** Empreinte non réversible du visiteur, propre à la fiche et au jour. */
export function empreinteVisiteur({ type, acteur_id, jour, utilisateur_id, installation, ip, userAgent }) {
  const qui = utilisateur_id
    ? `u:${utilisateur_id}`
    : installation
      ? `i:${installation}`
      : `a:${ip ?? ""}|${userAgent ?? ""}`;
  return crypto.createHmac("sha256", SECRET).update(`${jourIso(jour)}|${type}|${acteur_id}|${qui}`).digest("hex");
}

export function estRobot(userAgent) {
  return !userAgent || ROBOTS.test(userAgent);
}

/**
 * Enregistre une vue (une seule requête SQL, atomique). Ne lève jamais :
 * à appeler sans attendre, une statistique ne doit jamais ralentir ni
 * faire échouer l'affichage d'une fiche.
 * @param {{ req: object, type: string, acteur_id: string, gestionnaire?: boolean }} p
 *   gestionnaire : l'appelant gère la fiche ou est admin -> non compté.
 */
export async function enregistrerVueFiche({ req, type, acteur_id, gestionnaire = false }) {
  try {
    if (gestionnaire || !TYPES_COMPTES.includes(type) || !acteur_id) return { comptee: false };
    const role = req.utilisateur?.role;
    if (role === "admin" || role === "superadmin") return { comptee: false };
    const userAgent = req.get?.("user-agent") ?? req.headers?.["user-agent"];
    if (estRobot(userAgent)) return { comptee: false };

    const jour = debutDuJourUtc();
    const empreinte = empreinteVisiteur({
      type, acteur_id, jour, utilisateur_id: req.utilisateur?.utilisateur_id, installation: installationDe(req),
      ip: req.ip, userAgent,
    });
    // CTE : la ligne visiteur n'est créée (nouveau visiteur) ou rafraîchie
    // (vue après 30 min) que si la vue compte ; l'agrégat n'est incrémenté
    // que dans ces deux cas. Deux requêtes simultanées du même visiteur ne
    // comptent qu'une fois (conflit sur la clé primaire).
    const lignes = await prisma.$executeRawUnsafe(
      `WITH v AS (
         INSERT INTO vue_fiche_visiteur (type_acteur, acteur_id, jour, empreinte, derniere_vue)
         VALUES ($1::"TypeActeurPresence", $2::uuid, $3::date, $4, now())
         ON CONFLICT (type_acteur, acteur_id, jour, empreinte) DO UPDATE SET derniere_vue = now()
           WHERE vue_fiche_visiteur.derniere_vue < now() - ($5 || ' minutes')::interval
         RETURNING (xmax = 0) AS nouveau
       )
       INSERT INTO vue_fiche (type_acteur, acteur_id, jour, vues, visiteurs)
       SELECT $1::"TypeActeurPresence", $2::uuid, $3::date, 1, CASE WHEN nouveau THEN 1 ELSE 0 END FROM v
       ON CONFLICT (type_acteur, acteur_id, jour) DO UPDATE
         SET vues = vue_fiche.vues + 1, visiteurs = vue_fiche.visiteurs + EXCLUDED.visiteurs`,
      type, acteur_id, jourIso(jour), empreinte, String(FENETRE_REVUE_MINUTES)
    );
    return { comptee: lignes > 0 };
  } catch (err) {
    console.error(`[vues-fiche] Vue non enregistrée (${type} ${acteur_id}) :`, err.message);
    return { comptee: false };
  }
}

/** Purge des empreintes : seule la veille est conservée (cron quotidien). */
export async function purgerVisiteursVuesFiche() {
  const { count } = await prisma.vueFicheVisiteur.deleteMany({
    where: { jour: { lt: ajouterJours(debutDuJourUtc(), -1) } },
  });
  return { purgees: count };
}

/**
 * Statistiques d'une fiche : totaux 7 j / 30 j / depuis le début et, si
 * `detaillees`, la série jour par jour (jours sans vue inclus, à 0).
 * @returns {Promise<{ totaux: object, serie: object[]|null }>}
 */
export async function statistiquesFiche({ type, acteur_id, jours = 30, detaillees = false }) {
  const aujourdhui = debutDuJourUtc();
  const debut = ajouterJours(aujourdhui, -(jours - 1));
  const [periode, total] = await Promise.all([
    prisma.vueFiche.findMany({
      where: { type_acteur: type, acteur_id, jour: { gte: debut, lte: aujourdhui } },
      orderBy: { jour: "asc" },
    }),
    prisma.vueFiche.aggregate({
      where: { type_acteur: type, acteur_id },
      _sum: { vues: true, visiteurs: true },
    }),
  ]);
  const somme = (depuis) => periode
    .filter((l) => l.jour >= depuis)
    .reduce((acc, l) => ({ vues: acc.vues + l.vues, visiteurs: acc.visiteurs + l.visiteurs }), { vues: 0, visiteurs: 0 });

  let serie = null;
  if (detaillees) {
    const parJour = new Map(periode.map((l) => [jourIso(l.jour), l]));
    serie = [];
    for (let d = debut; d <= aujourdhui; d = ajouterJours(d, 1)) {
      const l = parJour.get(jourIso(d));
      serie.push({ jour: jourIso(d), vues: l?.vues ?? 0, visiteurs: l?.visiteurs ?? 0 });
    }
  }
  return {
    totaux: {
      sept_jours: somme(ajouterJours(aujourdhui, -6)),
      periode: { jours, ...somme(debut) },
      depuis_le_debut: { vues: total._sum.vues ?? 0, visiteurs: total._sum.visiteurs ?? 0 },
    },
    serie,
  };
}
