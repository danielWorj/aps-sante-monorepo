import prisma from "../lib/prisma.js";
import {
  creerSessionCheckout,
  creerPaymentIntent,
  creerRemboursement,
  rechercherPaymentIntentOuvert,
  obtenirPaymentIntent,
  annulerPaymentIntent,
  versUniteStripe,
  verifierSignatureWebhook,
} from "../lib/stripeService.js";
import { decomposerMontant, obtenirLignesTarifairesActives } from "../services/tarification.service.js";

const DEVISE_PAR_DEFAUT = process.env.STRIPE_DEVISE_PAR_DEFAUT || "xaf";

async function profilPatientAvecEmail(utilisateurCourant) {
  return prisma.patient.findUnique({
    where: { utilisateur_id: utilisateurCourant.utilisateur_id },
    include: { utilisateur: true },
  });
}

/**
 * Vérifications communes aux deux parcours de paiement (Checkout hébergé
 * ET PaymentSheet natif) : RDV existant, patient propriétaire, statut
 * `cree`, pas d'escrow, tarif > 0, puis calcul du montant total.
 *
 * Répond elle-même (404/403/409/400) et renvoie `null` si le paiement
 * n'est pas possible : l'appelant n'a alors plus rien à faire.
 * Ne crée AUCUNE transaction (voir creerTransactionEnAttente) : le
 * parcours natif doit pouvoir réutiliser une transaction existante.
 */
async function verifierRdvPayable(req, res) {
  const rdv = await prisma.rendezVous.findUnique({
    where: { rdv_id: req.params.id },
    include: { medecin: { include: { utilisateur: true } } },
  });
  if (!rdv) {
    res.status(404).json({ message: "Rendez-vous introuvable." });
    return null;
  }

  const patient = await profilPatientAvecEmail(req.utilisateur);
  if (!patient || patient.patient_id !== rdv.patient_id) {
    res.status(403).json({ message: "Ce rendez-vous ne vous appartient pas." });
    return null;
  }
  if (rdv.statut === "annule") {
    res.status(409).json({
      message:
        "Ce rendez-vous a été annulé : il n'est plus possible de le payer. " +
        "Veuillez réserver un nouveau créneau.",
    });
    return null;
  }
  if (rdv.statut !== "cree") {
    res.status(409).json({ message: `Ce rendez-vous ne peut plus être payé (statut : ${rdv.statut}).` });
    return null;
  }
  const escrowExistant = await prisma.compteEscrow.findUnique({ where: { rdv_id: rdv.rdv_id } });
  if (escrowExistant) {
    res.status(409).json({ message: "Un paiement existe déjà pour ce rendez-vous." });
    return null;
  }

  const honoraires = rdv.medecin.tarif_indicatif;
  const devise = DEVISE_PAR_DEFAUT;

  // Stripe refuse un montant nul (et en dessous d'un minimum selon la
  // devise) : on renvoie un message clair plutôt qu'un 500 opaque.
  if (!(Number(honoraires) > 0)) {
    res.status(400).json({
      message: "Ce médecin n'a pas de tarif défini : le paiement en ligne est impossible.",
    });
    return null;
  }

  // Lignes tarifaires (commission/taxe/frais d'agrégateur) en vigueur
  // dans le pays d'exercice du médecin — voir Phase 0. Les taux ne
  // sont jamais dupliqués ni recalculés sur la transaction : seules
  // les références vers ces 3 lignes sont stockées.
  const lignesTarifaires = await obtenirLignesTarifairesActives(rdv.medecin.pays_exercice_id);
  const { total: montant } = decomposerMontant(honoraires, lignesTarifaires);

  return { rdv, patient, honoraires, devise, lignesTarifaires, montant };
}

function creerTransactionEnAttente({ montant, devise, honoraires, lignesTarifaires }) {
  return prisma.transactionPaiement.create({
    data: {
      montant,
      devise,
      statut: "en_attente",
      montant_honoraires: honoraires,
      ligne_commission_id: lignesTarifaires.commission.ligne_tarifaire_id,
      ligne_taxe_id: lignesTarifaires.taxe.ligne_tarifaire_id,
      ligne_frais_agregateur_id: lignesTarifaires.frais_agregateur.ligne_tarifaire_id,
    },
  });
}

