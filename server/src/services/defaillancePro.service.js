// src/services/defaillancePro.service.js
// Phase 4 — Défaillance du professionnel (voir politique de gestion des
// fonds §3, §4 et §5) : remboursement intégral au patient — y compris
// frais d'agrégateur, jamais amputés (§4) — et imputation au médecin du
// coût de transaction PSP réellement facturé par Stripe sur la charge
// d'origine (un fait rapporté, jamais recalculé par nous).
//
// Déclenché UNIQUEMENT par detecterCreneauxDepasses.job.js (cron), pour
// les rendez-vous "confirme"/"en_attente_presence" dont le créneau est
// dépassé sans qu'aucune transition (honoré, annulé) n'ait eu lieu —
// personne n'appelle jamais l'API dans ce cas (ni le patient, qui n'a
// rien à faire, ni le médecin, défaillant par définition), d'où le
// scheduler (voir lib/scheduler.js).
//
// Le cas "médecin annule activement" (initiateur "medecin" dans
// annulation.service.js, Phase 3) produit déjà un remboursement intégral
// motif "defaillance_pro" par un autre chemin — mais SANS imputation de
// debit_frais_no_show, explicitement renvoyée à cette phase par un
// commentaire de la Phase 3. Cette fonction ne couvre PAS ce cas : le
// plan ne liste que ce détecteur périodique pour la Phase 4, et
// annulation.service.js n'est pas dans les fichiers de cette phase.
// Point signalé au demandeur (non tranché silencieusement) : l'écart
// entre la politique (§3 traite "absence", "annulation par le pro" et
// "créneau dépassé" comme une seule catégorie avec la même imputation
// de frais) et le plan (qui ne scope la Phase 4 qu'au cas cron) laisse
// le cas "médecin annule activement" sans imputation de frais PSP pour
// l'instant — limitation connue, à traiter dans un correctif séparé si
// validé.

import prisma from "../lib/prisma.js";
import {
  creerRemboursement,
  depuisUniteStripe,
  obtenirFraisTransactionPaymentIntent,
} from "../lib/stripeService.js";
import { creerMouvement } from "./portefeuille.service.js";

/**
 * Traite la défaillance du professionnel pour un rendez-vous détecté
 * par le cron (créneau dépassé sans confirmation) : remboursement
 * intégral du patient, puis imputation au médecin du coût de
 * transaction PSP réel.
 *
 * Idempotent (§6), de la même manière que traiterAnnulation
 * (annulation.service.js, Phase 3) :
 *   1. Clé d'idempotence Stripe `refund:${rdv_id}` — un rejeu retrouve
 *      le remboursement déjà créé plutôt que d'en créer un second.
 *   2. Prise en charge atomique de l'escrow ("sequestre" -> "rembourse"
 *      via updateMany conditionnel) — un seul appel concurrent écrit.
 *   3. `reference_idempotence` déterministe sur le mouvement de
 *      portefeuille (`debit_frais_no_show:${rdv_id}`).
 * Et, en amont, le job appelant (detecterCreneauxDepasses.job.js) ne
 * sélectionne que les rendez-vous encore "confirme"/"en_attente_presence" :
 * un rendez-vous déjà traité (statut "non_honore") ne sera simplement
 * plus jamais resélectionné par la requête du cron.
 *
 * Ordre volontaire, identique à traiterAnnulation : le frais de
 * transaction est un FAIT à lire chez Stripe — on le récupère D'ABORD,
 * avant tout remboursement. S'il n'est pas encore disponible (charge
 * pas totalement réglée côté Stripe, cas limite), on lève une erreur
 * explicite plutôt que d'imputer un montant deviné à 0 : le job
 * réessaiera ce rendez-vous au prochain passage, sans qu'aucun
 * remboursement n'ait encore eu lieu — rien à annuler pour rejouer.
 * Le remboursement Stripe est ensuite fait AVANT l'écriture en base,
 * pour la même raison que Phase 3 : un appel Stripe ne peut pas être
 * annulé par un rollback SQL.
 *
 * @param {object} rdv ligne RendezVous (rdv_id, medecin_id, ...)
 * @returns {Promise<{ deja_traite: boolean, remboursement: null|{montant:number, devise:string}, frais_no_show: number|null }>}
 */
