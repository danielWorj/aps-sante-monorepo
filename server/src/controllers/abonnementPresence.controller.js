// src/controllers/abonnementPresence.controller.js
// Administration des abonnements de présence (pharmacies, centres de
// santé, médecins). TOUTES les routes sont protégées par `authentifier` ET
// `autoriser("admin", "superadmin")` (abonnementPresence.routes.js) ; le
// type d'acteur est validé par router.param("type").
//
// EF-ADM-03 : gratuité, grilles, durées et — pour les médecins —
// obligation de souscrire, pilotées par pays, sans intervention technique.
// Toute action est journalisée (journal_audit) DANS sa transaction.

import prisma from "../lib/prisma.js";
import { journaliserAudit } from "../lib/audit.js";
import { debutDuJourUtc } from "../lib/droitsAssurance.js";
import { ajouterJours, ajouterMois } from "../lib/dates.js";
import { creerRemboursement } from "../lib/stripeService.js";
import { acteur, acteurIdDe, champActeur, verrouillerFichePresence } from "../lib/acteursPresence.js";
import { resoudreDroitsPresenceEnLot } from "../lib/droitsPresence.js";
import {
  ErreurAbonnement,
  repondreSiErreurAbonnement,
  chargerFicheOuErreur,
  exigerFichePubliee,
  exigerAbonnementRequis,
  exigerGestionnairesNonSuspendus,
  evaluerAchatPresence,
  activerAbonnementPresence,
  notifierAbonnementPresenceActive,
} from "../services/abonnementPresence.service.js";
import { MOTIF_PAIEMENT_TARDIF_PRESENCE } from "../services/finalisationAbonnementPresence.service.js";
import { repondreSiBaremeAbsent } from "./paiement.controller.js";

const STATUTS = ["en_attente_paiement", "actif", "expire", "annule", "suspendu", "remplace"];
const REGEX_DEVISE = /^[a-z]{3}$/;

// Drapeaux d'avantages : appliqués puis RÉSERVÉS (stockés, sans effet).
export const DRAPEAUX_PRESENCE = [
  "contact_direct", "photos", "description_enrichie", "presentation_equipe", "prise_rdv_en_ligne",
  "multimedia", "statistiques", "statistiques_detaillees", "multi_utilisateurs", "support_prioritaire",
];
const DRAPEAUX_PAR_DEFAUT = { contact_direct: true, photos: true, description_enrichie: true, prise_rdv_en_ligne: true };
const QUOTAS = ["max_photos", "max_gestionnaires"];

const id = (req) => req.utilisateur.utilisateur_id;

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

function quotaInferieurOuEgal(a, b) {
  if (b === null) return true;
  if (a === null) return false;
  return a <= b;
}

