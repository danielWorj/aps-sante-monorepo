// src/services/retrait.service.js
// Phase 6 — Retrait du médecin (décaissement Mobile Money via CamPay /withdraw/).
//
// Cycle de vie d'une DemandeRetrait :
//
//   création ──► en_attente_validation ──(admin approuve / auto)──► en_cours ──► reussie
//                      │                                              │
//                      └──(admin rejette)──► rejetee                  └──(échec définitif)──► echouee
//
// Règles d'or (argent réel) :
//  1. Le montant est RÉSERVÉ à la création : demande + mouvement `debit_retrait` sont écrits dans
//     UNE transaction SQL, sous verrou (SELECT … FOR UPDATE) du portefeuille -> deux demandes
//     simultanées ne peuvent pas dépasser le solde.
//  2. L'appel CamPay se fait APRÈS le commit, avec external_reference = demande_retrait_id.
//  3. Issue incertaine (timeout / 5xx / réponse sans référence) : on ne réessaie JAMAIS à l'aveugle
//     (risque de double décaissement). La demande reste `en_cours` ; webhook / cron / admin tranchent.
//  4. Le recrédit (`credit_annulation_retrait`) n'a lieu que dans une transition d'état atomique
//     (en_attente_validation|en_cours -> rejetee|echouee) et est idempotent (reference_idempotence).
//  5. Le numéro de destination vient TOUJOURS de la fiche MobileMoney du médecin, jamais d'une saisie libre.

import prisma from "../lib/prisma.js";
import {
  CampayError, DEVISE_CAMPAY, normaliserNumeroCM, obtenirSoldeCampay, obtenirStatutTransaction,
  obtenirTitulaireNumero, retirerFonds,
} from "../lib/campayService.js";
import { creerMouvement, soldePortefeuille } from "./portefeuille.service.js";

// ─── Paramétrage (variables d'environnement, valeurs par défaut prudentes) ────────────────────
const entierEnv = (nom, defaut) => {
  const n = Number.parseInt(process.env[nom] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : defaut;
};
export const RETRAIT_MONTANT_MIN = () => entierEnv("RETRAIT_MONTANT_MIN_XAF", 1000);
export const RETRAIT_MONTANT_MAX = () => entierEnv("RETRAIT_MONTANT_MAX_XAF", 500_000);
// Approbation automatique : DÉSACTIVÉE par défaut (validation manuelle par un admin).
const approbationAuto = () => process.env.RETRAIT_APPROBATION_AUTO === "true";
const plafondAuto = () => entierEnv("RETRAIT_AUTO_MONTANT_MAX_XAF", 100_000);

const STATUTS_ACTIFS = ["en_attente_validation", "en_cours"];
const CODES_ECHEC_DEFINITIF = new Set(["ER101", "ER102", "ER201"]); // numéro / opérateur / montant refusés

export class RetraitError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "RetraitError";
    this.status = status;
  }
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────────────────────

/** Montant saisi -> entier XAF (CamPay refuse les décimales), borné par min/max. */
export function validerMontantRetrait(saisie) {
  const nombre = typeof saisie === "string" ? Number(saisie.replace(/\s/g, "")) : Number(saisie);
  if (!Number.isFinite(nombre) || !Number.isInteger(nombre)) {
    throw new RetraitError("Le montant doit être un nombre entier de FCFA (sans décimales).");
  }
  const min = RETRAIT_MONTANT_MIN();
  const max = RETRAIT_MONTANT_MAX();
  if (nombre < min) throw new RetraitError(`Le montant minimum d'un retrait est de ${min} FCFA.`);
  if (nombre > max) throw new RetraitError(`Le montant maximum d'un retrait est de ${max} FCFA.`);
  return nombre;
}

const sansAccents = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const jetons = (t) => sansAccents(t).split(/[^a-z]+/).filter((m) => m.length > 1);

/** Tous les mots du nom le plus court figurent dans l'autre (ordre et accents ignorés). */
export function nomsConcordants(declare, campay) {
  const a = jetons(declare);
  const b = jetons(campay);
  if (a.length === 0 || b.length === 0) return null;
  const [court, long] = a.length <= b.length ? [a, b] : [b, a];
  return court.every((m) => long.includes(m));
}

