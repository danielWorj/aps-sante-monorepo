// src/services/annulation.service.js
// Phase 3 — Annulations et remboursements différenciés (voir politique
// de gestion des fonds §3, §4 et §5).
//
// Principe directeur (voir schema.prisma) : aucune valeur dérivée n'est
// stockée. Le fait que l'annulation soit "tardive" (moins de 24h avant
// le créneau) et le montant des frais retenus se recalculent ICI, à
// chaque annulation, depuis des faits (date_creneau, date de
// l'annulation, montant_honoraires figé à la réservation) et un
// paramétrage saisi par le médecin (taux_frais_annulation_tardive) —
// jamais depuis une valeur mise en cache. Seuls sont écrits en base des
// faits : le remboursement réellement effectué par Stripe, le motif et
// la date d'annulation, et les mouvements du grand-livre.

import prisma from "../lib/prisma.js";
import { creerRemboursement, depuisUniteStripe } from "../lib/stripeService.js";
import { creerMouvement } from "./portefeuille.service.js";

// Politique §3 : au-delà de 24h avant le rendez-vous, l'annulation est
// gratuite ; en deçà, les frais paramétrés par le médecin s'appliquent.
const DELAI_ANNULATION_SANS_FRAIS_MS = 24 * 60 * 60 * 1000;

// Arrondi à 2 décimales (unité monétaire courante des montants en base,
// voir @db.Decimal(12, 2)) — évite les écarts de type 14.999999999999998
// issus de l'arithmétique flottante. Même motif que tarification.service.js.
function arrondir(valeur) {
  return Math.round(valeur * 100) / 100;
}

/**
 * Fonction pure : vrai si l'annulation intervient à MOINS de 24h du
 * créneau. Pile 24h reste gratuit (la politique parle de "plus de 24h"
 * pour le remboursement intégral, mais une égalité exacte à la
 * milliseconde est un cas d'école : on tranche en faveur du patient).
 * @param {Date|string} date_creneau
 * @param {Date} maintenant
 * @returns {boolean}
 */
export function estAnnulationTardive(date_creneau, maintenant) {
  return new Date(date_creneau).getTime() - maintenant.getTime() < DELAI_ANNULATION_SANS_FRAIS_MS;
}

/**
 * Traite l'annulation d'un rendez-vous : remboursement Stripe selon
 * l'auteur et le délai, écritures du grand-livre, puis passage du
 * rendez-vous à "annule". C'est l'unique chemin qui peut poser
 * "annule" (voir rendezVous.controller.js) : ainsi une annulation
 * déclenche TOUJOURS le traitement financier correspondant.
 *
 * Règles (politique §3-5, avec les choix validés pour la Phase 3) :
 *   - initiateur "patient", plus de 24h avant : remboursement intégral
 *     du montant capturé (honoraires + commission + taxes + frais
 *     d'agrégateur), aucune retenue.
 *   - initiateur "patient", moins de 24h avant : retenue = honoraires ×
 *     taux_frais_annulation_tardive du médecin (0 si non paramétré) ;
 *     remboursement = montant capturé − retenue. La retenue est créditée
 *     au médecin (credit_frais_annulation), sans commission.
 *   - initiateur "medecin" : c'est une défaillance du professionnel
 *     (§3) : remboursement intégral, motif "defaillance_pro". Si
 *     l'annulation est tardive, retenue sur son portefeuille
 *     (debit_retenue_annulation_tardive, §5) égale à honoraires × son
 *     propre taux — valeur PROVISOIRE : le paramétrage détaillé figure
 *     en Annexe A du cahier des charges, non encore fournie. Le coût de
 *     transaction PSP imputé au médecin (debit_frais_no_show) relève de
 *     la Phase 4 (traiterDefaillancePro).
 *   - Dans tous les cas, les frais d'agrégateur sont inclus dans le
 *     remboursement, jamais amputés (§4) : la retenue ne porte que sur
 *     les honoraires.
 *
 * Idempotent (§6) à trois niveaux, pour qu'un rejeu ou deux appels
 * concurrents ne remboursent jamais deux fois :
 *   1. Clé d'idempotence Stripe `refund:${rdv_id}` : un second appel
 *      renvoie le remboursement déjà créé au lieu d'en créer un autre.
 *   2. Prise en charge atomique de l'escrow ("sequestre" -> "rembourse"
 *      via updateMany conditionnel) : un seul des appels concurrents
 *      écrit remboursement et mouvements.
 *   3. reference_idempotence déterministe sur chaque mouvement.
 *
 * Ordre volontaire : Stripe D'ABORD, base ensuite. Un appel Stripe ne
 * peut pas être annulé par un rollback SQL ; en cas d'échec de la base
 * après un remboursement réussi, le rejeu (même clé d'idempotence)
 * retrouve le même remboursement et complète l'écriture — alors qu'écrire
 * en base d'abord laisserait un escrow "rembourse" sans argent rendu.
 *
 * Retourne `{ erreur: { status, message } }` pour un refus métier
 * attendu (même convention que verifierTransitionAutorisee dans
 * rendezVous.controller.js) ; lève une exception pour tout le reste.
 *
 * @param {object} rdv ligne RendezVous (rdv_id, medecin_id, date_creneau, ...)
 * @param {{ motif: string, commentaire?: string|null, initiateur: "patient"|"medecin", maintenant?: Date }} params
 * @returns {Promise<{ erreur: {status:number, message:string} } | { remboursement: null|{ montant:number, devise:string, motif:string }, frais_annulation: number }>}
 */
