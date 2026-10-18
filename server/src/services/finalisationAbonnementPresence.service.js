// src/services/finalisationAbonnementPresence.service.js
// Finalisation d'un paiement d'abonnement de présence, indépendante du
// fournisseur : webhook Stripe (checkout.session.completed, objet
// « abonnement_presence »), callback CamPay et cron de rapprochement.
// Mêmes garanties que finalisationAbonnementAssurance.service.js :
//   - source de vérité : la transaction EN BASE (abonnement_presence_id_cible) ;
//   - idempotence (rejeu sans effet) et sérialisation (verrou de la fiche) ;
//   - paiement tardif ou double : encaissé, rien n'est activé, remboursement
//     MANUEL ouvert (« a_traiter »), jamais automatique.

import prisma from "../lib/prisma.js";
import { journaliserAudit } from "../lib/audit.js";
import { acteurIdDe, verrouillerFichePresence } from "../lib/acteursPresence.js";
import { activerAbonnementPresence, notifierAbonnementPresenceActive } from "./abonnementPresence.service.js";

// Distinct du motif assurance : chaque back-office liste ses propres cas.
export const MOTIF_PAIEMENT_TARDIF_PRESENCE = "paiement_tardif_abonnement_presence";

const AUCUN_EFFET = Object.freeze({ effet: false });

export async function finaliserAbonnementPresence({ transaction_id, payment_intent_id, campay_reference }) {
  const reference = campay_reference ? { campay_reference } : { stripe_payment_intent_id: payment_intent_id ?? undefined };

  const resultat = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transactionPaiement.findUnique({ where: { transaction_id } });
    const abonnement_id = transaction?.abonnement_presence_id_cible;
    if (!transaction || !abonnement_id) {
      console.warn(`[abonnement-presence] transaction ${transaction_id} sans abonnement cible — ignorée.`);
      return AUCUN_EFFET;
    }
    if (transaction.statut === "remboursee") return AUCUN_EFFET;

    const cible = await tx.abonnementPresence.findUnique({ where: { abonnement_id } });
    if (!cible) return AUCUN_EFFET;
    await verrouillerFichePresence(tx, cible.type_acteur, acteurIdDe(cible));

    const abo = await tx.abonnementPresence.findUnique({ where: { abonnement_id } });

    // Rejeu d'un paiement déjà finalisé.
    if (abo.statut === "actif" && abo.transaction_id === transaction_id) return AUCUN_EFFET;

    await tx.transactionPaiement.updateMany({
      where: { transaction_id, statut: { not: "remboursee" } },
      data: { statut: "reussie", ...reference },
    });
    const transactionAJour = await tx.transactionPaiement.findUnique({ where: { transaction_id } });

    if (abo.statut !== "en_attente_paiement") {
      // Une seule ligne par (transaction, motif) : contrôle AVANT création.
      const deja = await tx.remboursementPaiement.findFirst({
        where: { transaction_id, motif: MOTIF_PAIEMENT_TARDIF_PRESENCE },
      });
      if (!deja) {
        await tx.remboursementPaiement.create({
          data: {
            transaction_id,
            montant: transaction.montant,
            motif: MOTIF_PAIEMENT_TARDIF_PRESENCE,
            statut: "a_traiter",
          },
        });
        await journaliserAudit(tx, {
          type: "ABONNEMENT_PRESENCE_PAIEMENT_TARDIF",
          objet_type: "abonnement_presence",
          objet_id: abonnement_id,
          details: { transaction_id, statut_abonnement: abo.statut, fournisseur: transaction.fournisseur },
        });
      }
      return { effet: false, paiementTardif: true };
    }

    return activerAbonnementPresence(tx, abo, { transaction: transactionAJour });
  });

  // Hors transaction SQL : un échec de notification ne défait jamais un paiement.
  if (resultat.effet) {
    await notifierAbonnementPresenceActive(resultat.abonnement_id).catch((err) =>
      console.error(`[abonnement-presence] Notification d'activation impossible (${resultat.abonnement_id}) :`, err.message)
    );
  }
  if (resultat.paiementTardif) {
    console.warn(`[abonnement-presence] PAIEMENT TARDIF transaction=${transaction_id} : remboursement manuel à traiter.`);
  }
  return resultat;
}
