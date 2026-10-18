// src/services/finalisationPublicite.service.js
// Finalisation d'un paiement de publicité, indépendante du fournisseur :
// webhook Stripe (objet « publicite »), callback CamPay et cron de
// rapprochement. Mêmes garanties que finalisationAbonnementPresence :
//   - source de vérité : la transaction EN BASE (publicite_id_cible) ;
//   - idempotence et sérialisation (verrou de l'emplacement : la place est
//     re-contrôlée au moment du paiement) ;
//   - paiement tardif (publicité expirée dont la place a été reprise,
//     annulée, rejetée, déjà payée) : encaissé, rien n'est activé,
//     remboursement MANUEL ouvert (« a_traiter »), jamais automatique.

import prisma from "../lib/prisma.js";
import { journaliserAudit } from "../lib/audit.js";
import { jourUtc, notifierPublicite, trouverConflit, verrouillerEmplacement } from "./publicite.service.js";
import { emettreFacturePublicite } from "./facturePublicite.service.js";

export const MOTIF_PAIEMENT_TARDIF_PUBLICITE = "paiement_tardif_publicite";

const AUCUN_EFFET = Object.freeze({ effet: false });

/**
 * Une publicité expirée peut encore être payée si sa place est restée libre
 * et que sa période n'est pas terminée (les jours déjà écoulés sont perdus).
 */
async function expireeEncorePayable(tx, pub, maintenant) {
  if (jourUtc(pub.date_fin) <= jourUtc(maintenant)) return false;
  const conflit = await trouverConflit(tx, {
    emplacement_publicitaire_id: pub.emplacement_publicitaire_id, pays_id: pub.pays_id, rang: pub.rang,
    debut: pub.date_debut, fin: pub.date_fin, exclure_id: pub.publicite_id, maintenant,
  });
  return !conflit;
}

export async function finaliserPaiementPublicite({ transaction_id, payment_intent_id, campay_reference }) {
  const reference = campay_reference ? { campay_reference } : { stripe_payment_intent_id: payment_intent_id ?? undefined };
  const maintenant = new Date();

  const resultat = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transactionPaiement.findUnique({ where: { transaction_id } });
    const publicite_id = transaction?.publicite_id_cible;
    if (!transaction || !publicite_id) {
      console.warn(`[publicite] transaction ${transaction_id} sans publicité cible — ignorée.`);
      return AUCUN_EFFET;
    }
    if (transaction.statut === "remboursee") return AUCUN_EFFET;

    const cible = await tx.publicite.findUnique({ where: { publicite_id } });
    if (!cible) return AUCUN_EFFET;
    await verrouillerEmplacement(tx, cible.emplacement_publicitaire_id);
    const pub = await tx.publicite.findUnique({ where: { publicite_id } });

    // Rejeu d'un paiement déjà finalisé.
    if (pub.statut === "payee" && pub.transaction_id === transaction_id) return AUCUN_EFFET;

    await tx.transactionPaiement.updateMany({
      where: { transaction_id, statut: { not: "remboursee" } },
      data: { statut: "reussie", ...reference },
    });
    const transactionAJour = await tx.transactionPaiement.findUnique({ where: { transaction_id } });

    const payable =
      pub.statut === "en_attente_paiement" ||
      (pub.statut === "expiree" && (await expireeEncorePayable(tx, pub, maintenant)));

    if (!payable) {
      const deja = await tx.remboursementPaiement.findFirst({ where: { transaction_id, motif: MOTIF_PAIEMENT_TARDIF_PUBLICITE } });
      if (!deja) {
        await tx.remboursementPaiement.create({
          data: { transaction_id, montant: transaction.montant, motif: MOTIF_PAIEMENT_TARDIF_PUBLICITE, statut: "a_traiter" },
        });
        await journaliserAudit(tx, {
          type: "PUBLICITE_PAIEMENT_TARDIF",
          objet_type: "publicite",
          objet_id: publicite_id,
          details: { transaction_id, statut_publicite: pub.statut, fournisseur: transaction.fournisseur },
        });
      }
      return { effet: false, paiementTardif: true };
    }

    await tx.publicite.update({
      where: { publicite_id },
      data: { statut: "payee", statut_moderation: "validee", date_paiement: maintenant, transaction_id, date_limite_paiement: null },
    });
    await emettreFacturePublicite(tx, publicite_id, transactionAJour);
    await journaliserAudit(tx, {
      type: "PUBLICITE_PAYEE",
      objet_type: "publicite",
      objet_id: publicite_id,
      details: { transaction_id, fournisseur: transaction.fournisseur, montant: Number(transaction.montant) },
    });
    return { effet: true, publicite_id };
  });

  // Hors transaction SQL : un échec de notification ne défait jamais un paiement.
  if (resultat.effet) await notifierPublicite("publicite_payee", resultat.publicite_id);
  if (resultat.paiementTardif) {
    console.warn(`[publicite] PAIEMENT TARDIF transaction=${transaction_id} : remboursement manuel à traiter.`);
  }
  return resultat;
}
