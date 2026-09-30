// src/services/annulation.service.js
// Politique de fonds v2 §3-§4 — Annulation d'un rendez-vous par le
// patient ou par le médecin (un admin annule au nom de l'un des deux :
// `initiateur` obligatoire, voir rendezVous.controller.js).
//
// La règle vit dans politiqueFonds.service.js (`decider`) et son
// exécution dans traitementFonds.service.js ; ce service :
//   - refuse les annulations qui n'ont pas de sens (statut terminal,
//     litige, RDV en reprogrammation, créneau déjà passé côté patient) ;
//   - neutralise les paiements Stripe encore ouverts d'un RDV jamais payé ;
//   - traduit l'initiateur en événement de fonds.
//
// Matrice (>24h : pile 24h inclus ; voir estAnnulationTardive) :
//   patient  > 24h : remboursement (honoraires − frais de remboursement)
//   patient  < 24h : aucun remboursement, médecin payé (honoraires −
//                    commission APS), commission versée à APS
//   médecin  > 24h : remboursement
//   médecin  < 24h : remboursement + amende au médecin (§7)
// Annulation pendant la reprogrammation (statut « a_reprogrammer », les deux
// parties ont été absentes), par n'importe quelle partie ou un admin (point G) :
//   traitée comme « deux absents sans reprogrammation » — patient remboursé de
//   honoraires − frais de remboursement − commission APS, commission versée à
//   APS, aucune amende, RDV « annule ». Le délai du créneau n'a plus de sens
//   (le créneau initial est passé) : il n'est pas évalué.
// Un rendez-vous jamais payé : rien à rembourser ni à libérer ; l'amende
// reste due (point ouvert D).
//
// Retourne `{ erreur: { status, message } }` pour un refus métier
// attendu (même convention que verifierTransitionAutorisee) ; lève une
// exception pour tout le reste.

import prisma from "../lib/prisma.js";
import { annulerPaymentIntentsRdv } from "../lib/stripeService.js";
import { EVENEMENTS } from "./politiqueFonds.service.js";
import { appliquerEvenementFonds } from "./traitementFonds.service.js";

// « conteste » : litiges hors périmètre (ne pas toucher). Statuts terminaux :
// rien à annuler. « a_reprogrammer » N'est PAS ici : il est annulable (point G).
const STATUTS_NON_ANNULABLES = {
  conteste: "Ce rendez-vous est en litige : il ne peut pas être annulé.",
  honore: "Ce rendez-vous est déjà honoré : il ne peut plus être annulé.",
  non_honore: "Ce rendez-vous est déjà clôturé (non honoré) : il ne peut plus être annulé.",
  annule: "Ce rendez-vous est déjà annulé.",
};

/**
 * Rendez-vous annulé sans jamais avoir été payé : neutralise les
 * paiements encore possibles. On annule côté Stripe les PaymentIntent
 * ouverts et on passe leurs transactions `en_attente` à `echouee`.
 *
 * Non bloquant : une panne Stripe ne doit pas empêcher d'annuler. Le cas
 * résiduel (paiement déjà en cours) est rattrapé par le webhook :
 * finaliserPaiement rembourse (§6) tout paiement arrivé sur un RDV annulé.
 */
async function neutraliserPaiementsEnCours(rdv_id) {
  try {
    const annules = await annulerPaymentIntentsRdv(rdv_id);
    const transactionIds = annules.map((pi) => pi.metadata?.transaction_id).filter(Boolean);
    if (transactionIds.length > 0) {
      await prisma.transactionPaiement.updateMany({
        where: { transaction_id: { in: transactionIds }, statut: "en_attente" },
        data: { statut: "echouee" },
      });
    }
  } catch (err) {
    console.warn(
      `[annulation] Neutralisation des paiements en cours impossible pour le rdv ${rdv_id} : ${err.message}`
    );
  }
}

/**
 * Traite l'annulation d'un rendez-vous (unique chemin qui peut poser
 * « annule » : une annulation déclenche TOUJOURS le traitement financier).
 *
 * @param {object} rdv ligne RendezVous
 * @param {{ motif: string, commentaire?: string|null, initiateur: "patient"|"medecin", maintenant?: Date }} params
 * @returns {Promise<{ erreur: {status:number, message:string} } | {
 *   remboursement: null|object, tardif: boolean|null,
 *   versement_medecin: number, commission_aps: number, amende: boolean }>}
 */
export async function traiterAnnulation(
  rdv,
  { motif, commentaire, initiateur, maintenant = new Date() }
) {
  if (STATUTS_NON_ANNULABLES[rdv.statut]) {
    return { erreur: { status: 409, message: STATUTS_NON_ANNULABLES[rdv.statut] } };
  }

  const enReprogrammation = rdv.statut === "a_reprogrammer";

  // Un patient qui « annule » après l'heure du créneau n'annule plus : il
  // n'est pas venu (absence, traitée par absence.service.js). Sauf pendant la
  // reprogrammation, où le créneau initial est déjà passé par construction.
  if (!enReprogrammation && initiateur === "patient" && new Date(rdv.date_creneau).getTime() <= maintenant.getTime()) {
    return {
      erreur: {
        status: 409,
        message: "Le créneau de ce rendez-vous est déjà passé : il ne peut plus être annulé par le patient.",
      },
    };
  }

  const escrow = await prisma.compteEscrow.findUnique({
    where: { rdv_id: rdv.rdv_id },
    select: { statut: true },
  });
  // Jamais payé : on referme d'abord la porte aux paiements encore ouverts.
  if (!escrow) await neutraliserPaiementsEnCours(rdv.rdv_id);

  const resultat = await appliquerEvenementFonds(rdv, {
    evenement: enReprogrammation
      ? EVENEMENTS.DEUX_ABSENTS_SANS_REPROGRAMMATION
      : initiateur === "patient"
        ? EVENEMENTS.ANNULATION_PATIENT
        : EVENEMENTS.ANNULATION_MEDECIN,
    maintenant,
    statutRdv: "annule",
    // Un même instant qualifie le délai ET date l'annulation. La proposition
    // de nouvelle date en cours devient sans objet.
    donneesRdv: {
      motif_annulation: motif,
      commentaire_annulation: commentaire ?? null,
      date_annulation: maintenant,
      ...(enReprogrammation
        ? { nouvelle_date_proposee: null, proposee_par: null, date_proposition: null }
        : {}),
    },
  });

  if (resultat.deja_traite) {
    return {
      erreur: {
        status: 409,
        message:
          "Les fonds de ce rendez-vous ne sont plus en séquestre, ou il vient d'être traité par une autre requête : " +
          "aucune opération supplémentaire n'a été effectuée.",
      },
    };
  }

  return {
    remboursement: resultat.remboursement,
    tardif: resultat.tardif,
    versement_medecin: resultat.versement_medecin,
    commission_aps: resultat.commission_aps,
    amende: resultat.amende,
  };
}