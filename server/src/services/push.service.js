// src/services/push.service.js
// Push mobile (FCM) — canal supplémentaire des notifications in-app.
//
// Branché dans notification.service.js#creerNotifications : TOUTE
// notification créée (RDV payé, demande express, réponse d'un médecin,
// candidature retenue, rappels de RDV…) est aussi poussée sur les
// téléphones du destinataire, sans toucher aux appelants.
//
// Règles :
//   - une notification n'est poussée qu'UNE fois : `push_envoye_le` est
//     posé de façon atomique avant l'envoi (une clé rejouée par un cron
//     ne crée pas de ligne, et une ligne déjà traitée n'est jamais
//     renvoyée) ;
//   - l'envoi est DIFFÉRÉ et relit la base : une notification créée dans
//     une transaction annulée n'existe pas et n'est donc jamais poussée ;
//   - aucun échec de push ne remonte à l'appelant (journalisé) ;
//   - jeton déclaré invalide par FCM (application désinstallée) : supprimé.
//
// Sans configuration FCM (voir lib/fcmService.js), tout est sans effet.

import prisma from "../lib/prisma.js";
import { envoyerMessage, estConfigure } from "../lib/fcmService.js";

export const PLATEFORMES_PUSH = Object.freeze(["android", "ios"]);
const JETON_MAX = 512;
// Laisse à la transaction appelante le temps d'être validée avant la relecture.
const DELAI_ENVOI_MS = 1_500;

export class ErreurPush extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ErreurPush";
    this.status = status;
  }
}

/**
 * Écran à ouvrir sur le téléphone quand l'utilisateur touche la notification.
 * L'application choisit ensuite la page selon l'espace (patient / médecin).
 */
export function cibleNotification(type) {
  if (type.startsWith("rdv_")) return "rendez_vous";
  if (type.startsWith("offre_rdv_")) return "demandes";
  if (type.startsWith("avis_medecin_")) return "avis";
  return "notifications";
}

/** Données (chaînes uniquement, contrainte FCM) jointes au message. */
export function donneesPush(notification) {
  const d = notification.donnees && typeof notification.donnees === "object" ? notification.donnees : {};
  const donnees = {
    notification_id: notification.notification_id,
    type: notification.type,
    cible: cibleNotification(notification.type),
  };
  if (notification.rdv_id) donnees.rdv_id = notification.rdv_id;
  for (const cle of ["offre_id", "palier", "date_creneau", "date_souhaitee", "type_rdv", "appelant", "appelant_photo", "lancee_le"]) {
    if (d[cle] != null) donnees[cle] = String(d[cle]);
  }
  return donnees;
}

/* -------------------------------------------------------------------
 * Appareils
 * ------------------------------------------------------------------- */

/**
 * Enregistre (ou réattribue) le jeton FCM de l'appareil au compte connecté.
 * @param {string} utilisateur_id
 * @param {{ jeton: unknown, plateforme: unknown }} corps
 */
export async function enregistrerAppareil(utilisateur_id, { jeton, plateforme } = {}) {
  const j = typeof jeton === "string" ? jeton.trim() : "";
  if (!j || j.length > JETON_MAX) throw new ErreurPush("Jeton d'appareil invalide.");
  const p = PLATEFORMES_PUSH.includes(plateforme) ? plateforme : null;
  if (!p) throw new ErreurPush(`Plateforme invalide (attendu : ${PLATEFORMES_PUSH.join(", ")}).`);

  await prisma.appareilPush.upsert({
    where: { jeton: j },
    create: { utilisateur_id, jeton: j, plateforme: p },
    update: { utilisateur_id, plateforme: p },
  });
}

/** Déconnexion : le téléphone ne reçoit plus les notifications de ce compte. */
export async function retirerAppareil(utilisateur_id, { jeton } = {}) {
  const j = typeof jeton === "string" ? jeton.trim() : "";
  if (!j) throw new ErreurPush("Jeton d'appareil manquant.");
  await prisma.appareilPush.deleteMany({ where: { jeton: j, utilisateur_id } });
}

/* -------------------------------------------------------------------
 * Envoi
 * ------------------------------------------------------------------- */

/**
 * Signal SILENCIEUX (aucun bandeau, aucune notification en base) envoyé à
 * tous les téléphones d'un utilisateur — ex. `visio_appel_termine` : l'appel
 * entrant doit cesser de sonner (refusé ou décroché ailleurs, visio terminée
 * par le médecin). Ne lève jamais, ne bloque jamais l'appelant.
 * @param {string} utilisateur_id
 * @param {Record<string,string>} donnees valeurs CHAÎNES uniquement
 */
export function signalerAppareils(utilisateur_id, donnees) {
  if (!utilisateur_id || !estConfigure()) return;
  (async () => {
    const appareils = await prisma.appareilPush.findMany({ where: { utilisateur_id }, select: { jeton: true } });
    for (const { jeton } of appareils) {
      // eslint-disable-next-line no-await-in-loop
      await envoyerMessage(jeton, { donnees, silencieux: true }).catch(async (err) => {
        if (err.jetonInvalide) await prisma.appareilPush.deleteMany({ where: { jeton } }).catch(() => {});
        else console.error(`[push] Signal ${donnees.type} non envoyé : ${err.message}`);
      });
    }
  })().catch((err) => console.error("[push] Signal inattendu :", err.message));
}

/**
 * Planifie le push des notifications identifiées par leurs clés. Ne lève
 * jamais, ne bloque jamais l'appelant.
 * @param {string[]} cles
 */
export function planifierPush(cles) {
  if (!cles?.length || !estConfigure()) return;
  const minuteur = setTimeout(() => {
    pousserNotifications(cles).catch((err) => console.error("[push] Échec inattendu :", err.message));
  }, DELAI_ENVOI_MS);
  minuteur.unref?.();
}

/**
 * Pousse les notifications (déjà en base) pas encore poussées.
 * @param {string[]} cles
 * @returns {Promise<{ envoyes: number, echecs: number }>}
 */
export async function pousserNotifications(cles) {
  const bilan = { envoyes: 0, echecs: 0 };
  if (!estConfigure()) return bilan;

  const notifications = await prisma.notification.findMany({
    where: { cle: { in: cles }, push_envoye_le: null },
  });
  for (const n of notifications) {
    // Prise en charge atomique : un seul processus pousse une notification donnée.
    // eslint-disable-next-line no-await-in-loop
    const { count } = await prisma.notification.updateMany({
      where: { notification_id: n.notification_id, push_envoye_le: null },
      data: { push_envoye_le: new Date() },
    });
    if (count !== 1) continue;

    // eslint-disable-next-line no-await-in-loop
    const appareils = await prisma.appareilPush.findMany({
      where: { utilisateur_id: n.utilisateur_id },
      select: { jeton: true },
    });
    const message = {
      titre: n.titre,
      corps: n.message,
      donnees: donneesPush(n),
      // Visio lancée par le médecin : sonnerie d'appel entrant sur le téléphone.
      appel: n.type === "rdv_visio_demarree",
    };
    for (const { jeton } of appareils) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await envoyerMessage(jeton, message);
        bilan.envoyes += 1;
      } catch (err) {
        bilan.echecs += 1;
        if (err.jetonInvalide) {
          // eslint-disable-next-line no-await-in-loop
          await prisma.appareilPush.deleteMany({ where: { jeton } }).catch(() => {});
        } else {
          console.error(`[push] Notification ${n.notification_id} non poussée : ${err.message}`);
        }
      }
    }
  }
  return bilan;
}
