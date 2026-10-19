// src/services/engagementMedecin.service.js
// Engagements sur la fiche publique d'un médecin — ce que les visiteurs
// FONT de la fiche, au-delà de la simple vue (vuesFiche.service.js) :
//   clic_rdv        : ouverture de la prise de rendez-vous ;
//   clic_contact    : affichage / clic du contact direct ;
//   clic_itineraire : ouverture de l'itinéraire (carte) ;
//   partage         : partage de la fiche ;
//   lecture_avis    : ouverture de l'onglet des avis.
//
// Mêmes garanties que le compteur de vues : ne comptent ni le médecin lui-
// même, ni l'administration, ni les robots ; un visiteur (empreinte HMAC
// du jour, non réversible, purgée chaque nuit) compte au plus UNE fois par
// jour et par type. Jours calendaires UTC.

import prisma from "../lib/prisma.js";
import { debutDuJourUtc } from "../lib/droitsAssurance.js";
import { ajouterJours } from "../lib/dates.js";
import { empreinteVisiteur, estRobot, installationDe } from "./vuesFiche.service.js";

export const TYPES_ENGAGEMENT_MEDECIN = Object.freeze([
  "clic_rdv",
  "clic_contact",
  "clic_itineraire",
  "partage",
  "lecture_avis",
]);

export const LIBELLES_ENGAGEMENT = Object.freeze({
  clic_rdv: "Clics « Prendre rendez-vous »",
  clic_contact: "Contacts",
  clic_itineraire: "Itinéraires",
  partage: "Partages",
  lecture_avis: "Lectures des avis",
});

/**
 * Enregistre un engagement (une requête SQL, atomique). Ne lève jamais.
 * @param {{ req: object, medecin: { medecin_id: string, utilisateur_id: string }, type: string }} p
 * @returns {Promise<{ compte: boolean }>}
 */
export async function enregistrerEngagementMedecin({ req, medecin, type }) {
  try {
    if (!TYPES_ENGAGEMENT_MEDECIN.includes(type) || !medecin?.medecin_id) return { compte: false };
    const u = req.utilisateur;
    if (u && (u.role === "admin" || u.role === "superadmin" || u.utilisateur_id === medecin.utilisateur_id)) {
      return { compte: false };
    }
    const userAgent = req.get?.("user-agent") ?? req.headers?.["user-agent"];
    if (estRobot(userAgent)) return { compte: false };

    const jour = debutDuJourUtc();
    const empreinte = empreinteVisiteur({
      type: `engagement:${type}`, acteur_id: medecin.medecin_id, jour,
      utilisateur_id: u?.utilisateur_id, installation: installationDe(req), ip: req.ip, userAgent,
    });
    const lignes = await prisma.$executeRawUnsafe(
      `WITH v AS (
         INSERT INTO engagement_medecin_visiteur (medecin_id, jour, type, empreinte)
         VALUES ($1::uuid, $2::date, $3::"TypeEngagementMedecin", $4)
         ON CONFLICT DO NOTHING
         RETURNING 1
       )
       INSERT INTO engagement_medecin (medecin_id, jour, type, nombre)
       SELECT $1::uuid, $2::date, $3::"TypeEngagementMedecin", 1 FROM v
       ON CONFLICT (medecin_id, jour, type) DO UPDATE SET nombre = engagement_medecin.nombre + 1`,
      medecin.medecin_id, jour.toISOString().slice(0, 10), type, empreinte
    );
    return { compte: lignes > 0 };
  } catch (err) {
    console.error(`[engagement-medecin] Non enregistré (${type} ${medecin?.medecin_id}) :`, err.message);
    return { compte: false };
  }
}

/** Purge des empreintes : seule la veille est conservée (cron quotidien). */
export async function purgerVisiteursEngagement() {
  const { count } = await prisma.engagementMedecinVisiteur.deleteMany({
    where: { jour: { lt: ajouterJours(debutDuJourUtc(), -1) } },
  });
  return { purgees: count };
}
