// src/services/traitementFonds.service.js
// Politique de fonds v2 §2-§5 — EXÉCUTEUR unique des décisions de fonds.
//
// La règle métier vit dans politiqueFonds.service.js (fonction pure
// `decider`) ; ce service ne fait qu'APPLIQUER la décision, une seule
// fois pour tous les événements (annulation patient / médecin, médecin
// absent, patient absent, deux absents, deux absents sans reprogrammation).
// annulation.service.js et absence.service.js ne sont que des
// « traducteurs » événement -> appel ici.
//
// Ordre volontaire : Stripe D'ABORD, base ensuite. Un appel Stripe ne
// s'annule pas par un rollback SQL ; tout ce qui peut faire échouer la
// transaction SQL (ligne de frais, taux d'amende, données de la
// transaction) est donc vérifié AVANT le remboursement (« contrôles
// amont »). Rejeu : clé d'idempotence Stripe `refund:<rdv_id>`.
//
// Idempotence à trois niveaux :
//   1. clé d'idempotence Stripe ;
//   2. réservation atomique de l'escrow (UPDATE conditionnel
//      `WHERE statut = 'sequestre'`) : un seul appel concurrent écrit ;
//   3. contraintes d'unicité : (transaction_id, motif) sur le
//      remboursement, rdv_id sur l'amende, (rdv_id, origine) sur
//      CommissionApsVersee (écriture par upsert).
//
// Aucune valeur dérivée stockée : on écrit les faits (remboursement
// réellement effectué, commissions conservées, amende due) ; nets et
// estimations se recalculent.
//
// Vocabulaire : H = honoraires ; F = frais de remboursement de l'agrégateur ;
// CM = commission MÉDECIN ; CP = commission PATIENT. CP n'est jamais rendue
// au patient sauf médecin fautif (annulation médecin, médecin absent) ;
// dans tous les autres cas APS la conserve et l'enregistre dans
// CommissionApsVersee (origine « patient »), dès l'événement — libération
// OU remboursement partiel. CM + CP sont conservées pour « deux absents
// sans reprogrammation ».

import prisma from "../lib/prisma.js";
import { creerRemboursement, depuisUniteStripe } from "../lib/stripeService.js";
import { decimalesPourMontant } from "../utils/montants.js";
import { calculerCommissionPatient } from "./tarification.service.js";
import {
  EVENEMENTS,
  STATUTS_RDV_ACTIFS,
  decider,
  decisionSansFonds,
} from "./politiqueFonds.service.js";
import { resoudreFraisRemboursement } from "./fraisAgregateur.service.js";
import { libererFonds } from "./liberationEscrow.service.js";
import { creerAmende, exigerParametreAmende } from "./amende.service.js";
import { enregistrerCommissionsAps } from "./commissionAps.service.js";

/**
 * Applique la décision de fonds d'un événement à un rendez-vous.
 *
 * @param {object} rdv  ligne RendezVous (rdv_id, medecin_id, date_creneau, ...)
 * @param {object} p
 * @param {string} p.evenement   une valeur de EVENEMENTS
 * @param {Date}   [p.maintenant]
 * @param {object} [p.donneesRdv] champs de RendezVous à écrire en plus du
 *        statut, dans la même transaction (ex. données d'annulation)
 * @param {string} [p.statutRdv] surcharge du statut final du RDV (ex. « annule »
 *        pour une annulation pendant la reprogrammation, dont les fonds suivent
 *        la règle « deux absents sans reprogrammation » mais qui n'est pas un « non_honore »)
 * @returns {Promise<{ deja_traite: true } | {
 *   deja_traite: false, evenement: string, statut_rdv: string, tardif: boolean|null,
 *   remboursement: null | { montant:number, montant_estime_net?:number, devise:string, motif:string, statut:string },
 *   versement_medecin: number,            // H − CM libérés au médecin (avant amendes)
 *   commission_medecin: number,           // CM conservée par APS
 *   commission_patient: number,           // CP conservée par APS
 *   commission_patient_rendue: number,    // CP rendue au patient (médecin fautif), sinon 0
 *   commission_aps: number,               // ALIAS DÉPRÉCIÉ de commission_medecin
 *   amende: boolean }>}
 */
