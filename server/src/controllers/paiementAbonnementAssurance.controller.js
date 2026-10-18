// src/controllers/paiementAbonnementAssurance.controller.js
// Souscription en ligne d'un abonnement assurance par le promoteur (agent
// de la fiche) — guide abonnements assurances v3, §1.5.
//
// On branche un NOUVEL OBJET PAYÉ (l'abonnement) sur la tuyauterie éprouvée
// du RDV : Stripe Checkout, collecte CamPay, mêmes webhooks, même cron de
// rapprochement. Hors périmètre d'un abonnement (politique) : pas
// d'escrow, pas de commission, pas de remboursement automatique.
//
// Règles transverses :
//   - le client n'envoie JAMAIS de montant : niveau_id + duree_mois, le
//     montant est figé sur le brouillon à sa création ;
//   - chaque route vérifie peutGererServiceAssurance (agent de CETTE fiche
//     ou admin) ;
//   - fiche publiée, compte payeur non suspendu (politique §2).

import prisma from "../lib/prisma.js";
import { creerSessionCheckout, expirerSessionCheckout } from "../lib/stripeService.js";
import { CampayError, DEVISE_CAMPAY, initierCollecte, normaliserNumeroCM } from "../lib/campayService.js";
import { peutGererServiceAssurance } from "../lib/accesAssurance.js";
import { resoudreDroits } from "../lib/droitsAssurance.js";
import { obtenirFraisActifs, calculerFraisEnvoi } from "../services/fraisAgregateur.service.js";
import { PaiementDejaExistantError, CODE_PAIEMENT_EN_COURS, CODE_PAIEMENT_NON_ANNULABLE } from "../services/antiDoublePaiement.service.js";
import {
  synchroniserCampayPour,
  derniereTentativeCampayPour,
  verifierEtFinaliserTransactionCampay,
} from "../services/paiementCampay.service.js";
import {
  ErreurAbonnement,
  repondreSiErreurAbonnement,
  exigerFichePubliee,
  verifierPayeur,
  evaluerAchat,
  gratuiteApplicable,
  creerBrouillonOuActiver,
} from "../services/abonnementAssurance.service.js";
import { DUREES_PROPOSEES } from "../services/tarifAbonnementAssurance.service.js";
import { construireDevisAbonnement } from "../services/factureAbonnement.service.js";
import { fraisEnvoiAbonnement, detailCheckoutAbonnement, libelleAbonnement } from "../services/fraisAbonnement.service.js";
import { synchroniserStripeAbonnement } from "../services/synchroStripeAbonnement.service.js";
import { journaliserAudit } from "../lib/audit.js";
import { repondreSiPaiementExistant, repondreSiBaremeAbsent, marquerTransactionEchouee } from "./paiement.controller.js";

const FENETRE_ANTI_DOUBLE_CAMPAY_MS = 2 * 60 * 1000;

/** Sans accents ni caractères spéciaux (description CamPay). */
function texteSimple(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w .,()+=-]/g, "");
}

/* ===================================================================
 * Contrôle préalable (§1.5.4)
 * =================================================================== */

/**
 * Abonnement payable par l'utilisateur connecté. Lève ErreurAbonnement
 * (404/403/409) sinon. Ne crée rien.
 */
async function verifierAbonnementPayable(req) {
  const abo = await prisma.abonnementAssurance.findUnique({
    where: { abonnement_id: req.params.id },
    include: { service: true, niveau: true },
  });
  if (!abo) throw new ErreurAbonnement(404, "ABONNEMENT_INTROUVABLE", "Abonnement introuvable.");
  if (!(await peutGererServiceAssurance(req.utilisateur, abo.service_assurance_id))) {
    throw new ErreurAbonnement(403, "ACCES_REFUSE", "Cet abonnement ne vous appartient pas.");
  }
  if (abo.statut !== "en_attente_paiement") {
    throw new ErreurAbonnement(409, "ABONNEMENT_NON_PAYABLE", `Cet abonnement ne peut plus être payé (statut : ${abo.statut}).`);
  }
  exigerFichePubliee(abo.service);
  const payeur = await verifierPayeur(req.utilisateur.utilisateur_id);
  if (!(Number(abo.montant_total) > 0)) {
    throw new ErreurAbonnement(409, "MONTANT_NUL", "Aucun montant à payer pour cet abonnement.");
  }
  return { abo, service: abo.service, niveau: abo.niveau, payeur, montant: Number(abo.montant_total), devise: abo.devise };
}

