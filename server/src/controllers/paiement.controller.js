import prisma from "../lib/prisma.js";
import {
  creerSessionCheckout,
  creerPaymentIntent,
  rechercherPaymentIntentOuvert,
  obtenirPaymentIntent,
  annulerPaymentIntent,
  versUniteStripe,
  verifierSignatureWebhook,
  expirerSessionCheckout,
} from "../lib/stripeService.js";
import { decomposerMontant, obtenirLignesTarifairesActives } from "../services/tarification.service.js";
import { obtenirFraisActifs, calculerFrais } from "../services/fraisAgregateur.service.js";
import { creerTransactionSansDoublon, invaliderCheckoutsOuverts, PaiementDejaExistantError } from "../services/antiDoublePaiement.service.js";
import { decimalesPourMontant, arrondir } from "../utils/montants.js";
import { finaliserPaiement } from "../services/finalisationPaiement.service.js";
import { synchroniserCampayPourRdv, derniereTentativeCampay } from "../services/paiementCampay.service.js";

const DEVISE_PAR_DEFAUT = process.env.STRIPE_DEVISE_PAR_DEFAUT || "xaf";

async function profilPatientAvecEmail(utilisateurCourant) {
  return prisma.patient.findUnique({
    where: { utilisateur_id: utilisateurCourant.utilisateur_id },
    include: { utilisateur: true },
  });
}

/**
 * Vérifications communes aux parcours de paiement (Checkout hébergé,
 * PaymentSheet natif, CamPay) : RDV existant, patient propriétaire,
 * statut `cree`, pas d'escrow, tarif > 0, puis calcul du montant total.
 *
 * Politique de fonds v2 §1 : total = honoraires + frais d'envoi de
 * l'AGRÉGATEUR choisi (`agregateur` : "stripe" | "campay"). Plus de
 * taxe ni de commission à la charge du patient.
 *
 * Répond elle-même (404/403/409/400) et renvoie `null` si le paiement
 * n'est pas possible : l'appelant n'a alors plus rien à faire.
 * Ne crée AUCUNE transaction (voir creerTransactionEnAttente) : les
 * parcours natif et CamPay doivent pouvoir réutiliser une tentative
 * existante avant d'en créer une. Le contrôle anti double paiement
 * (§6) est donc fait à la CRÉATION, pas ici.
 */
export async function verifierRdvPayable(req, res, agregateur) {
  if (agregateur !== "stripe" && agregateur !== "campay") {
    throw new Error(`verifierRdvPayable : agrégateur inconnu "${agregateur}".`);
  }
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
  // CamPay débite toujours en XAF ; Stripe : devise configurée.
  const devise = agregateur === "campay" ? "xaf" : DEVISE_PAR_DEFAUT;

  // Stripe refuse un montant nul (et en dessous d'un minimum selon la
  // devise) : on renvoie un message clair plutôt qu'un 500 opaque.
  if (!(Number(honoraires) > 0)) {
    res.status(400).json({
      message: "Ce médecin n'a pas de tarif défini : le paiement en ligne est impossible.",
    });
    return null;
  }

  // Lignes en vigueur : commission APS (par pays d'exercice du médecin)
  // et frais d'agrégateur (envoi ET remboursement). Elles sont FIGÉES
  // sur la transaction (références, jamais de montants) : un changement
  // de barème ultérieur ne touche pas cette transaction. Une ligne
  // absente lève une erreur explicite (saisie admin requise).
  const lignesTarifaires = await obtenirLignesTarifairesActives(rdv.medecin.pays_exercice_id);
  const fraisActifs = await obtenirFraisActifs(agregateur);
  const decimales = decimalesPourMontant({ fournisseur: agregateur, devise });
  const decomposition = decomposerMontant(
    honoraires,
    { commission: lignesTarifaires.commission, frais_envoi: fraisActifs.envoi },
    decimales
  );

  return {
    rdv, patient, honoraires, devise, agregateur,
    lignesTarifaires, fraisActifs, decomposition,
    montant: decomposition.total,
  };
}

/**
 * Crée la transaction `en_attente` du RDV, après contrôle anti double
 * paiement (§6) et sous verrou de créneau — voir antiDoublePaiement.
 * Lève PaiementDejaExistantError (409) si un paiement existe déjà.
 * `extra` : champs propres au fournisseur (CamPay : numéro, montant
 * arrondi…). `rdv_id_cible` est posé pour TOUS les fournisseurs : il
 * permet de retrouver une transaction `en_attente` par RDV.
 */
