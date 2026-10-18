// src/controllers/paiementPublicite.controller.js
// Paiement d'une publicité acceptée par son annonceur — même tuyauterie que
// les abonnements de présence (Stripe Checkout, collecte CamPay, mêmes
// webhooks et cron de rapprochement) ; paiement direct à la plateforme,
// HORS escrow, sans commission. Le lien reçu par WhatsApp mène à la page
// de paiement (choix du moyen + facture récapitulative).
//
// Règles transverses :
//   - le client n'envoie JAMAIS de montant (prix figé sur la publicité) ;
//   - seul l'annonceur (ou un admin) accède à ces routes ;
//   - payable uniquement « en_attente_paiement » avant date_limite_paiement ;
//   - frais d'agrégateur payés EN SUS, ligne figée sur la transaction.

import prisma from "../lib/prisma.js";
import { creerSessionCheckout, expirerSessionCheckout, creerRemboursement, stripe } from "../lib/stripeService.js";
import { journaliserAudit } from "../lib/audit.js";
import { CampayError, DEVISE_CAMPAY, initierCollecte, normaliserNumeroCM } from "../lib/campayService.js";
import { construireUrl } from "../lib/cloudinaryService.js";
import { PaiementDejaExistantError, CODE_PAIEMENT_EN_COURS, CODE_PAIEMENT_NON_ANNULABLE } from "../services/antiDoublePaiement.service.js";
import {
  synchroniserCampayPour,
  derniereTentativeCampayPour,
  verifierEtFinaliserTransactionCampay,
} from "../services/paiementCampay.service.js";
import { verifierPayeur, repondreSiErreurAbonnement } from "../services/abonnementAssurance.service.js";
import { fraisEnvoiAbonnement } from "../services/fraisAbonnement.service.js";
import { construireDevisPublicite, detailCheckoutPublicite } from "../services/facturePublicite.service.js";
import { finaliserPaiementPublicite, MOTIF_PAIEMENT_TARDIF_PUBLICITE } from "../services/finalisationPublicite.service.js";
import { ErreurPublicite, repondreSiErreurPublicite, versJourIso, lienPortailPublicite } from "../services/publicite.service.js";
import { repondreSiPaiementExistant, repondreSiBaremeAbsent, marquerTransactionEchouee } from "./paiement.controller.js";

const FENETRE_ANTI_DOUBLE_CAMPAY_MS = 2 * 60 * 1000;
const AGREGATEURS = ["stripe", "campay"];

function texteSimple(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w .,()+=-]/g, "");
}

function repondreErreurConnue(err, res) {
  return (
    repondreSiErreurPublicite(err, res) ||
    repondreSiErreurAbonnement(err, res) ||
    repondreSiPaiementExistant(err, res) ||
    repondreSiBaremeAbsent(err, res)
  );
}

/** Rattrapage des paiements Stripe sans webhook ; un échec n'empêche jamais la réponse. */
async function rattraperStripe(publicite_id) {
  try {
    const ouvertes = await prisma.transactionPaiement.findMany({
      where: { publicite_id_cible: publicite_id, fournisseur: "stripe", statut: "en_attente", stripe_checkout_session_id: { not: null } },
      select: { transaction_id: true, stripe_checkout_session_id: true },
    });
    for (const t of ouvertes) {
      const session = await stripe.checkout.sessions.retrieve(t.stripe_checkout_session_id);
      if (session.payment_status === "paid") {
        await finaliserPaiementPublicite({ transaction_id: t.transaction_id, payment_intent_id: session.payment_intent });
      }
    }
  } catch (err) {
    console.error(`[stripe] Rattrapage de la publicité ${publicite_id} impossible :`, err.message);
  }
}

/** Publicité de l'utilisateur connecté (ou admin), avec son emplacement. */
async function chargerPubliciteAutorisee(req) {
  const pub = await prisma.publicite.findUnique({
    where: { publicite_id: req.params.id },
    include: { emplacement_publicitaire: { select: { libelle: true, code: true } } },
  });
  if (!pub) throw new ErreurPublicite(404, "PUBLICITE_INTROUVABLE", "Publicité introuvable.");
  const admin = req.utilisateur.role === "admin" || req.utilisateur.role === "superadmin";
  if (!admin && pub.utilisateur_id !== req.utilisateur.utilisateur_id) {
    throw new ErreurPublicite(403, "ACCES_REFUSE", "Cette publicité ne vous appartient pas.");
  }
  return pub;
}

