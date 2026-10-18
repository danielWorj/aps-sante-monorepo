// src/services/acceptationRdv.service.js
// Acceptation d'un RDV PHYSIQUE par le médecin, APRÈS paiement.
//
// Le paiement passe le RDV à « confirme » (finaliserPaiement) et notifie le
// médecin (rdv_paye). Le médecin l'accepte alors en saisissant LUI-MÊME le
// lieu de la consultation (texte libre, obligatoire) ; le PATIENT reçoit la
// notification « rdv_accepte » avec la date et le lieu.
//
// On enregistre des FAITS (pas de statut dédié) :
//   - lieu_rdv   : le lieu en vigueur ;
//   - accepte_le : la date de la PREMIÈRE acceptation (jamais réécrite).
// Le lieu reste modifiable tant que le RDV est « confirme » : chaque
// changement renotifie le patient. Renvoyer le même lieu ne fait rien
// (double clic sans effet). Sans acceptation, rien d'automatique.
//
// Règles :
//   - réservé au médecin du RDV (ni le patient, ni un admin) ;
//   - RDV « cree » (non payé) : 409 RDV_NON_PAYE (D8) ;
//   - téléconsultation : 400 (aucun lieu) ;
//   - tout autre statut que « confirme » : 409.

import prisma from "../lib/prisma.js";
import { creerNotifications } from "./notification.service.js";

export const LONGUEUR_MAX_LIEU = 500;
export const STATUTS_ACCEPTATION = Object.freeze(["confirme"]);

function erreur(status, message, code) {
  return { erreur: { status, message, ...(code ? { code } : {}) } };
}

/**
 * Normalise le lieu saisi (espaces de bord retirés, espaces internes
 * réduits). Renvoie { lieu } ou { erreur }.
 * @param {unknown} brut
 */
export function normaliserLieu(brut) {
  if (typeof brut !== "string") return erreur(400, "Le lieu du rendez-vous est obligatoire.", "LIEU_REQUIS");
  const lieu = brut.replace(/\s+/g, " ").trim();
  if (!lieu) return erreur(400, "Le lieu du rendez-vous est obligatoire.", "LIEU_REQUIS");
  if (lieu.length > LONGUEUR_MAX_LIEU) {
    return erreur(400, `Le lieu ne peut pas dépasser ${LONGUEUR_MAX_LIEU} caractères.`, "LIEU_TROP_LONG");
  }
  return { lieu };
}

/**
 * Règle PURE : l'acceptation est-elle possible sur ce RDV, par ce médecin ?
 * @param {{ medecin_id: string, type_rdv: string, statut: string }} rdv
 * @param {string} medecin_id
 * @returns {null | { erreur: object }}
 */
export function verifierAcceptationPossible(rdv, medecin_id) {
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
  if (rdv.type_rdv !== "physique") {
    return erreur(400, "Seul un rendez-vous physique s'accepte avec un lieu.", "TYPE_RDV_INVALIDE");
  }
  if (!STATUTS_ACCEPTATION.includes(rdv.statut)) {
    return erreur(409, "Ce rendez-vous ne peut plus être accepté ni changer de lieu.", "STATUT_INVALIDE");
  }
  return null;
}

/**
 * Message du patient. La date n'est pas dans le texte : elle est dans
 * `donnees` (ISO) pour que chaque client l'affiche dans le fuseau de
 * l'utilisateur.
 */
function messagePatient(lieu, modification) {
  return modification
    ? `Le médecin a changé le lieu de votre rendez-vous. Nouveau lieu : ${lieu}.`
    : `Le médecin a accepté votre rendez-vous. Lieu : ${lieu}.`;
}

/**
 * Accepte un RDV physique (ou en change le lieu) et notifie le patient.
 * @param {{ rdv_id: string, medecin_id: string, lieu: unknown }} p
 * @param {{ maintenant?: Date }} [options]
 * @returns {Promise<{ erreur: object } | { deja_accepte: boolean, modification: boolean, lieu_rdv: string, accepte_le: Date }>}
 */
export async function accepterRendezVous({ rdv_id, medecin_id, lieu: brut }, { maintenant = new Date() } = {}) {
  const rdv = await prisma.rendezVous.findUnique({
    where: { rdv_id },
    select: {
      rdv_id: true,
      medecin_id: true,
      type_rdv: true,
      statut: true,
      date_creneau: true,
      lieu_rdv: true,
      accepte_le: true,
      patient: { select: { utilisateur_id: true } },
    },
  });

  const refus = verifierAcceptationPossible(rdv, medecin_id);
  if (refus) return refus;

  const saisie = normaliserLieu(brut);
  if (saisie.erreur) return saisie;
  const { lieu } = saisie;

  // Même lieu déjà enregistré : rien à faire, aucune notification.
  if (rdv.accepte_le && rdv.lieu_rdv === lieu) {
    return { deja_accepte: true, modification: false, lieu_rdv: lieu, accepte_le: rdv.accepte_le };
  }

  const modification = Boolean(rdv.accepte_le);
  const accepte_le = rdv.accepte_le ?? maintenant;

  // Écriture conditionnelle : un RDV annulé (ou passé en présence) entre la
  // lecture et l'écriture n'est pas modifié.
  const { count } = await prisma.rendezVous.updateMany({
    where: { rdv_id, statut: { in: [...STATUTS_ACCEPTATION] } },
    data: { lieu_rdv: lieu, accepte_le },
  });
  if (count !== 1) {
    return erreur(409, "Ce rendez-vous ne peut plus être accepté ni changer de lieu.", "STATUT_INVALIDE");
  }

  // La notification ne doit jamais défaire une acceptation déjà enregistrée.
  try {
    const destinataire = rdv.patient.utilisateur_id;
    await creerNotifications([
      {
        utilisateur_id: destinataire,
        type: "rdv_accepte",
        rdv_id,
        titre: modification ? "Lieu du rendez-vous modifié" : "Rendez-vous accepté",
        message: messagePatient(lieu, modification),
        // Le lieu est figé ici : il peut changer ensuite dans le RDV.
        donnees: { date_creneau: rdv.date_creneau.toISOString(), lieu_rdv: lieu, modification },
        cle: `rdv_accepte:${rdv_id}:${maintenant.toISOString()}:${destinataire}`,
      },
    ]);
  } catch (err) {
    console.error(`[rdv] Notification patient (rdv_accepte) impossible pour le rdv ${rdv_id} :`, err.message);
  }

  return { deja_accepte: false, modification, lieu_rdv: lieu, accepte_le };
}