export function creerTransactionEnAttente(ctx, extra = {}) {
  const { rdv, montant, devise, honoraires, lignesTarifaires, fraisActifs } = ctx;
  return creerTransactionSansDoublon({
    rdv,
    donnees: {
      montant,
      devise,
      statut: "en_attente",
      rdv_id_cible: rdv.rdv_id,
      montant_honoraires: honoraires,
      ligne_commission_id: lignesTarifaires.commission.ligne_tarifaire_id,
      frais_envoi_id: fraisActifs.envoi.frais_agregateur_id,
      frais_remboursement_id: fraisActifs.remboursement.frais_agregateur_id,
      ...extra,
    },
  });
}

/** 409 clair pour un doublon de paiement ; renvoie true si l'erreur a été traitée. */
export function repondreSiPaiementExistant(err, res) {
  if (!(err instanceof PaiementDejaExistantError)) return false;
  res.status(409).json({ message: err.message });
  return true;
}

/**
 * Barème non saisi par l'admin (frais d'agrégateur ou commission APS du
 * pays du médecin, voir fraisAgregateur / tarification) : 503 avec un
 * message clair pour le patient, détail technique dans les logs.
 * Sans cela le gestionnaire global renverrait un 500 « Erreur interne »
 * opaque. Renvoie true si l'erreur a été traitée.
 */
const BAREME_ABSENT = /^(Aucune ligne|Ligne de commission manquante)/;
export function repondreSiBaremeAbsent(err, res) {
  if (!BAREME_ABSENT.test(err?.message ?? "")) return false;
  console.error("[paiement] Barème non configuré :", err.message);
  res.status(503).json({
    message: "Le paiement par ce moyen n'est pas encore disponible. Veuillez réessayer plus tard ou contacter l'assistance.",
  });
  return true;
}

/** Une transaction dont la création chez le fournisseur a échoué ne doit pas bloquer une nouvelle tentative. */
async function marquerTransactionEchouee(transaction_id) {
  await prisma.transactionPaiement.updateMany({
    where: { transaction_id, statut: "en_attente" },
    data: { statut: "echouee" },
  });
}

