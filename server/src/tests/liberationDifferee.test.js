// src/tests/liberationDifferee.phase3.test.js
// Libération différée des fonds — Phase 3 : sélection des RDV échus et passage
// du job. Prisma et libererFonds sont SIMULÉS : aucune base requise.
// Lancement : node --experimental-test-module-mocks --test src/tests/liberationDifferee.phase3.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

const H = 3_600_000;
const T0 = new Date("2026-10-07T10:00:00.000Z");
const MAINT = new Date(T0.getTime() + 48 * H);

// État simulé, remis à zéro par test.
let candidats = [];
let rdvVerrouille = null;
let appelsLibererFonds = [];
let resultatLibererFonds = { deja_traite: false, honoraires: 10000, commission_medecin: 1000, commission_patient: 500, net_medecin: 9000, amendes_imputees: 0, credit_final: 9000 };
let erreurPour = new Set();

const tx = {
  $queryRaw: async () => [],
  rendezVous: { findUnique: async () => rdvVerrouille },
};
const prismaSimule = {
  rendezVous: { findMany: async () => candidats },
  $transaction: async (fn) => fn(tx),
};

mock.module("../lib/prisma.js", { defaultExport: prismaSimule });
mock.module("../services/liberationEscrow.service.js", {
  namedExports: {
    libererFonds: async (rdv_id, opts) => {
      appelsLibererFonds.push({ rdv_id, opts });
      if (erreurPour.has(rdv_id)) throw new Error("ligne de commission absente");
      return resultatLibererFonds;
    },
  },
});

const { trouverRdvsALiberer, libererRdvEchu, libererFondsEchus } = await import("../services/liberationDifferee.service.js");
const { libererFondsEchusJob } = await import("../jobs/libererFondsEchus.job.js");

function reinitialiser() {
  candidats = [];
  rdvVerrouille = null;
  appelsLibererFonds = [];
  erreurPour = new Set();
  resultatLibererFonds = { deja_traite: false, honoraires: 10000, commission_medecin: 1000, commission_patient: 500, net_medecin: 9000, amendes_imputees: 0, credit_final: 9000 };
}

test("trouverRdvsALiberer : n'inclut que les RDV dont termine_le + T est échu", async () => {
  reinitialiser();
  candidats = [
    { rdv_id: "echu", termine_le: T0, delai_liberation_heures: 24 },
    { rdv_id: "pile", termine_le: T0, delai_liberation_heures: 48 }, // borne inclusive
    { rdv_id: "en-cours", termine_le: T0, delai_liberation_heures: 49 },
  ];
  const res = await trouverRdvsALiberer({ maintenant: MAINT });
  assert.deepEqual(res.map((r) => r.rdv_id), ["echu", "pile"]);
  assert.equal(res[0].date_liberation.getTime(), T0.getTime() + 24 * H);
});

test("trouverRdvsALiberer : T figé respecté, plafond par passage", async () => {
  reinitialiser();
  candidats = [
    { rdv_id: "a", termine_le: T0, delai_liberation_heures: 0 },
    { rdv_id: "b", termine_le: T0, delai_liberation_heures: 0 },
    { rdv_id: "c", termine_le: T0, delai_liberation_heures: 0 },
  ];
  const res = await trouverRdvsALiberer({ maintenant: MAINT, limite: 2 });
  assert.deepEqual(res.map((r) => r.rdv_id), ["a", "b"]);
});

test("libererRdvEchu : délai en cours -> aucune libération", async () => {
  reinitialiser();
  rdvVerrouille = { rdv_id: "r1", statut: "confirme", termine_le: T0, delai_liberation_heures: 72 };
  const res = await libererRdvEchu("r1", { maintenant: MAINT });
  assert.equal(res.libere, false);
  assert.equal(res.raison, "delai_en_cours");
  assert.equal(appelsLibererFonds.length, 0);
});

