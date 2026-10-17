// src/tests/abonnementAssurance.test.js
// Abonnements assurance (guide v3) : dates, montants, prorata, devis,
// activation (renouvellement chaîné, montée de niveau) et finalisation
// (idempotence, paiement tardif). Prisma est SIMULÉ : aucune base requise.
// Lancement : node --experimental-test-module-mocks --test src/tests/abonnementAssurance.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

process.env.STRIPE_SECRET_KEY ??= "sk_test_simule";

// ─── Prisma simulé ──────────────────────────────────────────────
let abonnements = [];
let transactions = [];
let remboursements = [];
let audits = [];
let factures = [];
let compteur = 0;

function correspond(ligne, where = {}) {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("not" in v) return ligne[k] !== v.not;
      if ("in" in v) return v.in.includes(ligne[k]);
      if ("gt" in v) return ligne[k] > v.gt;
    }
    return ligne[k] === v;
  });
}

const niveaux = {
  n1: { niveau_id: "n1", code: "enrichie", libelle: "Enrichie", rang: 1 },
  n2: { niveau_id: "n2", code: "premium", libelle: "Premium", rang: 2 },
};

const tx = {
  $queryRaw: async (strings) => {
    if (String(strings[0]).includes("compteur_facture_abonnement")) {
      compteur += 1;
      return [{ dernier: compteur }];
    }
    return [];
  },
  abonnementAssurance: {
    findUnique: async ({ where, include }) => {
      const a = abonnements.find((x) => x.abonnement_id === where.abonnement_id);
      if (!a) return null;
      return include
        ? { ...a, niveau: niveaux[a.niveau_id], service: { nom: "Assur Test", service_assurance_id: a.service_assurance_id } }
        : { ...a };
    },
    findFirst: async ({ where, orderBy }) => {
      let l = abonnements.filter((a) => correspond(a, where));
      if (orderBy?.date_fin === "desc") l = l.sort((x, y) => y.date_fin - x.date_fin);
      return l[0] ? { ...l[0] } : null;
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const a of abonnements) if (correspond(a, where)) { Object.assign(a, data); count += 1; }
      return { count };
    },
    update: async ({ where, data }) => {
      const a = abonnements.find((x) => x.abonnement_id === where.abonnement_id);
      Object.assign(a, data);
      return a;
    },
  },
  transactionPaiement: {
    findUnique: async ({ where }) => transactions.find((t) => t.transaction_id === where.transaction_id) ?? null,
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const t of transactions) if (correspond(t, where)) { Object.assign(t, data); count += 1; }
      return { count };
    },
  },
  remboursementPaiement: {
    findFirst: async ({ where }) => remboursements.find((r) => correspond(r, where)) ?? null,
    create: async ({ data }) => { remboursements.push(data); return data; },
  },
  factureAbonnementAssurance: { create: async ({ data }) => { factures.push(data); return data; } },
  journalAudit: { create: async ({ data }) => { audits.push(data); return data; } },
};

const prismaSimule = {
  ...tx,
  $transaction: async (fn) => fn(tx),
  agentAssurance: { findMany: async () => [] },
  notification: { createMany: async () => ({ count: 0 }) },
};

mock.module("../lib/prisma.js", { defaultExport: prismaSimule });

const { ajouterMois } = await import("../lib/dates.js");
const { calculerMontantsAbonnement, calculerCreditProrata } = await import("../services/tarifAbonnementAssurance.service.js");
const { construireDevisAbonnement } = await import("../services/factureAbonnement.service.js");
const { activerAbonnement } = await import("../services/abonnementAssurance.service.js");
const { finaliserAbonnementAssurance } = await import("../services/finalisationAbonnementAssurance.service.js");
const { debutDuJourUtc } = await import("../lib/droitsAssurance.js");

const J = (s) => new Date(`${s}T00:00:00.000Z`);
const AUJ = debutDuJourUtc();

function reinitialiser() {
  abonnements = [];
  transactions = [];
  remboursements = [];
  audits = [];
  factures = [];
  compteur = 0;
}

// ─── Dates ──────────────────────────────────────────────────────
test("ajouterMois borne au dernier jour du mois", () => {
  assert.deepEqual(ajouterMois(J("2026-01-31"), 1), J("2026-02-28"));
  assert.deepEqual(ajouterMois(J("2028-01-31"), 1), J("2028-02-29"));
  assert.deepEqual(ajouterMois(J("2026-03-15"), 12), J("2027-03-15"));
  assert.deepEqual(ajouterMois(J("2026-08-31"), 6), J("2027-02-28"));
});

// ─── Montants ───────────────────────────────────────────────────
test("montants XAF : arrondis à l'unité, total = brut − remise − crédit", () => {
  const m = calculerMontantsAbonnement({ prix_mensuel: 10001, duree_mois: 1, remise_pourcent: 5, devise: "xaf" });
  assert.equal(m.brut, 10001);
  assert.equal(m.remise, 500);
  assert.equal(m.apres_remise, 9501);
  assert.equal(m.total, 9501);
  const m2 = calculerMontantsAbonnement({ prix_mensuel: 25000, duree_mois: 12, remise_pourcent: 15, credit_prorata: 4000, devise: "xaf" });
  assert.equal(m2.brut, 300000);
  assert.equal(m2.remise, 45000);
  assert.equal(m2.total, 251000);
});

test("le crédit ne rend jamais le total négatif", () => {
  const m = calculerMontantsAbonnement({ prix_mensuel: 1000, duree_mois: 1, credit_prorata: 5000, devise: "xaf" });
  assert.equal(m.credit_prorata, 1000);
  assert.equal(m.total, 0);
});

