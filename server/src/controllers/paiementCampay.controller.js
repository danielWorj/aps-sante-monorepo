// src/controllers/paiementCampay.controller.js
import prisma from "../lib/prisma.js";
import { verifierRdvPayable, creerTransactionEnAttente, repondreSiPaiementExistant, repondreSiBaremeAbsent, descriptionCampay } from "./paiement.controller.js";
import {
  CampayError, DEVISE_CAMPAY, initierCollecte, normaliserNumeroCM, signatureCallbackValide,
} from "../lib/campayService.js";
import {
  verifierEtFinaliserTransactionCampay, rattacherReferenceCallback,
} from "../services/paiementCampay.service.js";
import { rattacherReferenceRetrait, verifierEtFinaliserRetrait } from "../services/retrait.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/paiement/rendez-vous/:id/paiement-campay   body: { numero }
export async function creerPaiementCampayRdv(req, res, next) {
  try {
    const ctx = await verifierRdvPayable(req, res, "campay"); // 404/403/409/400 déjà gérés
    if (!ctx) return;
    const { rdv, patient, montant } = ctx;

    const numero = normaliserNumeroCM(req.body?.numero ?? patient.utilisateur.telephone);
    const montantXaf = Math.round(Number(montant)); // CamPay refuse les décimales (ER201)

    // Anti double demande : même RDV, même numéro, moins de 2 min -> on renvoie la tentative en cours.
    // Inclut les tentatives à issue incertaine (sans campay_reference) : les rejouer risquerait
    // de débiter deux fois le patient.
    const enCours = await prisma.transactionPaiement.findFirst({
      where: {
        fournisseur: "campay", rdv_id_cible: rdv.rdv_id, statut: "en_attente",
        numero_payeur: numero,
        date_creation: { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
      orderBy: { date_creation: "desc" },
    });
    if (enCours) {
      return res.status(200).json({
        reference: enCours.campay_reference ?? null,
        operateur: enCours.campay_operator ?? null,
        incertain: !enCours.campay_reference,
        deja_initie: true,
      });
    }

    // §6 : contrôle anti double paiement + création sous verrou de créneau
    // (409 si un paiement existe déjà). Total = H + frais d'envoi CamPay + CP,
    // déjà arrondi à l'unité (XAF) par verifierRdvPayable ; la ligne CP est
    // figée sur la transaction par creerTransactionEnAttente.
    const transaction = await creerTransactionEnAttente(ctx, {
      montant: montantXaf, // le montant arrondi EST le montant réellement débité
      devise: DEVISE_CAMPAY.toLowerCase(),
      fournisseur: "campay",
      numero_payeur: numero,
    });

    let collecte;
    try {
      collecte = await initierCollecte({
        montant: montantXaf,
        numero,
        // Détail des composantes (H + frais + commission APS = total), court
        // et sans accents ; retombe sur la description historique si trop long.
        description: descriptionCampay(ctx),
        external_reference: transaction.transaction_id,
      });
    } catch (err) {
      if (err instanceof CampayError && err.issueIncertaine) {
        // Timeout / coupure / 5xx : CamPay a peut-être envoyé la demande au patient. On NE marque
        // PAS la transaction « echouee » (sinon un paiement validé ensuite serait perdu, le RDV ne
        // serait jamais confirmé). Elle reste « en_attente » ; le callback (external_reference =
        // transaction_id) permettra de la rattacher et de la finaliser.
        console.warn(
          `[campay] Collecte à issue incertaine transaction=${transaction.transaction_id} : ${err.message}`
        );
        return res.status(202).json({ reference: null, ussd_code: null, operateur: null, incertain: true });
      }
      await prisma.transactionPaiement.update({
        where: { transaction_id: transaction.transaction_id },
        data: { statut: "echouee" },
      });
      throw err;
    }

    await prisma.transactionPaiement.update({
      where: { transaction_id: transaction.transaction_id },
      data: { campay_reference: collecte.reference, campay_operator: collecte.operator ?? null },
    });

    return res.status(201).json({
      reference: collecte.reference,
      ussd_code: collecte.ussd_code ?? null,
      operateur: collecte.operator ?? null,
    });
  } catch (err) {
    if (repondreSiPaiementExistant(err, res)) return;
    if (repondreSiBaremeAbsent(err, res)) return;
    if (err instanceof CampayError) {
      console.error("[campay] collecte refusée :", err.code, err.payload);
      return res.status(err.status >= 500 ? 502 : 400).json({ message: err.message, code: err.code });
    }
    next(err);
  }
}

// Callback d'un retrait médecin : retrouve la demande (par référence, sinon par external_reference),
// la rattache si besoin (issue incertaine) puis re-interroge CamPay. `status` du callback est ignoré.
// @returns {Promise<boolean>} true si le callback concernait un retrait connu
async function traiterCallbackRetrait({ reference, external_reference }) {
  let demande = null;
  if (typeof reference === "string" && reference) {
    demande = await prisma.demandeRetrait.findUnique({ where: { campay_reference: reference } });
  }
  if (!demande && typeof external_reference === "string" && UUID.test(external_reference)) {
    demande = await prisma.demandeRetrait.findUnique({ where: { demande_retrait_id: external_reference } });
  }
  if (!demande) return false;

  if (!demande.campay_reference) {
    demande = await rattacherReferenceRetrait(demande, reference);
    if (!demande) return true; // retrait connu mais référence non confirmée : acquitté, journalisé
  }
  await verifierEtFinaliserRetrait(demande, { force: true });
  return true;
}

// GET /api/paiement/campay/webhook — appelé par CamPay (aucune authentification utilisateur)
export async function traiterWebhookCampay(req, res) {
  const { reference, external_reference, signature } = req.query;

  if (!signatureCallbackValide(signature)) {
    console.warn(`[campay] Signature de callback non validée (reference=${reference}).`);
    if (process.env.CAMPAY_VERIFIER_SIGNATURE === "true") {
      return res.status(400).json({ message: "Signature invalide." });
    }
    // Mode observation : la vraie protection est la re-vérification via l'API ci-dessous.
  }

  try {
    let transaction = null;
    if (typeof reference === "string" && reference) {
      transaction = await prisma.transactionPaiement.findUnique({ where: { campay_reference: reference } });
    }
    if (!transaction && typeof external_reference === "string" && UUID.test(external_reference)) {
      transaction = await prisma.transactionPaiement.findUnique({ where: { transaction_id: external_reference } });
    }
    // Pas une collecte : peut-être un RETRAIT MÉDECIN (withdraw, external_reference = demande_retrait_id).
    if (!transaction) {
      const traite = await traiterCallbackRetrait({ reference, external_reference });
      if (traite) return res.status(200).json({ received: true });
      // Inconnue (ligne de mass_payout — CamPay envoie un callback par ligne —, test…) :
      // on acquitte pour éviter des relances inutiles.
      return res.status(200).json({ received: true, ignore: true });
    }

    // Collecte à issue incertaine (pas encore de référence) : on la rattache après contrôle
    // de l'external_reference auprès de CamPay (voir rattacherReferenceCallback).
    if (!transaction.campay_reference) {
      transaction = await rattacherReferenceCallback(transaction, reference);
      if (!transaction) return res.status(200).json({ received: true, ignore: true });
    }

    // On ignore `status` du callback : on interroge CamPay.
    await verifierEtFinaliserTransactionCampay(transaction, { force: true });
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[campay] Erreur traitement webhook :", err);
    return res.status(500).json({ message: "Erreur de traitement du webhook." }); // + cron de secours
  }
}