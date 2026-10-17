// src/controllers/abonnementAssurance.controller.js
// Administration des abonnements assurance (guide abonnements assurances
// v3, §1.4.3, §1.5.10, §3). TOUTES les routes sont protégées par
// `authentifier` ET `autoriser("admin", "superadmin")` (voir
// abonnementAssurance.routes.js) — ne pas reproduire le contrôle des
// routes d'abonnement pharmacie, protégées par `authentifier` seul.
//
// Toute action qui modifie la grille ou un abonnement est journalisée
// (journal_audit, ajout seul) DANS la même transaction que l'action.

import prisma from "../lib/prisma.js";
import { journaliserAudit } from "../lib/audit.js";
import { resoudreDroitsEnLot, debutDuJourUtc } from "../lib/droitsAssurance.js";
import { ajouterJours, ajouterMois } from "../lib/dates.js";
import { creerRemboursement } from "../lib/stripeService.js";
import { construireUrl } from "../lib/cloudinaryService.js";
import {
  ErreurAbonnement,
  repondreSiErreurAbonnement,
  exigerFichePubliee,
  evaluerAchat,
  activerAbonnement,
  verrouillerFiche,
  notifierAbonnementActive,
} from "../services/abonnementAssurance.service.js";
import { MOTIF_PAIEMENT_TARDIF } from "../services/finalisationAbonnementAssurance.service.js";
import { repondreSiBaremeAbsent } from "./paiement.controller.js";

const TYPES_ACTEUR = ["compagnie", "courtier"];
const STATUTS = ["en_attente_paiement", "actif", "expire", "annule", "suspendu", "remplace"];
const REGEX_DEVISE = /^[a-z]{3}$/;

// Drapeaux d'avantages : les 5 premiers sont appliqués, les 4 derniers
// sont RÉSERVÉS (stockés, sans effet en V1 — phase 9).
const DRAPEAUX = [
  "siege_complet", "afficher_activites", "afficher_agences", "formulaire_contact", "suivi_demandes",
  "video_presentation", "vitrine_premium", "stats_completes", "export_stats",
];
const QUOTAS = ["max_agences", "max_photos", "max_gestionnaires"];

function acteur(req) {
  return req.utilisateur.utilisateur_id;
}

function repondreErreur(err, res) {
  if (repondreSiErreurAbonnement(err, res)) return true;
  if (repondreSiBaremeAbsent(err, res)) return true;
  return false;
}

/** Nombre (≥ 0) ou null ; undefined si absent ; NaN si invalide. */
function lireQuota(v) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

/* ===================================================================
 * Niveaux
 * =================================================================== */

/** quota a <= quota b (null = illimité). */
function quotaInferieurOuEgal(a, b) {
  if (b === null) return true;
  if (a === null) return false;
  return a <= b;
}

/**
 * Invariant : un niveau de rang supérieur CUMULE les droits des rangs
 * inférieurs (sinon idsServicesAvecDroit et resoudreDroits divergent).
 * Renvoie un message d'erreur ou null.
 */
function verifierCumul(candidat, autres) {
  for (const autre of autres) {
    if (autre.rang === candidat.rang) return `Le rang ${candidat.rang} est déjà utilisé par le niveau « ${autre.libelle} ».`;
    const [bas, haut] = autre.rang < candidat.rang ? [autre, candidat] : [candidat, autre];
    for (const d of DRAPEAUX) {
      if (bas[d] && !haut[d]) {
        return `Le niveau « ${haut.libelle} » (rang ${haut.rang}) doit inclure « ${d} », coché sur le niveau « ${bas.libelle} » (rang ${bas.rang}).`;
      }
    }
    for (const q of QUOTAS) {
      if (!quotaInferieurOuEgal(bas[q], haut[q])) {
        return `Le quota « ${q} » du niveau « ${haut.libelle} » ne peut pas être inférieur à celui du niveau « ${bas.libelle} ».`;
      }
    }
  }
  return null;
}

/** Données d'un niveau lues dans le corps (champs absents ignorés). */
function lireNiveau(body) {
  const data = {};
  if (body.code !== undefined) data.code = String(body.code).trim().toLowerCase();
  if (body.libelle !== undefined) data.libelle = String(body.libelle).trim();
  if (body.rang !== undefined) data.rang = Number(body.rang);
  if (body.actif !== undefined) data.actif = Boolean(body.actif);
  for (const d of DRAPEAUX) if (body[d] !== undefined) data[d] = Boolean(body[d]);
  for (const q of QUOTAS) {
    const v = lireQuota(body[q]);
    if (v !== undefined) data[q] = v;
  }
  return data;
}

function erreurNiveau(data, creation) {
  if (creation && (!data.code || !data.libelle || data.rang === undefined)) return "Champs requis : code, libelle, rang.";
  if (data.code !== undefined && !/^[a-z0-9_-]{2,30}$/.test(data.code)) return "code invalide (2 à 30 caractères : a-z, 0-9, _ ou -).";
  if (data.libelle !== undefined && !data.libelle) return "libelle invalide.";
  if (data.rang !== undefined && (!Number.isInteger(data.rang) || data.rang < 1)) return "rang invalide (entier ≥ 1).";
  for (const q of QUOTAS) if (Number.isNaN(data[q])) return `${q} invalide (entier ≥ 0, ou null pour illimité).`;
  return null;
}

