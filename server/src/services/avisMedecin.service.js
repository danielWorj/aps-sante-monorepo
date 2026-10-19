// src/services/avisMedecin.service.js
// Réputation médecin — règles métier des avis et de la notation.
//
// Règles (décision du 2026-10-19) :
//   - seul un PATIENT ayant réellement consulté peut noter : l'avis est
//     rattaché à un RDV dont la fin de consultation a été constatée
//     (rendez_vous.termine_le — code validé ou visio clôturée — ou statut
//     « honore »), au plus UN avis par RDV, dans les DELAI_AVIS_JOURS jours
//     qui suivent ;
//   - note globale obligatoire (1 à 5), seule à entrer dans la moyenne ;
//     critères (ponctualité, écoute, explications) et recommandation
//     facultatifs ;
//   - l'avis reste soumis à la modération existante (« en_attente » à la
//     création, publié par un admin/superadmin) ; la moyenne et le nombre
//     d'avis de la fiche (medecin.note_moyenne / nombre_avis) ne comptent
//     que les avis publiés et sont recalculés à chaque changement ;
//   - le médecin peut répondre publiquement (une réponse, modifiable) et
//     signaler un avis au back-office ; il ne peut ni le modifier ni le
//     masquer lui-même ;
//   - l'identité affichée est « Prénom N. », ou « Patient vérifié » si le
//     patient a choisi l'anonymat — jamais le nom complet.
//
// Les fonctions « pures » (validation, éligibilité, présentation) sont
// exportées pour les tests ; les notifications ne lèvent jamais.

import prisma from "../lib/prisma.js";
import { creerNotifications } from "./notification.service.js";

export const NOTE_MIN = 1;
export const NOTE_MAX = 5;
export const DELAI_AVIS_JOURS = 90;
export const COMMENTAIRE_MAX = 2000;
export const REPONSE_MAX = 1500;
export const MOTIF_SIGNALEMENT_MAX = 500;

export const CRITERES_AVIS = Object.freeze([
  { cle: "note_ponctualite", libelle: "Ponctualité" },
  { cle: "note_ecoute", libelle: "Écoute" },
  { cle: "note_explications", libelle: "Clarté des explications" },
]);

const erreur = (status, message, code) => ({ erreur: { status, message, code } });

function noteValide(valeur) {
  const n = Number(valeur);
  return Number.isInteger(n) && n >= NOTE_MIN && n <= NOTE_MAX ? n : null;
}

/**
 * Valide et normalise la saisie d'un avis (création ou correction par
 * l'auteur). `partiel` : seuls les champs présents sont validés.
 * @returns {{ donnees: object } | { erreur: object }}
 */
export function normaliserSaisieAvis(corps = {}, { partiel = false } = {}) {
  const donnees = {};

  if (corps.note !== undefined || !partiel) {
    const note = noteValide(corps.note);
    if (note === null) {
      return erreur(400, `La note globale est obligatoire (entier de ${NOTE_MIN} à ${NOTE_MAX}).`, "NOTE_INVALIDE");
    }
    donnees.note = note;
  }

  for (const { cle, libelle } of CRITERES_AVIS) {
    if (corps[cle] === undefined) continue;
    if (corps[cle] === null || corps[cle] === "") {
      donnees[cle] = null;
      continue;
    }
    const n = noteValide(corps[cle]);
    if (n === null) return erreur(400, `${libelle} : note invalide (entier de ${NOTE_MIN} à ${NOTE_MAX}).`, "NOTE_INVALIDE");
    donnees[cle] = n;
  }

  if (corps.recommande !== undefined) {
    if (corps.recommande !== null && typeof corps.recommande !== "boolean") {
      return erreur(400, "recommande doit être true, false ou null.", "RECOMMANDE_INVALIDE");
    }
    donnees.recommande = corps.recommande;
  }

  if (corps.anonyme !== undefined) donnees.anonyme = corps.anonyme === true;

  if (corps.commentaire !== undefined) {
    const texte = typeof corps.commentaire === "string" ? corps.commentaire.trim() : "";
    if (texte.length > COMMENTAIRE_MAX) {
      return erreur(400, `Le commentaire ne peut pas dépasser ${COMMENTAIRE_MAX} caractères.`, "COMMENTAIRE_TROP_LONG");
    }
    donnees.commentaire = texte || null;
  }

  return { donnees };
}

/**
 * Le RDV ouvre-t-il droit à un avis de cet utilisateur ?
 * @param {object|null} rdv  { patient: { utilisateur_id }, termine_le, statut, date_creneau, avis_medecin }
 * @returns {null | { erreur: object }}
 */