test("libererRdvEchu : statut conteste / annule / non_honore -> jamais libéré", async () => {
  for (const statut of ["conteste", "annule", "non_honore", "honore", "cree"]) {
    reinitialiser();
    rdvVerrouille = { rdv_id: "r1", statut, termine_le: T0, delai_liberation_heures: 1 };
    const res = await libererRdvEchu("r1", { maintenant: MAINT });
    assert.equal(res.libere, false, statut);
    assert.equal(res.raison, "statut_non_eligible", statut);
  }
  assert.equal(appelsLibererFonds.length, 0);
});

test("libererRdvEchu : fin non constatée -> consultation_non_terminee ; RDV absent -> rdv_introuvable", async () => {
  reinitialiser();
  rdvVerrouille = { rdv_id: "r1", statut: "confirme", termine_le: null, delai_liberation_heures: null };
  assert.equal((await libererRdvEchu("r1", { maintenant: MAINT })).raison, "consultation_non_terminee");
  rdvVerrouille = null;
  assert.equal((await libererRdvEchu("r1", { maintenant: MAINT })).raison, "rdv_introuvable");
  assert.equal(appelsLibererFonds.length, 0);
});

test("libererRdvEchu : délai échu -> libererFonds appelé en statut « honore »", async () => {
  reinitialiser();
  rdvVerrouille = { rdv_id: "r1", statut: "en_attente_presence", termine_le: T0, delai_liberation_heures: 24 };
  const res = await libererRdvEchu("r1", { maintenant: MAINT });
  assert.equal(res.libere, true);
  assert.equal(res.credit_final, 9000);
  assert.deepEqual(appelsLibererFonds, [{ rdv_id: "r1", opts: { statutRdv: "honore" } }]);
});

test("libererRdvEchu : escrow déjà traité (idempotence) -> deja_traite, pas de second crédit", async () => {
  reinitialiser();
  rdvVerrouille = { rdv_id: "r1", statut: "confirme", termine_le: T0, delai_liberation_heures: 24 };
  resultatLibererFonds = { deja_traite: true };
  const res = await libererRdvEchu("r1", { maintenant: MAINT });
  assert.deepEqual(res, { libere: false, raison: "deja_traite" });
});

test("libererFondsEchus : une erreur sur un RDV n'arrête pas les autres", async () => {
  reinitialiser();
  candidats = [
    { rdv_id: "ko", termine_le: T0, delai_liberation_heures: 1 },
    { rdv_id: "ok", termine_le: T0, delai_liberation_heures: 1 },
  ];
  rdvVerrouille = { rdv_id: "x", statut: "confirme", termine_le: T0, delai_liberation_heures: 1 };
  erreurPour = new Set(["ko"]);
  const logErreur = mock.method(console, "error", () => {});
  const logInfo = mock.method(console, "info", () => {});
  try {
    const res = await libererFondsEchus({ maintenant: MAINT });
    assert.deepEqual(res, { candidats: 2, liberes: 1, ignores: 0, echecs: 1 });
    assert.deepEqual(appelsLibererFonds.map((a) => a.rdv_id), ["ko", "ok"]);
  } finally {
    logErreur.mock.restore();
    logInfo.mock.restore();
  }
});

test("job : ne chevauche pas un passage encore en cours", async () => {
  reinitialiser();
  let debloquer;
  const bloque = new Promise((r) => (debloquer = r));
  prismaSimule.rendezVous.findMany = async () => { await bloque; return []; };
  const warn = mock.method(console, "warn", () => {});
  try {
    const premier = libererFondsEchusJob({ maintenant: MAINT });
    const second = await libererFondsEchusJob({ maintenant: MAINT });
    assert.equal(second.saute, true);
    debloquer();
    const res = await premier;
    assert.equal(res.saute, undefined);
    // Le verrou est bien relâché après le passage.
    const troisieme = await libererFondsEchusJob({ maintenant: MAINT });
    assert.equal(troisieme.saute, undefined);
  } finally {
    warn.mock.restore();
  }
});