export async function traiterAnnulation(
  rdv,
  { motif, commentaire, initiateur, maintenant = new Date() }
) {
  // Un même instant sert à qualifier le délai ET à dater l'annulation,
  // pour que date_annulation reste cohérente avec le calcul effectué.
  const donneesAnnulation = {
    statut: "annule",
    motif_annulation: motif,
    commentaire_annulation: commentaire ?? null,
    date_annulation: maintenant,
  };

  // Un patient qui annule après l'heure du créneau n'annule plus : il
  // n'est pas venu. Ce cas n'est pas couvert par la politique (patient
  // absent) ; on le refuse plutôt que de le traiter comme une annulation
  // "tardive" qui rembourserait un service dont le créneau est passé.
  if (initiateur === "patient" && new Date(rdv.date_creneau).getTime() <= maintenant.getTime()) {
    return {
      erreur: {
        status: 409,
        message: "Le créneau de ce rendez-vous est déjà passé : il ne peut plus être annulé par le patient.",
      },
    };
  }

  const escrow = await prisma.compteEscrow.findUnique({
    where: { rdv_id: rdv.rdv_id },
    include: { transaction: true },
  });

  // Rendez-vous jamais payé (pas de séquestre) : rien à rembourser,
  // on enregistre seulement l'annulation motivée.
  if (!escrow) {
    await prisma.rendezVous.update({ where: { rdv_id: rdv.rdv_id }, data: donneesAnnulation });
    return { remboursement: null, frais_annulation: 0 };
  }

  // Fonds déjà libérés, déjà remboursés ou gelés par un litige : on ne
  // touche à rien. Renvoyer un succès ici laisserait croire à un
  // remboursement qui n'a pas eu lieu.
  if (escrow.statut !== "sequestre") {
    return {
      erreur: {
        status: 409,
        message: `Les fonds de ce rendez-vous ne sont plus en séquestre (statut : "${escrow.statut}") : l'annulation avec remboursement est impossible.`,
      },
    };
  }

  const t = escrow.transaction;
  if (t.montant_honoraires == null || !t.stripe_payment_intent_id) {
    // Une transaction liée à un rendez-vous porte toujours ces deux
    // faits (posés à la capture, voir paiement.controller.js) — mieux
    // vaut un 500 clair qu'un remboursement calculé sur du vide.
    throw new Error(
      `Transaction ${t.transaction_id} incomplète (honoraires ou payment_intent manquants) : annulation du rdv ${rdv.rdv_id} impossible.`
    );
  }

  const montantCapture = Number(t.montant);
  const honoraires = Number(t.montant_honoraires);

  const medecin = await prisma.medecin.findUnique({
    where: { medecin_id: rdv.medecin_id },
    select: { taux_frais_annulation_tardive: true },
  });
  const taux = Number(medecin?.taux_frais_annulation_tardive ?? 0);

  const tardive = estAnnulationTardive(rdv.date_creneau, maintenant);
  // Frais recalculés à chaque fois (jamais stockés). Ils ne portent
  // que sur les honoraires : commission, taxes et frais d'agrégateur ne
  // sont jamais retenus (§4).
  const fraisTardifs = tardive ? arrondir(honoraires * taux) : 0;

  let montantARembourser;
  let motifRemboursement;
  if (initiateur === "patient") {
    montantARembourser = arrondir(montantCapture - fraisTardifs);
    motifRemboursement = tardive ? "annulation_tardive" : "annulation_precoce";
  } else {
    // Défaillance du professionnel (§3) : remboursement intégral sans
    // aucune retenue côté patient.
    montantARembourser = montantCapture;
    motifRemboursement = "defaillance_pro";
  }

  // 1. Stripe d'abord (voir l'en-tête pour l'ordre). Cas limite : si la
  // retenue absorbait tout le montant (taux = 1 et aucun frais/taxe),
  // il n'y a rien à rembourser et Stripe refuserait un montant nul.
  let refund = null;
  if (montantARembourser > 0) {
    refund = await creerRemboursement({
      payment_intent_id: t.stripe_payment_intent_id,
      montant: montantARembourser,
      devise: t.devise,
      idempotency_key: `refund:${rdv.rdv_id}`,
      metadata: { rdv_id: rdv.rdv_id, transaction_id: t.transaction_id },
    });
    if (refund.status === "failed" || refund.status === "canceled") {
      throw new Error(
        `Remboursement Stripe ${refund.id} en échec (statut ${refund.status}) pour le rdv ${rdv.rdv_id} : annulation non finalisée.`
      );
    }
  }

  // 2. Base de données : tout ou rien.
  return prisma.$transaction(async (tx) => {
    // Prise en charge atomique : si un autre appel a déjà basculé
    // l'escrow (count = 0), c'est lui qui écrit — on n'écrit rien en
    // double. Le remboursement Stripe, lui, est déjà couvert par la
    // clé d'idempotence.
    const { count } = await tx.compteEscrow.updateMany({
      where: { escrow_id: escrow.escrow_id, statut: "sequestre" },
      data: { statut: "rembourse" },
    });
    if (count === 0) {
      return {
        erreur: {
          status: 409,
          message: "Ce rendez-vous vient d'être traité par une autre requête : aucune opération supplémentaire n'a été effectuée.",
        },
      };
    }

    let remboursement = null;
    if (refund) {
      // Le montant enregistré est celui que Stripe a RÉELLEMENT
      // remboursé (un fait), pas celui qu'on avait demandé.
      const montantReel = depuisUniteStripe(refund.amount, t.devise);
      await tx.remboursementPaiement.create({
        data: {
          transaction_id: t.transaction_id,
          montant: montantReel,
          motif: motifRemboursement,
          stripe_refund_id: refund.id,
        },
      });
      remboursement = { montant: montantReel, devise: t.devise, motif: motifRemboursement };
    }

    if (fraisTardifs > 0) {
      await creerMouvement(
        initiateur === "patient"
          ? {
              medecin_id: rdv.medecin_id,
              type: "credit_frais_annulation",
              montant: fraisTardifs,
              rdv_id: rdv.rdv_id,
              reference_idempotence: `credit_frais_annulation:${rdv.rdv_id}`,
            }
          : {
              medecin_id: rdv.medecin_id,
              type: "debit_retenue_annulation_tardive",
              montant: fraisTardifs,
              rdv_id: rdv.rdv_id,
              reference_idempotence: `debit_retenue_annulation_tardive:${rdv.rdv_id}`,
            },
        tx
      );
    }

    await tx.rendezVous.update({ where: { rdv_id: rdv.rdv_id }, data: donneesAnnulation });

    return { remboursement, frais_annulation: fraisTardifs };
  });
}