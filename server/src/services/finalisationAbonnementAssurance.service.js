// src/services/finalisationAbonnementAssurance.service.js
// Finalisation d'un paiement d'abonnement assurance (guide v3, §1.5.6.3),
// indépendante du fournisseur : appelée par le webhook Stripe
// (checkout.session.completed), par le callback CamPay et par le cron de
// rapprochement CamPay (verifierEtFinaliserTransactionCampay).
//
// Garanties :
//   - source de vérité : la transaction EN BASE (abonnement_assurance_id_cible),
//     jamais les metadata du fournisseur ;
//   - idempotence : un rejeu (webhook livré deux fois, webhook + cron) n'a
//     aucun effet ;
//   - sérialisation : verrou sur la fiche (webhook, callback et cron
//     simultanés -> un seul effet) + mise à jour conditionnelle dans
//     activerAbonnement ;
//   - paiement tardif ou double paiement (brouillon annulé, abonnement déjà
//     activé par une autre transaction) : l'argent est encaissé, on N'ACTIVE
//     RIEN et on ouvre un remboursement MANUEL (RemboursementPaiement
//     « a_traiter », jamais automatique — politique abonnements).

import prisma from "../lib/prisma.js";
import { journaliserAudit } from "../lib/audit.js";
import { activerAbonnement, notifierAbonnementActive, verrouillerFiche } from "./abonnementAssurance.service.js";

export const MOTIF_PAIEMENT_TARDIF = "paiement_tardif_abonnement";

const AUCUN_EFFET = Object.freeze({ effet: false });

export async function finaliserAbonnementAssurance({ transaction_id, payment_intent_id, campay_reference }) {
  const reference = campay_reference ? { campay_reference } : { stripe_payment_intent_id: payment_intent_id ?? undefined };

  const resultat = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transactionPaiement.findUnique({ where: { transaction_id } });
    const abonnement_id = transaction?.abonnement_assurance_id_cible;
    if (!transaction || !abonnement_id) {
      console.warn(`[abonnement] transaction ${transaction_id} sans abonnement cible — ignorée.`);
      return AUCUN_EFFET;
    }
    if (transaction.statut === "remboursee") return AUCUN_EFFET;

    const cible = await tx.abonnementAssurance.findUnique({
      where: { abonnement_id },
      select: { service_assurance_id: true },
    });
    if (!cible) return AUCUN_EFFET;
    await verrouillerFiche(tx, cible.service_assurance_id);

    const abo = await tx.abonnementAssurance.findUnique({ where: { abonnement_id }, include: { niveau: true } });

    // Rejeu d'un paiement déjà finalisé.
    if (abo.statut === "actif" && abo.transaction_id === transaction_id) return AUCUN_EFFET;

    await tx.transactionPaiement.updateMany({
      where: { transaction_id, statut: { not: "remboursee" } },
      data: { statut: "reussie", ...reference },
    });
    const transactionAJour = await tx.transactionPaiement.findUnique({ where: { transaction_id } });

    if (abo.statut !== "en_attente_paiement") {
      // Une seule ligne par (transaction, motif) : contrôle AVANT création
      // (une violation d'unicité annulerait toute la transaction SQL).
      const deja = await tx.remboursementPaiement.findFirst({
        where: { transaction_id, motif: MOTIF_PAIEMENT_TARDIF },
      });
      if (!deja) {
        await tx.remboursementPaiement.create({
          data: {
            transaction_id,
            montant: transaction.montant,
            motif: MOTIF_PAIEMENT_TARDIF,
            statut: "a_traiter",
          },
        });
        await journaliserAudit(tx, {
          type: "ABONNEMENT_PAIEMENT_TARDIF",
          objet_type: "abonnement_assurance",
          objet_id: abonnement_id,
          details: { transaction_id, statut_abonnement: abo.statut, fournisseur: transaction.fournisseur },
        });
      }
      return { effet: false, paiementTardif: true };
    }

    return activerAbonnement(tx, abo, { transaction: transactionAJour });
  });

  // Hors transaction SQL : un échec de notification ne défait jamais un paiement.
  if (resultat.effet) {
    await notifierAbonnementActive(resultat.abonnement_id).catch((err) =>
      console.error(`[abonnement] Notification d'activation impossible (${resultat.abonnement_id}) :`, err.message)
    );
  }
  if (resultat.paiementTardif) {
    console.warn(`[abonnement] PAIEMENT TARDIF transaction=${transaction_id} : remboursement manuel à traiter.`);
  }
  return resultat;
}