// POST /api/rendez-vous/:id/paiement — le patient propriétaire uniquement
// (Checkout hébergé — parcours web, option A)
export async function creerPaiementRdv(req, res, next) {
  try {
    const ctx = await verifierRdvPayable(req, res);
    if (!ctx) return;
    const { rdv, patient, devise, montant } = ctx;

    const transaction = await creerTransactionEnAttente(ctx);

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

/**
 * Cherche un PaymentIntent déjà créé pour ce RDV et toujours utilisable
 * (même montant/devise, transaction encore `en_attente`). Sert à ne pas
 * créer une nouvelle TransactionPaiement à chaque ouverture de la
 * PaymentSheet (patient qui ferme puis rouvre la feuille).
 * Un PaymentIntent périmé (tarif modifié depuis) est annulé.
 * Toute erreur Stripe ici est non bloquante : on retombe sur une
 * création normale.
 */
async function trouverPaymentIntentReutilisable({ rdv, montant, devise }) {
  try {
    let pi = await rechercherPaymentIntentOuvert(rdv.rdv_id);
    if (!pi) return null;
    if (!pi.client_secret) pi = await obtenirPaymentIntent(pi.id);

    const transaction_id = pi.metadata?.transaction_id;
    if (!transaction_id || !pi.client_secret) return null;

    const transaction = await prisma.transactionPaiement.findUnique({ where: { transaction_id } });
    const memeMontant =
      pi.amount === versUniteStripe(montant, devise) &&
      pi.currency === devise.toLowerCase();

    if (transaction?.statut === "en_attente" && memeMontant) return pi;

    // Périmé : on l'annule pour qu'il ne puisse plus être payé par erreur.
    await annulerPaymentIntent(pi.id);
    if (transaction) {
      await prisma.transactionPaiement.updateMany({
        where: { transaction_id, statut: "en_attente" },
        data: { statut: "echouee" },
      });
    }
    return null;
  } catch (err) {
    console.warn("[paiement] Réutilisation du PaymentIntent impossible :", err.message);
    return null;
  }
}

// POST /api/paiement/rendez-vous/:id/paiement-natif — le patient
// propriétaire uniquement (PaymentSheet natif mobile — option B).
// Renvoie le `client_secret` du PaymentIntent + la clé PUBLIQUE Stripe
// (la clé secrète ne quitte jamais le serveur). Le RDV n'est confirmé
// que par le webhook `payment_intent.succeeded`, jamais par cette route.
export async function creerPaymentSheetRdv(req, res, next) {
  try {
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      console.error("[paiement] STRIPE_PUBLISHABLE_KEY manquant : paiement natif indisponible.");
      return res.status(500).json({ message: "Paiement en ligne momentanément indisponible." });
    }

    const ctx = await verifierRdvPayable(req, res);
    if (!ctx) return;
    const { rdv, patient, devise, montant } = ctx;

    const existant = await trouverPaymentIntentReutilisable(ctx);
    if (existant) {
      return res.status(200).json({
        client_secret: existant.client_secret,
        publishable_key: publishableKey,
      });
    }

    const transaction = await creerTransactionEnAttente(ctx);

    const intent = await creerPaymentIntent({
      montant, devise,
      transaction_id: transaction.transaction_id,
      rdv_id: rdv.rdv_id,
      email_client: patient.utilisateur.email,
    });

    await prisma.transactionPaiement.update({
      where: { transaction_id: transaction.transaction_id },
      data: { stripe_payment_intent_id: intent.id },
    });

    return res.status(201).json({
      client_secret: intent.client_secret,
      publishable_key: publishableKey,
    });
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
      where: { rdv_id: rdv.rdv_id },
      include: {
        transaction: {
          include: { ligne_commission: true, ligne_taxe: true, ligne_frais_agregateur: true },
        },
      },
    });

    // Décomposition honoraires/commission/taxes/frais d'agrégateur
    // recalculée à la volée depuis montant_honoraires + les 3 lignes
    // tarifaires liées — jamais lue depuis une valeur stockée (voir
    // Phase 0 / tarification.service.js).
    let decomposition = null;
    const t = escrow?.transaction;
    if (t?.montant_honoraires != null && t.ligne_commission && t.ligne_taxe && t.ligne_frais_agregateur) {
      decomposition = decomposerMontant(t.montant_honoraires, {
        commission: t.ligne_commission,
        taxe: t.ligne_taxe,
        frais_agregateur: t.ligne_frais_agregateur,
      });
    }

    return res.status(200).json({
      statut_rdv: rdv.statut,
      paiement: escrow
        ? {
            statut: escrow.transaction.statut,
            montant: escrow.transaction.montant,
            devise: escrow.transaction.devise,
            decomposition,
          }
        : null,
    });
  } catch (err) { next(err); }
}