export async function appliquerEvenementFonds(rdv, { evenement, maintenant = new Date(), donneesRdv = {}, statutRdv }) {
  const escrow = await prisma.compteEscrow.findUnique({
    where: { rdv_id: rdv.rdv_id },
    include: {
      transaction: {
        include: { ligne_commission: true, ligne_commission_patient: true, frais_remboursement: true },
      },
    },
  });

  if (!escrow) return appliquerSansEscrow(rdv, { evenement, maintenant, donneesRdv });

  // Déjà libérés, remboursés, ou déjà traités par un autre appel/passage
  // de cron : on ne touche à rien (jamais d'exception, l'appelant décide).
  if (escrow.statut !== "sequestre") return { deja_traite: true };

  const t = escrow.transaction;
  const estCampay = t.fournisseur === "campay";
  if (t.montant_honoraires == null || !t.ligne_commission || (!estCampay && !t.stripe_payment_intent_id)) {
    throw new Error(
      `Transaction ${t.transaction_id} incomplète (honoraires, ligne de commission ou payment_intent manquants) : ` +
      `traitement de fonds du rdv ${rdv.rdv_id} impossible.`
    );
  }

  const decimales = decimalesPourMontant({ fournisseur: t.fournisseur, devise: t.devise });

  // ── Contrôles amont (rien d'irréversible n'a encore eu lieu) ──
  // Ligne de frais de remboursement : figée à la capture, sinon active.
  // Inutile pour « deux absents » (aucun calcul de frais, fonds gardés).
  const fraisRemboursement =
    evenement === EVENEMENTS.DEUX_ABSENTS ? undefined : await resoudreFraisRemboursement(t);

  const decision = decider({
    evenement,
    honoraires: t.montant_honoraires,
    commission: t.ligne_commission,
    commissionPatient: t.ligne_commission_patient,
    fraisRemboursement,
    dateCreneau: rdv.date_creneau,
    maintenant,
    decimales,
  });

  if (decision.amende) await exigerParametreAmende(rdv.medecin_id);

  const rem = decision.remboursement;
  const versementRemboursement = Boolean(rem?.creerLigne);

  // CP rendue au patient : uniquement quand un remboursement est dû ET que
  // APS ne conserve pas CP (= médecin fautif). Fait recalculé, jamais stocké ;
  // exposé pour que les contrôleurs filtrent la réponse par rôle (D7).
  const commissionPatientRendue =
    versementRemboursement && decision.commissionPatient === 0
      ? calculerCommissionPatient(t.montant_honoraires, t.ligne_commission_patient, decimales)
      : 0;

  // ── 1. Stripe d'abord (CamPay : aucun appel, ligne « a_traiter » plus bas) ──
  let refund = null;
  if (versementRemboursement && !estCampay) {
    refund = await creerRemboursement({
      payment_intent_id: t.stripe_payment_intent_id,
      montant: rem.net,
      devise: t.devise,
      idempotency_key: `refund:${rdv.rdv_id}`,
      metadata: { rdv_id: rdv.rdv_id, transaction_id: t.transaction_id, evenement },
    });
    if (refund.status === "failed" || refund.status === "canceled") {
      throw new Error(
        `Remboursement Stripe ${refund.id} en échec (statut ${refund.status}) pour le rdv ${rdv.rdv_id} : ` +
        `traitement (${evenement}) non finalisé.`
      );
    }
  }

  // ── 2. Base de données : tout ou rien ──
  return prisma.$transaction(async (tx) => {
    // Fonds qui SORTENT vers le médecin (patient fautif) : libererFonds
    // réserve l'escrow, crédite le net, enregistre CommissionApsVersee et
    // impute les amendes en attente — une seule implémentation (étape 4).
    if (decision.sortEscrow === "libere") {
      const lib = await libererFonds(rdv.rdv_id, { statutRdv: decision.statutRdv }, tx);
      if (lib.deja_traite) return { deja_traite: true };
      if (Object.keys(donneesRdv).length > 0) {
        await tx.rendezVous.update({ where: { rdv_id: rdv.rdv_id }, data: donneesRdv });
      }
      return {
        deja_traite: false,
        evenement,
        statut_rdv: decision.statutRdv,
        tardif: decision.tardif,
        remboursement: null,
        versement_medecin: lib.net_medecin,
        commission_medecin: lib.commission_medecin,
        commission_patient: lib.commission_patient,
        commission_patient_rendue: 0,
        commission_aps: lib.commission_medecin, // alias déprécié de commission_medecin
        amende: false,
        amendes_imputees: lib.amendes_imputees,
      };
    }

    // Deux absents : les fonds restent en séquestre, le RDV passe à
    // « a_reprogrammer » (point de départ des 48h). UPDATE conditionnel :
    // idempotent face à deux passages de cron qui se chevauchent.
    if (decision.sortEscrow === "sequestre") {
      const { count } = await tx.rendezVous.updateMany({
        where: { rdv_id: rdv.rdv_id, statut: { in: ["confirme", "en_attente_presence"] } },
        data: {
          statut: decision.statutRdv,
          a_reprogrammer_le: maintenant,
          nouvelle_date_proposee: null,
          proposee_par: null,
          date_proposition: null,
        },
      });
      if (count === 0) return { deja_traite: true };
      return {
        deja_traite: false,
        evenement,
        statut_rdv: decision.statutRdv,
        tardif: null,
        remboursement: null,
        versement_medecin: 0,
        commission_medecin: 0,
        commission_patient: 0,
        commission_patient_rendue: 0,
        commission_aps: 0,
        amende: false,
      };
    }

    // Fonds qui RETOURNENT au patient (sortEscrow « rembourse »).
    const { count } = await tx.compteEscrow.updateMany({
      where: { escrow_id: escrow.escrow_id, statut: "sequestre" },
      data: { statut: "rembourse" },
    });
    if (count === 0) return { deja_traite: true };

    let remboursement = null;
    if (refund) {
      // Montant RÉELLEMENT remboursé par Stripe (un fait), pas celui demandé.
      const montantReel = depuisUniteStripe(refund.amount, t.devise);
      await tx.remboursementPaiement.create({
        data: {
          transaction_id: t.transaction_id,
          montant: montantReel,
          motif: rem.motif,
          stripe_refund_id: refund.id,
        },
      });
      remboursement = { montant: montantReel, devise: t.devise, motif: rem.motif, statut: "effectue" };
    } else if (versementRemboursement && estCampay) {
      // Pas de remboursement natif chez CamPay : la ligne porte le BRUT ;
      // le net définitif = brut − frais réels du retrait Mobile Money,
      // connu seulement à la clôture par un admin (remboursementCampay.service.js).
      await tx.remboursementPaiement.create({
        data: {
          transaction_id: t.transaction_id,
          montant: rem.brut,
          motif: rem.motif,
          statut: "a_traiter",
        },
      });
      remboursement = {
        montant: rem.brut,
        montant_estime_net: rem.net,
        devise: t.devise,
        motif: rem.motif,
        statut: "a_traiter",
      };
    }

    // Commissions conservées par APS, enregistrées dès cet événement (et
    // non plus seulement à la libération) :
    //   - CP (origine « patient ») : annulation patient > 24 h, deux absents
    //     sans reprogrammation ; jamais quand CP est rendue (médecin fautif) ;
    //   - CM (origine « medecin ») : deux absents sans reprogrammation.
    // Upsert sur (rdv_id, origine) : un rejeu n'écrit rien de plus.
    await enregistrerCommissionsAps(tx, {
      rdv_id: rdv.rdv_id,
      transaction: t,
      commissionMedecin: decision.commissionMedecin,
      commissionPatient: decision.commissionPatient,
    });

    // Amende du médecin (§7) : enregistrée « en_attente », imputée à sa
    // prochaine libération (amende.service.js). Idempotente sur rdv_id.
    if (decision.amende) await creerAmende({ rdv_id: rdv.rdv_id, medecin_id: rdv.medecin_id }, tx);

    const statutFinal = statutRdv ?? decision.statutRdv;
    await tx.rendezVous.update({
      where: { rdv_id: rdv.rdv_id },
      data: { statut: statutFinal, ...donneesRdv },
    });

    return {
      deja_traite: false,
      evenement,
      statut_rdv: statutFinal,
      tardif: decision.tardif,
      remboursement,
      versement_medecin: 0,
      commission_medecin: decision.commissionMedecin,
      commission_patient: decision.commissionPatient,
      commission_patient_rendue: commissionPatientRendue,
      commission_aps: decision.commissionMedecin, // alias déprécié de commission_medecin
      amende: decision.amende,
    };
  });
}

/**
 * RDV jamais payé : aucun fonds ne bouge. Le statut et l'amende
 * (point ouvert D : due même sans escrow) sont décidés par la fonction
 * pure `decisionSansFonds`.
 */
async function appliquerSansEscrow(rdv, { evenement, maintenant, donneesRdv }) {
  const d = decisionSansFonds({ evenement, dateCreneau: rdv.date_creneau, maintenant });
  if (d.amende) await exigerParametreAmende(rdv.medecin_id);

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.rendezVous.updateMany({
      where: { rdv_id: rdv.rdv_id, statut: { in: STATUTS_RDV_ACTIFS } },
      data: { statut: d.statutRdv, ...donneesRdv },
    });
    if (count === 0) return { deja_traite: true };
    if (d.amende) await creerAmende({ rdv_id: rdv.rdv_id, medecin_id: rdv.medecin_id }, tx);
    return {
      deja_traite: false,
      evenement,
      statut_rdv: d.statutRdv,
      tardif: d.tardif,
      remboursement: null,
      versement_medecin: 0,
      commission_medecin: 0,
      commission_patient: 0,
      commission_patient_rendue: 0,
      commission_aps: 0,
      amende: d.amende,
    };
  });
}