/** holder_info en « best effort » : une panne ne doit jamais bloquer la demande. */
async function titulaireCampay(numero) {
  try {
    const info = await obtenirTitulaireNumero(numero);
    const nom = typeof info?.full_name === "string" ? info.full_name.trim() : "";
    return nom || null;
  } catch (err) {
    console.warn(`[retrait] holder_info indisponible : ${err.message}`);
    return null;
  }
}

const tronquer = (texte, max = 500) => (texte ? String(texte).slice(0, max) : null);

// ─── Création ─────────────────────────────────────────────────────────────────────────────────

/**
 * Crée la demande ET réserve le montant (atomique, sous verrou du portefeuille).
 * @returns {Promise<object>} la DemandeRetrait créée (puis éventuellement déjà approuvée en mode auto)
 */
export async function creerDemandeRetrait({ medecin_id, mobile_money_id, montant }) {
  const montantXaf = validerMontantRetrait(montant);

  const mm = await prisma.mobileMoney.findFirst({ where: { id: mobile_money_id ?? "", medecin_id } });
  if (!mm) throw new RetraitError("Numéro Mobile Money introuvable dans votre profil.", 404);

  let numero;
  try {
    numero = normaliserNumeroCM(mm.numero);
  } catch (err) {
    if (err instanceof CampayError) {
      throw new RetraitError("Le numéro Mobile Money enregistré est invalide. Corrigez-le dans votre profil.", 400);
    }
    throw err;
  }

  // Appel réseau HORS transaction SQL (on ne garde jamais un verrou pendant un appel externe).
  const nomCampay = await titulaireCampay(numero);
  const concordant = nomCampay ? nomsConcordants(mm.titulaire, nomCampay) : null;

  let demande;
  try {
    demande = await prisma.$transaction(
      async (tx) => {
        // Le portefeuille doit exister pour pouvoir être verrouillé.
        await tx.portefeuilleMedecin.upsert({ where: { medecin_id }, update: {}, create: { medecin_id } });
        await tx.$queryRaw`SELECT medecin_id FROM portefeuille_medecin WHERE medecin_id = ${medecin_id}::uuid FOR UPDATE`;

        const active = await tx.demandeRetrait.findFirst({
          where: { medecin_id, statut: { in: STATUTS_ACTIFS } },
          select: { demande_retrait_id: true },
        });
        if (active) {
          throw new RetraitError("Une demande de retrait est déjà en cours de traitement. Attendez son issue.", 409);
        }

        const solde = await soldePortefeuille(medecin_id, tx);
        if (montantXaf > solde) {
          throw new RetraitError(`Solde insuffisant : ${solde} FCFA disponibles.`, 409);
        }

        const creee = await tx.demandeRetrait.create({
          data: {
            medecin_id,
            mobile_money_id: mm.id,
            montant: montantXaf,
            numero,
            titulaire_declare: tronquer(mm.titulaire, 255),
            titulaire_campay: tronquer(nomCampay, 255),
            titulaire_concordant: concordant,
          },
        });

        const mouvement = await creerMouvement(
          {
            medecin_id,
            type: "debit_retrait",
            montant: montantXaf,
            demande_retrait_id: creee.demande_retrait_id,
            reference_idempotence: `retrait:${creee.demande_retrait_id}`,
          },
          tx
        );
        if (!mouvement) throw new Error("Mouvement de réservation déjà existant (état incohérent).");
        return creee;
      },
      { timeout: 10_000 }
    );
  } catch (err) {
    // Filet : l'index unique partiel « une active par médecin » (voir migration).
    if (err.code === "P2002") {
      throw new RetraitError("Une demande de retrait est déjà en cours de traitement. Attendez son issue.", 409);
    }
    throw err;
  }

  // Mode automatique : uniquement si le titulaire concorde et sous le plafond. Sinon → validation manuelle.
  if (approbationAuto() && concordant === true && montantXaf <= plafondAuto()) {
    try {
      return (await executerRetrait(demande.demande_retrait_id, { automatique: true })).demande;
    } catch (err) {
      // La demande existe et le montant est réservé : elle reste traitable à la main.
      console.warn(`[retrait] Approbation automatique impossible (${demande.demande_retrait_id}) : ${err.message}`);
      return prisma.demandeRetrait.findUnique({ where: { demande_retrait_id: demande.demande_retrait_id } });
    }
  }
  return demande;
}