test("prorata : part non consommée, même devise seulement", () => {
  const courant = { date_debut: J("2026-01-01"), date_fin: J("2026-01-31"), montant_total: 30000, devise: "xaf" };
  assert.equal(calculerCreditProrata(courant, "xaf", J("2026-01-21")), 10000);
  assert.equal(calculerCreditProrata(courant, "eur", J("2026-01-21")), 0);
  assert.equal(calculerCreditProrata(courant, "xaf", J("2026-02-05")), 0);
});

test("devis : lignes et total cohérents ; incohérence détectée", () => {
  const abonnement = {
    abonnement_id: "a1", devise: "xaf", duree_mois: 12, prix_mensuel_applique: 25000,
    remise_pourcent: 15, credit_prorata: 4000, montant_total: 251000,
  };
  const d = construireDevisAbonnement({ abonnement, niveau: niveaux.n2, service: { nom: "X", service_assurance_id: "s" } });
  assert.equal(d.total, 251000);
  assert.deepEqual(d.lignes.map((l) => l.montant), [300000, -45000, -4000]);
  assert.throws(() =>
    construireDevisAbonnement({ abonnement: { ...abonnement, montant_total: 250000 }, niveau: niveaux.n2, service: { nom: "X" } })
  );
});

// ─── Activation ─────────────────────────────────────────────────
test("renouvellement du même niveau : démarre à l'échéance en cours", async () => {
  reinitialiser();
  const finCourante = ajouterMois(AUJ, 1);
  abonnements.push({ abonnement_id: "ancien", service_assurance_id: "s1", niveau_id: "n1", statut: "actif", date_debut: AUJ, date_fin: finCourante });
  abonnements.push({ abonnement_id: "nouveau", service_assurance_id: "s1", niveau_id: "n1", statut: "en_attente_paiement", duree_mois: 3, montant_total: 0 });
  const r = await activerAbonnement(tx, { ...abonnements[1] });
  assert.equal(r.effet, true);
  assert.deepEqual(abonnements[1].date_debut, finCourante);
  assert.deepEqual(abonnements[1].date_fin, ajouterMois(finCourante, 3));
  assert.equal(abonnements[0].statut, "actif");
});

test("montée de niveau : démarre aujourd'hui, l'ancien passe « remplace »", async () => {
  reinitialiser();
  abonnements.push({ abonnement_id: "bas", service_assurance_id: "s1", niveau_id: "n1", statut: "actif", date_debut: AUJ, date_fin: ajouterMois(AUJ, 6) });
  abonnements.push({
    abonnement_id: "haut", service_assurance_id: "s1", niveau_id: "n2", statut: "en_attente_paiement",
    duree_mois: 1, montant_total: 0, abonnement_remplace_id: "bas",
  });
  await activerAbonnement(tx, { ...abonnements[1] });
  assert.deepEqual(abonnements[1].date_debut, AUJ);
  assert.equal(abonnements[0].statut, "remplace");
});

test("activation concurrente : un seul effet", async () => {
  reinitialiser();
  abonnements.push({ abonnement_id: "a", service_assurance_id: "s1", niveau_id: "n1", statut: "en_attente_paiement", duree_mois: 1, montant_total: 0 });
  const copie = { ...abonnements[0] };
  const [r1, r2] = [await activerAbonnement(tx, copie), await activerAbonnement(tx, copie)];
  assert.equal(r1.effet, true);
  assert.equal(r2.effet, false);
});

// ─── Finalisation ───────────────────────────────────────────────
function brouillonPaye() {
  abonnements.push({
    abonnement_id: "a", service_assurance_id: "s1", niveau_id: "n1", statut: "en_attente_paiement",
    duree_mois: 1, prix_mensuel_applique: 10000, remise_pourcent: 0, credit_prorata: 0, montant_total: 10000, devise: "xaf",
  });
  transactions.push({ transaction_id: "t1", abonnement_assurance_id_cible: "a", statut: "en_attente", montant: 10000, fournisseur: "stripe" });
}

test("finalisation : active, facture numérotée ; rejeu sans effet", async () => {
  reinitialiser();
  brouillonPaye();
  const r1 = await finaliserAbonnementAssurance({ transaction_id: "t1", payment_intent_id: "pi_1" });
  assert.equal(r1.effet, true);
  assert.equal(abonnements[0].statut, "actif");
  assert.equal(transactions[0].statut, "reussie");
  assert.equal(factures.length, 1);
  assert.match(factures[0].numero, /^FAC-ABO-\d{4}-000001$/);

  const r2 = await finaliserAbonnementAssurance({ transaction_id: "t1", payment_intent_id: "pi_1" });
  assert.equal(r2.effet, false);
  assert.equal(factures.length, 1);
});

test("paiement tardif (brouillon annulé) : rien n'est activé, remboursement à traiter unique", async () => {
  reinitialiser();
  brouillonPaye();
  abonnements[0].statut = "annule";
  const r = await finaliserAbonnementAssurance({ transaction_id: "t1", campay_reference: "ref" });
  assert.equal(r.paiementTardif, true);
  assert.equal(abonnements[0].statut, "annule");
  assert.equal(remboursements.length, 1);
  assert.equal(remboursements[0].statut, "a_traiter");
  await finaliserAbonnementAssurance({ transaction_id: "t1", campay_reference: "ref" });
  assert.equal(remboursements.length, 1);
  assert.equal(factures.length, 0);
});