function exigerPayable(pub, maintenant = new Date()) {
  if (pub.statut !== "en_attente_paiement") {
    const raisons = {
      en_moderation: "Votre demande est encore en cours d'examen.",
      payee: "Cette publicité est déjà payée.",
      expiree: "Le délai de paiement est dépassé : contactez APS Santé pour relancer votre demande.",
      rejetee: "Cette demande a été rejetée.",
      annulee: "Cette demande a été annulée.",
    };
    throw new ErreurPublicite(409, "PUBLICITE_NON_PAYABLE", raisons[pub.statut] ?? `Statut : ${pub.statut}.`);
  }
  if (pub.date_limite_paiement && pub.date_limite_paiement <= maintenant) {
    throw new ErreurPublicite(409, "PUBLICITE_NON_PAYABLE", "Le délai de paiement est dépassé : contactez APS Santé pour relancer votre demande.");
  }
  if (!(Number(pub.montant) > 0)) throw new ErreurPublicite(409, "MONTANT_NUL", "Aucun montant à payer pour cette publicité.");
}

async function verifierPayable(req) {
  const pub = await chargerPubliciteAutorisee(req);
  exigerPayable(pub);
  const payeur = await verifierPayeur(req.utilisateur.utilisateur_id);
  return { pub, payeur, montant: Number(pub.montant), devise: pub.devise };
}

