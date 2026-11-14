// src/services/teleconsultationPrealable.service.js
// Règle : une TÉLÉCONSULTATION n'est possible qu'avec un médecin qui a déjà
// reçu le patient en consultation PHYSIQUE, et que cette consultation a eu
// lieu (fin constatée : `termine_le`, ou statut « honore »).
//
// Appliquée côté serveur à toute prise de RDV en visio par le patient :
//   - réservation d'un créneau (POST /rendez-vous) ;
//   - demande directe à un médecin sans créneau libre ;
//   - RDV sur offre : publication (au moins un médecin éligible l'a déjà
//     reçu), réponse du médecin, validation du médecin retenu.
// Le changement de type décidé par le MÉDECIN (changementTypeRdv) n'est pas
// concerné : c'est le médecin qui juge.

import prisma from "../lib/prisma.js";
import { creerNotifications } from "./notification.service.js";

export const CODE_TELECONSULTATION_SANS_RDV_PHYSIQUE = "TELECONSULTATION_SANS_RDV_PHYSIQUE";
export const MESSAGE_TELECONSULTATION_SANS_RDV_PHYSIQUE =
  "Une téléconsultation n'est possible qu'après un premier rendez-vous physique effectué avec ce médecin. " +
  "Prenez d'abord un rendez-vous en consultation physique.";

/** Filtre Prisma : RDV physique effectivement réalisé (jamais annulé). */
export const FILTRE_RDV_PHYSIQUE_EFFECTUE = Object.freeze({
  type_rdv: "physique",
  statut: { not: "annule" },
  OR: [{ termine_le: { not: null } }, { statut: "honore" }],
});

export class ErreurTeleconsultationPrealable extends Error {
  constructor(message = MESSAGE_TELECONSULTATION_SANS_RDV_PHYSIQUE) {
    super(message);
    this.name = "ErreurTeleconsultationPrealable";
    this.status = 409;
    this.code = CODE_TELECONSULTATION_SANS_RDV_PHYSIQUE;
  }
}

/**
 * Le patient a-t-il déjà eu un RDV physique effectué avec ce médecin ?
 * @returns {Promise<boolean>}
 */
export async function aEuRdvPhysiqueEffectue(patient_id, medecin_id, db = prisma) {
  if (!patient_id || !medecin_id) return false;
  const n = await db.rendezVous.count({ where: { patient_id, medecin_id, ...FILTRE_RDV_PHYSIQUE_EFFECTUE } });
  return n > 0;
}

/**
 * Médecins (parmi `medecin_ids`) qui ont déjà reçu ce patient en consultation
 * physique effectuée.
 * @returns {Promise<Set<string>>}
 */
export async function medecinsAyantRecuLePatient(patient_id, medecin_ids, db = prisma) {
  if (!patient_id || !medecin_ids?.length) return new Set();
  const lignes = await db.rendezVous.findMany({
    where: { patient_id, medecin_id: { in: medecin_ids }, ...FILTRE_RDV_PHYSIQUE_EFFECTUE },
    select: { medecin_id: true },
    distinct: ["medecin_id"],
  });
  return new Set(lignes.map((l) => l.medecin_id));
}

/**
 * Lève ErreurTeleconsultationPrealable (409) si la téléconsultation n'est pas
 * permise entre ce patient et ce médecin. Sans effet pour un RDV physique.
 */
export async function exigerRdvPhysiquePrealable({ patient_id, medecin_id, type_rdv }, db = prisma) {
  if (type_rdv !== "teleconsultation") return;
  if (!(await aEuRdvPhysiqueEffectue(patient_id, medecin_id, db))) {
    throw new ErreurTeleconsultationPrealable();
  }
}

/**
 * Notifie le PATIENT que sa téléconsultation est refusée faute de RDV
 * physique préalable (type `rdv_teleconsultation_refusee`). Une seule note
 * par patient, médecin et jour (clé) : plusieurs essais ne spamment pas.
 * Ne lève jamais : journalise.
 * @param {string} patient_id
 * @param {{ medecin_id?: string|null, message?: string, maintenant?: Date }} [options]
 */
export async function notifierRefusTeleconsultation(
  patient_id,
  { medecin_id = null, message = MESSAGE_TELECONSULTATION_SANS_RDV_PHYSIQUE, maintenant = new Date() } = {},
  db = prisma
) {
  try {
    const patient = await db.patient.findUnique({ where: { patient_id }, select: { utilisateur_id: true } });
    if (!patient) return;
    const jour = maintenant.toISOString().slice(0, 10);
    await creerNotifications(
      [
        {
          utilisateur_id: patient.utilisateur_id,
          type: "rdv_teleconsultation_refusee",
          titre: "Téléconsultation impossible",
          message,
          // Lien : la fiche du médecin, pour prendre un RDV physique.
          donnees: medecin_id ? { medecin_id, lien: `/profil/${medecin_id}` } : {},
          cle: `rdv_teleconsultation_refusee:${patient_id}:${medecin_id ?? "offre"}:${jour}`,
        },
      ],
      db
    );
  } catch (err) {
    console.error(`[teleconsultation] Notification de refus impossible (patient ${patient_id}) :`, err.message);
  }
}
