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

// GET /api/rendez-vous/:id/paiement — statut (pour la page de retour)
export async function obtenirStatutPaiementRdv(req, res, next) {
  try {
    const rdv = await prisma.rendezVous.findUnique({ where: { rdv_id: req.params.id } });
    if (!rdv) return res.status(404).json({ message: "Rendez-vous introuvable." });

    const patient = await prisma.patient.findUnique({ where: { utilisateur_id: req.utilisateur.utilisateur_id } });
    if (!patient || patient.patient_id !== rdv.patient_id) {
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

// POST /api/paiements/webhook — appelé UNIQUEMENT par Stripe
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
      const session = evenement.data.object;
      const { transaction_id, rdv_id } = session.metadata;

      const transaction = await prisma.transactionPaiement.update({
        where: { transaction_id },
        data: { statut: "reussie", stripe_payment_intent_id: session.payment_intent },
      });

      await prisma.$transaction([
        prisma.compteEscrow.create({
          data: { rdv_id, transaction_id: transaction.transaction_id, montant: transaction.montant, statut: "sequestre" },
        }),
        prisma.rendezVous.update({ where: { rdv_id }, data: { statut: "confirme" } }),
      ]);
    } else if (evenement.type === "checkout.session.expired") {
      const session = evenement.data.object;
      await prisma.transactionPaiement.update({
        where: { transaction_id: session.metadata.transaction_id },
        data: { statut: "echouee" },
      });
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[paiement] Erreur traitement webhook :", err);
    return res.status(500).json({ message: "Erreur de traitement du webhook." }); // Stripe réessaiera
  }
}