// ─── Clôture avec recrédit (rejet / échec définitif) ─────────────────────────────────────────

/**
 * Transition atomique `depuis` -> `vers` + recrédit idempotent du montant réservé.
 * @returns {Promise<boolean>} true si CETTE invocation a fait la transition
 */
async function cloturerAvecRecredit(demande_retrait_id, { depuis, vers, champs = {} }) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.demandeRetrait.updateMany({
      where: { demande_retrait_id, statut: { in: depuis } },
      data: { statut: vers, date_cloture: new Date(), ...champs },
    });
    if (count === 0) return false;

    const d = await tx.demandeRetrait.findUnique({ where: { demande_retrait_id } });
    await creerMouvement(
      {
        medecin_id: d.medecin_id,
        type: "credit_annulation_retrait",
        montant: Number(d.montant),
        demande_retrait_id,
        reference_idempotence: `retrait-annule:${demande_retrait_id}`,
      },
      tx
    );
    return true;
  });
}

/** Admin : rejette une demande non encore envoyée. Le montant est recrédité. */
export async function rejeterRetrait(demande_retrait_id, { admin_utilisateur_id, motif }) {
  const motifNet = tronquer(String(motif ?? "").trim());
  if (!motifNet) throw new RetraitError("Un motif de rejet est requis.");
  const fait = await cloturerAvecRecredit(demande_retrait_id, {
    depuis: ["en_attente_validation"],
    vers: "rejetee",
    champs: { motif_rejet: motifNet, traite_par: admin_utilisateur_id ?? null },
  });
  if (!fait) throw new RetraitError("Cette demande n'est plus en attente de validation.", 409);
  return prisma.demandeRetrait.findUnique({ where: { demande_retrait_id } });
}

/** Admin : constate qu'un retrait `en_cours` SANS référence n'a jamais été émis (après vérif. dans le tableau de bord CamPay). */
export async function marquerRetraitEchoue(demande_retrait_id, { admin_utilisateur_id, motif }) {
  const motifNet = tronquer(String(motif ?? "").trim());
  if (!motifNet) throw new RetraitError("Un motif est requis (ex. « introuvable dans le tableau de bord CamPay »).");
  const d = await prisma.demandeRetrait.findUnique({ where: { demande_retrait_id } });
  if (!d) throw new RetraitError("Demande introuvable.", 404);
  if (d.campay_reference) {
    throw new RetraitError("Une référence CamPay existe : le résultat sera tranché par CamPay, pas à la main.", 409);
  }
  const fait = await cloturerAvecRecredit(demande_retrait_id, {
    depuis: ["en_cours"],
    vers: "echouee",
    champs: { derniere_erreur: motifNet, traite_par: admin_utilisateur_id ?? null },
  });
  if (!fait) throw new RetraitError("Cette demande n'est pas en cours.", 409);
  return prisma.demandeRetrait.findUnique({ where: { demande_retrait_id } });
}

// ─── Exécution (appel CamPay) ─────────────────────────────────────────────────────────────────

/**
 * Envoie le retrait à CamPay. Appelée par l'admin (approbation) ou en mode automatique.
 * @returns {Promise<{ demande: object, incertain: boolean }>}
 * @throws {RetraitError} 404/409 ; la demande est alors ramenée à `en_attente_validation` si l'échec est réessayable
 */
