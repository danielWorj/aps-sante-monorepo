// src/controllers/paiementAbonnementPresence.controller.js
// Souscription en ligne d'un abonnement de présence par le gestionnaire de
// la fiche : agent de la pharmacie, agent du centre de santé, ou le médecin
// lui-même. Même tuyauterie que les abonnements assurance (Stripe Checkout,
// collecte CamPay, virement, mêmes webhooks et cron de rapprochement) ;
// paiement direct à la plateforme, HORS escrow, sans commission.
//
// Règles transverses :
//   - le client n'envoie JAMAIS de montant (niveau_id + duree_mois) ;
//   - chaque route vérifie peutGererFichePresence (gestionnaire de CETTE
//     fiche ou admin) ;
//   - fiche publiée, compte payeur non suspendu ;
//   - médecins : uniquement dans un pays où l'abonnement est obligatoire.

import prisma from "../lib/prisma.js";
import { creerSessionCheckout, expirerSessionCheckout } from "../lib/stripeService.js";
import { CampayError, DEVISE_CAMPAY, initierCollecte, normaliserNumeroCM } from "../lib/campayService.js";
import { construireUrl } from "../lib/cloudinaryService.js";
import { journaliserAudit } from "../lib/audit.js";
import { debutDuJourUtc } from "../lib/droitsAssurance.js";
import {
  acteur,
  acteurIdDe,
  estFicheEnLigne,
  filtreAbonnementsDe,
  peutGererFichePresence,
} from "../lib/acteursPresence.js";
import { resoudreDroitsPresence } from "../lib/droitsPresence.js";
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
  verifierPayeur,
  chargerFicheOuErreur,
  exigerFichePubliee,
  exigerAbonnementRequis,
  abonnementRequis,
  evaluerAchatPresence,
  gratuitePresenceApplicable,
  creerBrouillonOuActiverPresence,
} from "../services/abonnementPresence.service.js";
import { DUREES_PROPOSEES } from "../services/tarifAbonnementPresence.service.js";
import { construireDevisAbonnementPresence } from "../services/factureAbonnementPresence.service.js";
import { fraisEnvoiAbonnement, detailCheckoutAbonnement, libelleAbonnement } from "../services/fraisAbonnement.service.js";
import { synchroniserStripeAbonnement } from "../services/synchroStripeAbonnement.service.js";
import { statistiquesFiche } from "../services/vuesFiche.service.js";
import { repondreSiPaiementExistant, repondreSiBaremeAbsent, marquerTransactionEchouee } from "./paiement.controller.js";

const FENETRE_ANTI_DOUBLE_CAMPAY_MS = 2 * 60 * 1000;

// Avantages affichés au gestionnaire (offres), selon le type d'acteur.
const AVANTAGES_PAR_TYPE = {
  pharmacie: ["contact_direct", "photos", "description_enrichie", "statistiques", "statistiques_detaillees"],
  structure: ["contact_direct", "photos", "description_enrichie", "presentation_equipe", "multimedia", "statistiques", "statistiques_detaillees", "multi_utilisateurs", "support_prioritaire"],
  medecin: ["contact_direct", "photos", "description_enrichie", "prise_rdv_en_ligne", "multimedia", "statistiques", "statistiques_detaillees", "support_prioritaire"],
};

function texteSimple(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w .,()+=-]/g, "");
}

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

async function exigerGestionnaire(req, type, acteur_id) {
  if (!acteur_id) throw new ErreurAbonnement(400, "ACTEUR_REQUIS", "Paramètre requis : acteur_id.");
  if (!(await peutGererFichePresence(req.utilisateur, type, acteur_id))) {
    throw new ErreurAbonnement(403, "ACCES_REFUSE", "Accès réservé au gestionnaire de cette fiche ou à un administrateur.");
  }
}

/* ===================================================================
 * Contrôles par abonnement
 * =================================================================== */

/** Abonnement + fiche, lisibles par l'utilisateur connecté. */
async function chargerAbonnementAutorise(req) {
  const abo = await prisma.abonnementPresence.findUnique({
    where: { abonnement_id: req.params.id },
    include: { niveau: true },
  });
  if (!abo) throw new ErreurAbonnement(404, "ABONNEMENT_INTROUVABLE", "Abonnement introuvable.");
  if (!(await peutGererFichePresence(req.utilisateur, abo.type_acteur, acteurIdDe(abo)))) {
    throw new ErreurAbonnement(403, "ACCES_REFUSE", "Cet abonnement ne vous appartient pas.");
  }
  const fiche = await chargerFicheOuErreur(prisma, abo.type_acteur, acteurIdDe(abo));
  return { abo, fiche };
}

