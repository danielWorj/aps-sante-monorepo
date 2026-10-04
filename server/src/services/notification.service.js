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

// Textes de la note « reprogrammer » — DEUX versions, car la règle de fonds
// (le patient reçoit H − CM − F) ne doit pas révéler le montant de CM au
// patient (D7), et le médecin n'a pas à voir de montant du patient (CP).
// Aucun montant n'est cité : seul le remboursement effectif est affiché
// ailleurs. Les frais d'envoi et CP ne sont pas rendus.
const MESSAGE_REPROGRAMMATION_PATIENT =
  "Ni vous ni le médecin ne vous êtes présentés à ce rendez-vous. " +
  `Vous avez ${DELAI_REPROGRAMMATION_H}h pour convenir d'une nouvelle date : l'un de vous propose, l'autre accepte. ` +
  "Sans nouvelle date acceptée dans ce délai, le rendez-vous est annulé et vous êtes remboursé d'une partie " +
  "des honoraires, déduction faite des frais de remboursement de l'agrégateur et d'une retenue de service APS. " +
  "Les frais d'envoi et la commission patient ne sont pas remboursés.";

const MESSAGE_REPROGRAMMATION_MEDECIN =
  "Ni vous ni le patient ne vous êtes présentés à ce rendez-vous. " +
  `Vous avez ${DELAI_REPROGRAMMATION_H}h pour convenir d'une nouvelle date : l'un de vous propose, l'autre accepte. ` +
  "Sans nouvelle date acceptée dans ce délai, le rendez-vous est annulé, le patient est remboursé " +
  "et aucun versement n'est effectué pour ce rendez-vous.";

/**
 * §5 — Note « reprogrammer » envoyée AUX DEUX parties quand un RDV passe à
 * « a_reprogrammer » (les deux absents), avec un texte adapté à chaque rôle.
 * Sans effet si le RDV n'est plus dans ce statut (annulé, reprogrammé,
 * remboursé entre-temps).
 * @param {string} rdv_id
 * @returns {Promise<{ creees: number }>}
 */
export async function notifierReprogrammation(rdv_id) {
  const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id }, select: SELECTION_PARTIES });
  if (!rdv || rdv.statut !== "a_reprogrammer" || !rdv.a_reprogrammer_le) return { creees: 0 };

  const cycle = rdv.a_reprogrammer_le.toISOString();
  const destinataires = [
    { utilisateur_id: rdv.patient.utilisateur_id, message: MESSAGE_REPROGRAMMATION_PATIENT },
    { utilisateur_id: rdv.medecin.utilisateur_id, message: MESSAGE_REPROGRAMMATION_MEDECIN },
  ];
  // La clé (événement + destinataire) est inchangée : une note déjà émise
  // n'est jamais dupliquée par le balayage de rattrapage.
  const { count } = await creerNotifications(
    destinataires.map(({ utilisateur_id, message }) => ({
      utilisateur_id,
      type: "rdv_a_reprogrammer",
      rdv_id,
      titre: "Rendez-vous à reprogrammer",
      message,
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

/**
 * D8 — Le MÉDECIN est notifié quand le paiement d'un RDV est confirmé
 * (cree -> confirme). Jamais avant : un RDV non payé n'existe pas pour lui
 * (ni à la création, ni à l'annulation ou l'expiration d'un RDV non payé).
 * Aucun montant n'est cité (D7 : le médecin ne voit pas CP). La date du
 * créneau est dans `donnees` (ISO) pour que chaque client l'affiche dans le
 * fuseau de l'utilisateur.
 * Sans effet si le RDV n'est plus « confirme » (annulé entre-temps).
 * Idempotent : une seule notification par RDV et par médecin.
 * @param {string} rdv_id
 * @returns {Promise<{ creees: number }>}
 */
export async function notifierRdvPaye(rdv_id) {
  const rdv = await prisma.rendezVous.findUnique({
    where: { rdv_id },
    select: {
      rdv_id: true,
      statut: true,
      date_creneau: true,
      type_rdv: true,
      medecin: { select: { utilisateur_id: true } },
    },
  });
  if (!rdv || rdv.statut !== "confirme") return { creees: 0 };

  const destinataire = rdv.medecin.utilisateur_id;
  const { count } = await creerNotifications([
    {
      utilisateur_id: destinataire,
      type: "rdv_paye",
      rdv_id,
      titre: "Nouveau rendez-vous confirmé",
      message:
        "Un patient a payé et confirmé un rendez-vous avec vous. " +
        "Consultez votre agenda pour en voir les détails.",
      donnees: { date_creneau: rdv.date_creneau.toISOString(), type_rdv: rdv.type_rdv },
      cle: `rdv_paye:${rdv_id}:${destinataire}`,
    },
  ]);
  return { creees: count };
}