/** GET /api/admin/niveaux-assurance */
export async function listerNiveaux(req, res, next) {
  try {
    const niveaux = await prisma.niveauAbonnementAssurance.findMany({ orderBy: { rang: "asc" } });
    return res.status(200).json({ niveaux });
  } catch (err) { next(err); }
}

/** POST /api/admin/niveaux-assurance */
export async function creerNiveau(req, res, next) {
  try {
    const data = lireNiveau(req.body ?? {});
    const erreur = erreurNiveau(data, true);
    if (erreur) return res.status(400).json({ message: erreur });

    const niveau = await prisma.$transaction(async (tx) => {
      // Verrou consultatif : deux enregistrements simultanés de niveaux ne
      // contournent pas le contrôle de cumul.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('niveaux_abonnement_assurance', 0))::text`;
      const autres = await tx.niveauAbonnementAssurance.findMany();
      const candidat = { ...Object.fromEntries(DRAPEAUX.map((d) => [d, false])), ...Object.fromEntries(QUOTAS.map((q) => [q, null])), ...data };
      // Valeurs par défaut du schéma pour les drapeaux appliqués.
      for (const d of DRAPEAUX.slice(0, 5)) if (data[d] === undefined) candidat[d] = true;
      const msg = verifierCumul(candidat, autres);
      if (msg) throw new ErreurAbonnement(400, "CUMUL_DROITS", msg);
      const cree = await tx.niveauAbonnementAssurance.create({ data });
      await journaliserAudit(tx, {
        acteur_id: acteur(req), type: "NIVEAU_ABONNEMENT_CREE", objet_type: "niveau_abonnement_assurance",
        objet_id: cree.niveau_id, details: cree,
      });
      return cree;
    });
    return res.status(201).json({ niveau });
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ message: "Ce code de niveau existe déjà." });
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/** PUT /api/admin/niveaux-assurance/:id — n'affecte jamais les dates des abonnés en cours. */
export async function modifierNiveau(req, res, next) {
  try {
    const data = lireNiveau(req.body ?? {});
    const erreur = erreurNiveau(data, false);
    if (erreur) return res.status(400).json({ message: erreur });

    const niveau = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('niveaux_abonnement_assurance', 0))::text`;
      const existant = await tx.niveauAbonnementAssurance.findUnique({ where: { niveau_id: req.params.id } });
      if (!existant) throw new ErreurAbonnement(404, "NIVEAU_INTROUVABLE", "Niveau introuvable.");
      const autres = await tx.niveauAbonnementAssurance.findMany({ where: { niveau_id: { not: existant.niveau_id } } });
      const msg = verifierCumul({ ...existant, ...data }, autres);
      if (msg) throw new ErreurAbonnement(400, "CUMUL_DROITS", msg);
      const maj = await tx.niveauAbonnementAssurance.update({ where: { niveau_id: existant.niveau_id }, data });
      await journaliserAudit(tx, {
        acteur_id: acteur(req), type: "NIVEAU_ABONNEMENT_MODIFIE", objet_type: "niveau_abonnement_assurance",
        objet_id: maj.niveau_id, details: { avant: existant, apres: maj },
      });
      return maj;
    });
    return res.status(200).json({ niveau });
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ message: "Ce code de niveau existe déjà." });
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/* ===================================================================
 * Tarifs et remises de durée
 * =================================================================== */

/** GET /api/admin/tarifs-abonnement-assurance?pays_id= */
export async function listerTarifs(req, res, next) {
  try {
    const tarifs = await prisma.tarifAbonnementAssurance.findMany({
      where: req.query.pays_id ? { pays_id: req.query.pays_id } : {},
      include: {
        niveau: { select: { code: true, libelle: true, rang: true } },
        pays: { select: { pays_id: true, nom: true } },
      },
      orderBy: [{ pays_id: "asc" }, { niveau: { rang: "asc" } }],
    });
    return res.status(200).json({ tarifs });
  } catch (err) { next(err); }
}

/**
 * PUT /api/admin/tarifs-abonnement-assurance
 * body : { niveau_id, pays_id, type_acteur (null = générique), devise, prix_mensuel, prix_usd_indicatif?, actif? }
 * Crée ou met à jour la ligne (niveau, pays, type_acteur). Jamais rétroactif :
 * le prix est figé sur chaque abonnement à sa création.
 */
export async function enregistrerTarif(req, res, next) {
  try {
    const { niveau_id, pays_id } = req.body ?? {};
    const type_acteur = req.body?.type_acteur || null;
    const devise = String(req.body?.devise ?? "").trim().toLowerCase();
    const prix_mensuel = Number(req.body?.prix_mensuel);
    const usd = req.body?.prix_usd_indicatif;
    const prix_usd_indicatif = usd === undefined || usd === null || usd === "" ? null : Number(usd);
    const actif = req.body?.actif === undefined ? true : Boolean(req.body.actif);

    if (!niveau_id || !pays_id) return res.status(400).json({ message: "Champs requis : niveau_id, pays_id." });
    if (type_acteur && !TYPES_ACTEUR.includes(type_acteur)) {
      return res.status(400).json({ message: `type_acteur invalide. Valeurs acceptées : ${TYPES_ACTEUR.join(", ")} (ou null).` });
    }
    if (!REGEX_DEVISE.test(devise)) return res.status(400).json({ message: "devise invalide (code ISO à 3 lettres, ex. xaf)." });
    if (!Number.isFinite(prix_mensuel) || prix_mensuel <= 0) return res.status(400).json({ message: "prix_mensuel invalide (> 0)." });
    if (prix_usd_indicatif !== null && (!Number.isFinite(prix_usd_indicatif) || prix_usd_indicatif < 0)) {
      return res.status(400).json({ message: "prix_usd_indicatif invalide." });
    }
    const [niveau, pays] = await Promise.all([
      prisma.niveauAbonnementAssurance.findUnique({ where: { niveau_id } }),
      prisma.pays.findUnique({ where: { pays_id } }),
    ]);
    if (!niveau) return res.status(400).json({ message: "niveau_id introuvable." });
    if (!pays) return res.status(400).json({ message: "pays_id introuvable." });

    const tarif = await prisma.$transaction(async (tx) => {
      const existant = await tx.tarifAbonnementAssurance.findFirst({ where: { niveau_id, pays_id, type_acteur } });
      const data = { devise, prix_mensuel, prix_usd_indicatif, actif };
      const resultat = existant
        ? await tx.tarifAbonnementAssurance.update({ where: { tarif_id: existant.tarif_id }, data })
        : await tx.tarifAbonnementAssurance.create({ data: { niveau_id, pays_id, type_acteur, ...data } });
      await journaliserAudit(tx, {
        acteur_id: acteur(req), type: "TARIF_ABONNEMENT_MODIFIE", objet_type: "tarif_abonnement_assurance",
        objet_id: resultat.tarif_id, details: { avant: existant, apres: resultat },
      });
      return resultat;
    });
    return res.status(200).json({ tarif });
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ message: "Une ligne de tarif existe déjà pour ce niveau, ce pays et ce type d'acteur." });
    next(err);
  }
}

/** GET /api/admin/remises-duree-abonnement-assurance */
export async function listerRemises(req, res, next) {
  try {
    const remises = await prisma.remiseDureeAbonnementAssurance.findMany({ orderBy: { duree_mois: "asc" } });
    return res.status(200).json({ remises });
  } catch (err) { next(err); }
}

/**
 * PUT /api/admin/remises-duree-abonnement-assurance
 * body : { remises: [{ duree_mois, remise_pourcent }] } — une durée absente
 * de la table n'est pas proposée à la vente.
 */
export async function enregistrerRemises(req, res, next) {
  try {
    const remises = req.body?.remises;
    if (!Array.isArray(remises) || !remises.length) return res.status(400).json({ message: "remises : tableau requis." });
    for (const r of remises) {
      const d = Number(r.duree_mois);
      const p = Number(r.remise_pourcent);
      if (!Number.isInteger(d) || d < 1 || d > 36) return res.status(400).json({ message: "duree_mois invalide (entier de 1 à 36)." });
      if (!Number.isFinite(p) || p < 0 || p >= 100) return res.status(400).json({ message: "remise_pourcent invalide (0 à 99,99)." });
    }
    const resultat = await prisma.$transaction(async (tx) => {
      const avant = await tx.remiseDureeAbonnementAssurance.findMany();
      for (const r of remises) {
        await tx.remiseDureeAbonnementAssurance.upsert({
          where: { duree_mois: Number(r.duree_mois) },
          create: { duree_mois: Number(r.duree_mois), remise_pourcent: Number(r.remise_pourcent) },
          update: { remise_pourcent: Number(r.remise_pourcent) },
        });
      }
      const apres = await tx.remiseDureeAbonnementAssurance.findMany({ orderBy: { duree_mois: "asc" } });
      await journaliserAudit(tx, {
        acteur_id: acteur(req), type: "REMISES_DUREE_MODIFIEES", objet_type: "remise_duree_abonnement_assurance",
        details: { avant, apres },
      });
      return apres;
    });
    return res.status(200).json({ remises: resultat });
  } catch (err) { next(err); }
}

/** DELETE /api/admin/remises-duree-abonnement-assurance/:duree — retire une durée de la vente. */
export async function supprimerRemise(req, res, next) {
  try {
    const duree_mois = Number(req.params.duree);
    await prisma.$transaction(async (tx) => {
      const existante = await tx.remiseDureeAbonnementAssurance.findUnique({ where: { duree_mois } });
      if (!existante) throw new ErreurAbonnement(404, "REMISE_INTROUVABLE", "Durée introuvable.");
      await tx.remiseDureeAbonnementAssurance.delete({ where: { duree_mois } });
      await journaliserAudit(tx, {
        acteur_id: acteur(req), type: "REMISES_DUREE_MODIFIEES", objet_type: "remise_duree_abonnement_assurance",
        details: { supprimee: existante },
      });
    });
    return res.status(200).json({ message: "Durée retirée de la vente." });
  } catch (err) {
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/* ===================================================================
 * Configuration par pays (gratuité d'amorçage, grâce)
 * =================================================================== */

/** GET /api/admin/config-abonnement-assurance */
export async function listerConfigs(req, res, next) {
  try {
    const configs = await prisma.configAbonnementAssurance.findMany({
      include: { pays: { select: { pays_id: true, nom: true } } },
    });
    return res.status(200).json({ configs });
  } catch (err) { next(err); }
}

/**
 * PUT /api/admin/config-abonnement-assurance/:pays_id
 * body : { gratuite_active, gratuite_niveau_id, gratuite_jusqu_au (AAAA-MM-JJ, inclus), grace_jours }
 */
export async function enregistrerConfig(req, res, next) {
  try {
    const { pays_id } = req.params;
    const b = req.body ?? {};
    const data = {};
    if (b.gratuite_active !== undefined) data.gratuite_active = Boolean(b.gratuite_active);
    if (b.gratuite_niveau_id !== undefined) data.gratuite_niveau_id = b.gratuite_niveau_id || null;
    if (b.gratuite_jusqu_au !== undefined) {
      if (b.gratuite_jusqu_au === null || b.gratuite_jusqu_au === "") data.gratuite_jusqu_au = null;
      else {
        const d = new Date(`${String(b.gratuite_jusqu_au).slice(0, 10)}T00:00:00.000Z`);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ message: "gratuite_jusqu_au invalide (AAAA-MM-JJ)." });
        data.gratuite_jusqu_au = d;
      }
    }
    if (b.grace_jours !== undefined) {
      const g = Number(b.grace_jours);
      if (!Number.isInteger(g) || g < 0 || g > 90) return res.status(400).json({ message: "grace_jours invalide (0 à 90)." });
      data.grace_jours = g;
    }
    const pays = await prisma.pays.findUnique({ where: { pays_id } });
    if (!pays) return res.status(404).json({ message: "Pays introuvable." });
    if (data.gratuite_niveau_id) {
      const niveau = await prisma.niveauAbonnementAssurance.findUnique({ where: { niveau_id: data.gratuite_niveau_id } });
      if (!niveau) return res.status(400).json({ message: "gratuite_niveau_id introuvable." });
    }

    const config = await prisma.$transaction(async (tx) => {
      const avant = await tx.configAbonnementAssurance.findUnique({ where: { pays_id } });
      const apres = await tx.configAbonnementAssurance.upsert({ where: { pays_id }, create: { pays_id, ...data }, update: data });
      if (apres.gratuite_active && !apres.gratuite_niveau_id) {
        throw new ErreurAbonnement(400, "GRATUITE_SANS_NIVEAU", "Choisissez le niveau offert avant d'activer la gratuité.");
      }
      await journaliserAudit(tx, {
        acteur_id: acteur(req), type: "CONFIG_ABONNEMENT_MODIFIEE", objet_type: "config_abonnement_assurance",
        details: { pays_id, avant, apres },
      });
      return apres;
    });
    return res.status(200).json({ config });
  } catch (err) {
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/* ===================================================================
 * Abonnements : création admin, virement, suspension, prolongation
 * =================================================================== */

/** Refus si un compte agent de la fiche est suspendu (politique §2). */
async function exigerAgentsNonSuspendus(tx, service_assurance_id) {
  const suspendu = await tx.agentAssurance.findFirst({
    where: { service_assurance_id, utilisateur: { statut_compte: "suspendu" } },
  });
  if (suspendu) throw new ErreurAbonnement(403, "COMPTE_SUSPENDU", "Le compte de l'agent de cette fiche est suspendu.");
}

/** Libère la place du brouillon unique : annule un brouillon sans paiement en cours, sinon 409. */
async function libererBrouillon(tx, service_assurance_id) {
  const existant = await tx.abonnementAssurance.findFirst({
    where: { service_assurance_id, statut: "en_attente_paiement" },
  });
  if (!existant) return null;
  const ouverte = await tx.transactionPaiement.findFirst({
    where: { abonnement_assurance_id_cible: existant.abonnement_id, statut: "en_attente" },
  });
  if (ouverte) {
    throw new ErreurAbonnement(409, "PAIEMENT_EN_COURS", "Un paiement en ligne est en cours pour cette fiche : réessayez après son issue.");
  }
  await tx.abonnementAssurance.update({ where: { abonnement_id: existant.abonnement_id }, data: { statut: "annule" } });
  return existant.abonnement_id;
}

/**
 * POST /api/admin/abonnements-assurance
 * body : { service_assurance_id, niveau_id, duree_mois, origine: "geste" | "virement", motif }
 *   - geste    : activation immédiate, sans paiement (montant 0), motif OBLIGATOIRE ;
 *   - virement : brouillon au prix de la grille, activé par « Encaissement constaté ».
 * Mêmes règles d'achat que le promoteur (descente refusée, montée au prorata).
 */
export async function creerAbonnementAdmin(req, res, next) {
  try {
    const { service_assurance_id, niveau_id, origine } = req.body ?? {};
    const duree_mois = Number(req.body?.duree_mois);
    const motif = req.body?.motif?.trim() || null;
    if (!service_assurance_id || !niveau_id || !Number.isInteger(duree_mois)) {
      return res.status(400).json({ message: "Champs requis : service_assurance_id, niveau_id, duree_mois." });
    }
    if (!["geste", "virement"].includes(origine)) {
      return res.status(400).json({ message: "origine invalide. Valeurs acceptées : geste, virement." });
    }
    if (origine === "geste" && !motif) {
      return res.status(400).json({ message: "Le motif est obligatoire pour un geste commercial." });
    }
    const [service, niveau] = await Promise.all([
      prisma.serviceAssurance.findUnique({ where: { service_assurance_id } }),
      prisma.niveauAbonnementAssurance.findUnique({ where: { niveau_id } }),
    ]);
    if (!service) return res.status(404).json({ message: "Service d'assurance introuvable." });
    if (!niveau) return res.status(400).json({ message: "niveau_id introuvable." });
    exigerFichePubliee(service);

    const abonnement = await prisma.$transaction(async (tx) => {
      await verrouillerFiche(tx, service_assurance_id);
      await exigerAgentsNonSuspendus(tx, service_assurance_id);
      // evaluerAchat applique les règles (niveau vendable, durée, tarif,
      // descente refusée, crédit de montée) — même pour un geste.
      const conditions = await evaluerAchat(tx, { service, niveau, duree_mois });
      const brouillonAnnule = await libererBrouillon(tx, service_assurance_id);

      const data = origine === "geste"
        ? { ...conditions, prix_mensuel_applique: 0, remise_pourcent: 0, credit_prorata: 0, montant_total: 0 }
        : conditions;
      const cree = await tx.abonnementAssurance.create({ data: { ...data, origine, motif } });
      await journaliserAudit(tx, {
        acteur_id: acteur(req),
        type: origine === "geste" ? "ABONNEMENT_GESTE_COMMERCIAL" : "ABONNEMENT_VIREMENT_CREE",
        objet_type: "abonnement_assurance",
        objet_id: cree.abonnement_id,
        details: { service_assurance_id, niveau_id, duree_mois, motif, brouillon_annule: brouillonAnnule, prix_grille: conditions.montant_total },
      });
      // Geste, ou montée entièrement couverte par le crédit : rien à encaisser.
      if (origine === "geste" || Number(cree.montant_total) === 0) {
        await activerAbonnement(tx, cree, { acteur_id: acteur(req) });
      }
      return tx.abonnementAssurance.findUnique({ where: { abonnement_id: cree.abonnement_id } });
    });

    if (abonnement.statut === "actif") {
      await notifierAbonnementActive(abonnement.abonnement_id).catch((e) => console.error("[abonnement] notification :", e.message));
    }
    return res.status(201).json({ abonnement });
  } catch (err) {
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/**
 * POST /api/admin/abonnements-assurance/:id/encaissement-constate
 * body : { reference_virement?, motif? } — virement reçu : crée la transaction
 * « virement » réussie, active l'abonnement et émet la facture.
 */
export async function constaterEncaissement(req, res, next) {
  try {
    const reference = req.body?.reference_virement?.trim() || null;
    const resultat = await prisma.$transaction(async (tx) => {
      const abo = await tx.abonnementAssurance.findUnique({ where: { abonnement_id: req.params.id } });
      if (!abo) throw new ErreurAbonnement(404, "ABONNEMENT_INTROUVABLE", "Abonnement introuvable.");
      await verrouillerFiche(tx, abo.service_assurance_id);
      const actuel = await tx.abonnementAssurance.findUnique({ where: { abonnement_id: abo.abonnement_id } });
      if (actuel.statut !== "en_attente_paiement") {
        throw new ErreurAbonnement(409, "ABONNEMENT_NON_PAYABLE", `Cet abonnement n'attend pas de paiement (statut : ${actuel.statut}).`);
      }
      if (!(Number(actuel.montant_total) > 0)) {
        throw new ErreurAbonnement(409, "MONTANT_NUL", "Aucun montant à encaisser.");
      }
      const ouverte = await tx.transactionPaiement.findFirst({
        where: { abonnement_assurance_id_cible: actuel.abonnement_id, statut: "en_attente" },
      });
      if (ouverte) {
        throw new ErreurAbonnement(409, "PAIEMENT_EN_COURS", "Un paiement en ligne est en cours pour cet abonnement.");
      }
      const origine = "virement";
      if (actuel.origine !== origine) {
        await tx.abonnementAssurance.update({ where: { abonnement_id: actuel.abonnement_id }, data: { origine } });
      }
      const transaction = await tx.transactionPaiement.create({
        data: {
          montant: actuel.montant_total,
          devise: actuel.devise,
          statut: "reussie",
          fournisseur: "virement",
          abonnement_assurance_id_cible: actuel.abonnement_id,
        },
      });
      await journaliserAudit(tx, {
        acteur_id: acteur(req), type: "ABONNEMENT_ENCAISSEMENT_CONSTATE", objet_type: "abonnement_assurance",
        objet_id: actuel.abonnement_id,
        details: { transaction_id: transaction.transaction_id, reference_virement: reference, montant: actuel.montant_total, devise: actuel.devise },
      });
      return activerAbonnement(tx, { ...actuel, origine }, { transaction, acteur_id: acteur(req) });
    });
    if (resultat.effet) {
      await notifierAbonnementActive(resultat.abonnement_id).catch((e) => console.error("[abonnement] notification :", e.message));
    }
    const abonnement = await prisma.abonnementAssurance.findUnique({
      where: { abonnement_id: req.params.id },
      include: { facture: { select: { numero: true } } },
    });
    return res.status(200).json({ abonnement });
  } catch (err) {
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/** Change le statut d'un abonnement sous verrou de fiche, avec audit. */
async function changerStatut(req, { attendu, nouveau, type }) {
  return prisma.$transaction(async (tx) => {
    const abo = await tx.abonnementAssurance.findUnique({ where: { abonnement_id: req.params.id } });
    if (!abo) throw new ErreurAbonnement(404, "ABONNEMENT_INTROUVABLE", "Abonnement introuvable.");
    await verrouillerFiche(tx, abo.service_assurance_id);
    const { count } = await tx.abonnementAssurance.updateMany({
      where: { abonnement_id: abo.abonnement_id, statut: attendu },
      data: { statut: nouveau },
    });
    if (count === 0) {
      throw new ErreurAbonnement(409, "STATUT_INCOMPATIBLE", `Action impossible : l'abonnement doit être « ${attendu} ».`);
    }
    await journaliserAudit(tx, {
      acteur_id: acteur(req), type, objet_type: "abonnement_assurance", objet_id: abo.abonnement_id,
      details: { avant: attendu, apres: nouveau, motif: req.body?.motif?.trim() || null },
    });
    return tx.abonnementAssurance.findUnique({ where: { abonnement_id: abo.abonnement_id } });
  });
}

/** PATCH /api/admin/abonnements-assurance/:id/suspendre — sans prolongation compensatoire. */
export async function suspendreAbonnement(req, res, next) {
  try {
    const abonnement = await changerStatut(req, { attendu: "actif", nouveau: "suspendu", type: "ABONNEMENT_SUSPENDU" });
    return res.status(200).json({ abonnement });
  } catch (err) {
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/** PATCH /api/admin/abonnements-assurance/:id/retablir — dates inchangées. */
export async function retablirAbonnement(req, res, next) {
  try {
    const abonnement = await changerStatut(req, { attendu: "suspendu", nouveau: "actif", type: "ABONNEMENT_RETABLI" });
    return res.status(200).json({ abonnement });
  } catch (err) {
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/**
 * PATCH /api/admin/abonnements-assurance/:id/prolonger
 * body : { jours?, mois?, motif } — prolongation exceptionnelle, motif OBLIGATOIRE.
 */
export async function prolongerAbonnement(req, res, next) {
  try {
    const motif = req.body?.motif?.trim();
    const jours = req.body?.jours === undefined ? 0 : Number(req.body.jours);
    const mois = req.body?.mois === undefined ? 0 : Number(req.body.mois);
    if (!motif) return res.status(400).json({ message: "Le motif est obligatoire pour une prolongation." });
    if (!Number.isInteger(jours) || !Number.isInteger(mois) || jours < 0 || mois < 0 || jours + mois === 0 || jours > 365 || mois > 24) {
      return res.status(400).json({ message: "Indiquez une prolongation en jours (≤ 365) et/ou en mois (≤ 24)." });
    }
    const abonnement = await prisma.$transaction(async (tx) => {
      const abo = await tx.abonnementAssurance.findUnique({ where: { abonnement_id: req.params.id } });
      if (!abo) throw new ErreurAbonnement(404, "ABONNEMENT_INTROUVABLE", "Abonnement introuvable.");
      await verrouillerFiche(tx, abo.service_assurance_id);
      const actuel = await tx.abonnementAssurance.findUnique({ where: { abonnement_id: abo.abonnement_id } });
      if (!["actif", "suspendu"].includes(actuel.statut) || !actuel.date_fin) {
        throw new ErreurAbonnement(409, "STATUT_INCOMPATIBLE", "Seul un abonnement actif ou suspendu peut être prolongé.");
      }
      const nouvelleFin = ajouterJours(ajouterMois(actuel.date_fin, mois), jours);
      const maj = await tx.abonnementAssurance.update({
        where: { abonnement_id: actuel.abonnement_id },
        data: { date_fin: nouvelleFin, motif, dernier_rappel_jours: null },
      });
      await journaliserAudit(tx, {
        acteur_id: acteur(req), type: "ABONNEMENT_PROLONGE", objet_type: "abonnement_assurance", objet_id: actuel.abonnement_id,
        details: { motif, jours, mois, date_fin_avant: actuel.date_fin, date_fin_apres: nouvelleFin },
      });
      return maj;
    });
    return res.status(200).json({ abonnement });
  } catch (err) {
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/**
 * GET /api/admin/abonnements-assurance?statut=&pays_id=&echeance_jours=&service_assurance_id=
 */
export async function listerAbonnements(req, res, next) {
  try {
    const { statut, pays_id, service_assurance_id } = req.query;
    if (statut && !STATUTS.includes(statut)) {
      return res.status(400).json({ message: `statut invalide. Valeurs acceptées : ${STATUTS.join(", ")}.` });
    }
    const where = {};
    if (statut) where.statut = statut;
    if (service_assurance_id) where.service_assurance_id = service_assurance_id;
    if (pays_id) where.service = { pays_id };
    if (req.query.echeance_jours) {
      const n = Number(req.query.echeance_jours);
      if (!Number.isInteger(n) || n < 0) return res.status(400).json({ message: "echeance_jours invalide." });
      const aujourdhui = debutDuJourUtc();
      where.statut = "actif";
      where.date_fin = { gt: aujourdhui, lte: ajouterJours(aujourdhui, n) };
    }
    const abonnements = await prisma.abonnementAssurance.findMany({
      where,
      include: {
        service: { select: { service_assurance_id: true, nom: true, type_acteur: true, pays_id: true, pays: { select: { nom: true } } } },
        niveau: { select: { code: true, libelle: true, rang: true } },
        facture: { select: { numero: true } },
      },
      orderBy: { date_creation: "desc" },
      take: 500,
    });
    return res.status(200).json({ abonnements });
  } catch (err) { next(err); }
}

/**
 * GET /api/admin/abonnements-assurance/tableau-de-bord
 * Abonnés actifs, échéances à 30 jours, revenus PAR DEVISE (jamais
 * additionnés entre devises), taux de renouvellement (90 derniers jours).
 */
export async function tableauDeBord(req, res, next) {
  try {
    const aujourdhui = debutDuJourUtc();
    const dans30 = ajouterJours(aujourdhui, 30);
    const il_y_a_90 = ajouterJours(aujourdhui, -90);

    const [valides, echeances, revenus, echus] = await Promise.all([
      prisma.abonnementAssurance.findMany({
        where: { statut: "actif", date_debut: { lte: aujourdhui }, date_fin: { gt: aujourdhui } },
        select: { service_assurance_id: true, niveau: { select: { code: true, libelle: true } } },
      }),
      prisma.abonnementAssurance.count({ where: { statut: "actif", date_fin: { gt: aujourdhui, lte: dans30 } } }),
      prisma.factureAbonnementAssurance.groupBy({ by: ["devise"], _sum: { total: true }, _count: { _all: true } }),
      prisma.abonnementAssurance.findMany({
        where: { statut: { in: ["actif", "expire"] }, date_fin: { gte: il_y_a_90, lte: aujourdhui } },
        select: { service_assurance_id: true, date_fin: true },
      }),
    ]);

    const fichesActives = new Set(valides.map((v) => v.service_assurance_id));
    const parNiveau = {};
    for (const v of valides) parNiveau[v.niveau.libelle] = (parNiveau[v.niveau.libelle] ?? 0) + 1;

    // Renouvelé : la fiche a un autre abonnement actif qui finit après l'échéance.
    let renouveles = 0;
    const fichesEchues = [...new Set(echus.map((e) => e.service_assurance_id))];
    if (fichesEchues.length) {
      const suites = await prisma.abonnementAssurance.findMany({
        where: { service_assurance_id: { in: fichesEchues }, statut: "actif", date_fin: { gt: aujourdhui } },
        select: { service_assurance_id: true },
      });
      const renouvelees = new Set(suites.map((s) => s.service_assurance_id));
      renouveles = fichesEchues.filter((id) => renouvelees.has(id)).length;
    }

    return res.status(200).json({
      abonnes_actifs: fichesActives.size,
      abonnes_par_niveau: parNiveau,
      echeances_30_jours: echeances,
      revenus_par_devise: revenus.map((r) => ({ devise: r.devise, total: Number(r._sum.total ?? 0), factures: r._count._all })),
      renouvellement_90_jours: {
        echeances: fichesEchues.length,
        renouveles,
        taux: fichesEchues.length ? Math.round((renouveles / fichesEchues.length) * 1000) / 10 : null,
      },
    });
  } catch (err) { next(err); }
}

/* ===================================================================
 * Paiements
 * =================================================================== */

/** GET /api/admin/paiements-abonnement-assurance?statut=&fournisseur= */
export async function listerPaiements(req, res, next) {
  try {
    const where = { abonnement_assurance_id_cible: { not: null } };
    if (req.query.statut) where.statut = req.query.statut;
    if (req.query.fournisseur) where.fournisseur = req.query.fournisseur;
    const transactions = await prisma.transactionPaiement.findMany({
      where,
      orderBy: { date_creation: "desc" },
      take: 500,
      select: {
        transaction_id: true, montant: true, devise: true, statut: true, fournisseur: true,
        campay_reference: true, stripe_payment_intent_id: true, stripe_checkout_session_id: true,
        numero_payeur: true, date_creation: true, abonnement_assurance_id_cible: true,
      },
    });
    const ids = [...new Set(transactions.map((t) => t.abonnement_assurance_id_cible))];
    const abonnements = await prisma.abonnementAssurance.findMany({
      where: { abonnement_id: { in: ids } },
      select: {
        abonnement_id: true, statut: true,
        service: { select: { nom: true } },
        niveau: { select: { libelle: true } },
      },
    });
    const parId = new Map(abonnements.map((a) => [a.abonnement_id, a]));
    return res.status(200).json({
      paiements: transactions.map((t) => ({
        ...t,
        reference: t.campay_reference ?? t.stripe_payment_intent_id ?? t.stripe_checkout_session_id ?? null,
        abonnement: parId.get(t.abonnement_assurance_id_cible) ?? null,
      })),
    });
  } catch (err) { next(err); }
}

/** GET /api/admin/paiements-tardifs-abonnement-assurance?statut=a_traiter|effectue|traite */
export async function listerPaiementsTardifs(req, res, next) {
  try {
    const statut = req.query.statut ?? "a_traiter";
    const lignes = await prisma.remboursementPaiement.findMany({
      where: { motif: MOTIF_PAIEMENT_TARDIF, statut },
      include: {
        transaction: {
          select: {
            transaction_id: true, fournisseur: true, devise: true, montant: true, numero_payeur: true,
            campay_reference: true, stripe_payment_intent_id: true, abonnement_assurance_id_cible: true,
          },
        },
      },
      orderBy: { date_creation: "asc" },
    });
    return res.status(200).json({ remboursements: lignes });
  } catch (err) { next(err); }
}

/**
 * POST /api/admin/paiements-tardifs-abonnement-assurance/:id/traiter
 * Remboursement EXCEPTIONNEL validé par l'admin (jamais automatique) :
 *   - Stripe : remboursement effectué chez Stripe (clé d'idempotence) ;
 *   - CamPay / virement : retour des fonds fait à la main par l'admin,
 *     body { frais_reels } (entier ≥ 0, CamPay) — la ligne passe « traite ».
 */
export async function traiterPaiementTardif(req, res, next) {
  try {
    const r = await prisma.remboursementPaiement.findUnique({
      where: { remboursement_id: req.params.id },
      include: { transaction: true },
    });
    if (!r || r.motif !== MOTIF_PAIEMENT_TARDIF) return res.status(404).json({ message: "Remboursement introuvable." });
    if (r.statut !== "a_traiter") return res.status(409).json({ message: `Remboursement déjà traité (statut : ${r.statut}).` });
    const t = r.transaction;

    let maj = {};
    if (t.fournisseur === "stripe") {
      if (!t.stripe_payment_intent_id) return res.status(409).json({ message: "Paiement Stripe sans PaymentIntent : remboursement à faire depuis le tableau de bord Stripe." });
      const refund = await creerRemboursement({
        payment_intent_id: t.stripe_payment_intent_id,
        montant: r.montant,
        devise: t.devise,
        idempotency_key: `remb_${r.remboursement_id}`,
        metadata: { remboursement_id: r.remboursement_id, motif: MOTIF_PAIEMENT_TARDIF },
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
      const { count } = await tx.remboursementPaiement.updateMany({
        where: { remboursement_id: r.remboursement_id, statut: "a_traiter" },
        data: maj,
      });
      if (count === 0) throw new ErreurAbonnement(409, "DEJA_TRAITE", "Remboursement traité entre-temps.");
      await tx.transactionPaiement.update({ where: { transaction_id: t.transaction_id }, data: { statut: "remboursee" } });
      await journaliserAudit(tx, {
        acteur_id: acteur(req), type: "ABONNEMENT_REMBOURSEMENT_EXCEPTIONNEL", objet_type: "abonnement_assurance",
        objet_id: t.abonnement_assurance_id_cible,
        details: { remboursement_id: r.remboursement_id, transaction_id: t.transaction_id, fournisseur: t.fournisseur, montant: r.montant, ...maj },
      });
      return tx.remboursementPaiement.findUnique({ where: { remboursement_id: r.remboursement_id } });
    });
    return res.status(200).json({ remboursement: ligne });
  } catch (err) {
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/* ===================================================================
 * Fiches (tous statuts) — la liste publique est restreinte à « publie »
 * =================================================================== */

/** GET /api/admin/services-assurance?statut_verification=&pays_id=&ville_id=&type_acteur=&recherche= */
export async function listerServicesAssuranceAdmin(req, res, next) {
  try {
    const { statut_verification, pays_id, ville_id, type_acteur, recherche } = req.query;
    if (statut_verification && !["non_publie", "en_cours", "publie"].includes(statut_verification)) {
      return res.status(400).json({ message: "statut_verification invalide." });
    }
    if (type_acteur && !TYPES_ACTEUR.includes(type_acteur)) {
      return res.status(400).json({ message: "type_acteur invalide." });
    }
    const where = {};
    if (statut_verification) where.statut_verification = statut_verification;
    if (pays_id) where.pays_id = pays_id;
    if (ville_id) where.ville_id = ville_id;
    if (type_acteur) where.type_acteur = type_acteur;
    if (recherche) where.nom = { contains: recherche, mode: "insensitive" };
    const services = await prisma.serviceAssurance.findMany({
      where,
      include: { pays: true, ville: true },
      orderBy: { nom: "asc" },
    });
    const droits = await resoudreDroitsEnLot(services.map((s) => s.service_assurance_id));
    return res.status(200).json({
      services_assurance: services.map((s) => {
        const d = droits.get(s.service_assurance_id);
        return {
          ...s,
          // URL publique reconstruite, comme sur la route publique (le back-office l'affiche).
          image_url: construireUrl(s.file_url),
          niveau_presence: d.droits.niveau_presence,
          statut_abonnement: d.statut_abonnement,
          date_fin_abonnement: d.date_fin,
        };
      }),
    });
  } catch (err) { next(err); }
}
