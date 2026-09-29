// src/services/paiementCampay.service.js
import prisma from "../lib/prisma.js";
import { obtenirStatutTransaction, DEVISE_CAMPAY, CampayError } from "../lib/campayService.js";
import { finaliserPaiement } from "./finalisationPaiement.service.js";

// Anti-martèlement : le client interroge le statut toutes les ~1,5 s.
// On ne rappelle CamPay que toutes les 4 s par transaction.
const derniereVerification = new Map();
const INTERVALLE_MIN_MS = 4000;

const REFERENCE_CAMPAY_MAX = 100; // VarChar(100) en base

/**
 * Le statut renvoyé par CamPay correspond-il à ce qu'on a demandé ? Montant (arrondi, en XAF)
 * ET devise. Une valeur absente ou illisible est traitée comme une incohérence : on ne
 * finalise et on ne rattache jamais sur la foi d'une réponse incomplète.
 */
function montantEtDeviseCoherents(st, transaction) {
  const attendu = Math.round(Number(transaction.montant));
  const recu = Number(st?.amount);
  const deviseOk = !st?.currency || st.currency === DEVISE_CAMPAY;
  return { ok: Number.isFinite(recu) && recu === attendu && deviseOk, attendu, recu };
}

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
    const controle = montantEtDeviseCoherents(st, transaction);
    if (!controle.ok) {
      console.error(
        `[campay] MONTANT INCOHÉRENT transaction=${cle} attendu=${controle.attendu} reçu=${st.amount} ${st.currency} — non finalisé.`
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

/**
 * Transaction dont la collecte a eu une issue INCERTAINE (timeout / 5xx / réponse illisible
 * sur POST /collect/) : elle est restée « en_attente » sans campay_reference alors que CamPay
 * a peut-être bien envoyé la demande au patient. Quand le callback arrive avec la `reference`,
 * on la rattache à la transaction (retrouvée par external_reference = transaction_id) pour que
 * la vérification habituelle puisse la finaliser.
 *
 * La `reference` vient d'une URL non authentifiée et la signature n'est pas une garantie
 * (mode observation) : on ne s'y fie pas. On interroge CamPay directement
 * (GET /transaction/{reference}/) et on ne rattache QUE si la réponse confirme à la fois
 *   1. external_reference === transaction_id   (c'est bien NOTRE collecte),
 *   2. montant et devise === ceux qu'on a demandés.
 * Sinon un tiers pourrait rattacher à notre transaction la référence d'un autre paiement réussi.
 * ⚠️ Suppose que GET /transaction/{reference}/ renvoie `external_reference` et `amount`
 * (présents dans les SDK CamPay, à vérifier en démo) ; s'ils sont absents, on ne rattache
 * rien (sans danger : le patient n'est pas confirmé automatiquement et le cas est journalisé).
 *
 * @returns {Promise<object|null>} la transaction à jour, ou null si non rattachée.
 */
export async function rattacherReferenceCallback(transaction, reference) {
  if (transaction.fournisseur !== "campay" || transaction.campay_reference) return null;
  if (transaction.statut !== "en_attente") return null;
  if (typeof reference !== "string" || !reference || reference.length > REFERENCE_CAMPAY_MAX) return null;

  let st;
  try {
    st = await obtenirStatutTransaction(reference);
  } catch (err) {
    // Référence inconnue de CamPay (4xx) : callback forgé ou sans rapport, on l'ignore.
    // Panne CamPay (5xx / réseau) : on relance l'erreur -> le webhook répond 500 et CamPay réessaie.
    if (err instanceof CampayError && !err.issueIncertaine && err.status >= 400 && err.status < 500) {
      console.warn(`[campay] Référence ${reference} inconnue de CamPay (${err.status}) : non rattachée.`);
      return null;
    }
    throw err;
  }

  if (st?.external_reference !== transaction.transaction_id) {
    console.warn(
      `[campay] Référence ${reference} non rattachée à la transaction ${transaction.transaction_id} : ` +
      `external_reference renvoyé par CamPay = ${st?.external_reference ?? "absent"}.`
    );
    return null;
  }
  const controle = montantEtDeviseCoherents(st, transaction);
  if (!controle.ok) {
    console.error(
      `[campay] Référence ${reference} NON rattachée à la transaction ${transaction.transaction_id} : ` +
      `montant attendu=${controle.attendu}, reçu=${st.amount} ${st.currency ?? ""}.`
    );
    return null;
  }

  try {
    const { count } = await prisma.transactionPaiement.updateMany({
      where: { transaction_id: transaction.transaction_id, campay_reference: null, statut: "en_attente" },
      data: { campay_reference: reference, campay_operator: st.operator ?? null },
    });
    if (count === 0) return null; // déjà rattachée (ou clôturée) entre-temps
  } catch (err) {
    if (err.code === "P2002") return null; // référence déjà utilisée par une autre transaction
    throw err;
  }
  console.info(`[campay] Collecte incertaine rattachée : transaction=${transaction.transaction_id} reference=${reference}.`);
  return prisma.transactionPaiement.findUnique({ where: { transaction_id: transaction.transaction_id } });
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

// Collectes à issue incertaine jamais rattachées (callback perdu, CamPay injoignable au
// moment du callback…) : sans référence, le cron ne peut rien interroger. On les signale
// pour un rapprochement manuel dans le tableau de bord CamPay (external_reference = transaction_id).
const SEUIL_A_VERIFIER_MS = 10 * 60 * 1000; // laisse d'abord sa chance au callback + réessais CamPay
const FENETRE_A_VERIFIER_MS = 7 * 24 * 60 * 60 * 1000;
const dejaSignalees = new Set(); // une alerte par transaction et par démarrage, pas une par minute

function masquerNumero(numero) {
  return numero ? `${"*".repeat(Math.max(numero.length - 3, 0))}${numero.slice(-3)}` : "inconnu";
}

/**
 * Journalise en erreur (« A VERIFIER ») chaque transaction CamPay restée `en_attente` sans
 * campay_reference au-delà de 10 min. Ne modifie rien en base.
 * @returns {Promise<{ total: number, nouvelles: number }>}
 */
export async function signalerCollectesIncertainesNonRattachees() {
  const maintenant = Date.now();
  const transactions = await prisma.transactionPaiement.findMany({
    where: {
      fournisseur: "campay", statut: "en_attente", campay_reference: null,
      date_creation: {
        gte: new Date(maintenant - FENETRE_A_VERIFIER_MS),
        lte: new Date(maintenant - SEUIL_A_VERIFIER_MS),
      },
    },
    select: { transaction_id: true, rdv_id_cible: true, numero_payeur: true, montant: true, date_creation: true },
    orderBy: { date_creation: "asc" },
    take: 100,
  });

  let nouvelles = 0;
  for (const t of transactions) {
    if (dejaSignalees.has(t.transaction_id)) continue;
    dejaSignalees.add(t.transaction_id);
    nouvelles += 1;
    console.error(
      `[campay] A VERIFIER : collecte à issue incertaine jamais rattachée depuis ` +
      `${Math.round((maintenant - t.date_creation.getTime()) / 60000)} min — ` +
      `transaction=${t.transaction_id} rdv=${t.rdv_id_cible} montant=${Math.round(Number(t.montant))} XAF ` +
      `numero=${masquerNumero(t.numero_payeur)}. Chercher dans le tableau de bord CamPay la collecte ` +
      `dont external_reference = ${t.transaction_id} : si elle est SUCCESSFUL, le patient a payé ` +
      `(rattacher la référence à la main) ; sinon aucune action.`
    );
  }
  // Purge : on ne garde que les transactions encore concernées (la Set ne grossit pas indéfiniment).
  const encore = new Set(transactions.map((t) => t.transaction_id));
  for (const id of dejaSignalees) if (!encore.has(id)) dejaSignalees.delete(id);

  return { total: transactions.length, nouvelles };
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
  let incertaines = { total: 0, nouvelles: 0 };
  try {
    incertaines = await signalerCollectesIncertainesNonRattachees();
  } catch (err) {
    console.error("[campay] Signalement des collectes incertaines en échec :", err.message);
  }
  return { traitees, total: transactions.length, incertaines };
}