export async function executerRetrait(demande_retrait_id, { admin_utilisateur_id = null, automatique = false } = {}) {
  // Réservation de l'exécution : une seule invocation peut passer de en_attente_validation à en_cours.
  const { count } = await prisma.demandeRetrait.updateMany({
    where: { demande_retrait_id, statut: "en_attente_validation" },
    data: { statut: "en_cours", date_envoi: new Date(), traite_par: admin_utilisateur_id, derniere_erreur: null },
  });
  if (count === 0) {
    const existe = await prisma.demandeRetrait.findUnique({ where: { demande_retrait_id }, select: { statut: true } });
    if (!existe) throw new RetraitError("Demande introuvable.", 404);
    throw new RetraitError("Cette demande n'est plus en attente de validation.", 409);
  }
  const demande = await prisma.demandeRetrait.findUnique({ where: { demande_retrait_id } });
  const montant = Math.round(Number(demande.montant));

  // Remet la demande en attente (échec RÉESSAYABLE : rien n'a été envoyé à CamPay).
  const relacher = async (message) => {
    await prisma.demandeRetrait.updateMany({
      where: { demande_retrait_id, statut: "en_cours", campay_reference: null },
      data: { statut: "en_attente_validation", derniere_erreur: tronquer(message), date_envoi: null },
    });
  };

  // Contrôle préalable du solde CamPay (best effort : si l'appel échoue, CamPay répondra ER301 le cas échéant).
  let soldeCampayTotal = null;
  try {
    soldeCampayTotal = Number((await obtenirSoldeCampay())?.total_balance);
  } catch (err) {
    console.warn(`[retrait] Solde CamPay indisponible avant retrait ${demande_retrait_id} : ${err.message}`);
  }
  if (Number.isFinite(soldeCampayTotal) && soldeCampayTotal < montant) {
    const message = "Solde CamPay insuffisant : rechargez le compte puis réessayez.";
    await relacher(message);
    throw new RetraitError(message, 409);
  }

  let reference;
  try {
    const rep = await retirerFonds({
      montant,
      numero: demande.numero,
      description: `Retrait honoraires APS Sante ${demande_retrait_id.slice(0, 8)}`,
      external_reference: demande_retrait_id,
    });
    reference = typeof rep?.reference === "string" && rep.reference ? rep.reference : null;
  } catch (err) {
    if (!(err instanceof CampayError)) {
      // Erreur inattendue : on ne sait pas si l'ordre est parti -> traité comme incertain.
      console.error(`[retrait] Erreur inattendue pendant le retrait ${demande_retrait_id} :`, err);
      return { demande: await prisma.demandeRetrait.findUnique({ where: { demande_retrait_id } }), incertain: true };
    }
    if (err.issueIncertaine) {
      console.warn(`[retrait] Issue INCERTAINE retrait=${demande_retrait_id} : ${err.message}. Pas de réessai automatique.`);
      return { demande: await prisma.demandeRetrait.findUnique({ where: { demande_retrait_id } }), incertain: true };
    }
    if (err.code && CODES_ECHEC_DEFINITIF.has(err.code)) {
      // CamPay a refusé la demande elle-même : rien n'a été envoyé -> échec définitif + recrédit.
      await cloturerAvecRecredit(demande_retrait_id, {
        depuis: ["en_cours"],
        vers: "echouee",
        champs: { derniere_erreur: tronquer(`${err.code} : ${err.message}`) },
      });
      throw new RetraitError(`Retrait refusé par CamPay : ${err.message} Le montant a été recrédité.`, 422);
    }
    // ER301 (solde CamPay), jeton absent/invalide, etc. : réessayable par l'admin.
    await relacher(`${err.code ?? err.status} : ${err.message}`);
    throw new RetraitError(
      err.code === "ER301" ? "Solde CamPay insuffisant : rechargez le compte puis réessayez." : err.message,
      err.code === "ER301" ? 409 : 502
    );
  }

  if (!reference) {
    console.warn(`[retrait] Réponse CamPay sans référence retrait=${demande_retrait_id} : issue incertaine.`);
    return { demande: await prisma.demandeRetrait.findUnique({ where: { demande_retrait_id } }), incertain: true };
  }

  try {
    await prisma.demandeRetrait.update({ where: { demande_retrait_id }, data: { campay_reference: reference } });
  } catch (err) {
    // La référence n'a pas pu être enregistrée (P2002 : déjà utilisée ; ou panne base) : signalé, tranché ensuite.
    console.error(`[retrait] Référence CamPay ${reference} non enregistrée pour ${demande_retrait_id} :`, err.message);
    return { demande: await prisma.demandeRetrait.findUnique({ where: { demande_retrait_id } }), incertain: true };
  }

  // Un premier contrôle immédiat (les retraits sont souvent quasi instantanés) ; le cron prend le relais.
  try {
    await verifierEtFinaliserRetrait(await prisma.demandeRetrait.findUnique({ where: { demande_retrait_id } }), { force: true });
  } catch (err) {
    console.warn(`[retrait] Premier contrôle du statut en échec (${demande_retrait_id}) : ${err.message}`);
  }
  console.info(`[retrait] Retrait ${demande_retrait_id} envoyé (${automatique ? "auto" : "admin"}), reference=${reference}.`);
  return { demande: await prisma.demandeRetrait.findUnique({ where: { demande_retrait_id } }), incertain: false };
}

