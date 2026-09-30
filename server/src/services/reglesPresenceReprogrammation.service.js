// src/services/reglesPresenceReprogrammation.service.js
// Politique de fonds v2 §5 (étape 6) — RÈGLES PURES (aucun accès base,
// aucune horloge implicite : `maintenant` est toujours passé) de la
// détection de présence et de la reprogrammation « deux absents ».
// Même esprit que politiqueFonds.service.js : la règle est ici et
// testable seule (src/tests/reglesPresenceReprogrammation.test.js) ;
// presence.service.js et reprogrammation.service.js ne font que
// l'appliquer.

import { DELAI_REPROGRAMMATION_H, delaiReprogrammationEcoule } from "./politiqueFonds.service.js";

const MS_PAR_HEURE = 60 * 60 * 1000;

/**
 * Échéance du délai de reprogrammation : a_reprogrammer_le + 48h.
 * Recalculée à chaque appel, jamais stockée (principe « aucune valeur
 * dérivée stockée »). Le délai ne se prolonge JAMAIS : une nouvelle
 * proposition ne change pas ce point de départ.
 * @param {Date|string} aReprogrammerLe
 * @returns {Date}
 */
export function echeanceReprogrammation(aReprogrammerLe) {
  return new Date(new Date(aReprogrammerLe).getTime() + DELAI_REPROGRAMMATION_H * MS_PAR_HEURE);
}

/**
 * Identifie la partie (patient / médecin) d'un participant de visio.
 *
 * Le JWT Jitsi porte `context.user.id` = utilisateur_id (jitsi.service.js)
 * et `email`. L'identifiant prime : s'il est fourni et ne correspond à
 * personne, on renvoie null (jamais de repli sur l'e-mail, qui pourrait
 * désigner quelqu'un d'autre). Sans identifiant (jeton émis avant
 * l'étape 6), repli sur l'e-mail, unique en base, comparé sans casse.
 *
 * @param {{ medecin?: { utilisateur?: { utilisateur_id: string, email: string } },
 *           patient?: { utilisateur?: { utilisateur_id: string, email: string } } }} rdv
 * @param {{ user_id?: string|null, email?: string|null }} participant
 * @returns {"medecin"|"patient"|null}
 */
export function partieDepuisParticipant(rdv, participant = {}) {
  const medecin = rdv?.medecin?.utilisateur;
  const patient = rdv?.patient?.utilisateur;
  const { user_id, email } = participant;

  if (user_id) {
    if (medecin && medecin.utilisateur_id === user_id) return "medecin";
    if (patient && patient.utilisateur_id === user_id) return "patient";
    return null;
  }
  if (email) {
    const e = String(email).trim().toLowerCase();
    if (medecin?.email && String(medecin.email).trim().toLowerCase() === e) return "medecin";
    if (patient?.email && String(patient.email).trim().toLowerCase() === e) return "patient";
  }
  return null;
}

/**
 * Partie d'un utilisateur connecté sur un RDV chargé avec
 * `patient.utilisateur_id` et `medecin.utilisateur_id`. Un admin n'est PAS
 * une partie : la proposition/acceptation de reprogrammation est réservée
 * au patient et au médecin du rendez-vous (§5).
 * @returns {"patient"|"medecin"|null}
 */
export function partieDeUtilisateur(rdv, utilisateurId) {
  if (!utilisateurId) return null;
  if (rdv?.patient?.utilisateur_id === utilisateurId) return "patient";
  if (rdv?.medecin?.utilisateur_id === utilisateurId) return "medecin";
  return null;
}

/** L'autre partie du rendez-vous. */
export function autrePartie(partie) {
  return partie === "patient" ? "medecin" : "patient";
}

/**
 * Valide la date proposée : valide et STRICTEMENT dans le futur (§5).
 * @returns {{ date: Date } | { erreur: { status: number, message: string } }}
 */