/** Transaction `en_attente`, sous verrou de la ligne publicité (double clic -> une seule). */
async function creerTransactionPublicite(ctx, donnees) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM publicite WHERE publicite_id = ${ctx.pub.publicite_id}::uuid FOR UPDATE`;
    const pub = await tx.publicite.findUnique({ where: { publicite_id: ctx.pub.publicite_id } });
    exigerPayable(pub);
    if (donnees.fournisseur === "campay") {
      const recente = await tx.transactionPaiement.findFirst({
        where: {
          publicite_id_cible: pub.publicite_id, fournisseur: "campay", statut: "en_attente",
          date_creation: { gte: new Date(Date.now() - FENETRE_ANTI_DOUBLE_CAMPAY_MS) },
        },
      });
      if (recente) {
        throw new PaiementDejaExistantError(
          "Une demande Mobile Money est déjà en cours pour cette publicité : validez-la sur votre téléphone.",
          CODE_PAIEMENT_EN_COURS
        );
      }
    }
    return tx.transactionPaiement.create({ data: { statut: "en_attente", publicite_id_cible: pub.publicite_id, ...donnees } });
  });
}

/** Résumé affiché sur la page de paiement. */
function resumePublicite(pub) {
  return {
    publicite_id: pub.publicite_id,
    titre: pub.titre,
    description: pub.description,
    visuel_url: construireUrl(pub.visuel_url),
    emplacement: pub.emplacement_publicitaire?.libelle ?? null,
    rang: pub.rang,
    statut: pub.statut,
    date_debut: versJourIso(pub.date_debut),
    date_fin: versJourIso(pub.date_fin),
    date_limite_paiement: pub.date_limite_paiement,
    montant: Number(pub.montant ?? 0),
    devise: pub.devise,
    lien_portail: lienPortailPublicite(pub.publicite_id),
  };
}

/**
 * GET /api/publicites/:id/devis?agregateur=stripe|campay
 * Facture récapitulative recalculée (montant initial, frais d'agrégateur,
 * montant final), jamais stockée.
 */
export async function obtenirDevisPublicite(req, res, next) {
  try {
    const agregateur = req.query.agregateur ?? "stripe";
    if (!AGREGATEURS.includes(agregateur)) {
      return res.status(400).json({ message: `agregateur invalide. Valeurs acceptées : ${AGREGATEURS.join(", ")}.` });
    }
    const pub = await chargerPubliciteAutorisee(req);
    exigerPayable(pub);
    const frais = await fraisEnvoiAbonnement(agregateur, Number(pub.montant), pub.devise);
    const devis = construireDevisPublicite({ publicite: pub, emplacement: pub.emplacement_publicitaire, frais_agregateur: frais });
    return res.status(200).json({
      ...devis,
      agregateur,
      campay_disponible: pub.devise === DEVISE_CAMPAY.toLowerCase(),
      publicite: resumePublicite(pub),
    });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}

/** POST /api/publicites/:id/paiement — Stripe Checkout -> { url } */
export async function creerPaiementStripePublicite(req, res, next) {
  try {
    await rattraperStripe(req.params.id);
    const ctx = await verifierPayable(req);

    const ouvertes = await prisma.transactionPaiement.findMany({
      where: { publicite_id_cible: ctx.pub.publicite_id, fournisseur: "stripe", statut: "en_attente", stripe_checkout_session_id: { not: null } },
    });
    for (const t of ouvertes) {
      if ((await expirerSessionCheckout(t.stripe_checkout_session_id)) === "payee") {
        throw new PaiementDejaExistantError("Un paiement vient d'aboutir pour cette publicité : sa confirmation est en cours.", CODE_PAIEMENT_EN_COURS);
      }
      await marquerTransactionEchouee(t.transaction_id);
    }

    const frais = await fraisEnvoiAbonnement("stripe", ctx.montant, ctx.devise);
    const devis = construireDevisPublicite({ publicite: ctx.pub, emplacement: ctx.pub.emplacement_publicitaire, frais_agregateur: frais });
    const transaction = await creerTransactionPublicite(ctx, {
      montant: devis.total,
      devise: ctx.devise,
      fournisseur: "stripe",
      frais_envoi_id: frais.ligne.frais_agregateur_id,
    });

    let session;
    try {
      const base = process.env.FRONTEND_URL || "http://localhost:5173";
      const retour = `publicite_id=${ctx.pub.publicite_id}`;
      session = await creerSessionCheckout({
        montant: devis.total,
        devise: ctx.devise,
        transaction_id: transaction.transaction_id,
        metadata: { objet: "publicite" }, // la publicité se lit via la transaction
        libelle: `Publicité - ${ctx.pub.emplacement_publicitaire.libelle}`,
        ...detailCheckoutPublicite(devis),
        description_facture: `Publicité APS Santé - ${ctx.pub.titre}`.slice(0, 500),
        email_client: ctx.pub.annonceur_email || ctx.payeur.email,
        url_succes: `${base}/paiement/publicite/succes?${retour}`,
        url_annulation: `${base}/paiement/publicite/annule?${retour}`,
      });
    } catch (err) {
      await marquerTransactionEchouee(transaction.transaction_id);
      throw err;
    }

    await prisma.transactionPaiement.update({
      where: { transaction_id: transaction.transaction_id },
      data: { stripe_checkout_session_id: session.id },
    });
    return res.status(201).json({ url: session.url });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}

/** POST /api/publicites/:id/paiement-campay   body: { numero } */
export async function creerPaiementCampayPublicite(req, res, next) {
  try {
    const ctx = await verifierPayable(req);
    if (ctx.devise !== DEVISE_CAMPAY.toLowerCase()) {
      return res.status(409).json({ message: "Le paiement Mobile Money n'est disponible qu'en XAF." });
    }
    const numero = normaliserNumeroCM(req.body?.numero ?? ctx.pub.annonceur_telephone ?? ctx.payeur.telephone);
    const montantEnvoyeXaf = Math.round(ctx.montant);
    const frais = await fraisEnvoiAbonnement("campay", montantEnvoyeXaf, ctx.devise);

    const enCours = await prisma.transactionPaiement.findFirst({
      where: {
        fournisseur: "campay", publicite_id_cible: ctx.pub.publicite_id, statut: "en_attente", numero_payeur: numero,
        date_creation: { gte: new Date(Date.now() - FENETRE_ANTI_DOUBLE_CAMPAY_MS) },
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

    const transaction = await creerTransactionPublicite(ctx, {
      montant: montantEnvoyeXaf + frais.montant,
      devise: DEVISE_CAMPAY.toLowerCase(),
      fournisseur: "campay",
      numero_payeur: numero,
      frais_envoi_id: frais.ligne.frais_agregateur_id,
    });

    let collecte;
    try {
      collecte = await initierCollecte({
        montant: montantEnvoyeXaf,
        numero,
        description: texteSimple(`Publicite APS ${ctx.pub.titre}`).slice(0, 100),
        external_reference: transaction.transaction_id,
      });
    } catch (err) {
      if (err instanceof CampayError && err.issueIncertaine) {
        console.warn(`[campay] Collecte publicité à issue incertaine transaction=${transaction.transaction_id} : ${err.message}`);
        return res.status(202).json({ reference: null, ussd_code: null, operateur: null, incertain: true });
      }
      await marquerTransactionEchouee(transaction.transaction_id);
      throw err;
    }

    await prisma.transactionPaiement.update({
      where: { transaction_id: transaction.transaction_id },
      data: { campay_reference: collecte.reference, campay_operator: collecte.operator ?? null },
    });
    return res.status(201).json({ reference: collecte.reference, ussd_code: collecte.ussd_code ?? null, operateur: collecte.operator ?? null });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    if (err instanceof CampayError) {
      console.error("[campay] collecte publicité refusée :", err.code, err.payload);
      return res.status(err.status >= 500 ? 502 : 400).json({ message: err.message, code: err.code });
    }
    next(err);
  }
}

/** GET /api/publicites/:id/paiement — statut (polling des pages succès / Mobile Money). */
export async function obtenirStatutPaiementPublicite(req, res, next) {
  try {
    const pub = await chargerPubliciteAutorisee(req);
    const cible = { publicite_id: pub.publicite_id };
    try {
      await synchroniserCampayPour(cible);
    } catch (err) {
      console.error(`[campay] Synchronisation de la publicité ${pub.publicite_id} impossible :`, err.message);
    }
    await rattraperStripe(pub.publicite_id);

    const actuel = await prisma.publicite.findUnique({
      where: { publicite_id: pub.publicite_id },
      include: { emplacement_publicitaire: { select: { libelle: true } }, facture: { select: { numero: true } } },
    });
    const transaction = actuel.transaction_id
      ? await prisma.transactionPaiement.findUnique({
          where: { transaction_id: actuel.transaction_id },
          select: { statut: true, montant: true, devise: true, fournisseur: true },
        })
      : null;
    return res.status(200).json({
      statut_publicite: actuel.statut,
      publicite: { ...resumePublicite(actuel), facture_numero: actuel.facture?.numero ?? null },
      paiement: transaction ? { ...transaction, montant: Number(transaction.montant) } : null,
      tentative_campay: await derniereTentativeCampayPour(cible),
    });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}

/** POST /api/publicites/:id/paiement/annuler — annule les paiements en attente (jamais un paiement abouti). */
export async function annulerPaiementPublicite(req, res, next) {
  try {
    const pub = await chargerPubliciteAutorisee(req);
    const enAttente = await prisma.transactionPaiement.findMany({
      where: { publicite_id_cible: pub.publicite_id, statut: "en_attente" },
      orderBy: { date_creation: "asc" },
    });
    const dejaAbouti = () => new PaiementDejaExistantError("Un paiement vient d'aboutir pour cette publicité : sa confirmation est en cours.");

    let annulees = 0;
    for (const t of enAttente) {
      if (t.fournisseur === "campay") {
        if (!t.campay_reference) {
          throw new PaiementDejaExistantError(
            "Votre demande Mobile Money est en cours de vérification auprès de l'opérateur : patientez quelques minutes.",
            CODE_PAIEMENT_NON_ANNULABLE
          );
        }
        const issue = await verifierEtFinaliserTransactionCampay(t, { force: true });
        if (issue === "SUCCESSFUL") throw dejaAbouti();
        if (issue === "MONTANT_INCOHERENT") {
          throw new PaiementDejaExistantError("Ce paiement nécessite une vérification manuelle : contactez l'assistance.", CODE_PAIEMENT_NON_ANNULABLE);
        }
      } else if (t.stripe_checkout_session_id) {
        if ((await expirerSessionCheckout(t.stripe_checkout_session_id)) === "payee") throw dejaAbouti();
      }
      const { count } = await prisma.transactionPaiement.updateMany({
        where: { transaction_id: t.transaction_id, statut: "en_attente" },
        data: { statut: "echouee" },
      });
      annulees += count;
    }
    return res.status(200).json({ annulees });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    if (err instanceof CampayError) {
      return res.status(502).json({ message: "Impossible de vérifier le paiement auprès de l'opérateur. Réessayez dans un instant." });
    }
    next(err);
  }
}

/** GET /api/publicites/:id/facture — facture archivée du paiement abouti. */
export async function obtenirFacturePublicite(req, res, next) {
  try {
    const pub = await chargerPubliciteAutorisee(req);
    const facture = await prisma.facturePublicite.findUnique({ where: { publicite_id: pub.publicite_id } });
    if (!facture) {
      return res.status(409).json({ code: "PUBLICITE_NON_FACTUREE", message: "Aucune facture pour cette publicité (non payée)." });
    }
    return res.status(200).json({ facture: facture.snapshot });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}

/* ===================================================================
 * Administration : paiements tardifs (remboursement manuel)
 * =================================================================== */

/** GET /api/admin/publicites/paiements-tardifs?statut=a_traiter|effectue|traite */
export async function listerPaiementsTardifsPublicite(req, res, next) {
  try {
    const remboursements = await prisma.remboursementPaiement.findMany({
      where: { motif: MOTIF_PAIEMENT_TARDIF_PUBLICITE, statut: req.query.statut ?? "a_traiter" },
      include: {
        transaction: {
          select: {
            transaction_id: true, fournisseur: true, devise: true, montant: true, numero_payeur: true,
            campay_reference: true, stripe_payment_intent_id: true, publicite_id_cible: true, date_creation: true,
          },
        },
      },
      orderBy: { date_creation: "asc" },
    });
    const pubs = await prisma.publicite.findMany({
      where: { publicite_id: { in: remboursements.map((r) => r.transaction.publicite_id_cible).filter(Boolean) } },
      select: { publicite_id: true, titre: true, statut: true, annonceur_nom: true, annonceur_telephone: true },
    });
    const parId = new Map(pubs.map((p) => [p.publicite_id, p]));
    return res.status(200).json({
      remboursements: remboursements.map((r) => ({ ...r, publicite: parId.get(r.transaction.publicite_id_cible) ?? null })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/publicites/paiements-tardifs/:id/traiter
 * Stripe -> remboursé chez Stripe ; CamPay -> fonds renvoyés à la main, body { frais_reels }.
 */
export async function traiterPaiementTardifPublicite(req, res, next) {
  try {
    const r = await prisma.remboursementPaiement.findUnique({ where: { remboursement_id: req.params.id }, include: { transaction: true } });
    if (!r || r.motif !== MOTIF_PAIEMENT_TARDIF_PUBLICITE) return res.status(404).json({ message: "Remboursement introuvable." });
    if (r.statut !== "a_traiter") return res.status(409).json({ message: `Remboursement déjà traité (statut : ${r.statut}).` });
    const t = r.transaction;

    let maj;
    if (t.fournisseur === "stripe") {
      if (!t.stripe_payment_intent_id) {
        return res.status(409).json({ message: "Paiement Stripe sans PaymentIntent : remboursement à faire depuis le tableau de bord Stripe." });
      }
      const refund = await creerRemboursement({
        payment_intent_id: t.stripe_payment_intent_id,
        montant: r.montant,
        devise: t.devise,
        idempotency_key: `remb_${r.remboursement_id}`,
        metadata: { remboursement_id: r.remboursement_id, motif: MOTIF_PAIEMENT_TARDIF_PUBLICITE },
      });
      maj = { statut: "effectue", stripe_refund_id: refund.id };
    } else {
      const frais_reels = req.body?.frais_reels === undefined ? 0 : Number(req.body.frais_reels);
      if (!Number.isInteger(frais_reels) || frais_reels < 0) {
        return res.status(400).json({ message: "frais_reels doit être un entier positif ou nul." });
      }
      maj = { statut: "traite", frais_reels };
    }

    const ligne = await prisma.$transaction(async (tx) => {
      const { count } = await tx.remboursementPaiement.updateMany({ where: { remboursement_id: r.remboursement_id, statut: "a_traiter" }, data: maj });
      if (count === 0) throw new ErreurPublicite(409, "DEJA_TRAITE", "Remboursement traité entre-temps.");
      await tx.transactionPaiement.update({ where: { transaction_id: t.transaction_id }, data: { statut: "remboursee" } });
      await journaliserAudit(tx, {
        acteur_id: req.utilisateur.utilisateur_id, type: "PUBLICITE_REMBOURSEMENT_EXCEPTIONNEL", objet_type: "publicite",
        objet_id: t.publicite_id_cible,
        details: { remboursement_id: r.remboursement_id, transaction_id: t.transaction_id, fournisseur: t.fournisseur, montant: r.montant, ...maj },
      });
      return tx.remboursementPaiement.findUnique({ where: { remboursement_id: r.remboursement_id } });
    });
    return res.status(200).json({ remboursement: ligne });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}