/** Abonnement payable par l'utilisateur connecté ; ne crée rien. */
async function verifierAbonnementPayable(req) {
  const { abo, fiche } = await chargerAbonnementAutorise(req);
  if (abo.statut !== "en_attente_paiement") {
    throw new ErreurAbonnement(409, "ABONNEMENT_NON_PAYABLE", `Cet abonnement ne peut plus être payé (statut : ${abo.statut}).`);
  }
  exigerFichePubliee(fiche);
  const payeur = await verifierPayeur(req.utilisateur.utilisateur_id);
  if (!(Number(abo.montant_total) > 0)) {
    throw new ErreurAbonnement(409, "MONTANT_NUL", "Aucun montant à payer pour cet abonnement.");
  }
  return { abo, fiche, niveau: abo.niveau, payeur, montant: Number(abo.montant_total), devise: abo.devise };
}

/** Transaction `en_attente`, sous verrou de la ligne abonnement (double clic -> une seule). */
async function creerTransactionAbonnement(ctx, donnees) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM abonnement_presence WHERE abonnement_id = ${ctx.abo.abonnement_id}::uuid FOR UPDATE`;
    const abo = await tx.abonnementPresence.findUnique({ where: { abonnement_id: ctx.abo.abonnement_id } });
    if (abo.statut !== "en_attente_paiement") {
      throw new ErreurAbonnement(409, "ABONNEMENT_NON_PAYABLE", `Cet abonnement ne peut plus être payé (statut : ${abo.statut}).`);
    }
    if (donnees.fournisseur === "campay") {
      const recente = await tx.transactionPaiement.findFirst({
        where: {
          abonnement_presence_id_cible: abo.abonnement_id,
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
    // Hors escrow : ni honoraires ni commission.
    return tx.transactionPaiement.create({
      data: { statut: "en_attente", abonnement_presence_id_cible: abo.abonnement_id, ...donnees },
    });
  });
}

/** Frais CamPay estimés, payés EN SUS (montant de la transaction = APS + frais). */
async function fraisCampay(montant) {
  const frais = await obtenirFraisActifs("campay");
  return { ligne: frais.envoi, montant: calculerFraisEnvoi(Math.round(montant), frais.envoi, 0) };
}

/* ===================================================================
 * Fiche du gestionnaire et vue de gestion
 * =================================================================== */

/**
 * GET /api/abonnements-presence/:type/mon-acteur
 * Fiche gérée par l'utilisateur connecté (404 sinon) et si l'abonnement
 * est requis (médecins : selon le pays).
 */
export async function obtenirMonActeur(req, res, next) {
  try {
    const { type } = req.params;
    const id = await acteur(type).acteurDeUtilisateur(req.utilisateur.utilisateur_id, req.utilisateur.espace);
    if (!id) return res.status(404).json({ message: `Aucune fiche ${acteur(type).libelle} rattachée à ce compte.` });
    const fiche = await chargerFicheOuErreur(prisma, type, id);
    return res.status(200).json({
      type_acteur: type,
      fiche: {
        acteur_id: fiche.acteur_id, nom: fiche.nom, statut_verification: fiche.statut_verification,
        en_ligne: estFicheEnLigne(fiche),
      },
      abonnement_requis: await abonnementRequis(prisma, type, fiche),
    });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}

/** Contenus (publics ou enrichis) de la fiche, toujours lus EN ENTIER par son gestionnaire. */
async function contenusDeLaFiche(type, id) {
  if (type === "pharmacie") {
    const p = await prisma.pharmacie.findUnique({
      where: { pharmacie_id: id },
      select: { telephone: true, image_nom: true, description_enrichie: true, services_particuliers: true },
    });
    return { telephone: p.telephone, image_url: construireUrl(p.image_nom), description_enrichie: p.description_enrichie, services_particuliers: p.services_particuliers };
  }
  if (type === "structure") {
    const s = await prisma.structureSante.findUnique({
      where: { structure_id: id },
      select: { telephone: true, image_nom: true, description_enrichie: true, presentation_equipe: true },
    });
    return { telephone: s.telephone, image_url: construireUrl(s.image_nom), description_enrichie: s.description_enrichie, presentation_equipe: s.presentation_equipe };
  }
  const m = await prisma.medecin.findUnique({
    where: { medecin_id: id },
    select: { photo_url: true, biographie: true, utilisateur: { select: { telephone: true } } },
  });
  return { telephone: m.utilisateur?.telephone ?? null, image_url: m.photo_url ? construireUrl(m.photo_url) : null, biographie: m.biographie };
}

/**
 * GET /api/abonnements-presence/:type/gestion?acteur_id=
 * Vue PROPRIÉTAIRE : droits appliqués au public, abonnement en cours,
 * brouillon, historique (avec factures) et contenus conservés en base.
 */
export async function obtenirGestion(req, res, next) {
  try {
    const { type } = req.params;
    const acteur_id = req.query.acteur_id;
    await exigerGestionnaire(req, type, acteur_id);
    const fiche = await chargerFicheOuErreur(prisma, type, acteur_id);

    const [resolution, historique, brouillon, contenus] = await Promise.all([
      resoudreDroitsPresence(type, acteur_id),
      prisma.abonnementPresence.findMany({
        where: { ...filtreAbonnementsDe(type, acteur_id), statut: { not: "en_attente_paiement" } },
        include: {
          niveau: { select: { code: true, libelle: true, rang: true } },
          facture: { select: { facture_id: true, numero: true, date_emission: true } },
        },
        orderBy: { date_creation: "desc" },
      }),
      prisma.abonnementPresence.findFirst({
        where: { ...filtreAbonnementsDe(type, acteur_id), statut: "en_attente_paiement" },
        include: { niveau: { select: { code: true, libelle: true } } },
      }),
      contenusDeLaFiche(type, acteur_id),
    ]);

    const { droits, statut_abonnement, date_fin, en_grace, abonnement_id, abonnement_requis } = resolution;
    const courant = abonnement_id ? historique.find((a) => a.abonnement_id === abonnement_id) : null;
    const jours_restants = statut_abonnement === "actif" && date_fin
      ? Math.round((date_fin - debutDuJourUtc()) / 86_400_000)
      : null;

    return res.status(200).json({
      type_acteur: type,
      fiche,
      contenus,
      droits,
      abonnement_requis,
      abonnement: { statut_abonnement, abonnement_id, niveau: courant?.niveau ?? null, date_fin, en_grace, jours_restants },
      brouillon: brouillon
        ? {
            abonnement_id: brouillon.abonnement_id,
            niveau: brouillon.niveau,
            duree_mois: brouillon.duree_mois,
            montant_total: brouillon.montant_total,
            devise: brouillon.devise,
            origine: brouillon.origine,
            date_creation: brouillon.date_creation,
          }
        : null,
      historique: historique.map((a) => ({
        abonnement_id: a.abonnement_id,
        niveau: a.niveau,
        duree_mois: a.duree_mois,
        date_debut: a.date_debut,
        date_fin: a.date_fin,
        statut: a.statut,
        origine: a.origine,
        montant_total: a.montant_total,
        devise: a.devise,
        facture: a.facture,
      })),
    });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}

/* ===================================================================
 * Offres et brouillon
 * =================================================================== */

/**
 * GET /api/abonnements-presence/:type/offres?acteur_id=
 * Niveaux vendables de ce type avec, pour chaque durée, le montant que
 * paierait CETTE fiche. Aucune écriture.
 */
export async function obtenirOffres(req, res, next) {
  try {
    const { type } = req.params;
    const acteur_id = req.query.acteur_id;
    await exigerGestionnaire(req, type, acteur_id);
    const fiche = await chargerFicheOuErreur(prisma, type, acteur_id);

    const [niveaux, remises, resolution, brouillon, requis] = await Promise.all([
      prisma.niveauAbonnementPresence.findMany({ where: { type_acteur: type, actif: true }, orderBy: { rang: "asc" } }),
      prisma.remiseDureeAbonnementPresence.findMany({
        where: { type_acteur: type, duree_mois: { in: DUREES_PROPOSEES } },
        orderBy: { duree_mois: "asc" },
      }),
      resoudreDroitsPresence(type, acteur_id),
      prisma.abonnementPresence.findFirst({
        where: { ...filtreAbonnementsDe(type, acteur_id), statut: "en_attente_paiement" },
        include: { niveau: { select: { code: true, libelle: true } } },
      }),
      abonnementRequis(prisma, type, fiche),
    ]);

    const offres = [];
    for (const niveau of niveaux) {
      const gratuite = await gratuitePresenceApplicable(prisma, { type, fiche, niveau_id: niveau.niveau_id });
      const durees = [];
      for (const r of remises) {
        if (gratuite) {
          // Déjà accordé à la fiche pendant l'amorçage : rien à souscrire.
          durees.push({ duree_mois: r.duree_mois, disponible: false, code: "NIVEAU_DEJA_OFFERT", message: "Inclus gratuitement pendant la période de lancement." });
          continue;
        }
        try {
          const c = await evaluerAchatPresence(prisma, { type, fiche, niveau, duree_mois: r.duree_mois });
          durees.push({
            duree_mois: r.duree_mois,
            remise_pourcent: Number(r.remise_pourcent),
            prix_mensuel: Number(c.prix_mensuel_applique),
            credit_prorata: Number(c.credit_prorata),
            montant_total: Number(c.montant_total),
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
        avantages: Object.fromEntries(AVANTAGES_PAR_TYPE[type].map((cle) => [cle, niveau[cle]])),
        gratuite: gratuite ? { jusqu_au: gratuite.gratuite_jusqu_au } : null,
        durees,
      });
    }

    return res.status(200).json({
      type_acteur: type,
      fiche: {
        acteur_id: fiche.acteur_id, nom: fiche.nom, statut_verification: fiche.statut_verification,
        en_ligne: estFicheEnLigne(fiche),
      },
      abonnement_requis: requis,
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
      offres: requis ? offres : [],
    });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}

/**
 * POST /api/abonnements-presence/:type   body: { acteur_id, niveau_id, duree_mois }
 * Crée (ou réutilise) le brouillon ; active directement une gratuité ou un
 * montant nul. 201 créé, 200 réutilisé.
 */
export async function creerAbonnement(req, res, next) {
  try {
    const { type } = req.params;
    const { acteur_id, niveau_id } = req.body ?? {};
    const duree_mois = Number(req.body?.duree_mois);
    if (!acteur_id || !niveau_id || !Number.isInteger(duree_mois)) {
      return res.status(400).json({ message: "Champs requis : acteur_id, niveau_id, duree_mois (entier)." });
    }
    await exigerGestionnaire(req, type, acteur_id);
    const [fiche, niveau] = await Promise.all([
      chargerFicheOuErreur(prisma, type, acteur_id),
      prisma.niveauAbonnementPresence.findUnique({ where: { niveau_id } }),
    ]);
    if (!niveau) return res.status(400).json({ message: "niveau_id introuvable." });
    exigerFichePubliee(fiche);
    await exigerAbonnementRequis(prisma, type, fiche);
    await verifierPayeur(req.utilisateur.utilisateur_id);

    const { abonnement, active, reutilise } = await creerBrouillonOuActiverPresence({
      type,
      fiche,
      niveau,
      duree_mois,
      acteur_id: req.utilisateur.utilisateur_id,
    });

    return res.status(reutilise ? 200 : 201).json({
      abonnement: {
        abonnement_id: abonnement.abonnement_id,
        type_acteur: abonnement.type_acteur,
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

/** GET /api/abonnements-presence/:id/devis?agregateur=stripe|campay|virement — recalculé, jamais stocké. */
export async function obtenirDevis(req, res, next) {
  try {
    const agregateur = req.query.agregateur ?? "stripe";
    if (!["stripe", "campay", "virement"].includes(agregateur)) {
      return res.status(400).json({ message: "agregateur invalide. Valeurs acceptées : stripe, campay, virement." });
    }
    const { abo, fiche } = await chargerAbonnementAutorise(req);
    if (abo.statut !== "en_attente_paiement") {
      throw new ErreurAbonnement(409, "ABONNEMENT_NON_PAYABLE", `Cet abonnement n'est plus à payer (statut : ${abo.statut}).`);
    }
    const frais = await fraisEnvoiAbonnement(agregateur, Number(abo.montant_total), abo.devise);
    const devis = construireDevisAbonnementPresence({ abonnement: abo, niveau: abo.niveau, fiche, frais_agregateur: frais });
    return res.status(200).json({ ...devis, agregateur });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}