export function validerDateProposee(dateBrute, maintenant) {
  if (dateBrute === undefined || dateBrute === null || dateBrute === "") {
    return { erreur: { status: 400, message: "Champ requis manquant : nouvelle_date." } };
  }
  const date = dateBrute instanceof Date ? new Date(dateBrute.getTime()) : new Date(dateBrute);
  if (Number.isNaN(date.getTime())) {
    return { erreur: { status: 400, message: "nouvelle_date invalide (attendu : date et heure ISO 8601)." } };
  }
  if (date.getTime() <= new Date(maintenant).getTime()) {
    return { erreur: { status: 400, message: "nouvelle_date doit être dans le futur." } };
  }
  return { date };
}

/**
 * Correspondance date_creneau (DateTime) -> case de l'agenda
 * (CreneauAgenda.date @db.Date + Horaire.heure_debut @db.Time).
 *
 * ⚠️ Hypothèse (point ouvert I) : date et heure sont lues en UTC, comme la
 * génération des créneaux (agenda.controller.js, `T00:00:00Z` et getUTCDay).
 * Si le front saisit des heures locales (Douala = UTC+1) sans conversion,
 * cette fonction est le SEUL endroit à ajuster.
 *
 * @returns {{ date: Date, heure: Date, alignee: boolean }}
 *   `alignee` = faux si secondes/millisecondes non nulles (ne peut pas être
 *   un début de créneau).
 */
export function creneauAgendaDepuisDate(dateCreneau) {
  const d = new Date(dateCreneau);
  return {
    date: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())),
    heure: new Date(Date.UTC(1970, 0, 1, d.getUTCHours(), d.getUTCMinutes(), 0, 0)),
    alignee: d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0,
  };
}

function erreur(status, message) {
  return { erreur: { status, message } };
}

/**
 * État du RDV requis pour PROPOSER une nouvelle date.
 * @param {{ rdv: object, partie: string|null, maintenant: Date }} p
 * @returns {{ ok: true } | { erreur: { status: number, message: string } }}
 */
export function evaluerProposition({ rdv, partie, maintenant }) {
  if (!partie) {
    return erreur(403, "Seuls le patient et le médecin de ce rendez-vous peuvent proposer une nouvelle date.");
  }
  if (rdv.statut !== "a_reprogrammer") {
    return erreur(409, `Ce rendez-vous n'est pas à reprogrammer (statut actuel : ${rdv.statut}).`);
  }
  if (!rdv.a_reprogrammer_le) {
    return erreur(409, "Ce rendez-vous n'a pas de date d'entrée en reprogrammation : délai de 48h incalculable.");
  }
  if (delaiReprogrammationEcoule(rdv.a_reprogrammer_le, maintenant)) {
    return erreur(
      409,
      `Le délai de reprogrammation de ${DELAI_REPROGRAMMATION_H}h est écoulé : le remboursement du patient est déclenché automatiquement.`
    );
  }
  return { ok: true };
}

/**
 * État du RDV requis pour ACCEPTER la proposition en cours : les mêmes
 * conditions que pour proposer, plus une proposition existante émise par
 * l'AUTRE partie, dont la date est encore dans le futur.
 */
export function evaluerAcceptation({ rdv, partie, maintenant }) {
  const base = evaluerProposition({ rdv, partie, maintenant });
  if (base.erreur) return base;

  if (!rdv.nouvelle_date_proposee || !rdv.proposee_par) {
    return erreur(409, "Aucune proposition de nouvelle date n'est en attente d'acceptation.");
  }
  if (rdv.proposee_par === partie) {
    return erreur(403, "Vous ne pouvez pas accepter votre propre proposition : elle doit être acceptée par l'autre partie.");
  }
  if (new Date(rdv.nouvelle_date_proposee).getTime() <= new Date(maintenant).getTime()) {
    return erreur(409, "La date proposée est désormais passée : une nouvelle proposition est nécessaire.");
  }
  return { ok: true };
}
