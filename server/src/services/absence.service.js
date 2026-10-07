// src/services/absence.service.js
// Politique de fonds v2 §5 — Absence au rendez-vous. REMPLACE
// defaillancePro.service.js (ancien traitement « défaillance du
// professionnel » : remboursement intégral + debit_frais_no_show).
//
// L'absence est DÉDUITE de faits (`medecin_present_le`,
// `patient_present_le`) — jamais stockée. Les règles de fonds vivent dans
// politiqueFonds.service.js (`decider`), leur exécution dans
// traitementFonds.service.js ; ce service choisit l'événement.
//
// Vocabulaire : H = honoraires ; F = frais de remboursement de l'agrégateur ;
// CM = commission MÉDECIN ; CP = commission PATIENT.
//
//   médecin absent  : médecin fautif — patient remboursé de H + CP − F (CP
//                     lui est rendue, F reste déduit) + amende au médecin ;
//                     APS ne conserve rien
//   patient absent  : comme une annulation patient < 24h (médecin payé
//                     H − CM avant amendes ; APS conserve CM + CP)
//   deux absents    : fonds gardés en séquestre, RDV « a_reprogrammer »
//                     (début du délai de 48h) — la NOTIFICATION aux deux
//                     parties est envoyée à l'étape 6 (canal à identifier,
//                     point ouvert E)
//   deux absents, 48h sans reprogrammation acceptée : patient remboursé de
//                     H − CM − F ; APS conserve CM + CP ; le médecin ne
//                     touche rien
//   deux présents mais RDV non clôturé : jamais décidé automatiquement,
//                     signalé pour arbitrage admin (forcer-liberation)
//
// Ces événements ne concernent que des RDV PAYÉS (D8) : un RDV non payé
// n'atteint jamais « confirme ».
//
// Déclencheurs : detecterCreneauxDepasses.job.js (cron). La détection des
// présences et le cron d'expiration des 48h sont l'objet de l'étape 6.

import prisma from "../lib/prisma.js";
import {
  EVENEMENTS,
  delaiReprogrammationEcoule,
  determinerEvenementAbsence,
} from "./politiqueFonds.service.js";
import { appliquerEvenementFonds } from "./traitementFonds.service.js";

const STATUTS_ABSENCE_ELIGIBLES = ["confirme", "en_attente_presence"];

/**
 * Traite un RDV dont le créneau est dépassé sans clôture : déduit
 * l'événement des présences enregistrées, puis applique la décision.
 * Relit le RDV (les présences ont pu être posées depuis la sélection du cron).
 *
 * @param {{ rdv_id: string }} rdvRef
 * @param {{ maintenant?: Date }} [options]
 * @returns {Promise<{ deja_traite: boolean, arbitrage_admin?: boolean,
 *   notifier_reprogrammation?: boolean, evenement?: string } & object>}
 */
export async function traiterAbsence(rdvRef, { maintenant = new Date() } = {}) {
  const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id: rdvRef.rdv_id } });
  if (!rdv || !STATUTS_ABSENCE_ELIGIBLES.includes(rdv.statut)) return { deja_traite: true };

  // Libération différée : une fin de consultation constatée (code validé ou
  // visio clôturée) n'est plus une absence ni un RDV « jamais clôturé » :
  // les fonds attendent termine_le + T (liberationDifferee.service.js). Sans
  // cette garde, le cron signalerait un faux « arbitrage admin » à chaque
  // passage pendant tout le délai T.
  if (rdv.termine_le) return { deja_traite: true };

  const evenement = determinerEvenementAbsence(rdv);
  if (!evenement) return { deja_traite: false, arbitrage_admin: true };

  const resultat = await appliquerEvenementFonds(rdv, { evenement, maintenant });
  if (resultat.deja_traite) return resultat;

  return {
    ...resultat,
    // Note « reprogrammer » à envoyer aux deux parties (étape 6) : seulement
    // si le RDV est bien passé en « a_reprogrammer » (il existe un escrow).
    notifier_reprogrammation:
      evenement === EVENEMENTS.DEUX_ABSENTS && resultat.statut_rdv === "a_reprogrammer",
  };
}

/**
 * §5 — Deux absents, aucune reprogrammation acceptée dans les 48h suivant
 * le passage à « a_reprogrammer » : patient remboursé de H − CM − F ; APS
 * conserve CM + CP (CommissionApsVersee, une ligne par origine).
 * Sans effet tant que le délai court. Idempotent (RDV déjà « non_honore »
 * ou repassé « confirme » => deja_traite).
 *
 * Appelée par le cron d'expiration (étape 6).
 *
 * @param {{ rdv_id: string }} rdvRef
 * @param {{ maintenant?: Date }} [options]
 */
export async function traiterDeuxAbsentsSansReprogrammation(rdvRef, { maintenant = new Date() } = {}) {
  const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id: rdvRef.rdv_id } });
  if (!rdv || rdv.statut !== "a_reprogrammer") return { deja_traite: true };
  if (!rdv.a_reprogrammer_le) {
    throw new Error(`Rdv ${rdv.rdv_id} « a_reprogrammer » sans a_reprogrammer_le : délai de 48h incalculable.`);
  }
  if (!delaiReprogrammationEcoule(rdv.a_reprogrammer_le, maintenant)) {
    return { deja_traite: false, delai_en_cours: true };
  }
  return appliquerEvenementFonds(rdv, {
    evenement: EVENEMENTS.DEUX_ABSENTS_SANS_REPROGRAMMATION,
    maintenant,
  });
}