// ─── Vérification du résultat (webhook, cron, contrôle immédiat) ─────────────────────────────

/**
 * Interroge CamPay (source de vérité) et applique le résultat. Idempotent.
 * @returns {Promise<"reussie"|"echouee"|"EN_COURS"|"IGNORE"|"MONTANT_INCOHERENT">}
 */
export async function verifierEtFinaliserRetrait(demande, { force = false } = {}) {
  if (!demande || demande.statut !== "en_cours" || !demande.campay_reference) return "IGNORE";
  void force; // pas d'anti-martèlement ici : appelée par le cron (1 fois / passage) et le webhook

  const st = await obtenirStatutTransaction(demande.campay_reference);

  if (st?.status === "SUCCESSFUL") {
    // Si CamPay renvoie un montant, il doit être celui demandé (sinon : alerte, pas de clôture automatique).
    const recu = st.amount === undefined || st.amount === null ? null : Number(st.amount);
    const attendu = Math.round(Number(demande.montant));
    const deviseOk = !st.currency || st.currency === DEVISE_CAMPAY;
    if ((recu !== null && recu !== attendu) || !deviseOk) {
      console.error(
        `[retrait] MONTANT INCOHÉRENT retrait=${demande.demande_retrait_id} attendu=${attendu} reçu=${st.amount} ${st.currency ?? ""} — non clôturé, à vérifier à la main.`
      );
      return "MONTANT_INCOHERENT";
    }
    const { count } = await prisma.demandeRetrait.updateMany({
      where: { demande_retrait_id: demande.demande_retrait_id, statut: "en_cours" },
      data: { statut: "reussie", date_cloture: new Date(), derniere_erreur: null },
    });
    if (count > 0) console.info(`[retrait] Retrait ${demande.demande_retrait_id} réussi.`);
    return "reussie";
  }

  if (st?.status === "FAILED") {
    await cloturerAvecRecredit(demande.demande_retrait_id, {
      depuis: ["en_cours"],
      vers: "echouee",
      champs: { derniere_erreur: "Échec du décaissement côté CamPay / opérateur." },
    });
    return "echouee";
  }
  return "EN_COURS";
}

/**
 * Retrait à issue incertaine (pas de référence) : rattache la `reference` reçue (callback ou saisie admin)
 * UNIQUEMENT si CamPay confirme external_reference === demande_retrait_id et le montant.
 * @returns {Promise<object|null>} la demande à jour, ou null si non rattachée
 */
export async function rattacherReferenceRetrait(demande, reference) {
  if (!demande || demande.statut !== "en_cours" || demande.campay_reference) return null;
  if (typeof reference !== "string" || !reference || reference.length > 100) return null;

  let st;
  try {
    st = await obtenirStatutTransaction(reference);
  } catch (err) {
    if (err instanceof CampayError && !err.issueIncertaine && err.status >= 400 && err.status < 500) {
      console.warn(`[retrait] Référence ${reference} inconnue de CamPay (${err.status}) : non rattachée.`);
      return null;
    }
    throw err;
  }

  if (st?.external_reference !== demande.demande_retrait_id) {
    console.warn(
      `[retrait] Référence ${reference} non rattachée à ${demande.demande_retrait_id} : external_reference CamPay = ${st?.external_reference ?? "absent"}.`
    );
    return null;
  }
  const recu = Number(st?.amount);
  if (!Number.isFinite(recu) || recu !== Math.round(Number(demande.montant))) {
    console.error(`[retrait] Référence ${reference} NON rattachée à ${demande.demande_retrait_id} : montant reçu=${st?.amount}.`);
    return null;
  }

  try {
    const { count } = await prisma.demandeRetrait.updateMany({
      where: { demande_retrait_id: demande.demande_retrait_id, campay_reference: null, statut: "en_cours" },
      data: { campay_reference: reference },
    });
    if (count === 0) return null;
  } catch (err) {
    if (err.code === "P2002") return null;
    throw err;
  }
  console.info(`[retrait] Retrait incertain rattaché : ${demande.demande_retrait_id} reference=${reference}.`);
  return prisma.demandeRetrait.findUnique({ where: { demande_retrait_id: demande.demande_retrait_id } });
}