export async function traiterDefaillancePro(rdv) {
  const escrow = await prisma.compteEscrow.findUnique({
    where: { rdv_id: rdv.rdv_id },
    include: { transaction: true },
  });

  // Rendez-vous "confirme"/"en_attente_presence" sans escrow : ne
  // devrait jamais arriver (voir rendezVous.controller.js,
  // verifierTransitionAutorisee — un rdv n'atteint "confirme" que si un
  // CompteEscrow existe déjà). Défensif, comme traiterAnnulation.
  if (!escrow) {
    await prisma.rendezVous.update({ where: { rdv_id: rdv.rdv_id }, data: { statut: "non_honore" } });
    return { deja_traite: true, remboursement: null, frais_no_show: null };
  }

  // Déjà traité (double sélection concurrente du cron), déjà remboursé
  // autrement, ou gelé par un litige (Phase 5) : on ne touche à rien.
  if (escrow.statut !== "sequestre") {
    return { deja_traite: true, remboursement: null, frais_no_show: null };
  }

  const t = escrow.transaction;
  if (t.montant_honoraires == null || !t.stripe_payment_intent_id) {
    throw new Error(
      `Transaction ${t.transaction_id} incomplète (honoraires ou payment_intent manquants) : ` +
      `défaillance pro du rdv ${rdv.rdv_id} impossible à traiter.`
    );
  }

  // 1. Frais de transaction PSP réel — un FAIT à lire chez Stripe,
  // jamais recalculé (voir stripeService.js). Levée d'erreur explicite
  // si indisponible plutôt qu'un montant deviné : rien n'a encore été
  // fait, le job réessaiera ce rendez-vous au prochain passage.
  const fraisTransaction = await obtenirFraisTransactionPaymentIntent(t.stripe_payment_intent_id);
  if (!fraisTransaction) {
    throw new Error(
      `Frais de transaction Stripe indisponible pour le payment_intent ${t.stripe_payment_intent_id} ` +
      `(rdv ${rdv.rdv_id}) : la charge n'est probablement pas encore totalement réglée côté Stripe. ` +
      `Traitement reporté au prochain passage du cron.`
    );
  }
  const montantFraisNoShow = depuisUniteStripe(fraisTransaction.fee, fraisTransaction.devise);

  // 2. Remboursement intégral du montant RÉELLEMENT capturé (fait
  // constaté sur t.montant — honoraires + commission + taxes + frais
  // d'agrégateur déjà inclus dedans, cf. Phase 0), jamais recalculé :
  // même principe que traiterAnnulation (Phase 3), aucune retenue ici
  // contrairement à une annulation tardive du patient (§4).
  const montantARembourser = Number(t.montant);

  const refund = await creerRemboursement({
    payment_intent_id: t.stripe_payment_intent_id,
    montant: montantARembourser,
    devise: t.devise,
    idempotency_key: `refund:${rdv.rdv_id}`,
    metadata: { rdv_id: rdv.rdv_id, transaction_id: t.transaction_id, motif: "defaillance_pro" },
  });
  if (refund.status === "failed" || refund.status === "canceled") {
    throw new Error(
      `Remboursement Stripe ${refund.id} en échec (statut ${refund.status}) pour le rdv ${rdv.rdv_id} : ` +
      `traitement de la défaillance pro non finalisé.`
    );
  }

  // 3. Base de données : tout ou rien.
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.compteEscrow.updateMany({
      where: { escrow_id: escrow.escrow_id, statut: "sequestre" },
      data: { statut: "rembourse" },
    });
    if (count === 0) {
      // Un autre appel concurrent a déjà pris en charge cet escrow
      // (ex. deux passages de cron qui se chevauchent) : le
      // remboursement Stripe ci-dessus est de toute façon protégé par
      // sa clé d'idempotence, on ne réécrit rien en double ici.
      return { deja_traite: true, remboursement: null, frais_no_show: null };
    }

    const montantReel = depuisUniteStripe(refund.amount, t.devise);
    await tx.remboursementPaiement.create({
      data: {
        transaction_id: t.transaction_id,
        montant: montantReel,
        motif: "defaillance_pro",
        stripe_refund_id: refund.id,
      },
    });

    await tx.rendezVous.update({
      where: { rdv_id: rdv.rdv_id },
      data: { statut: "non_honore" },
    });

    await creerMouvement(
      {
        medecin_id: rdv.medecin_id,
        type: "debit_frais_no_show",
        montant: montantFraisNoShow,
        rdv_id: rdv.rdv_id,
        reference_idempotence: `debit_frais_no_show:${rdv.rdv_id}`,
      },
      tx
    );

    return {
      deja_traite: false,
      remboursement: { montant: montantReel, devise: t.devise },
      frais_no_show: montantFraisNoShow,
    };
  });
}