/** Un rang supérieur CUMULE les droits des rangs inférieurs (même type d'acteur). */
function verifierCumul(candidat, autres) {
  for (const autre of autres) {
    if (autre.rang === candidat.rang) return `Le rang ${candidat.rang} est déjà utilisé par le niveau « ${autre.libelle} ».`;
    const [bas, haut] = autre.rang < candidat.rang ? [autre, candidat] : [candidat, autre];
    for (const d of DRAPEAUX_PRESENCE) {
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

function lireNiveau(body) {
  const data = {};
  if (body.code !== undefined) data.code = String(body.code).trim().toLowerCase();
  if (body.libelle !== undefined) data.libelle = String(body.libelle).trim();
  if (body.rang !== undefined) data.rang = Number(body.rang);
  if (body.actif !== undefined) data.actif = Boolean(body.actif);
  for (const d of DRAPEAUX_PRESENCE) if (body[d] !== undefined) data[d] = Boolean(body[d]);
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

const verrouNiveaux = (tx, type) =>
  tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text", `niveaux_abonnement_presence:${type}`);

/** GET /api/admin/abonnements-presence/:type/niveaux */
export async function listerNiveaux(req, res, next) {
  try {
    const niveaux = await prisma.niveauAbonnementPresence.findMany({
      where: { type_acteur: req.params.type },
      orderBy: { rang: "asc" },
    });
    return res.status(200).json({ niveaux });
  } catch (err) { next(err); }
}

/** POST /api/admin/abonnements-presence/:type/niveaux */
export async function creerNiveau(req, res, next) {
  try {
    const { type } = req.params;
    const data = lireNiveau(req.body ?? {});
    const erreur = erreurNiveau(data, true);
    if (erreur) return res.status(400).json({ message: erreur });

    const niveau = await prisma.$transaction(async (tx) => {
      await verrouNiveaux(tx, type);
      const autres = await tx.niveauAbonnementPresence.findMany({ where: { type_acteur: type } });
      const candidat = {
        ...Object.fromEntries(DRAPEAUX_PRESENCE.map((d) => [d, DRAPEAUX_PAR_DEFAUT[d] ?? false])),
        ...Object.fromEntries(QUOTAS.map((q) => [q, null])),
        ...data,
      };
      const msg = verifierCumul(candidat, autres);
      if (msg) throw new ErreurAbonnement(400, "CUMUL_DROITS", msg);
      const cree = await tx.niveauAbonnementPresence.create({ data: { ...data, type_acteur: type } });
      await journaliserAudit(tx, {
        acteur_id: id(req), type: "NIVEAU_ABONNEMENT_PRESENCE_CREE", objet_type: "niveau_abonnement_presence",
        objet_id: cree.niveau_id, details: cree,
      });
      return cree;
    });
    return res.status(201).json({ niveau });
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ message: "Ce code (ou ce rang) de niveau existe déjà pour ce type d'acteur." });
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/** PUT /api/admin/abonnements-presence/:type/niveaux/:id — n'affecte jamais les abonnés en cours. */
export async function modifierNiveau(req, res, next) {
  try {
    const { type } = req.params;
    const data = lireNiveau(req.body ?? {});
    const erreur = erreurNiveau(data, false);
    if (erreur) return res.status(400).json({ message: erreur });

    const niveau = await prisma.$transaction(async (tx) => {
      await verrouNiveaux(tx, type);
      const existant = await tx.niveauAbonnementPresence.findUnique({ where: { niveau_id: req.params.id } });
      if (!existant || existant.type_acteur !== type) throw new ErreurAbonnement(404, "NIVEAU_INTROUVABLE", "Niveau introuvable.");
      const autres = await tx.niveauAbonnementPresence.findMany({
        where: { type_acteur: type, niveau_id: { not: existant.niveau_id } },
      });
      const msg = verifierCumul({ ...existant, ...data }, autres);
      if (msg) throw new ErreurAbonnement(400, "CUMUL_DROITS", msg);
      const maj = await tx.niveauAbonnementPresence.update({ where: { niveau_id: existant.niveau_id }, data });
      await journaliserAudit(tx, {
        acteur_id: id(req), type: "NIVEAU_ABONNEMENT_PRESENCE_MODIFIE", objet_type: "niveau_abonnement_presence",
        objet_id: maj.niveau_id, details: { avant: existant, apres: maj },
      });
      return maj;
    });
    return res.status(200).json({ niveau });
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ message: "Ce code (ou ce rang) de niveau existe déjà pour ce type d'acteur." });
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/* ===================================================================
 * Tarifs et remises de durée
 * =================================================================== */

/** GET /api/admin/abonnements-presence/:type/tarifs?pays_id= */
export async function listerTarifs(req, res, next) {
  try {
    const where = { niveau: { type_acteur: req.params.type } };
    if (req.query.pays_id) where.pays_id = req.query.pays_id;
    const tarifs = await prisma.tarifAbonnementPresence.findMany({
      where,
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
 * PUT /api/admin/abonnements-presence/:type/tarifs
 * body : { niveau_id, pays_id, devise, prix_mensuel, prix_usd_indicatif?, actif? }
 * Crée ou met à jour la ligne (niveau, pays). Jamais rétroactif.
 */
export async function enregistrerTarif(req, res, next) {
  try {
    const { type } = req.params;
    const { niveau_id, pays_id } = req.body ?? {};
    const devise = String(req.body?.devise ?? "").trim().toLowerCase();
    const prix_mensuel = Number(req.body?.prix_mensuel);
    const usd = req.body?.prix_usd_indicatif;
    const prix_usd_indicatif = usd === undefined || usd === null || usd === "" ? null : Number(usd);
    const actif = req.body?.actif === undefined ? true : Boolean(req.body.actif);

    if (!niveau_id || !pays_id) return res.status(400).json({ message: "Champs requis : niveau_id, pays_id." });
    if (!REGEX_DEVISE.test(devise)) return res.status(400).json({ message: "devise invalide (code ISO à 3 lettres, ex. xaf)." });
    if (!Number.isFinite(prix_mensuel) || prix_mensuel <= 0) return res.status(400).json({ message: "prix_mensuel invalide (> 0)." });
    if (prix_usd_indicatif !== null && (!Number.isFinite(prix_usd_indicatif) || prix_usd_indicatif < 0)) {
      return res.status(400).json({ message: "prix_usd_indicatif invalide." });
    }
    const [niveau, pays] = await Promise.all([
      prisma.niveauAbonnementPresence.findUnique({ where: { niveau_id } }),
      prisma.pays.findUnique({ where: { pays_id } }),
    ]);
    if (!niveau || niveau.type_acteur !== type) return res.status(400).json({ message: "niveau_id introuvable pour ce type d'acteur." });
    if (!pays) return res.status(400).json({ message: "pays_id introuvable." });

    const tarif = await prisma.$transaction(async (tx) => {
      const existant = await tx.tarifAbonnementPresence.findUnique({ where: { niveau_id_pays_id: { niveau_id, pays_id } } });
      const data = { devise, prix_mensuel, prix_usd_indicatif, actif };
      const resultat = existant
        ? await tx.tarifAbonnementPresence.update({ where: { tarif_id: existant.tarif_id }, data })
        : await tx.tarifAbonnementPresence.create({ data: { niveau_id, pays_id, ...data } });
      await journaliserAudit(tx, {
        acteur_id: id(req), type: "TARIF_ABONNEMENT_PRESENCE_MODIFIE", objet_type: "tarif_abonnement_presence",
        objet_id: resultat.tarif_id, details: { type_acteur: type, avant: existant, apres: resultat },
      });
      return resultat;
    });
    return res.status(200).json({ tarif });
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ message: "Une ligne de tarif existe déjà pour ce niveau et ce pays." });
    next(err);
  }
}

/** GET /api/admin/abonnements-presence/:type/remises */
export async function listerRemises(req, res, next) {
  try {
    const remises = await prisma.remiseDureeAbonnementPresence.findMany({
      where: { type_acteur: req.params.type },
      orderBy: { duree_mois: "asc" },
    });
    return res.status(200).json({ remises });
  } catch (err) { next(err); }
}

/** PUT /api/admin/abonnements-presence/:type/remises — body : { remises: [{ duree_mois, remise_pourcent }] } */
export async function enregistrerRemises(req, res, next) {
  try {
    const { type } = req.params;
    const remises = req.body?.remises;
    if (!Array.isArray(remises) || !remises.length) return res.status(400).json({ message: "remises : tableau requis." });
    for (const r of remises) {
      const d = Number(r.duree_mois);
      const p = Number(r.remise_pourcent);
      if (!Number.isInteger(d) || d < 1 || d > 36) return res.status(400).json({ message: "duree_mois invalide (entier de 1 à 36)." });
      if (!Number.isFinite(p) || p < 0 || p >= 100) return res.status(400).json({ message: "remise_pourcent invalide (0 à 99,99)." });
    }
    const resultat = await prisma.$transaction(async (tx) => {
      const avant = await tx.remiseDureeAbonnementPresence.findMany({ where: { type_acteur: type } });
      for (const r of remises) {
        const duree_mois = Number(r.duree_mois);
        const remise_pourcent = Number(r.remise_pourcent);
        await tx.remiseDureeAbonnementPresence.upsert({
          where: { type_acteur_duree_mois: { type_acteur: type, duree_mois } },
          create: { type_acteur: type, duree_mois, remise_pourcent },
          update: { remise_pourcent },
        });
      }
      const apres = await tx.remiseDureeAbonnementPresence.findMany({ where: { type_acteur: type }, orderBy: { duree_mois: "asc" } });
      await journaliserAudit(tx, {
        acteur_id: id(req), type: "REMISES_DUREE_PRESENCE_MODIFIEES", objet_type: "remise_duree_abonnement_presence",
        details: { type_acteur: type, avant, apres },
      });
      return apres;
    });
    return res.status(200).json({ remises: resultat });
  } catch (err) { next(err); }
}

/** DELETE /api/admin/abonnements-presence/:type/remises/:duree — retire une durée de la vente. */
export async function supprimerRemise(req, res, next) {
  try {
    const { type } = req.params;
    const duree_mois = Number(req.params.duree);
    await prisma.$transaction(async (tx) => {
      const cle = { type_acteur_duree_mois: { type_acteur: type, duree_mois } };
      const existante = Number.isInteger(duree_mois) ? await tx.remiseDureeAbonnementPresence.findUnique({ where: cle }) : null;
      if (!existante) throw new ErreurAbonnement(404, "REMISE_INTROUVABLE", "Durée introuvable.");
      await tx.remiseDureeAbonnementPresence.delete({ where: cle });
      await journaliserAudit(tx, {
        acteur_id: id(req), type: "REMISES_DUREE_PRESENCE_MODIFIEES", objet_type: "remise_duree_abonnement_presence",
        details: { type_acteur: type, supprimee: existante },
      });
    });
    return res.status(200).json({ message: "Durée retirée de la vente." });
  } catch (err) {
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/* ===================================================================
 * Paramètres par pays (gratuité, grâce, obligation médecin)
 * =================================================================== */

/** GET /api/admin/abonnements-presence/:type/configs */
export async function listerConfigs(req, res, next) {
  try {
    const configs = await prisma.configAbonnementPresence.findMany({
      where: { type_acteur: req.params.type },
      include: { pays: { select: { pays_id: true, nom: true } } },
    });
    return res.status(200).json({ configs });
  } catch (err) { next(err); }
}

/**
 * PUT /api/admin/abonnements-presence/:type/configs/:pays_id
 * body : { gratuite_active, gratuite_niveau_id, gratuite_jusqu_au (AAAA-MM-JJ, inclus), grace_jours,
 *          abonnement_obligatoire (médecins uniquement) }
 */
export async function enregistrerConfig(req, res, next) {
  try {
    const { type, pays_id } = req.params;
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
    if (b.abonnement_obligatoire !== undefined) {
      if (type !== "medecin") {
        return res.status(400).json({ message: "L'obligation de souscrire ne se règle que pour les médecins." });
      }
      data.abonnement_obligatoire = Boolean(b.abonnement_obligatoire);
    }
    const pays = await prisma.pays.findUnique({ where: { pays_id } });
    if (!pays) return res.status(404).json({ message: "Pays introuvable." });
    if (data.gratuite_niveau_id) {
      const niveau = await prisma.niveauAbonnementPresence.findUnique({ where: { niveau_id: data.gratuite_niveau_id } });
      if (!niveau || niveau.type_acteur !== type) return res.status(400).json({ message: "gratuite_niveau_id introuvable pour ce type d'acteur." });
    }

    const config = await prisma.$transaction(async (tx) => {
      const cle = { type_acteur_pays_id: { type_acteur: type, pays_id } };
      const avant = await tx.configAbonnementPresence.findUnique({ where: cle });
      const apres = await tx.configAbonnementPresence.upsert({
        where: cle,
        create: { type_acteur: type, pays_id, ...data },
        update: data,
      });
      if (apres.gratuite_active && !apres.gratuite_niveau_id) {
        throw new ErreurAbonnement(400, "GRATUITE_SANS_NIVEAU", "Choisissez le niveau offert avant d'activer la gratuité.");
      }
      const basculeObligation = data.abonnement_obligatoire !== undefined
        && (avant?.abonnement_obligatoire ?? false) !== apres.abonnement_obligatoire;
      await journaliserAudit(tx, {
        acteur_id: id(req),
        type: basculeObligation
          ? (apres.abonnement_obligatoire ? "ABONNEMENT_MEDECIN_OBLIGATOIRE_ACTIVE" : "ABONNEMENT_MEDECIN_OBLIGATOIRE_DESACTIVE")
          : "CONFIG_ABONNEMENT_PRESENCE_MODIFIEE",
        objet_type: "config_abonnement_presence",
        details: { type_acteur: type, pays_id, avant, apres },
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

/** Annule un brouillon sans paiement en cours (place unique), sinon 409. */
async function libererBrouillon(tx, type, acteur_id) {
  const existant = await tx.abonnementPresence.findFirst({
    where: { type_acteur: type, [champActeur(type)]: acteur_id, statut: "en_attente_paiement" },
  });
  if (!existant) return null;
  const ouverte = await tx.transactionPaiement.findFirst({
    where: { abonnement_presence_id_cible: existant.abonnement_id, statut: "en_attente" },
  });
  if (ouverte) {
    throw new ErreurAbonnement(409, "PAIEMENT_EN_COURS", "Un paiement en ligne est en cours pour cette fiche : réessayez après son issue.");
  }
  await tx.abonnementPresence.update({ where: { abonnement_id: existant.abonnement_id }, data: { statut: "annule" } });
  return existant.abonnement_id;
}

/** Abonnement de ce type (404 sinon). */
async function chargerAbonnementDuType(client, type, abonnement_id) {
  const abo = await client.abonnementPresence.findUnique({ where: { abonnement_id } });
  if (!abo || abo.type_acteur !== type) throw new ErreurAbonnement(404, "ABONNEMENT_INTROUVABLE", "Abonnement introuvable.");
  return abo;
}

/**
 * POST /api/admin/abonnements-presence/:type/abonnements
 * body : { acteur_id, niveau_id, duree_mois, origine: "geste" | "virement", motif }
 *   - geste    : activation immédiate, sans paiement, motif OBLIGATOIRE ;
 *   - virement : brouillon au prix de la grille, activé par « Encaissement constaté ».
 */
export async function creerAbonnementAdmin(req, res, next) {
  try {
    const { type } = req.params;
    const { acteur_id, niveau_id, origine } = req.body ?? {};
    const duree_mois = Number(req.body?.duree_mois);
    const motif = req.body?.motif?.trim() || null;
    if (!acteur_id || !niveau_id || !Number.isInteger(duree_mois)) {
      return res.status(400).json({ message: "Champs requis : acteur_id, niveau_id, duree_mois." });
    }
    if (!["geste", "virement"].includes(origine)) {
      return res.status(400).json({ message: "origine invalide. Valeurs acceptées : geste, virement." });
    }
    if (origine === "geste" && !motif) {
      return res.status(400).json({ message: "Le motif est obligatoire pour un geste commercial." });
    }
    const [fiche, niveau] = await Promise.all([
      chargerFicheOuErreur(prisma, type, acteur_id),
      prisma.niveauAbonnementPresence.findUnique({ where: { niveau_id } }),
    ]);
    if (!niveau) return res.status(400).json({ message: "niveau_id introuvable." });
    exigerFichePubliee(fiche);
    await exigerAbonnementRequis(prisma, type, fiche);

    const abonnement = await prisma.$transaction(async (tx) => {
      await verrouillerFichePresence(tx, type, acteur_id);
      await exigerGestionnairesNonSuspendus(tx, type, acteur_id);
      const conditions = await evaluerAchatPresence(tx, { type, fiche, niveau, duree_mois });
      const brouillonAnnule = await libererBrouillon(tx, type, acteur_id);

      const data = origine === "geste"
        ? { ...conditions, prix_mensuel_applique: 0, remise_pourcent: 0, credit_prorata: 0, montant_total: 0 }
        : conditions;
      const cree = await tx.abonnementPresence.create({ data: { ...data, origine, motif } });
      await journaliserAudit(tx, {
        acteur_id: id(req),
        type: origine === "geste" ? "ABONNEMENT_PRESENCE_GESTE_COMMERCIAL" : "ABONNEMENT_PRESENCE_VIREMENT_CREE",
        objet_type: "abonnement_presence",
        objet_id: cree.abonnement_id,
        details: { type_acteur: type, acteur_id, niveau_id, duree_mois, motif, brouillon_annule: brouillonAnnule, prix_grille: conditions.montant_total },
      });
      if (origine === "geste" || Number(cree.montant_total) === 0) {
        await activerAbonnementPresence(tx, cree, { acteur_id: id(req) });
      }
      return tx.abonnementPresence.findUnique({ where: { abonnement_id: cree.abonnement_id } });
    });

    if (abonnement.statut === "actif") {
      await notifierAbonnementPresenceActive(abonnement.abonnement_id).catch((e) => console.error("[abonnement-presence] notification :", e.message));
    }
    return res.status(201).json({ abonnement });
  } catch (err) {
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/** POST /api/admin/abonnements-presence/:type/abonnements/:id/encaissement-constate — virement reçu. */
export async function constaterEncaissement(req, res, next) {
  try {
    const { type } = req.params;
    const reference = req.body?.reference_virement?.trim() || null;
    const resultat = await prisma.$transaction(async (tx) => {
      const abo = await chargerAbonnementDuType(tx, type, req.params.id);
      await verrouillerFichePresence(tx, type, acteurIdDe(abo));
      const actuel = await tx.abonnementPresence.findUnique({ where: { abonnement_id: abo.abonnement_id } });
      if (actuel.statut !== "en_attente_paiement") {
        throw new ErreurAbonnement(409, "ABONNEMENT_NON_PAYABLE", `Cet abonnement n'attend pas de paiement (statut : ${actuel.statut}).`);
      }
      if (!(Number(actuel.montant_total) > 0)) throw new ErreurAbonnement(409, "MONTANT_NUL", "Aucun montant à encaisser.");
      const ouverte = await tx.transactionPaiement.findFirst({
        where: { abonnement_presence_id_cible: actuel.abonnement_id, statut: "en_attente" },
      });
      if (ouverte) throw new ErreurAbonnement(409, "PAIEMENT_EN_COURS", "Un paiement en ligne est en cours pour cet abonnement.");
      if (actuel.origine !== "virement") {
        await tx.abonnementPresence.update({ where: { abonnement_id: actuel.abonnement_id }, data: { origine: "virement" } });
      }
      const transaction = await tx.transactionPaiement.create({
        data: {
          montant: actuel.montant_total,
          devise: actuel.devise,
          statut: "reussie",
          fournisseur: "virement",
          abonnement_presence_id_cible: actuel.abonnement_id,
        },
      });
      await journaliserAudit(tx, {
        acteur_id: id(req), type: "ABONNEMENT_PRESENCE_ENCAISSEMENT_CONSTATE", objet_type: "abonnement_presence",
        objet_id: actuel.abonnement_id,
        details: { transaction_id: transaction.transaction_id, reference_virement: reference, montant: actuel.montant_total, devise: actuel.devise },
      });
      return activerAbonnementPresence(tx, { ...actuel, origine: "virement" }, { transaction, acteur_id: id(req) });
    });
    if (resultat.effet) {
      await notifierAbonnementPresenceActive(resultat.abonnement_id).catch((e) => console.error("[abonnement-presence] notification :", e.message));
    }
    const abonnement = await prisma.abonnementPresence.findUnique({
      where: { abonnement_id: req.params.id },
      include: { facture: { select: { numero: true } } },
    });
    return res.status(200).json({ abonnement });
  } catch (err) {
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

async function changerStatut(req, { attendu, nouveau, type: typeAudit }) {
  const { type } = req.params;
  return prisma.$transaction(async (tx) => {
    const abo = await chargerAbonnementDuType(tx, type, req.params.id);
    await verrouillerFichePresence(tx, type, acteurIdDe(abo));
    const { count } = await tx.abonnementPresence.updateMany({
      where: { abonnement_id: abo.abonnement_id, statut: attendu },
      data: { statut: nouveau },
    });
    if (count === 0) {
      throw new ErreurAbonnement(409, "STATUT_INCOMPATIBLE", `Action impossible : l'abonnement doit être « ${attendu} ».`);
    }
    await journaliserAudit(tx, {
      acteur_id: id(req), type: typeAudit, objet_type: "abonnement_presence", objet_id: abo.abonnement_id,
      details: { type_acteur: type, avant: attendu, apres: nouveau, motif: req.body?.motif?.trim() || null },
    });
    return tx.abonnementPresence.findUnique({ where: { abonnement_id: abo.abonnement_id } });
  });
}

/** PATCH .../abonnements/:id/suspendre — sans prolongation compensatoire (incident éthique, plainte…). */
export async function suspendreAbonnement(req, res, next) {
  try {
    const abonnement = await changerStatut(req, { attendu: "actif", nouveau: "suspendu", type: "ABONNEMENT_PRESENCE_SUSPENDU" });
    return res.status(200).json({ abonnement });
  } catch (err) {
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/** PATCH .../abonnements/:id/retablir — dates inchangées. */
export async function retablirAbonnement(req, res, next) {
  try {
    const abonnement = await changerStatut(req, { attendu: "suspendu", nouveau: "actif", type: "ABONNEMENT_PRESENCE_RETABLI" });
    return res.status(200).json({ abonnement });
  } catch (err) {
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/** PATCH .../abonnements/:id/prolonger — body : { jours?, mois?, motif } (motif OBLIGATOIRE). */
export async function prolongerAbonnement(req, res, next) {
  try {
    const { type } = req.params;
    const motif = req.body?.motif?.trim();
    const jours = req.body?.jours === undefined ? 0 : Number(req.body.jours);
    const mois = req.body?.mois === undefined ? 0 : Number(req.body.mois);
    if (!motif) return res.status(400).json({ message: "Le motif est obligatoire pour une prolongation." });
    if (!Number.isInteger(jours) || !Number.isInteger(mois) || jours < 0 || mois < 0 || jours + mois === 0 || jours > 365 || mois > 24) {
      return res.status(400).json({ message: "Indiquez une prolongation en jours (≤ 365) et/ou en mois (≤ 24)." });
    }
    const abonnement = await prisma.$transaction(async (tx) => {
      const abo = await chargerAbonnementDuType(tx, type, req.params.id);
      await verrouillerFichePresence(tx, type, acteurIdDe(abo));
      const actuel = await tx.abonnementPresence.findUnique({ where: { abonnement_id: abo.abonnement_id } });
      if (!["actif", "suspendu"].includes(actuel.statut) || !actuel.date_fin) {
        throw new ErreurAbonnement(409, "STATUT_INCOMPATIBLE", "Seul un abonnement actif ou suspendu peut être prolongé.");
      }
      const nouvelleFin = ajouterJours(ajouterMois(actuel.date_fin, mois), jours);
      const maj = await tx.abonnementPresence.update({
        where: { abonnement_id: actuel.abonnement_id },
        data: { date_fin: nouvelleFin, motif, dernier_rappel_jours: null },
      });
      await journaliserAudit(tx, {
        acteur_id: id(req), type: "ABONNEMENT_PRESENCE_PROLONGE", objet_type: "abonnement_presence", objet_id: actuel.abonnement_id,
        details: { type_acteur: type, motif, jours, mois, date_fin_avant: actuel.date_fin, date_fin_apres: nouvelleFin },
      });
      return maj;
    });
    return res.status(200).json({ abonnement });
  } catch (err) {
    if (repondreErreur(err, res)) return;
    next(err);
  }
}

/** Ajoute { fiche: { acteur_id, nom, pays } } à des abonnements (une requête par liste). */
async function avecFiches(type, abonnements) {
  const ids = [...new Set(abonnements.map(acteurIdDe))];
  const fiches = ids.length ? await acteur(type).lister(prisma, { ids }) : [];
  const parId = new Map(fiches.map((f) => [f.acteur_id, f]));
  return abonnements.map((a) => ({ ...a, fiche: parId.get(acteurIdDe(a)) ?? null }));
}

/** GET /api/admin/abonnements-presence/:type/abonnements?statut=&pays_id=&echeance_jours=&acteur_id= */
export async function listerAbonnements(req, res, next) {
  try {
    const { type } = req.params;
    const { statut, pays_id, acteur_id } = req.query;
    if (statut && !STATUTS.includes(statut)) {
      return res.status(400).json({ message: `statut invalide. Valeurs acceptées : ${STATUTS.join(", ")}.` });
    }
    const where = { type_acteur: type };
    if (statut) where.statut = statut;
    if (acteur_id) where[champActeur(type)] = acteur_id;
    if (pays_id) {
      const relation = { pharmacie: "pharmacie", structure: "structure", medecin: "medecin" }[type];
      where[relation] = type === "medecin" ? { pays_exercice_id: pays_id } : { pays_id };
    }
    if (req.query.echeance_jours) {
      const n = Number(req.query.echeance_jours);
      if (!Number.isInteger(n) || n < 0) return res.status(400).json({ message: "echeance_jours invalide." });
      const aujourdhui = debutDuJourUtc();
      where.statut = "actif";
      where.date_fin = { gt: aujourdhui, lte: ajouterJours(aujourdhui, n) };
    }
    const abonnements = await prisma.abonnementPresence.findMany({
      where,
      include: {
        niveau: { select: { code: true, libelle: true, rang: true } },
        facture: { select: { numero: true } },
      },
      orderBy: { date_creation: "desc" },
      take: 500,
    });
    return res.status(200).json({ abonnements: await avecFiches(type, abonnements) });
  } catch (err) { next(err); }
}

/** GET /api/admin/abonnements-presence/:type/tableau-de-bord — revenus PAR DEVISE, jamais additionnés. */
export async function tableauDeBord(req, res, next) {
  try {
    const { type } = req.params;
    const champ = champActeur(type);
    const aujourdhui = debutDuJourUtc();
    const dans30 = ajouterJours(aujourdhui, 30);
    const il_y_a_90 = ajouterJours(aujourdhui, -90);

    const [valides, echeances, revenus, echus, configs] = await Promise.all([
      prisma.abonnementPresence.findMany({
        where: { type_acteur: type, statut: "actif", date_debut: { lte: aujourdhui }, date_fin: { gt: aujourdhui } },
        select: { [champ]: true, niveau: { select: { libelle: true } } },
      }),
      prisma.abonnementPresence.count({ where: { type_acteur: type, statut: "actif", date_fin: { gt: aujourdhui, lte: dans30 } } }),
      prisma.factureAbonnementPresence.groupBy({
        by: ["devise"],
        where: { abonnement: { type_acteur: type } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      prisma.abonnementPresence.findMany({
        where: { type_acteur: type, statut: { in: ["actif", "expire"] }, date_fin: { gte: il_y_a_90, lte: aujourdhui } },
        select: { [champ]: true },
      }),
      type === "medecin"
        ? prisma.configAbonnementPresence.findMany({
            where: { type_acteur: "medecin", abonnement_obligatoire: true },
            select: { pays: { select: { nom: true } } },
          })
        : Promise.resolve([]),
    ]);

    const fichesActives = new Set(valides.map((v) => v[champ]));
    const parNiveau = {};
    for (const v of valides) parNiveau[v.niveau.libelle] = (parNiveau[v.niveau.libelle] ?? 0) + 1;

    let renouveles = 0;
    const fichesEchues = [...new Set(echus.map((e) => e[champ]))];
    if (fichesEchues.length) {
      const suites = await prisma.abonnementPresence.findMany({
        where: { type_acteur: type, [champ]: { in: fichesEchues }, statut: "actif", date_fin: { gt: aujourdhui } },
        select: { [champ]: true },
      });
      const renouvelees = new Set(suites.map((s) => s[champ]));
      renouveles = fichesEchues.filter((x) => renouvelees.has(x)).length;
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
      ...(type === "medecin" ? { pays_obligatoires: configs.map((c) => c.pays.nom) } : {}),
    });
  } catch (err) { next(err); }
}

/* ===================================================================
 * Paiements
 * =================================================================== */

/** GET /api/admin/abonnements-presence/:type/paiements?statut=&fournisseur= */
export async function listerPaiements(req, res, next) {
  try {
    const { type } = req.params;
    const ids = (await prisma.abonnementPresence.findMany({ where: { type_acteur: type }, select: { abonnement_id: true } }))
      .map((a) => a.abonnement_id);
    const where = { abonnement_presence_id_cible: { in: ids } };
    if (req.query.statut) where.statut = req.query.statut;
    if (req.query.fournisseur) where.fournisseur = req.query.fournisseur;
    const transactions = ids.length
      ? await prisma.transactionPaiement.findMany({
          where,
          orderBy: { date_creation: "desc" },
          take: 500,
          select: {
            transaction_id: true, montant: true, devise: true, statut: true, fournisseur: true,
            campay_reference: true, stripe_payment_intent_id: true, stripe_checkout_session_id: true,
            numero_payeur: true, date_creation: true, abonnement_presence_id_cible: true,
          },
        })
      : [];
    const abonnements = await avecFiches(type, await prisma.abonnementPresence.findMany({
      where: { abonnement_id: { in: [...new Set(transactions.map((t) => t.abonnement_presence_id_cible))] } },
      include: { niveau: { select: { libelle: true } } },
    }));
    const parId = new Map(abonnements.map((a) => [a.abonnement_id, a]));
    return res.status(200).json({
      paiements: transactions.map((t) => {
        const a = parId.get(t.abonnement_presence_id_cible);
        return {
          ...t,
          reference: t.campay_reference ?? t.stripe_payment_intent_id ?? t.stripe_checkout_session_id ?? null,
          abonnement: a ? { abonnement_id: a.abonnement_id, statut: a.statut, niveau: a.niveau, fiche: a.fiche } : null,
        };
      }),
    });
  } catch (err) { next(err); }
}

/** GET /api/admin/abonnements-presence/:type/paiements-tardifs?statut=a_traiter|effectue|traite */
export async function listerPaiementsTardifs(req, res, next) {
  try {
    const { type } = req.params;
    const statut = req.query.statut ?? "a_traiter";
    const lignes = await prisma.remboursementPaiement.findMany({
      where: { motif: MOTIF_PAIEMENT_TARDIF_PRESENCE, statut },
      include: {
        transaction: {
          select: {
            transaction_id: true, fournisseur: true, devise: true, montant: true, numero_payeur: true,
            campay_reference: true, stripe_payment_intent_id: true, abonnement_presence_id_cible: true,
          },
        },
      },
      orderBy: { date_creation: "asc" },
    });
    const duType = new Set(
      (await prisma.abonnementPresence.findMany({
        where: { type_acteur: type, abonnement_id: { in: lignes.map((l) => l.transaction.abonnement_presence_id_cible).filter(Boolean) } },
        select: { abonnement_id: true },
      })).map((a) => a.abonnement_id)
    );
    return res.status(200).json({ remboursements: lignes.filter((l) => duType.has(l.transaction.abonnement_presence_id_cible)) });
  } catch (err) { next(err); }
}

/**
 * POST /api/admin/abonnements-presence/:type/paiements-tardifs/:id/traiter
 * Remboursement EXCEPTIONNEL validé par l'admin : Stripe -> remboursé chez
 * Stripe ; CamPay / virement -> fonds renvoyés à la main, body { frais_reels }.
 */
export async function traiterPaiementTardif(req, res, next) {
  try {
    const r = await prisma.remboursementPaiement.findUnique({
      where: { remboursement_id: req.params.id },
      include: { transaction: true },
    });
    if (!r || r.motif !== MOTIF_PAIEMENT_TARDIF_PRESENCE) return res.status(404).json({ message: "Remboursement introuvable." });
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
        metadata: { remboursement_id: r.remboursement_id, motif: MOTIF_PAIEMENT_TARDIF_PRESENCE },
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
        acteur_id: id(req), type: "ABONNEMENT_PRESENCE_REMBOURSEMENT_EXCEPTIONNEL", objet_type: "abonnement_presence",
        objet_id: t.abonnement_presence_id_cible,
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
 * Fiches (tous statuts) avec leur état d'abonnement
 * =================================================================== */

/** GET /api/admin/abonnements-presence/:type/fiches?statut_verification=&pays_id=&recherche= */
export async function listerFiches(req, res, next) {
  try {
    const { type } = req.params;
    const { statut_verification, pays_id, recherche } = req.query;
    if (statut_verification && !["non_publie", "en_cours", "publie"].includes(statut_verification)) {
      return res.status(400).json({ message: "statut_verification invalide." });
    }
    const fiches = await acteur(type).lister(prisma, { statut_verification, pays_id, recherche });
    const ids = fiches.map((f) => f.acteur_id);
    const [droits, vues] = await Promise.all([
      resoudreDroitsPresenceEnLot(type, ids),
      ids.length
        ? prisma.vueFiche.groupBy({
            by: ["acteur_id"],
            where: { type_acteur: type, acteur_id: { in: ids }, jour: { gte: ajouterJours(debutDuJourUtc(), -29) } },
            _sum: { vues: true },
          })
        : [],
    ]);
    const vuesParFiche = new Map(vues.map((v) => [v.acteur_id, v._sum.vues ?? 0]));
    return res.status(200).json({
      fiches: fiches.map((f) => {
        const d = droits.get(f.acteur_id);
        return {
          ...f,
          niveau_presence: d.droits.niveau_presence,
          statut_abonnement: d.statut_abonnement,
          abonnement_requis: d.abonnement_requis,
          date_fin_abonnement: d.date_fin,
          vues_30_jours: vuesParFiche.get(f.acteur_id) ?? 0,
        };
      }),
    });
  } catch (err) { next(err); }
}