/**
 * Cœur métier commun à `checkout.session.completed` (web) et
 * `payment_intent.succeeded` (mobile natif) : transaction `reussie`,
 * escrow `sequestre`, RDV `cree` → `confirme`. Idempotent : Stripe peut
 * livrer le même événement plusieurs fois.
 *
 * Paiement tardif : si le rendez-vous a été annulé avant que ce paiement
 * n'aboutisse (PaymentSheet déjà validée au moment de l'annulation,
 * PaymentIntent non annulable), on n'encaisse rien : aucun escrow n'est
 * créé et le montant est remboursé intégralement au patient.
 */
async function finaliserPaiement({ transaction_id, rdv_id, payment_intent_id }) {
  const paiementTardif = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transactionPaiement.findUnique({ where: { transaction_id } });
    if (!transaction) {
      console.warn(`[paiement] transaction ${transaction_id} introuvable — ignorée.`);
      return null;
    }
    // Rejeu d'un événement déjà traité jusqu'au remboursement.
    if (transaction.statut === "remboursee") return null;

    const rdv = await tx.rendezVous.findUnique({ where: { rdv_id }, select: { statut: true } });
    const escrowExistant = await tx.compteEscrow.findUnique({ where: { rdv_id } });

    // Rejeu d'un paiement déjà finalisé (escrow créé pour CETTE
    // transaction, éventuellement remboursé depuis par une annulation) :
    // rien à refaire, et surtout ne pas repasser la transaction à
    // "reussie" ni la rembourser une 2e fois.
    if (escrowExistant?.transaction_id === transaction_id) return null;

    if (rdv?.statut === "annule") {
      // On garde une trace du paiement réellement encaissé par Stripe ;
      // le remboursement (hors transaction SQL) le passera à "remboursee".
      await tx.transactionPaiement.update({
        where: { transaction_id },
        data: { statut: "reussie", stripe_payment_intent_id: payment_intent_id },
      });
      return transaction;
    }

    await tx.transactionPaiement.update({
      where: { transaction_id },
      data: { statut: "reussie", stripe_payment_intent_id: payment_intent_id },
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
      // Deux paiements réussis pour le même RDV : le 2e n'a pas
      // de séquestre associé -> à rembourser manuellement dans Stripe.
      console.error(
        `[paiement] DOUBLE PAIEMENT rdv=${rdv_id} : transaction ${transaction_id} ` +
        `(payment_intent ${payment_intent_id}) à rembourser.`
      );
    }

    // Ne confirme que depuis "cree" : un RDV annulé entre-temps ne doit
    // pas être ressuscité par un webhook tardif.
    await tx.rendezVous.updateMany({ where: { rdv_id, statut: "cree" }, data: { statut: "confirme" } });
    return null;
  });

  if (paiementTardif) {
    await rembourserPaiementRdvAnnule({ transaction: paiementTardif, rdv_id, payment_intent_id });
  }
}

/**
 * Rembourse intégralement un paiement arrivé APRÈS l'annulation du rendez-vous.
 * Stripe d'abord, base ensuite (même ordre que annulation.service.js) ; la
 * clé d'idempotence garantit qu'un rejeu du webhook ne rembourse jamais deux
 * fois. En cas d'échec Stripe on lève : le webhook répond 500 et Stripe
 * réessaie (la transaction reste "reussie" tant que le remboursement n'a pas
 * abouti, ce qui rend le rejeu possible).
 */
