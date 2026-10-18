// src/services/statistiquesPublicite.service.js
// Statistiques de diffusion des publicités (portail annonceur) : impressions
// (publicité affichée dans un slider) et clics, agrégés par jour UTC.
//
// Dédoublonnage en mémoire du processus : un même visiteur (empreinte HMAC
// non réversible de l'IP + user-agent, jamais stockée en base) compte au plus
// une impression et un clic par publicité toutes les 30 minutes. Perdu au
// redémarrage : tolérable pour une statistique de diffusion.

import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { jourUtc, versJourIso } from "./publicite.service.js";

const FENETRE_MS = 30 * 60 * 1000;
const MAX_IDS = 10;
const vus = new Map(); // `${empreinte}:${type}:${id}` -> horodatage

export const TYPES_EVENEMENT = ["impression", "clic"];

export function empreinteVisiteur(ip, userAgent) {
  const secret = process.env.JWT_SECRET || "aps-publicite";
  return crypto.createHmac("sha256", secret).update(`${ip ?? ""}|${userAgent ?? ""}`).digest("hex").slice(0, 32);
}

function purger(maintenant) {
  if (vus.size < 50_000) return;
  for (const [cle, t] of vus) if (maintenant - t > FENETRE_MS) vus.delete(cle);
}

/**
 * Compte un événement pour des publicités ACTUELLEMENT diffusées ; les
 * identifiants inconnus ou non diffusés sont ignorés sans erreur.
 * @returns {Promise<number>} nombre d'événements comptés
 */
export async function enregistrerEvenements({ type, publicite_ids, empreinte, maintenant = new Date() }) {
  if (!TYPES_EVENEMENT.includes(type)) return 0;
  const ids = [...new Set((Array.isArray(publicite_ids) ? publicite_ids : []).filter((x) => typeof x === "string"))].slice(0, MAX_IDS);
  if (!ids.length) return 0;

  const t = maintenant.getTime();
  purger(t);
  const nouveaux = ids.filter((id) => {
    const cle = `${empreinte}:${type}:${id}`;
    const dernier = vus.get(cle);
    if (dernier && t - dernier < FENETRE_MS) return false;
    vus.set(cle, t);
    return true;
  });
  if (!nouveaux.length) return 0;

  const aujourdhui = jourUtc(maintenant);
  const diffusees = await prisma.publicite.findMany({
    where: { publicite_id: { in: nouveaux }, statut: "payee", date_debut: { lte: aujourdhui }, date_fin: { gt: aujourdhui } },
    select: { publicite_id: true },
  });
  const colonneImpr = type === "impression" ? 1 : 0;
  const colonneClic = type === "clic" ? 1 : 0;
  for (const { publicite_id } of diffusees) {
    await prisma.$executeRaw`
      INSERT INTO statistique_publicite_jour (publicite_id, jour, impressions, clics)
      VALUES (${publicite_id}::uuid, ${aujourdhui}::date, ${colonneImpr}, ${colonneClic})
      ON CONFLICT (publicite_id, jour) DO UPDATE SET
        impressions = statistique_publicite_jour.impressions + EXCLUDED.impressions,
        clics = statistique_publicite_jour.clics + EXCLUDED.clics`;
  }
  return diffusees.length;
}

/** Totaux (impressions, clics) par publicité. */
export async function totauxParPublicite(publicite_ids) {
  if (!publicite_ids.length) return new Map();
  const groupes = await prisma.statistiquePubliciteJour.groupBy({
    by: ["publicite_id"],
    where: { publicite_id: { in: publicite_ids } },
    _sum: { impressions: true, clics: true },
  });
  return new Map(groupes.map((g) => [g.publicite_id, { impressions: g._sum.impressions ?? 0, clics: g._sum.clics ?? 0 }]));
}

/** Série jour par jour sur la période de diffusion (jours sans événement à 0). */
export async function serieStatistiques(publicite) {
  const lignes = await prisma.statistiquePubliciteJour.findMany({
    where: { publicite_id: publicite.publicite_id },
    orderBy: { jour: "asc" },
  });
  const parJour = new Map(lignes.map((l) => [versJourIso(l.jour), l]));
  const debut = jourUtc(publicite.date_debut);
  const finExclue = jourUtc(publicite.date_fin);
  const borne = jourUtc(new Date()) < finExclue ? new Date(jourUtc(new Date()).getTime() + 86_400_000) : finExclue;

  const serie = [];
  for (let d = debut; d < borne; d = new Date(d.getTime() + 86_400_000)) {
    const l = parJour.get(versJourIso(d));
    serie.push({ jour: versJourIso(d), impressions: l?.impressions ?? 0, clics: l?.clics ?? 0 });
  }
  const impressions = serie.reduce((s, x) => s + x.impressions, 0);
  const clics = serie.reduce((s, x) => s + x.clics, 0);
  return {
    impressions,
    clics,
    taux_clic: impressions ? Number(((clics / impressions) * 100).toFixed(2)) : 0,
    serie,
  };
}