/* ===================================================================
 * Paiement
 * =================================================================== */

/** POST /api/abonnements-presence/:id/paiement — Stripe Checkout -> { url } */
export async function creerPaiementStripe(req, res, next) {
  try {
    // Session déjà payée sans webhook reçu : activée ici, puis refusée
    // ci-dessous comme « plus à payer » au lieu de rester bloquée.
    await rattraperStripe("presence", req.params.id);
    const ctx = await verifierAbonnementPayable(req);

    const ouvertes = await prisma.transactionPaiement.findMany({
      where: {
        abonnement_presence_id_cible: ctx.abo.abonnement_id,
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
    const devis = construireDevisAbonnementPresence({ abonnement: ctx.abo, niveau: ctx.niveau, fiche: ctx.fiche, frais_agregateur: frais });
    const transaction = await creerTransactionAbonnement(ctx, {
      montant: devis.total,
      devise: ctx.devise,
      fournisseur: "stripe",
      frais_envoi_id: frais.ligne.frais_agregateur_id,
    });

    let session;
    try {
      const base = process.env.FRONTEND_URL || "http://localhost:5173";
      const libelle = `${libelleAbonnement("Abonnement de présence", ctx.niveau)} (${ctx.abo.duree_mois} mois)`;
      const retour = `abonnement_id=${ctx.abo.abonnement_id}`;
      // Prix sans réduction + frais, remise par coupon, récapitulatif des montants.
      const detail = detailCheckoutAbonnement(devis, { duree_mois: ctx.abo.duree_mois });
      session = await creerSessionCheckout({
        montant: devis.total,
        devise: ctx.devise,
        transaction_id: transaction.transaction_id,
        metadata: { objet: "abonnement_presence" }, // l'abonnement se lit via la transaction
        libelle,
        ...detail,
        description_facture: `Abonnement APS Santé - ${ctx.fiche.nom}`,
        email_client: ctx.payeur.email,
        url_succes: `${base}/paiement/abonnement-presence/succes?${retour}`,
        url_annulation: `${base}/paiement/abonnement-presence/annule?${retour}`,
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

/** POST /api/abonnements-presence/:id/paiement-campay   body: { numero } */
export async function creerPaiementCampay(req, res, next) {
  try {
    const ctx = await verifierAbonnementPayable(req);
    if (ctx.devise !== DEVISE_CAMPAY.toLowerCase()) {
      return res.status(409).json({ message: "Le paiement Mobile Money n'est disponible qu'en XAF." });
    }

    const numero = normaliserNumeroCM(req.body?.numero ?? ctx.payeur.telephone);
    const montantEnvoyeXaf = Math.round(ctx.montant);
    const frais = await fraisCampay(ctx.montant);

    const enCours = await prisma.transactionPaiement.findFirst({
      where: {
        fournisseur: "campay",
        abonnement_presence_id_cible: ctx.abo.abonnement_id,
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
        montant: montantEnvoyeXaf,
        numero,
        description: court.slice(0, 100),
        external_reference: transaction.transaction_id,
      });
    } catch (err) {
      if (err instanceof CampayError && err.issueIncertaine) {
        console.warn(`[campay] Collecte abonnement présence à issue incertaine transaction=${transaction.transaction_id} : ${err.message}`);
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
      console.error("[campay] collecte abonnement présence refusée :", err.code, err.payload);
      return res.status(err.status >= 500 ? 502 : 400).json({ message: err.message, code: err.code });
    }
    next(err);
  }
}

/** GET /api/abonnements-presence/:id/paiement — statut (polling), même forme que les assurances. */
export async function obtenirStatutPaiement(req, res, next) {
  try {
    const { abo } = await chargerAbonnementAutorise(req);
    const cible = { abonnement_presence_id: abo.abonnement_id };
    try {
      await synchroniserCampayPour(cible);
    } catch (err) {
      console.error(`[campay] Synchronisation de l'abonnement ${abo.abonnement_id} impossible :`, err.message);
    }
    await rattraperStripe("presence", abo.abonnement_id);
    const actuel = await prisma.abonnementPresence.findUnique({
      where: { abonnement_id: abo.abonnement_id },
      include: {
        transaction: { select: { statut: true, montant: true, devise: true, fournisseur: true } },
        facture: { select: { numero: true } },
      },
    });
    const ficheId = acteurIdDe(actuel);

    return res.status(200).json({
      statut_abonnement: actuel.statut,
      abonnement: {
        abonnement_id: actuel.abonnement_id,
        type_acteur: actuel.type_acteur,
        acteur_id: ficheId,
        lien_gestion: acteur(actuel.type_acteur).lienGestion(ficheId),
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
      tentative_campay: await derniereTentativeCampayPour(cible),
    });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}

/** POST /api/abonnements-presence/:id/paiement/annuler — annule les paiements en attente (jamais un paiement abouti). */
export async function annulerPaiementEnCours(req, res, next) {
  try {
    const { abo } = await chargerAbonnementAutorise(req);
    const enAttente = await prisma.transactionPaiement.findMany({
      where: { abonnement_presence_id_cible: abo.abonnement_id, statut: "en_attente" },
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

/** POST /api/abonnements-presence/:id/virement — instructions ; activation par l'admin (« Encaissement constaté »). */
export async function choisirVirement(req, res, next) {
  try {
    const ctx = await verifierAbonnementPayable(req);
    const ouverte = await prisma.transactionPaiement.findFirst({
      where: { abonnement_presence_id_cible: ctx.abo.abonnement_id, statut: "en_attente" },
    });
    if (ouverte) {
      throw new ErreurAbonnement(409, "PAIEMENT_EN_COURS", "Un paiement en ligne est en cours : annulez-le avant de choisir le virement.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.abonnementPresence.updateMany({
        where: { abonnement_id: ctx.abo.abonnement_id, statut: "en_attente_paiement" },
        data: { origine: "virement" },
      });
      await journaliserAudit(tx, {
        acteur_id: req.utilisateur.utilisateur_id,
        type: "ABONNEMENT_PRESENCE_VIREMENT_DEMANDE",
        objet_type: "abonnement_presence",
        objet_id: ctx.abo.abonnement_id,
        details: { type_acteur: ctx.abo.type_acteur, montant_total: ctx.montant, devise: ctx.devise },
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

/** GET /api/abonnements-presence/:id/facture — facture archivée du paiement abouti. */
export async function obtenirFacture(req, res, next) {
  try {
    const { abo } = await chargerAbonnementAutorise(req);
    const facture = await prisma.factureAbonnementPresence.findUnique({ where: { abonnement_id: abo.abonnement_id } });
    if (!facture) {
      return res.status(409).json({ code: "ABONNEMENT_NON_FACTURE", message: "Aucune facture pour cet abonnement (non payé ou sans montant)." });
    }
    return res.status(200).json({ facture: facture.snapshot });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}


/* ===================================================================
 * Statistiques de consultation de la fiche
 * =================================================================== */

/**
 * GET /api/abonnements-presence/:type/statistiques?acteur_id=&jours=30
 * Réservé au gestionnaire de la fiche (ou admin). Restitution selon
 * l'abonnement : droit « statistiques » -> totaux ; « statistiques_
 * detaillees » -> série par jour. Sans ce droit : { disponible: false }
 * (les vues continuent d'être comptées, elles apparaîtront dès la
 * souscription). L'administration voit toujours tout.
 */
export async function obtenirStatistiques(req, res, next) {
  try {
    const { type } = req.params;
    const acteur_id = req.query.acteur_id;
    await exigerGestionnaire(req, type, acteur_id);
    await chargerFicheOuErreur(prisma, type, acteur_id);
    const jours = req.query.jours === undefined ? 30 : Number(req.query.jours);
    if (!Number.isInteger(jours) || jours < 7 || jours > 365) {
      return res.status(400).json({ message: "jours invalide (entier de 7 à 365)." });
    }
    const admin = req.utilisateur.role === "admin" || req.utilisateur.role === "superadmin";
    const { droits } = await resoudreDroitsPresence(type, acteur_id);
    if (!admin && !droits.statistiques) {
      return res.status(200).json({ disponible: false, detaillees: false });
    }
    const detaillees = admin || droits.statistiques_detaillees;
    const stats = await statistiquesFiche({ type, acteur_id, jours, detaillees });
    return res.status(200).json({ disponible: true, detaillees, ...stats });
  } catch (err) {
    if (repondreErreurConnue(err, res)) return;
    next(err);
  }
}