async function rembourserPaiementRdvAnnule({ transaction, rdv_id, payment_intent_id }) {
  const remboursement = await creerRemboursement({
    payment_intent_id,
    montant: Number(transaction.montant),
    devise: transaction.devise,
    idempotency_key: `refund-rdv-annule:${transaction.transaction_id}`,
    metadata: {
      rdv_id,
      transaction_id: transaction.transaction_id,
      raison: "paiement_apres_annulation",
    },
  });
  if (remboursement.status === "failed" || remboursement.status === "canceled") {
    throw new Error(
      `Remboursement Stripe ${remboursement.id} en échec (statut ${remboursement.status}) ` +
      `pour le paiement tardif du rdv annulé ${rdv_id}.`
    );
  }

  await prisma.transactionPaiement.update({
    where: { transaction_id: transaction.transaction_id },
    data: { statut: "remboursee" },
  });
  console.warn(
    `[paiement] Paiement reçu après annulation du rdv ${rdv_id} : remboursé intégralement ` +
    `(transaction ${transaction.transaction_id}, payment_intent ${payment_intent_id}).`
  );
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
  await finaliserPaiement({ transaction_id, rdv_id, payment_intent_id: session.payment_intent });
}

// `payment_intent.succeeded` : le PaymentIntent d'une session Checkout
// n'a PAS nos metadata (elles sont sur la session) -> déjà traité par
// `checkout.session.completed`, on l'ignore ici sans bruit. Seuls les
// PaymentIntent créés par creerPaymentSheetRdv portent transaction_id
// et rdv_id.
async function traiterPaymentIntentReussi(paymentIntent) {
  const { transaction_id, rdv_id } = paymentIntent.metadata ?? {};
  if (!transaction_id || !rdv_id) return;
  await finaliserPaiement({ transaction_id, rdv_id, payment_intent_id: paymentIntent.id });
}

// `payment_intent.payment_failed` (PaymentSheet natif) : carte refusée,
// 3D Secure échoué… Le PaymentIntent reste réutilisable par le patient
// (il peut ressaisir une autre carte sur la même feuille, Stripe le
// repasse à requires_payment_method), donc la transaction n'est PAS
// définitivement perdue : on ne la marque `echouee` que si le
// PaymentIntent n'est plus payable (annulé). Ici on se contente de
// journaliser l'échec pour garder de la visibilité — le RDV reste `cree`
// et le bouton « Payer » reste proposé côté mobile.
async function traiterPaiementEchoue(paymentIntent) {
  const { transaction_id, rdv_id } = paymentIntent.metadata ?? {};
  if (!transaction_id || !rdv_id) return; // PaymentIntent issu de Checkout : pas le nôtre
  const erreur = paymentIntent.last_payment_error;
  console.warn(
    `[paiement] Paiement échoué rdv=${rdv_id} transaction=${transaction_id} ` +
    `(payment_intent ${paymentIntent.id}) : ${erreur?.code ?? "inconnu"} — ${erreur?.message ?? "sans détail"}`
  );
}

// `payment_intent.canceled` : PaymentIntent annulé (annulation du RDV,
// tarif périmé remplacé, expiration). La transaction correspondante ne
// pourra plus jamais aboutir : on la passe à `echouee`. Ne touche jamais
// une transaction déjà `reussie` ou `remboursee`.
async function traiterPaymentIntentAnnule(paymentIntent) {
  const { transaction_id } = paymentIntent.metadata ?? {};
  if (!transaction_id) return;
  await prisma.transactionPaiement.updateMany({
    where: { transaction_id, statut: "en_attente" },
    data: { statut: "echouee" },
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
    } else if (evenement.type === "payment_intent.succeeded") {
      await traiterPaymentIntentReussi(evenement.data.object);
    } else if (evenement.type === "payment_intent.payment_failed") {
      await traiterPaiementEchoue(evenement.data.object);
    } else if (evenement.type === "payment_intent.canceled") {
      await traiterPaymentIntentAnnule(evenement.data.object);
    } else {
      // Événement reçu mais non traité par notre logique métier (ex.
      // invoice.*, subscription_schedule.*, entitlements.* — activés côté
      // Stripe mais aucun flux d'abonnement n'existe encore ici).
      // On l'acquitte quand même (200) pour éviter que Stripe ne
      // réessaie indéfiniment, mais on log pour garder de la visibilité.
      console.info(`[paiement] Événement Stripe ignoré (non géré) : ${evenement.type}`);
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[paiement] Erreur traitement webhook :", err);
    return res.status(500).json({ message: "Erreur de traitement du webhook." }); // Stripe réessaiera
  }
}