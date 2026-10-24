// src/services/changementTypeRdv.service.js
// Changement du TYPE d'un RDV par le médecin : physique <-> téléconsultation.
//
// Le tarif est unique (tarif_indicatif du profil) : changer de type ne touche
// ni le paiement ni le séquestre. Le patient est notifié (rdv_type_modifie).
//
// Effets sur les FAITS du RDV :
//   - vers « teleconsultation » : lieu_rdv et accepte_le effacés (une
//     téléconsultation n'a pas de lieu, cf. schema.prisma) ;
//   - vers « physique » : lieu_rdv et accepte_le effacés aussi — le médecin
//     doit ensuite accepter le RDV en précisant le lieu (acceptationRdv).
//
// Règles :
//   - réservé au médecin du RDV (ni le patient, ni un admin) ;
//   - RDV « cree » (non payé) : 409 RDV_NON_PAYE (D8) ;
//   - statut autre que « confirme » : 409 ;
//   - consultation commencée (présence constatée, visio clôturée, fin
//     constatée) : 409 ;
//   - vers téléconsultation : le médecin doit l'avoir activée sur son profil.

import prisma from "../lib/prisma.js";
import { creerNotifications } from "./notification.service.js";

export const TYPES_RDV = Object.freeze(["physique", "teleconsultation"]);
export const STATUTS_CHANGEMENT_TYPE = Object.freeze(["confirme"]);

const LIBELLES = { physique: "consultation physique", teleconsultation: "téléconsultation" };

function erreur(status, message, code) {
  return { erreur: { status, message, ...(code ? { code } : {}) } };
}

/**
 * Règle PURE : le changement de type est-il possible ?
 * @param {object|null} rdv  avec medecin.teleconsultation_activee
 * @param {string} medecin_id
 * @param {unknown} nouveauType
 * @returns {null | { erreur: object }}
 */
export function verifierChangementTypePossible(rdv, medecin_id, nouveauType) {
  if (!TYPES_RDV.includes(nouveauType)) {
    return erreur(400, `type_rdv invalide. Valeurs acceptées : ${TYPES_RDV.join(", ")}.`, "TYPE_RDV_INVALIDE");
  }
  if (!rdv) return erreur(404, "Rendez-vous introuvable.");
  if (rdv.medecin_id !== medecin_id) {
    return erreur(403, "Accès refusé : vous n'êtes pas le médecin de ce rendez-vous.");
  }
  if (rdv.statut === "cree") {
    return erreur(
      409,
      "Ce rendez-vous n'est pas encore payé : vous ne pouvez pas agir dessus. " +
        "Il vous sera communiqué une fois le paiement confirmé.",
      "RDV_NON_PAYE"
    );
  }
  if (!STATUTS_CHANGEMENT_TYPE.includes(rdv.statut)) {
    return erreur(409, "Le type de ce rendez-vous ne peut plus être modifié.", "STATUT_INVALIDE");
  }
  if (rdv.medecin_present_le || rdv.patient_present_le || rdv.visio_cloturee_le || rdv.termine_le) {
    return erreur(409, "La consultation a déjà commencé : son type ne peut plus être modifié.", "CONSULTATION_COMMENCEE");
  }
  if (nouveauType === "teleconsultation" && !rdv.medecin?.teleconsultation_activee) {
    return erreur(
      400,
      "Activez la téléconsultation sur votre profil avant de convertir un rendez-vous en téléconsultation.",
      "TELECONSULTATION_INACTIVE"
    );
  }
  return null;
}

function messagePatient(nouveauType) {
  return nouveauType === "teleconsultation"
    ? "Le médecin a transformé votre rendez-vous en téléconsultation. Vous serez alerté quand il lancera la visio."
    : "Le médecin a transformé votre rendez-vous en consultation physique. Il vous précisera le lieu prochainement.";
}

/**
 * Change le type d'un RDV et notifie le patient.
 * @param {{ rdv_id: string, medecin_id: string, type_rdv: unknown }} p
 * @param {{ maintenant?: Date }} [options]
 * @returns {Promise<{ erreur: object } | { inchange: boolean, type_rdv: string }>}
 */
export async function changerTypeRendezVous({ rdv_id, medecin_id, type_rdv: nouveauType }, { maintenant = new Date() } = {}) {
  const rdv = await prisma.rendezVous.findUnique({
    where: { rdv_id },
    select: {
      rdv_id: true,
      medecin_id: true,
      type_rdv: true,
      statut: true,
      date_creneau: true,
      medecin_present_le: true,
      patient_present_le: true,
      visio_cloturee_le: true,
      termine_le: true,
      medecin: { select: { teleconsultation_activee: true } },
      patient: { select: { utilisateur_id: true } },
    },
  });

  const refus = verifierChangementTypePossible(rdv, medecin_id, nouveauType);
  if (refus) return refus;

  // Même type : rien à faire, aucune notification (double clic sans effet).
  if (rdv.type_rdv === nouveauType) return { inchange: true, type_rdv: nouveauType };

  // Écriture conditionnelle : un RDV annulé ou commencé entre la lecture et
  // l'écriture n'est pas modifié.
  const { count } = await prisma.rendezVous.updateMany({
    where: {
      rdv_id,
      statut: { in: [...STATUTS_CHANGEMENT_TYPE] },
      type_rdv: rdv.type_rdv,
      medecin_present_le: null,
      patient_present_le: null,
      visio_cloturee_le: null,
      termine_le: null,
    },
    data: { type_rdv: nouveauType, lieu_rdv: null, accepte_le: null },
  });
  if (count !== 1) {
    return erreur(409, "Le type de ce rendez-vous ne peut plus être modifié.", "STATUT_INVALIDE");
  }

  // La notification ne doit jamais défaire un changement déjà enregistré.
  try {
    const destinataire = rdv.patient.utilisateur_id;
    await creerNotifications([
      {
        utilisateur_id: destinataire,
        type: "rdv_type_modifie",
        rdv_id,
        titre: `Rendez-vous en ${LIBELLES[nouveauType]}`,
        message: messagePatient(nouveauType),
        donnees: { date_creneau: rdv.date_creneau.toISOString(), type_rdv: nouveauType },
        cle: `rdv_type_modifie:${rdv_id}:${maintenant.toISOString()}:${destinataire}`,
      },
    ]);
  } catch (err) {
    console.error(`[rdv] Notification patient (rdv_type_modifie) impossible pour le rdv ${rdv_id} :`, err.message);
  }

  return { inchange: false, type_rdv: nouveauType };
}