export function verifierEligibiliteAvis(rdv, utilisateur_id, maintenant = new Date()) {
  if (!rdv) return erreur(404, "Rendez-vous introuvable.", "RDV_INTROUVABLE");
  if (rdv.patient?.utilisateur_id !== utilisateur_id) {
    return erreur(403, "Seul le patient de ce rendez-vous peut donner son avis.", "PAS_LE_PATIENT");
  }
  if (!rdv.termine_le && rdv.statut !== "honore") {
    return erreur(409, "Vous pourrez donner votre avis une fois la consultation terminée.", "CONSULTATION_NON_TERMINEE");
  }
  if (rdv.avis_medecin) return erreur(409, "Vous avez déjà donné votre avis sur cette consultation.", "AVIS_DEJA_DEPOSE");
  const fin = new Date(rdv.termine_le ?? rdv.date_creneau);
  if (maintenant - fin > DELAI_AVIS_JOURS * 86_400_000) {
    return erreur(409, `Un avis peut être donné dans les ${DELAI_AVIS_JOURS} jours qui suivent la consultation.`, "DELAI_AVIS_DEPASSE");
  }
  return null;
}

/** « Prénom N. », ou « Patient vérifié » si anonyme. */
export function nomPublicAuteur(utilisateur, anonyme = false) {
  if (anonyme || !utilisateur) return "Patient vérifié";
  const prenom = utilisateur.prenom?.trim();
  const initiale = utilisateur.nom?.trim()?.[0];
  if (!prenom) return initiale ? `${initiale.toUpperCase()}.` : "Patient";
  return initiale ? `${prenom} ${initiale.toUpperCase()}.` : prenom;
}

export const SELECTION_AVIS_PUBLIC = {
  avis_id: true,
  note: true,
  note_ponctualite: true,
  note_ecoute: true,
  note_explications: true,
  recommande: true,
  commentaire: true,
  anonyme: true,
  rdv_id: true,
  date_creation: true,
  reponse_medecin: true,
  date_reponse: true,
  utilisateur: { select: { prenom: true, nom: true } },
  rendez_vous: { select: { type_rdv: true } },
};

/** Avis tel qu'exposé au public (et au médecin) : jamais d'identifiant d'auteur. */
export function presenterAvisPublic(avis) {
  return {
    avis_id: avis.avis_id,
    note: avis.note,
    criteres: {
      ponctualite: avis.note_ponctualite ?? null,
      ecoute: avis.note_ecoute ?? null,
      explications: avis.note_explications ?? null,
    },
    recommande: avis.recommande ?? null,
    commentaire: avis.commentaire,
    date_creation: avis.date_creation,
    auteur: nomPublicAuteur(avis.utilisateur, avis.anonyme),
    patient_verifie: Boolean(avis.rdv_id),
    type_consultation: avis.rendez_vous?.type_rdv ?? null,
    reponse: avis.reponse_medecin ? { texte: avis.reponse_medecin, date: avis.date_reponse } : null,
  };
}

const arrondi1 = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);

/**
 * Synthèse des notes d'un ensemble d'avis (par défaut : les avis publiés
 * du médecin). Une seule passe en base par agrégat.
 * @returns {Promise<{ nombre, moyenne, distribution, criteres, taux_recommandation, avec_commentaire }>}
 */
export async function resumeNotes(medecin_id, filtre = {}, db = prisma) {
  const where = { medecin_id, statut_moderation: "publie", ...filtre };
  const [agregat, parNote, recommandations, avecCommentaire] = await Promise.all([
    db.avisMedecin.aggregate({
      where,
      _count: { _all: true },
      _avg: { note: true, note_ponctualite: true, note_ecoute: true, note_explications: true },
    }),
    db.avisMedecin.groupBy({ by: ["note"], where, _count: { _all: true } }),
    db.avisMedecin.groupBy({ by: ["recommande"], where: { ...where, recommande: { not: null } }, _count: { _all: true } }),
    db.avisMedecin.count({ where: { ...where, commentaire: { not: null } } }),
  ]);

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const g of parNote) distribution[g.note] = g._count._all;
  const oui = recommandations.find((g) => g.recommande === true)?._count._all ?? 0;
  const exprimees = recommandations.reduce((a, g) => a + g._count._all, 0);

  return {
    nombre: agregat._count._all,
    moyenne: arrondi1(agregat._avg.note),
    distribution,
    criteres: {
      ponctualite: arrondi1(agregat._avg.note_ponctualite),
      ecoute: arrondi1(agregat._avg.note_ecoute),
      explications: arrondi1(agregat._avg.note_explications),
    },
    taux_recommandation: exprimees ? Math.round((oui / exprimees) * 100) : null,
    recommandations_exprimees: exprimees,
    avec_commentaire: avecCommentaire,
  };
}

