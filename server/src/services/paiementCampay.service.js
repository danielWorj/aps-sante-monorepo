// src/services/paiementCampay.service.js
import prisma from "../lib/prisma.js";
import { obtenirStatutTransaction, DEVISE_CAMPAY } from "../lib/campayService.js";
import { finaliserPaiement } from "./finalisationPaiement.service.js";

// Anti-martèlement : le client interroge le statut toutes les ~1,5 s.
// On ne rappelle CamPay que toutes les 4 s par transaction.
const derniereVerification = new Map();
const INTERVALLE_MIN_MS = 4000;

/**
 * Interroge CamPay et applique le résultat. Idempotent.
 * @returns {Promise<"SUCCESSFUL"|"FAILED"|"PENDING"|"IGNORE"|"MONTANT_INCOHERENT">}
 */
export async function verifierEtFinaliserTransactionCampay(transaction, { force = false } = {}) {
  if (transaction.fournisseur !== "campay" || !transaction.campay_reference) return "IGNORE";
  if (transaction.statut !== "en_attente") return "IGNORE";

  const cle = transaction.transaction_id;
  const maintenant = Date.now();
  if (!force && maintenant - (derniereVerification.get(cle) ?? 0) < INTERVALLE_MIN_MS) return "PENDING";
  derniereVerification.set(cle, maintenant);

  const st = await obtenirStatutTransaction(transaction.campay_reference);

  if (st.status === "SUCCESSFUL") {
    // Garde-fou : le montant et la devise confirmés par CamPay doivent correspondre à ce qu'on a demandé.
    const attendu = Math.round(Number(transaction.montant));
    if (Number(st.amount) !== attendu || (st.currency && st.currency !== DEVISE_CAMPAY)) {
      console.error(
        `[campay] MONTANT INCOHÉRENT transaction=${cle} attendu=${attendu} reçu=${st.amount} ${st.currency} — non finalisé.`
      );
      return "MONTANT_INCOHERENT";
    }
    await finaliserPaiement({
      transaction_id: transaction.transaction_id,
      rdv_id: transaction.rdv_id_cible,
      campay_reference: transaction.campay_reference,
    });
    return "SUCCESSFUL";
  }

  if (st.status === "FAILED") {
    await prisma.transactionPaiement.updateMany({
      where: { transaction_id: cle, statut: "en_attente" },
      data: { statut: "echouee" },
    });
    return "FAILED";
  }

  return "PENDING";
}

/** Auto-guérison : appelée par GET /paiement/rendez-vous/:id/paiement (fonctionne même sans webhook, ex. en local). */
export async function synchroniserCampayPourRdv(rdv_id) {
  const enAttente = await prisma.transactionPaiement.findMany({
    where: { fournisseur: "campay", rdv_id_cible: rdv_id, statut: "en_attente", campay_reference: { not: null } },
  });
  for (const t of enAttente) await verifierEtFinaliserTransactionCampay(t);
}

/** Dernière tentative CamPay d'un RDV : permet au client d'afficher « refusé / expiré ». */
export async function derniereTentativeCampay(rdv_id) {
  const t = await prisma.transactionPaiement.findFirst({
    where: { fournisseur: "campay", rdv_id_cible: rdv_id },
    orderBy: { date_creation: "desc" },
    select: { statut: true, campay_operator: true },
  });
  return t ? { fournisseur: "campay", statut: t.statut, operateur: t.campay_operator } : null;
}

/** Filet de sécurité (cron) : callbacks perdus, serveur redémarré, etc. */
export async function reconcilierCampayEnAttente() {
  const depuis = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const avant = new Date(Date.now() - 20 * 1000); // laisse d'abord sa chance au webhook
  const transactions = await prisma.transactionPaiement.findMany({
    where: {
      fournisseur: "campay", statut: "en_attente", campay_reference: { not: null },
      date_creation: { gte: depuis, lte: avant },
    },
    take: 100,
  });
  let traitees = 0;
  for (const t of transactions) {
    try {
      await verifierEtFinaliserTransactionCampay(t, { force: true });
      traitees += 1;
    } catch (err) {
      console.error(`[campay] Réconciliation ${t.transaction_id} en échec :`, err.message);
    }
  }
  return { traitees, total: transactions.length };
}
