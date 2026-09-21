import prisma from "../lib/prisma.js";
import { creerSessionCheckout, verifierSignatureWebhook } from "../lib/stripeService.js";

const DEVISE_PAR_DEFAUT = process.env.STRIPE_DEVISE_PAR_DEFAUT || "xaf";

async function profilPatientAvecEmail(utilisateurCourant) {
  return prisma.patient.findUnique({
    where: { utilisateur_id: utilisateurCourant.utilisateur_id },
    include: { utilisateur: true },
  });
}

// POST /api/rendez-vous/:id/paiement — le patient propriétaire uniquement
export async function creerPaiementRdv(req, res, next) {
  try {
    const rdv = await prisma.rendezVous.findUnique({
      where: { rdv_id: req.params.id },
      include: { medecin: { include: { utilisateur: true } } },
    });
    if (!rdv) return res.status(404).json({ message: "Rendez-vous introuvable." });

    const patient = await profilPatientAvecEmail(req.utilisateur);
    if (!patient || patient.patient_id !== rdv.patient_id) {
      return res.status(403).json({ message: "Ce rendez-vous ne vous appartient pas." });
    }
    if (rdv.statut !== "cree") {
      return res.status(409).json({ message: `Ce rendez-vous ne peut plus être payé (statut : ${rdv.statut}).` });
    }
    const escrowExistant = await prisma.compteEscrow.findUnique({ where: { rdv_id: rdv.rdv_id } });
    if (escrowExistant) {
      return res.status(409).json({ message: "Un paiement existe déjà pour ce rendez-vous." });
    }

    const montant = rdv.medecin.tarif_indicatif;
    const devise = DEVISE_PAR_DEFAUT;

    // Stripe refuse un montant nul (et en dessous d'un minimum selon la
    // devise) : on renvoie un message clair plutôt qu'un 500 opaque.
    if (!(Number(montant) > 0)) {
      return res.status(400).json({
        message: "Ce médecin n'a pas de tarif défini : le paiement en ligne est impossible.",
      });
    }

    const transaction = await prisma.transactionPaiement.create({
      data: { montant, devise, statut: "en_attente" },
    });

    const base = process.env.FRONTEND_URL || "http://localhost:5173";
    const session = await creerSessionCheckout({
      montant, devise,
      transaction_id: transaction.transaction_id,
      rdv_id: rdv.rdv_id,
      libelle: `Consultation — Dr. ${rdv.medecin.utilisateur.nom} ${rdv.medecin.utilisateur.prenom}`,
      email_client: patient.utilisateur.email,
      url_succes: `${base}/paiement/succes?rdv_id=${rdv.rdv_id}`,
      url_annulation: `${base}/paiement/annule?rdv_id=${rdv.rdv_id}`,
    });

    await prisma.transactionPaiement.update({
      where: { transaction_id: transaction.transaction_id },
      data: { stripe_checkout_session_id: session.id },
    });

    return res.status(201).json({ url: session.url });
  } catch (err) { next(err); }
}

// GET /api/rendez-vous/:id/paiement — statut (pour la page de retour
// côté patient, ET pour le portail médecin qui doit savoir si le
// rendez-vous a bien été payé avant de proposer sa confirmation).
export async function obtenirStatutPaiementRdv(req, res, next) {
  try {
    const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id: req.params.id } });
    if (!rdv) return res.status(404).json({ message: "Rendez-vous introuvable." });

    const estAdmin = req.utilisateur?.role === "admin" || req.utilisateur?.role === "superadmin";
    const patient = await prisma.patient.findUnique({ where: { utilisateur_id: req.utilisateur.utilisateur_id } });
    const estPatientConcerne = patient && patient.patient_id === rdv.patient_id;

    let estMedecinConcerne = false;
    if (!estPatientConcerne && !estAdmin) {
      const medecin = await prisma.medecin.findUnique({ where: { utilisateur_id: req.utilisateur.utilisateur_id } });
      estMedecinConcerne = medecin && medecin.medecin_id === rdv.medecin_id;
    }

    if (!estPatientConcerne && !estMedecinConcerne && !estAdmin) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    const escrow = await prisma.compteEscrow.findUnique({
      where: { rdv_id: rdv.rdv_id }, include: { transaction: true },
    });
    return res.status(200).json({
      statut_rdv: rdv.statut,
      paiement: escrow ? { statut: escrow.transaction.statut, montant: escrow.transaction.montant, devise: escrow.transaction.devise } : null,
    });
  } catch (err) { next(err); }
}