/** Abonnement lisible par l'utilisateur connecté (statut, facture, devis). */
async function chargerAbonnementAutorise(req) {
  const abo = await prisma.abonnementAssurance.findUnique({
    where: { abonnement_id: req.params.id },
    include: { service: true, niveau: true },
  });
  if (!abo) throw new ErreurAbonnement(404, "ABONNEMENT_INTROUVABLE", "Abonnement introuvable.");
  if (!(await peutGererServiceAssurance(req.utilisateur, abo.service_assurance_id))) {
    throw new ErreurAbonnement(403, "ACCES_REFUSE", "Cet abonnement ne vous appartient pas.");
  }
  return abo;
}

/**
 * Transaction `en_attente` de l'abonnement, sous verrou de la ligne
 * abonnement (deux clics simultanés -> une seule transaction). CamPay :
 * refus si une demande a été envoyée il y a moins de 2 min.
 */
async function creerTransactionAbonnement(ctx, donnees) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM abonnement_assurance WHERE abonnement_id = ${ctx.abo.abonnement_id}::uuid FOR UPDATE`;
    const abo = await tx.abonnementAssurance.findUnique({ where: { abonnement_id: ctx.abo.abonnement_id } });
    if (abo.statut !== "en_attente_paiement") {
      throw new ErreurAbonnement(409, "ABONNEMENT_NON_PAYABLE", `Cet abonnement ne peut plus être payé (statut : ${abo.statut}).`);
    }
    if (donnees.fournisseur === "campay") {
      const recente = await tx.transactionPaiement.findFirst({
        where: {
          abonnement_assurance_id_cible: abo.abonnement_id,
          fournisseur: "campay",
          statut: "en_attente",
          date_creation: { gte: new Date(Date.now() - FENETRE_ANTI_DOUBLE_CAMPAY_MS) },
        },
      });
      if (recente) {
        throw new PaiementDejaExistantError(
          "Une demande Mobile Money est déjà en cours pour cet abonnement : validez-la sur votre téléphone.",
          CODE_PAIEMENT_EN_COURS
        );
      }
    }
    // Honoraires, commissions : NULL (pas d'escrow ni de commission sur un abonnement).
    return tx.transactionPaiement.create({
      data: { statut: "en_attente", abonnement_assurance_id_cible: abo.abonnement_id, ...donnees },
    });
  });
}

/**
 * Estimation des frais CamPay (payés EN SUS par le promoteur à l'opérateur,
 * comme pour le RDV — guide §1.5.3, option retenue « frais en sus ») : le
 * montant enregistré sur la transaction = montant APS + frais estimés, pour
 * que le contrôle montantEtDeviseCoherents compare au débit réel.
 */
async function fraisCampay(montant) {
  const frais = await obtenirFraisActifs("campay");
  return { ligne: frais.envoi, montant: calculerFraisEnvoi(Math.round(montant), frais.envoi, 0) };
}

/** Réponse d'erreur commune aux routes de ce contrôleur ; true si traitée. */
/** Rattrapage des paiements Stripe sans webhook ; un échec n'empêche jamais la réponse. */
async function rattraperStripe(nature, abonnement_id) {
  try {
    await synchroniserStripeAbonnement(nature, abonnement_id);
  } catch (err) {
    console.error(`[stripe] Rattrapage de l'abonnement ${abonnement_id} impossible :`, err.message);
  }
}

function repondreErreurConnue(err, res) {
  if (repondreSiErreurAbonnement(err, res)) return true;
  if (repondreSiPaiementExistant(err, res)) return true;
  if (repondreSiBaremeAbsent(err, res)) return true;
  return false;
}

/* ===================================================================
 * Offres et brouillon
 * =================================================================== */

/**
 * GET /api/abonnements-assurance/offres?service_assurance_id=
 * Niveaux vendables avec, pour chaque durée, le montant que paierait CETTE
 * fiche (renouvellement, montée au prorata), l'abonnement courant, le
 * brouillon éventuel et la gratuité applicable. Aucune écriture.
 */