/**
 * Recalcule medecin.note_moyenne / nombre_avis (avis publiés uniquement).
 * À appeler après toute modération, suppression ou modification d'un avis.
 */
export async function recalculerNoteMedecin(medecin_id, db = prisma) {
  const agregat = await db.avisMedecin.aggregate({
    where: { medecin_id, statut_moderation: "publie" },
    _count: { _all: true },
    _avg: { note: true },
  });
  const nombre = agregat._count._all;
  const moyenne = nombre ? Math.round(Number(agregat._avg.note) * 100) / 100 : null;
  await db.medecin.update({
    where: { medecin_id },
    data: { nombre_avis: nombre, note_moyenne: moyenne },
  });
  return { nombre_avis: nombre, note_moyenne: moyenne };
}

/* ============================== Notifications ============================== */

function nomMedecin(medecin) {
  const u = medecin?.utilisateur;
  return u ? `Dr ${[u.prenom, u.nom].filter(Boolean).join(" ")}`.trim() : "votre médecin";
}

/**
 * Invite le patient à noter une consultation qui vient de se terminer.
 * Idempotent (clé par RDV) ; ne lève jamais.
 */
export async function inviterAvisPatient(rdv_id) {
  try {
    const rdv = await prisma.rendezVous.findUnique({
      where: { rdv_id },
      select: {
        rdv_id: true, termine_le: true, statut: true, medecin_id: true,
        patient: { select: { utilisateur_id: true } },
        medecin: { select: { utilisateur: { select: { prenom: true, nom: true } } } },
        avis_medecin: { select: { avis_id: true } },
      },
    });
    if (!rdv || rdv.avis_medecin || (!rdv.termine_le && rdv.statut !== "honore")) return { creees: 0 };
    const { count } = await creerNotifications([{
      utilisateur_id: rdv.patient.utilisateur_id,
      type: "avis_medecin_invitation",
      rdv_id,
      titre: "Comment s'est passée votre consultation ?",
      message: `Votre avis sur la consultation avec ${nomMedecin(rdv.medecin)} aide les autres patients. Il ne prend qu'une minute.`,
      donnees: { rdv_id, medecin_id: rdv.medecin_id, lien: "/portail/patient-rdv" },
      cle: `avis_invitation:${rdv_id}`,
    }]);
    return { creees: count };
  } catch (err) {
    console.error(`[avis-medecin] Invitation non émise (rdv ${rdv_id}) :`, err.message);
    return { creees: 0 };
  }
}

/** Avis publié par la modération : le médecin est prévenu. Ne lève jamais. */
export async function notifierAvisPublie(avis) {
  try {
    const medecin = await prisma.medecin.findUnique({
      where: { medecin_id: avis.medecin_id },
      select: { utilisateur_id: true },
    });
    if (!medecin) return;
    await creerNotifications([{
      utilisateur_id: medecin.utilisateur_id,
      type: "avis_medecin_publie",
      titre: `Nouvel avis patient : ${avis.note}/5`,
      message: avis.commentaire
        ? `« ${avis.commentaire.slice(0, 140)}${avis.commentaire.length > 140 ? "…" : ""} »`
        : "Un patient a noté sa consultation. Vous pouvez lui répondre depuis votre espace.",
      donnees: { avis_id: avis.avis_id, lien: "/portail/medecin-avis" },
      cle: `avis_publie:${avis.avis_id}`,
    }]);
  } catch (err) {
    console.error(`[avis-medecin] Notification de publication non émise (${avis.avis_id}) :`, err.message);
  }
}

/**
 * Le médecin a répondu : l'auteur est prévenu à la PREMIÈRE réponse (une
 * correction ultérieure ne renotifie pas). Ne lève jamais.
 */
export async function notifierReponseAvis(avis, medecin) {
  try {
    await creerNotifications([{
      utilisateur_id: avis.utilisateur_id,
      type: "avis_medecin_reponse",
      rdv_id: avis.rdv_id ?? undefined,
      titre: `${nomMedecin(medecin)} a répondu à votre avis`,
      message: avis.reponse_medecin.slice(0, 200),
      donnees: { avis_id: avis.avis_id, medecin_id: avis.medecin_id, lien: `/profil/${avis.medecin_id}?onglet=avis` },
      cle: `avis_reponse:${avis.avis_id}`,
    }]);
  } catch (err) {
    console.error(`[avis-medecin] Notification de réponse non émise (${avis.avis_id}) :`, err.message);
  }
}