// ─── Cron ─────────────────────────────────────────────────────────────────────────────────────

const SEUIL_A_VERIFIER_MS = 10 * 60 * 1000;
const dejaSignalees = new Set();

/** Filet de sécurité (cron) : callbacks perdus, serveur redémarré… + alerte sur les retraits sans référence. */
export async function reconcilierRetraitsEnCours() {
  const enCours = await prisma.demandeRetrait.findMany({
    where: { statut: "en_cours", campay_reference: { not: null } },
    orderBy: { date_envoi: "asc" },
    take: 100,
  });
  let traitees = 0;
  for (const d of enCours) {
    try {
      await verifierEtFinaliserRetrait(d, { force: true });
      traitees += 1;
    } catch (err) {
      console.error(`[retrait] Réconciliation ${d.demande_retrait_id} en échec :`, err.message);
    }
  }

  // Retraits partis (peut-être) chez CamPay mais jamais rattachés : rien à interroger, intervention humaine.
  const limite = new Date(Date.now() - SEUIL_A_VERIFIER_MS);
  const sansReference = await prisma.demandeRetrait.findMany({
    where: { statut: "en_cours", campay_reference: null, date_envoi: { lte: limite } },
    select: { demande_retrait_id: true, montant: true, numero: true, date_envoi: true },
    take: 100,
  });
  for (const d of sansReference) {
    if (dejaSignalees.has(d.demande_retrait_id)) continue;
    dejaSignalees.add(d.demande_retrait_id);
    console.error(
      `[retrait] A VERIFIER : retrait à issue incertaine sans référence depuis > 10 min — ` +
      `demande=${d.demande_retrait_id} montant=${Math.round(Number(d.montant))} XAF numero=***${d.numero.slice(-3)}. ` +
      `Chercher dans le tableau de bord CamPay le décaissement dont external_reference = ${d.demande_retrait_id} : ` +
      `s'il existe, le rattacher (POST /api/retraits/:id/rattacher-reference) ; sinon le marquer échoué (POST /api/retraits/:id/marquer-echoue).`
    );
  }
  const encore = new Set(sansReference.map((d) => d.demande_retrait_id));
  for (const id of dejaSignalees) if (!encore.has(id)) dejaSignalees.delete(id);

  return { traitees, total: enCours.length, sansReference: sansReference.length };
}

// ─── Lecture ──────────────────────────────────────────────────────────────────────────────────

/** Vue publique (médecin) : jamais de champs internes (traite_par, titulaire_campay…). */
export function vueRetraitMedecin(d) {
  return {
    demande_retrait_id: d.demande_retrait_id,
    montant: Number(d.montant),
    numero: d.numero,
    statut: d.statut,
    motif_rejet: d.motif_rejet,
    date_creation: d.date_creation,
    date_cloture: d.date_cloture,
  };
}

export async function listerRetraitsMedecin(medecin_id, { take = 50 } = {}) {
  const lignes = await prisma.demandeRetrait.findMany({
    where: { medecin_id },
    orderBy: { date_creation: "desc" },
    take,
  });
  return lignes.map(vueRetraitMedecin);
}

export async function listerRetraitsAdmin({ statut, take = 100 } = {}) {
  return prisma.demandeRetrait.findMany({
    where: statut ? { statut } : undefined,
    orderBy: { date_creation: "desc" },
    take,
    include: {
      medecin: {
        select: {
          medecin_id: true,
          utilisateur: { select: { nom: true, prenom: true, email: true, telephone: true } },
        },
      },
    },
  });
}

export async function soldeCampayAdmin() {
  const b = await obtenirSoldeCampay();
  return {
    total: Number(b?.total_balance ?? 0),
    mtn: Number(b?.mtn_balance ?? 0),
    orange: Number(b?.orange_balance ?? 0),
    devise: b?.currency ?? DEVISE_CAMPAY,
  };
}