// Un événement "checkout.session.completed" qui ne vient pas de notre
// flux (ex. `stripe trigger checkout.session.completed` avec la CLI, qui
// n'a aucune metadata) ne doit PAS provoquer un 500 : Stripe
// réessaierait pendant des jours. On l'ignore proprement (200).
async function traiterPaiementReussi(session) {
  const { transaction_id, rdv_id } = session.metadata ?? {};
  if (!transaction_id || !rdv_id) {
    console.warn("[paiement] checkout.session.completed sans metadata APS — ignoré.");
    return;
  }
  if (session.payment_status !== "paid") {
    console.warn(`[paiement] session ${session.id} non payée (${session.payment_status}) — ignorée.`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transactionPaiement.findUnique({ where: { transaction_id } });
    if (!transaction) {
      console.warn(`[paiement] transaction ${transaction_id} introuvable — ignorée.`);
      return;
    }

    await tx.transactionPaiement.update({
      where: { transaction_id },
      data: { statut: "reussie", stripe_payment_intent_id: session.payment_intent },
    });

    // upsert : Stripe peut livrer le même événement plusieurs fois (et
    // le réessayer après un 5xx). Un simple create() levait une
    // violation d'unicité (rdv_id) au 2e passage -> 500 en boucle.
    const escrow = await tx.compteEscrow.upsert({
      where: { rdv_id },
      create: { rdv_id, transaction_id, montant: transaction.montant, statut: "sequestre" },
      update: {},
    });
    if (escrow.transaction_id !== transaction_id) {
      // Deux sessions Checkout payées pour le même RDV : la 2e n'a pas
      // de séquestre associé -> à rembourser manuellement dans Stripe.
      console.error(
        `[paiement] DOUBLE PAIEMENT rdv=${rdv_id} : transaction ${transaction_id} ` +
        `(payment_intent ${session.payment_intent}) à rembourser.`
      );
    }

    // Ne confirme que depuis "cree" : un RDV annulé entre-temps ne doit
    // pas être ressuscité par un webhook tardif.
    await tx.rendezVous.updateMany({ where: { rdv_id, statut: "cree" }, data: { statut: "confirme" } });
  });
}

async function traiterSessionExpiree(session) {
  const transaction_id = session.metadata?.transaction_id;
  if (!transaction_id) return;
  // Ne touche pas une transaction déjà "reussie".
  await prisma.transactionPaiement.updateMany({
    where: { transaction_id, statut: "en_attente" },
    data: { statut: "echouee" },
  });
}

// POST /api/paiement/webhook — appelé UNIQUEMENT par Stripe
export async function traiterWebhookStripe(req, res) {
  const signature = req.headers["stripe-signature"];
  let evenement;
  try {
    evenement = verifierSignatureWebhook(req.body, signature); // req.body = Buffer brut
  } catch (err) {
    console.error("[paiement] Signature webhook invalide :", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (evenement.type === "checkout.session.completed") {
      await traiterPaiementReussi(evenement.data.object);
    } else if (evenement.type === "checkout.session.expired") {
      await traiterSessionExpiree(evenement.data.object);
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[paiement] Erreur traitement webhook :", err);
    return res.status(500).json({ message: "Erreur de traitement du webhook." }); // Stripe réessaiera
  }
}