// src/services/notification.service.js
// Politique de fonds v2 §5 (étape 6, point ouvert E) — POINT UNIQUE
// d'émission des notifications.
//
// Canal retenu : in-app (table `notification`, lue via /api/notifications).
// Aucune infrastructure e-mail/SMS/push n'existe dans le dépôt (ni SMTP,
// ni FCM, ni modèle de jeton d'appareil). Un canal supplémentaire se
// branchera dans `creerNotifications` sans toucher aux appelants.
//
// Idempotence : chaque notification porte une clé unique (`cle`) qui
// identifie l'ÉVÉNEMENT et le DESTINATAIRE ; `createMany({ skipDuplicates })`
// rend tout rejeu inoffensif (cron qui repasse, reprise après échec) et le
// balayage de rattrapage du job de reprogrammation sûr. Le cycle de
// reprogrammation (a_reprogrammer_le) fait partie de la clé : un second
// « deux absents » sur le même RDV produit de nouvelles notifications.
//
// Les échecs d'émission ne doivent JAMAIS défaire une opération de fonds
// ou de reprogrammation déjà validée : les appelants les capturent et
// journalisent (le balayage du job rattrape la note « reprogrammer »).

import prisma from "../lib/prisma.js";
import { DELAI_REPROGRAMMATION_H } from "./politiqueFonds.service.js";

/**
 * @param {Array<{ utilisateur_id: string, type: string, rdv_id?: string,
 *   titre: string, message: string, donnees?: object, cle: string }>} notifications
 * @param {object} [db] client ou transaction Prisma
 * @returns {Promise<{ count: number }>} nombre de lignes réellement créées
 */
export async function creerNotifications(notifications, db = prisma) {
  if (!notifications.length) return { count: 0 };
  return db.notification.createMany({ data: notifications, skipDuplicates: true });
}

const SELECTION_PARTIES = {
  rdv_id: true,
  statut: true,
  a_reprogrammer_le: true,
  patient: { select: { utilisateur_id: true } },
  medecin: { select: { utilisateur_id: true } },
};

/**
 * §5 — Note « reprogrammer » envoyée AUX DEUX parties quand un RDV passe à
 * « a_reprogrammer » (les deux absents). Sans effet si le RDV n'est plus
 * dans ce statut (annulé, reprogrammé, remboursé entre-temps).
 * @param {string} rdv_id
 * @returns {Promise<{ creees: number }>}
 */
export async function notifierReprogrammation(rdv_id) {
  const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id }, select: SELECTION_PARTIES });
  if (!rdv || rdv.statut !== "a_reprogrammer" || !rdv.a_reprogrammer_le) return { creees: 0 };

  const cycle = rdv.a_reprogrammer_le.toISOString();
  const destinataires = [rdv.patient.utilisateur_id, rdv.medecin.utilisateur_id];
  const { count } = await creerNotifications(
    destinataires.map((utilisateur_id) => ({
      utilisateur_id,
      type: "rdv_a_reprogrammer",
      rdv_id,
      titre: "Rendez-vous à reprogrammer",
      message:
        "Ni vous ni l'autre partie ne vous êtes présentés à ce rendez-vous. " +
        `Vous avez ${DELAI_REPROGRAMMATION_H}h pour convenir d'une nouvelle date : l'un de vous propose, l'autre accepte. ` +
        "Sans nouvelle date acceptée dans ce délai, le patient est remboursé, déduction faite des frais " +
        "de l'agrégateur et de la commission APS.",
      cle: `a_reprogrammer:${rdv_id}:${cycle}:${utilisateur_id}`,
    }))
  );
  return { creees: count };
}

/**
 * Une partie a proposé une nouvelle date : l'AUTRE partie est prévenue.
 * @param {{ rdv_id: string, a_reprogrammer_le: Date, patient: {utilisateur_id:string}, medecin: {utilisateur_id:string} }} rdv
 * @param {{ auteur: "patient"|"medecin", dateProposee: Date, dateProposition: Date }} p
 */
export async function notifierProposition(rdv, { auteur, dateProposee, dateProposition }) {
  const destinataire = auteur === "patient" ? rdv.medecin.utilisateur_id : rdv.patient.utilisateur_id;
  const qui = auteur === "patient" ? "Le patient" : "Le médecin";
  return creerNotifications([
    {
      utilisateur_id: destinataire,
      type: "rdv_reprogrammation_proposee",
      rdv_id: rdv.rdv_id,
      titre: "Nouvelle date proposée",
      message: `${qui} propose une nouvelle date pour ce rendez-vous. Acceptez-la, ou proposez-en une autre, avant la fin du délai de ${DELAI_REPROGRAMMATION_H}h.`,
      // La date proposée est conservée ici : elle est remplacée dans le RDV par une contre-proposition.
      donnees: { nouvelle_date_proposee: dateProposee.toISOString(), proposee_par: auteur },
      cle: `proposee:${rdv.rdv_id}:${dateProposition.toISOString()}:${destinataire}`,
    },
  ]);
}

/**
 * La proposition est acceptée : l'AUTEUR de la proposition est prévenu.
 * @param {{ rdv_id: string, patient: {utilisateur_id:string}, medecin: {utilisateur_id:string} }} rdv
 * @param {{ auteurProposition: "patient"|"medecin", nouvelleDate: Date, cycle: Date }} p
 *   cycle = a_reprogrammer_le AVANT acceptation (une acceptation par cycle).
 */
export async function notifierAcceptation(rdv, { auteurProposition, nouvelleDate, cycle }) {
  const destinataire = auteurProposition === "patient" ? rdv.patient.utilisateur_id : rdv.medecin.utilisateur_id;
  return creerNotifications([
    {
      utilisateur_id: destinataire,
      type: "rdv_reprogrammation_acceptee",
      rdv_id: rdv.rdv_id,
      titre: "Rendez-vous reprogrammé",
      message: "Votre proposition a été acceptée : le rendez-vous est confirmé à la nouvelle date. Aucun nouveau paiement n'est nécessaire.",
      donnees: { nouvelle_date: nouvelleDate.toISOString() },
      cle: `acceptee:${rdv.rdv_id}:${cycle.toISOString()}:${destinataire}`,
    },
  ]);
}
