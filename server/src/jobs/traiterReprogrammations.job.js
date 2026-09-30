// src/jobs/traiterReprogrammations.job.js
// Politique de fonds v2 §5 (étape 6) — cycle de vie des RDV « a_reprogrammer »
// (les deux parties absentes). Deux rôles, un seul balayage :
//
//   1. délai de 48h ÉCOULÉ sans nouvelle date acceptée : le patient est
//      remboursé (honoraires − frais d'agrégateur − commission APS), la
//      commission est versée à APS — traiterDeuxAbsentsSansReprogrammation
//      (absence.service.js), qui délègue à l'exécuteur unique de fonds ;
//   2. délai EN COURS : filet de rattrapage de la note « reprogrammer »
//      (notification manquante si l'envoi immédiat par
//      detecterCreneauxDepasses.job.js a échoué). Idempotent grâce à la clé
//      d'unicité des notifications : rejouer ne crée jamais de doublon.
//
// Le point de départ des 48h est `a_reprogrammer_le` (passage à
// « a_reprogrammer » détecté par le cron, après le délai de grâce). Le délai
// ne se prolonge jamais, quelles que soient les propositions échangées.
//
// Chaque RDV est traité indépendamment : une erreur sur l'un (ex. ligne de
// frais de remboursement absente, Stripe indisponible) n'interrompt pas les
// autres et est retentée au prochain passage (le RDV reste « a_reprogrammer »).

import prisma from "../lib/prisma.js";
import { delaiReprogrammationEcoule } from "../services/politiqueFonds.service.js";
import { traiterDeuxAbsentsSansReprogrammation } from "../services/absence.service.js";
import { notifierReprogrammation } from "../services/notification.service.js";

/**
 * @param {{ maintenant?: Date }} [options]
 * @returns {Promise<{ rembourses: number, notifications: number, echecs: number }>}
 */
export async function traiterReprogrammations({ maintenant = new Date() } = {}) {
  const rdvs = await prisma.rendezVous.findMany({
    where: { statut: "a_reprogrammer" },
    select: { rdv_id: true, a_reprogrammer_le: true },
  });

  let rembourses = 0;
  let notifications = 0;
  let echecs = 0;

  for (const rdv of rdvs) {
    try {
      if (!rdv.a_reprogrammer_le) {
        // Ne devrait pas exister (le statut n'est posé que par le traitement d'absence).
        echecs += 1;
        console.error(`[reprogrammation] rdv ${rdv.rdv_id} « a_reprogrammer » sans a_reprogrammer_le : délai de 48h incalculable.`);
        continue;
      }

      if (delaiReprogrammationEcoule(rdv.a_reprogrammer_le, maintenant)) {
        const resultat = await traiterDeuxAbsentsSansReprogrammation(rdv, { maintenant });
        if (!resultat.deja_traite && !resultat.delai_en_cours) rembourses += 1;
      } else {
        const { creees } = await notifierReprogrammation(rdv.rdv_id);
        notifications += creees;
      }
    } catch (err) {
      echecs += 1;
      console.error(`[reprogrammation] Échec du traitement du rdv ${rdv.rdv_id} (retenté au prochain passage) :`, err);
    }
  }

  if (rembourses > 0 || notifications > 0 || echecs > 0) {
    console.info(
      `[reprogrammation] ${rembourses} remboursement(s) à l'expiration des 48h, ` +
      `${notifications} notification(s) rattrapée(s), ${echecs} échec(s), sur ${rdvs.length} RDV à reprogrammer.`
    );
  }
  return { rembourses, notifications, echecs };
}