// POST /api/rendez-vous/:id/paiement — le patient propriétaire uniquement
// (Checkout hébergé — parcours web, option A)
export async function creerPaiementRdv(req, res, next) {
  try {
    const ctx = await verifierRdvPayable(req, res, "stripe");
    if (!ctx) return;
    const { rdv, patient, devise, montant } = ctx;

    // Réessai après fermeture de la page Checkout : pas de paiement ->
    // on invalide l'ancienne session et on en ouvre une nouvelle ; un
    // paiement aboutissant entre-temps -> 409 (voir antiDoublePaiement).
    await invaliderCheckoutsOuverts({ rdv, expirer: expirerSessionCheckout });

    const transaction = await creerTransactionEnAttente(ctx);

    let session;
    try {
      const base = process.env.FRONTEND_URL || "http://localhost:5173";
      session = await creerSessionCheckout({
        montant, devise,
        transaction_id: transaction.transaction_id,
        rdv_id: rdv.rdv_id,
        libelle: `Consultation — Dr. ${rdv.medecin.utilisateur.nom} ${rdv.medecin.utilisateur.prenom}`,
        email_client: patient.utilisateur.email,
        url_succes: `${base}/paiement/succes?rdv_id=${rdv.rdv_id}`,
        url_annulation: `${base}/paiement/annule?rdv_id=${rdv.rdv_id}`,
      });
    } catch (err) {
      // Stripe a refusé : sans session, cette transaction ne peut jamais
      // aboutir — on la clôt pour ne pas bloquer la nouvelle tentative (§6).
      await marquerTransactionEchouee(transaction.transaction_id);
      throw err;
    }

    await prisma.transactionPaiement.update({
      where: { transaction_id: transaction.transaction_id },
      data: { stripe_checkout_session_id: session.id },
    });

    return res.status(201).json({ url: session.url });
  } catch (err) {
    if (repondreSiPaiementExistant(err, res)) return;
    if (repondreSiBaremeAbsent(err, res)) return;
    next(err);
  }
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

    const ctx = await verifierRdvPayable(req, res, "stripe");
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

    let intent;
    try {
      intent = await creerPaymentIntent({
        montant, devise,
        transaction_id: transaction.transaction_id,
        rdv_id: rdv.rdv_id,
        email_client: patient.utilisateur.email,
      });
    } catch (err) {
      await marquerTransactionEchouee(transaction.transaction_id); // voir creerPaiementRdv
      throw err;
    }

    await prisma.transactionPaiement.update({
      where: { transaction_id: transaction.transaction_id },
      data: { stripe_payment_intent_id: intent.id },
    });

    return res.status(201).json({
      client_secret: intent.client_secret,
      publishable_key: publishableKey,
    });
  } catch (err) {
    if (repondreSiPaiementExistant(err, res)) return;
    if (repondreSiBaremeAbsent(err, res)) return;
    next(err);
  }
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

    // CamPay : auto-guérison. Si une collecte Mobile Money est en attente, on
    // interroge CamPay ici (throttlé) : le paiement se valide même sans webhook
    // (ex. en local). Une panne CamPay ne doit jamais faire échouer ce GET.
    try {
      await synchroniserCampayPourRdv(rdv.rdv_id);
    } catch (err) {
      console.error(`[campay] Synchronisation du rdv ${rdv.rdv_id} impossible :`, err.message);
    }
    // Relu APRÈS la synchronisation : le RDV a pu passer de « cree » à « confirme ».
    const rdvActuel = await prisma.rendezVous.findUnique({ where: { rdv_id: rdv.rdv_id }, select: { statut: true } });

    const escrow = await prisma.compteEscrow.findUnique({
      where: { rdv_id: rdv.rdv_id },
      include: {
        transaction: {
          include: { ligne_commission: true, frais_envoi: true },
        },
      },
    });

    // Décomposition recalculée à la volée depuis montant_honoraires + les
    // lignes figées sur la transaction — jamais lue depuis une valeur
    // stockée (voir tarification.service.js). v2 : le patient voit
    // honoraires + frais d'envoi = total. La commission APS (prélevée
    // sur le médecin à la libération) et le net médecin ne sont exposés
    // qu'au médecin concerné et aux admins. Une transaction antérieure à
    // la v2 n'a pas de ligne de frais d'envoi : pas de décomposition.
    let decomposition = null;
    const t = escrow?.transaction;
    if (t?.montant_honoraires != null && t.ligne_commission && t.frais_envoi) {
      const d = decomposerMontant(
        t.montant_honoraires,
        { commission: t.ligne_commission, frais_envoi: t.frais_envoi },
        decimalesPourMontant({ fournisseur: t.fournisseur, devise: t.devise })
      );
      decomposition = { honoraires: d.honoraires, frais_envoi: d.fraisEnvoi, total: d.total };
      if (estAdmin || estMedecinConcerne) {
        decomposition.commission_aps = d.commission;
        decomposition.net_medecin = d.netMedecin;
      }
    }

    return res.status(200).json({
      statut_rdv: rdvActuel?.statut ?? rdv.statut,
      paiement: escrow
        ? {
            statut: escrow.transaction.statut,
            montant: escrow.transaction.montant,
            devise: escrow.transaction.devise,
            decomposition,
          }
        : null,
      // Dernière tentative Mobile Money (null si le RDV n'en a aucune) :
      // { fournisseur: "campay", statut: en_attente | reussie | echouee | remboursee, operateur }
      // -> permet au front d'afficher « en attente de validation », « refusé / expiré ».
      tentative_campay: await derniereTentativeCampay(rdv.rdv_id),
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

// GET /api/paiement/rendez-vous/:id/devis?agregateur=stripe|campay
// Politique de fonds v2 §1 — devis AVANT paiement : honoraires + frais
// d'envoi de l'agrégateur choisi = total. Réutilise verifierRdvPayable :
// mêmes contrôles que le paiement (404, 403 si le RDV n'est pas celui du
// patient, 409 si déjà payé/annulé, 400 sans tarif), même calcul, AUCUNE
// écriture en base (pas de transaction créée). Le total renvoyé est celui
// qui serait débité (CamPay : déjà arrondi à l'unité XAF).
// La commission APS (prélevée sur le médecin à la libération) n'est
// volontairement PAS exposée au patient.
// `remboursement_estime` = honoraires − frais de remboursement (§2),
// plancher 0, arrondi comme decider() (politiqueFonds) ; indicatif pour
// CamPay (frais réels connus à la clôture du retrait).
export async function obtenirDevisPaiementRdv(req, res, next) {
  try {
    const agregateur = req.query.agregateur;
    if (agregateur !== "stripe" && agregateur !== "campay") {
      return res.status(400).json({ message: "agregateur invalide. Valeurs acceptées : stripe, campay." });
    }

    const ctx = await verifierRdvPayable(req, res, agregateur); // répond seul en cas de refus
    if (!ctx) return;

    const { honoraires, devise, decomposition, fraisActifs } = ctx;
    const decimales = decimalesPourMontant({ fournisseur: agregateur, devise });
    const fraisRemboursement = calculerFrais(honoraires, fraisActifs.remboursement, decimales);
    const remboursementEstime = Math.max(0, arrondir(decomposition.honoraires - fraisRemboursement, decimales));

    return res.status(200).json({
      agregateur,
      devise,
      honoraires: decomposition.honoraires,
      frais_envoi: decomposition.fraisEnvoi,
      total: decomposition.total,
      remboursement_estime: remboursementEstime,
      remboursement_indicatif: agregateur === "campay",
    });
  } catch (err) {
    if (repondreSiBaremeAbsent(err, res)) return;
    next(err);
  }
}