export async function obtenirOffres(req, res, next) {
  try {
    const { service_assurance_id } = req.query;
    if (!service_assurance_id) {
      return res.status(400).json({ message: "Paramètre requis : service_assurance_id." });
    }
    if (!(await peutGererServiceAssurance(req.utilisateur, service_assurance_id))) {
      return res.status(403).json({ message: "Accès réservé à l'agent de cette fiche ou à un administrateur." });
    }
    const service = await prisma.serviceAssurance.findUnique({ where: { service_assurance_id } });
    if (!service) return res.status(404).json({ message: "Service d'assurance introuvable." });

    const [niveaux, remises, resolution, brouillon] = await Promise.all([
      prisma.niveauAbonnementAssurance.findMany({ where: { actif: true }, orderBy: { rang: "asc" } }),
      prisma.remiseDureeAbonnementAssurance.findMany({
        where: { duree_mois: { in: DUREES_PROPOSEES } },
        orderBy: { duree_mois: "asc" },
      }),
      resoudreDroits(service_assurance_id),
      prisma.abonnementAssurance.findFirst({
        where: { service_assurance_id, statut: "en_attente_paiement" },
        include: { niveau: { select: { code: true, libelle: true } } },
      }),
    ]);

    const offres = [];
    for (const niveau of niveaux) {
      const gratuite = await gratuiteApplicable(prisma, { service, niveau_id: niveau.niveau_id });
      const durees = [];
      for (const r of remises) {
        try {
          const c = await evaluerAchat(prisma, { service, niveau, duree_mois: r.duree_mois });
          durees.push({
            duree_mois: r.duree_mois,
            remise_pourcent: Number(r.remise_pourcent),
            prix_mensuel: Number(c.prix_mensuel_applique),
            credit_prorata: Number(c.credit_prorata),
            montant_total: gratuite ? 0 : Number(c.montant_total),
            devise: c.devise,
            montee_de_niveau: !!c.abonnement_remplace_id,
            disponible: true,
          });
        } catch (err) {
          if (err instanceof ErreurAbonnement) {
            durees.push({ duree_mois: r.duree_mois, disponible: false, code: err.code, message: err.message });
          } else if (/^Aucune ligne/.test(err.message)) {
            durees.push({ duree_mois: r.duree_mois, disponible: false, code: "TARIF_ABSENT", message: "Tarif non encore défini pour votre pays." });
          } else {
            throw err;
          }
        }
      }
      offres.push({
        niveau_id: niveau.niveau_id,
        code: niveau.code,
        libelle: niveau.libelle,
        rang: niveau.rang,
        avantages: {
          siege_complet: niveau.siege_complet,
          afficher_activites: niveau.afficher_activites,
          afficher_agences: niveau.afficher_agences,
          formulaire_contact: niveau.formulaire_contact,
          suivi_demandes: niveau.suivi_demandes,
          // Portail assurance (médiathèque, tableau de bord).
          video_presentation: niveau.video_presentation,
          stats_completes: niveau.stats_completes,
          max_agences: niveau.max_agences,
          max_photos: niveau.max_photos,
        },
        gratuite: gratuite ? { jusqu_au: gratuite.gratuite_jusqu_au } : null,
        durees,
      });
    }

    return res.status(200).json({
      service_assurance: {
        service_assurance_id: service.service_assurance_id,
        nom: service.nom,
        statut_verification: service.statut_verification,
      },
      abonnement_courant: {
        statut_abonnement: resolution.statut_abonnement,
        niveau_presence: resolution.droits.niveau_presence,
        date_fin: resolution.date_fin,
        en_grace: resolution.en_grace,
      },
      brouillon: brouillon
        ? {
            abonnement_id: brouillon.abonnement_id,
            niveau: brouillon.niveau,
            duree_mois: brouillon.duree_mois,
            montant_total: Number(brouillon.montant_total),
            devise: brouillon.devise,
            origine: brouillon.origine,
          }
        : null,
      offres,
    });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}

/**
 * POST /api/abonnements-assurance   body: { service_assurance_id, niveau_id, duree_mois }
 * Crée (ou réutilise) le brouillon ; active directement une gratuité ou un
 * montant nul. 201 brouillon créé, 200 réutilisé, 201 + active=true si activé.
 */
export async function creerAbonnement(req, res, next) {
  try {
    const { service_assurance_id, niveau_id } = req.body ?? {};
    const duree_mois = Number(req.body?.duree_mois);
    if (!service_assurance_id || !niveau_id || !Number.isInteger(duree_mois)) {
      return res.status(400).json({ message: "Champs requis : service_assurance_id, niveau_id, duree_mois (entier)." });
    }
    if (!(await peutGererServiceAssurance(req.utilisateur, service_assurance_id))) {
      return res.status(403).json({ message: "Accès réservé à l'agent de cette fiche ou à un administrateur." });
    }
    const [service, niveau] = await Promise.all([
      prisma.serviceAssurance.findUnique({ where: { service_assurance_id } }),
      prisma.niveauAbonnementAssurance.findUnique({ where: { niveau_id } }),
    ]);
    if (!service) return res.status(404).json({ message: "Service d'assurance introuvable." });
    if (!niveau) return res.status(400).json({ message: "niveau_id introuvable." });
    exigerFichePubliee(service);
    await verifierPayeur(req.utilisateur.utilisateur_id);

    const { abonnement, active, reutilise } = await creerBrouillonOuActiver({
      service,
      niveau,
      duree_mois,
      acteur_id: req.utilisateur.utilisateur_id,
    });

    return res.status(reutilise ? 200 : 201).json({
      abonnement: {
        abonnement_id: abonnement.abonnement_id,
        statut: abonnement.statut,
        origine: abonnement.origine,
        duree_mois: abonnement.duree_mois,
        montant_total: Number(abonnement.montant_total),
        devise: abonnement.devise,
        date_debut: abonnement.date_debut,
        date_fin: abonnement.date_fin,
      },
      active,
    });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}

/**
 * GET /api/abonnements-assurance/:id/devis?agregateur=stripe|campay
 * Devis recalculé (jamais stocké), aucune écriture. Carte et Mobile Money :
 * frais d'agrégateur en vigueur ajoutés au total, comme pour un RDV.
 */
export async function obtenirDevis(req, res, next) {
  try {
    const agregateur = req.query.agregateur ?? "stripe";
    if (!["stripe", "campay", "virement"].includes(agregateur)) {
      return res.status(400).json({ message: "agregateur invalide. Valeurs acceptées : stripe, campay, virement." });
    }
    const abo = await chargerAbonnementAutorise(req);
    if (abo.statut !== "en_attente_paiement") {
      throw new ErreurAbonnement(409, "ABONNEMENT_NON_PAYABLE", `Cet abonnement n'est plus à payer (statut : ${abo.statut}).`);
    }
    const frais = await fraisEnvoiAbonnement(agregateur, Number(abo.montant_total), abo.devise);
    const devis = construireDevisAbonnement({ abonnement: abo, niveau: abo.niveau, service: abo.service, frais_agregateur: frais });
    return res.status(200).json({ ...devis, agregateur });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}

/* ===================================================================
 * Paiement (§1.5.5)
 * =================================================================== */

/** POST /api/abonnements-assurance/:id/paiement — Stripe Checkout -> { url } */
export async function creerPaiementStripe(req, res, next) {
  try {
    // Session déjà payée sans webhook reçu : activée ici, puis refusée
    // ci-dessous comme « plus à payer » au lieu de rester bloquée.
    await rattraperStripe("assurance", req.params.id);
    const ctx = await verifierAbonnementPayable(req);

    // Session Checkout ouverte (page fermée puis réessai) : expirée avant
    // d'en ouvrir une autre ; payée entre-temps -> 409, le webhook finalisera.
    const ouvertes = await prisma.transactionPaiement.findMany({
      where: {
        abonnement_assurance_id_cible: ctx.abo.abonnement_id,
        fournisseur: "stripe",
        statut: "en_attente",
        stripe_checkout_session_id: { not: null },
      },
    });
    for (const t of ouvertes) {
      if ((await expirerSessionCheckout(t.stripe_checkout_session_id)) === "payee") {
        throw new PaiementDejaExistantError(
          "Un paiement vient d'aboutir pour cet abonnement : son activation est en cours.",
          CODE_PAIEMENT_EN_COURS
        );
      }
      await marquerTransactionEchouee(t.transaction_id);
    }

    // Total débité = abonnement + frais d'agrégateur (ligne figée sur la transaction).
    const frais = await fraisEnvoiAbonnement("stripe", ctx.montant, ctx.devise);
    const devis = construireDevisAbonnement({ abonnement: ctx.abo, niveau: ctx.niveau, service: ctx.service, frais_agregateur: frais });
    const transaction = await creerTransactionAbonnement(ctx, {
      montant: devis.total,
      devise: ctx.devise,
      fournisseur: "stripe",
      frais_envoi_id: frais.ligne.frais_agregateur_id,
    });

    let session;
    try {
      const base = process.env.FRONTEND_URL || "http://localhost:5173";
      const libelle = `${libelleAbonnement("Abonnement", ctx.niveau)} (${ctx.abo.duree_mois} mois)`;
      // Prix sans réduction + frais, remise par coupon, récapitulatif des montants.
      const detail = detailCheckoutAbonnement(devis, { duree_mois: ctx.abo.duree_mois });
      session = await creerSessionCheckout({
        montant: devis.total,
        devise: ctx.devise,
        transaction_id: transaction.transaction_id,
        metadata: { objet: "abonnement_assurance" }, // l'abonnement se lit via la transaction
        libelle,
        ...detail,
        description_facture: `Abonnement APS Santé - ${ctx.service.nom}`,
        email_client: ctx.payeur.email,
        url_succes: `${base}/paiement/abonnement/succes?abonnement_id=${ctx.abo.abonnement_id}`,
        url_annulation: `${base}/paiement/abonnement/annule?abonnement_id=${ctx.abo.abonnement_id}`,
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

/**
 * POST /api/abonnements-assurance/:id/paiement-campay   body: { numero }
 * -> { reference, ussd_code, operateur } ; 202 si l'issue de la collecte est
 * incertaine (la transaction reste en_attente, rattachée par callback / cron).
 */
export async function creerPaiementCampay(req, res, next) {
  try {
    const ctx = await verifierAbonnementPayable(req);
    if (ctx.devise !== DEVISE_CAMPAY.toLowerCase()) {
      return res.status(409).json({ message: "Le paiement Mobile Money n'est disponible qu'en XAF." });
    }

    const numero = normaliserNumeroCM(req.body?.numero ?? ctx.payeur.telephone);
    const montantEnvoyeXaf = Math.round(ctx.montant); // CamPay refuse les décimales (ER201)
    const frais = await fraisCampay(ctx.montant);

    // Même numéro, moins de 2 min : on renvoie la tentative en cours (y compris
    // à issue incertaine : la rejouer risquerait un double débit).
    const enCours = await prisma.transactionPaiement.findFirst({
      where: {
        fournisseur: "campay",
        abonnement_assurance_id_cible: ctx.abo.abonnement_id,
        statut: "en_attente",
        numero_payeur: numero,
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

    const transaction = await creerTransactionAbonnement(ctx, {
      // Débit attendu = montant APS + frais CamPay (estimés), comme pour le RDV.
      montant: montantEnvoyeXaf + frais.montant,
      devise: DEVISE_CAMPAY.toLowerCase(),
      fournisseur: "campay",
      numero_payeur: numero,
      frais_envoi_id: frais.ligne.frais_agregateur_id,
    });

    const court = texteSimple(`Abonnement APS ${ctx.niveau.libelle} ${ctx.abo.duree_mois} mois`);
    let collecte;
    try {
      collecte = await initierCollecte({
        montant: montantEnvoyeXaf, // CamPay y ajoute ses frais
        numero,
        description: court.slice(0, 100),
        external_reference: transaction.transaction_id,
      });
    } catch (err) {
      if (err instanceof CampayError && err.issueIncertaine) {
        console.warn(`[campay] Collecte abonnement à issue incertaine transaction=${transaction.transaction_id} : ${err.message}`);
        return res.status(202).json({ reference: null, ussd_code: null, operateur: null, incertain: true });
      }
      await marquerTransactionEchouee(transaction.transaction_id);
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
    if (repondreErreurConnue(err, res)) return;
    if (err instanceof CampayError) {
      console.error("[campay] collecte abonnement refusée :", err.code, err.payload);
      return res.status(err.status >= 500 ? 502 : 400).json({ message: err.message, code: err.code });
    }
    next(err);
  }
}

/**
 * GET /api/abonnements-assurance/:id/paiement — statut (polling).
 * Même forme que le statut du RDV (`paiement.statut`, `tentative_campay`)
 * pour réutiliser les composants web sans toucher au polling.
 */
export async function obtenirStatutPaiement(req, res, next) {
  try {
    const abo = await chargerAbonnementAutorise(req);

    try {
      await synchroniserCampayPour({ abonnement_id: abo.abonnement_id });
    } catch (err) {
      console.error(`[campay] Synchronisation de l'abonnement ${abo.abonnement_id} impossible :`, err.message);
    }
    await rattraperStripe("assurance", abo.abonnement_id);
    const actuel = await prisma.abonnementAssurance.findUnique({
      where: { abonnement_id: abo.abonnement_id },
      include: {
        transaction: { select: { statut: true, montant: true, devise: true, fournisseur: true } },
        facture: { select: { numero: true } },
      },
    });

    return res.status(200).json({
      statut_abonnement: actuel.statut,
      abonnement: {
        abonnement_id: actuel.abonnement_id,
        service_assurance_id: actuel.service_assurance_id,
        niveau: { code: abo.niveau.code, libelle: abo.niveau.libelle },
        duree_mois: actuel.duree_mois,
        date_debut: actuel.date_debut,
        date_fin: actuel.date_fin,
        montant_total: Number(actuel.montant_total),
        devise: actuel.devise,
        facture_numero: actuel.facture?.numero ?? null,
      },
      paiement: actuel.transaction
        ? {
            statut: actuel.transaction.statut,
            montant: Number(actuel.transaction.montant),
            devise: actuel.transaction.devise,
            fournisseur: actuel.transaction.fournisseur,
          }
        : null,
      tentative_campay: await derniereTentativeCampayPour({ abonnement_id: abo.abonnement_id }),
    });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}

/**
 * POST /api/abonnements-assurance/:id/paiement/annuler
 * Annule les paiements `en_attente` (Stripe, Mobile Money) pour permettre
 * d'en relancer un ou de changer de formule. Un paiement abouti n'est jamais
 * annulé (409) ; une collecte CamPay à issue incertaine non plus.
 */
export async function annulerPaiementEnCours(req, res, next) {
  try {
    const abo = await chargerAbonnementAutorise(req);
    const enAttente = await prisma.transactionPaiement.findMany({
      where: { abonnement_assurance_id_cible: abo.abonnement_id, statut: "en_attente" },
      orderBy: { date_creation: "asc" },
    });
    const dejaAbouti = () =>
      new PaiementDejaExistantError("Un paiement vient d'aboutir pour cet abonnement : son activation est en cours.");

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
          throw new PaiementDejaExistantError(
            "Ce paiement nécessite une vérification manuelle : contactez l'assistance.",
            CODE_PAIEMENT_NON_ANNULABLE
          );
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

/**
 * POST /api/abonnements-assurance/:id/virement
 * Le promoteur choisit le virement (montants élevés, EF-PAY-14) : le
 * brouillon passe en origine « virement » (il n'est plus annulé
 * automatiquement après 24 h) et les instructions s'affichent. L'activation
 * se fait par l'admin (« Encaissement constaté »).
 */
export async function choisirVirement(req, res, next) {
  try {
    const ctx = await verifierAbonnementPayable(req);
    const ouverte = await prisma.transactionPaiement.findFirst({
      where: { abonnement_assurance_id_cible: ctx.abo.abonnement_id, statut: "en_attente" },
    });
    if (ouverte) {
      throw new ErreurAbonnement(409, "PAIEMENT_EN_COURS", "Un paiement en ligne est en cours : annulez-le avant de choisir le virement.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.abonnementAssurance.updateMany({
        where: { abonnement_id: ctx.abo.abonnement_id, statut: "en_attente_paiement" },
        data: { origine: "virement" },
      });
      await journaliserAudit(tx, {
        acteur_id: req.utilisateur.utilisateur_id,
        type: "ABONNEMENT_VIREMENT_DEMANDE",
        objet_type: "abonnement_assurance",
        objet_id: ctx.abo.abonnement_id,
        details: { montant_total: ctx.montant, devise: ctx.devise },
      });
    });
    return res.status(200).json({
      reference: ctx.abo.abonnement_id,
      montant: ctx.montant,
      devise: ctx.devise,
      instructions:
        process.env.ABONNEMENT_VIREMENT_INSTRUCTIONS ||
        "Effectuez le virement sur le compte bancaire d'APS Santé communiqué par notre service commercial, " +
          "en indiquant la référence ci-dessus. Votre abonnement sera activé dès réception des fonds.",
    });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}

/** GET /api/abonnements-assurance/:id/facture — facture archivée du paiement abouti. */
export async function obtenirFacture(req, res, next) {
  try {
    const abo = await chargerAbonnementAutorise(req);
    const facture = await prisma.factureAbonnementAssurance.findUnique({ where: { abonnement_id: abo.abonnement_id } });
    if (!facture) {
      return res.status(409).json({ code: "ABONNEMENT_NON_FACTURE", message: "Aucune facture pour cet abonnement (non payé ou sans montant)." });
    }
    return res.status(200).json({ facture: facture.snapshot });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}
