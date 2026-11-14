// src/tests/dureeTeleconsultation.test.js
// Durée maximale d'une téléconsultation : paramètre par pays (valeur par
// défaut, bornes, versionnement), durée figée au début de l'appel, fin
// prévue, clôture automatique après l'échéance. Base SIMULÉE.
// Lancement : node --experimental-test-module-mocks --test src/tests/dureeTeleconsultation.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("../lib/prisma.js", { defaultExport: {} });
const constats = [];
mock.module("../services/finConsultation.service.js", {
  namedExports: {
    constaterFinConsultation: async (rdv_id) => {
      constats.push(rdv_id);
      return { deja_constate: false };
    },
  },
});
mock.module("../services/parametreDelaiLiberation.service.js", {
  namedExports: { ErreurParametreDelai: class extends Error {} },
});
mock.module("../services/avisMedecin.service.js", { namedExports: { inviterAvisPatient: () => {} } });
mock.module("../services/push.service.js", { namedExports: { signalerAppareils: () => {} } });

const lib = await import("../lib/dureeTeleconsultation.js");
const service = await import("../services/dureeTeleconsultation.service.js");

const MIN = 60_000;
const DEBUT = new Date("2026-11-06T10:00:00Z");

/** Base simulée : un médecin (pays-1), des paramètres et des RDV. */
function fausseBase({ parametres = [], rdvs = [] } = {}) {
  return {
    rdvs,
    parametres,
    medecin: { findUnique: async () => ({ pays_exercice_id: "pays-1" }) },
    pays: { findUnique: async ({ where }) => (where.pays_id === "pays-1" ? { pays_id: "pays-1" } : null) },
    parametreDureeTeleconsultation: {
      findFirst: async ({ where }) => parametres.find((p) => p.pays_id === where.pays_id && p.actif) ?? null,
      updateMany: async ({ where, data }) => {
        for (const p of parametres) if (p.pays_id === where.pays_id && p.actif) Object.assign(p, data);
        return { count: 1 };
      },
      create: async ({ data }) => {
        parametres.push(data);
        return data;
      },
    },
    rendezVous: {
      findMany: async () => rdvs,
      findUnique: async ({ where }) => rdvs.find((r) => r.rdv_id === where.rdv_id) ?? null,
      updateMany: async ({ where, data }) => {
        const r = rdvs.find((x) => x.rdv_id === where.rdv_id);
        if (!r || (where.visio_duree_minutes === null && r.visio_duree_minutes != null)) return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      },
      update: async ({ where, data }) => Object.assign(rdvs.find((x) => x.rdv_id === where.rdv_id), data),
    },
  };
}

const rdvVisio = (extra = {}) => ({
  rdv_id: "rdv-1",
  medecin_id: "med-1",
  type_rdv: "teleconsultation",
  statut: "confirme",
  medecin_present_le: DEBUT,
  patient_present_le: new Date(DEBUT.getTime() + 3 * MIN),
  visio_duree_minutes: null,
  visio_cloturee_le: null,
  termine_le: null,
  patient: { utilisateur_id: "u-pat" },
  ...extra,
});

test("bornes de la durée : entier entre 5 et 240 minutes", () => {
  assert.equal(lib.minutesDureeValides(30), true);
  assert.equal(lib.minutesDureeValides(4), false);
  assert.equal(lib.minutesDureeValides(241), false);
  assert.equal(lib.minutesDureeValides("30"), false);
  assert.equal(lib.minutesDureeValides(30.5), false);
});

test("début = arrivée de la seconde partie ; pas de fin tant qu'une partie manque", () => {
  assert.equal(lib.debutConsultation({ medecin_present_le: DEBUT }), null);
  const r = rdvVisio({ visio_duree_minutes: 20 });
  assert.equal(lib.debutConsultation(r).toISOString(), "2026-11-06T10:03:00.000Z");
  assert.equal(lib.finPrevue(r).toISOString(), "2026-11-06T10:23:00.000Z");
  assert.equal(lib.dureeEcoulee(r, new Date("2026-11-06T10:22:59Z")), false);
  assert.equal(lib.dureeEcoulee(r, new Date("2026-11-06T10:23:00Z")), true);
});

test("sans paramètre pour le pays : valeur par défaut", async () => {
  const db = fausseBase();
  const d = await service.resoudreDureePays("pays-1", db);
  assert.equal(d.par_defaut, true);
  assert.equal(d.minutes, lib.DUREE_TELECONSULTATION_PAR_DEFAUT_MIN);
});

test("nouvelle durée : l'ancienne est désactivée, la nouvelle s'applique", async () => {
  const db = fausseBase({ parametres: [{ pays_id: "pays-1", minutes: 30, actif: true }] });
  await service.creerParametreDuree({ pays_id: "pays-1", libelle: "Court", minutes: 15 }, db);
  assert.equal(db.parametres[0].actif, false);
  assert.equal((await service.resoudreDureePays("pays-1", db)).minutes, 15);
  await assert.rejects(service.creerParametreDuree({ pays_id: "pays-1", libelle: "X", minutes: 2 }, db), /minutes/);
});

test("la durée est figée au début de l'appel : un changement ultérieur ne la modifie pas", async () => {
  const db = fausseBase({ parametres: [{ pays_id: "pays-1", minutes: 20, actif: true }], rdvs: [rdvVisio()] });
  const etat = await service.etatDureeVisio(db.rdvs[0], new Date("2026-11-06T10:10:00Z"), db);
  assert.equal(etat.duree_minutes, 20);
  assert.equal(etat.fin_prevue_le, "2026-11-06T10:23:00.000Z");
  assert.equal(etat.alerte_avant_fin_minutes, 5);
  assert.equal(etat.ecoulee, false);
  await service.creerParametreDuree({ pays_id: "pays-1", libelle: "Long", minutes: 60 }, db);
  const apres = await service.etatDureeVisio(db.rdvs[0], new Date("2026-11-06T10:10:00Z"), db);
  assert.equal(apres.duree_minutes, 20);
});

test("une seule partie présente : pas de compte à rebours", async () => {
  const db = fausseBase({ rdvs: [rdvVisio({ patient_present_le: null })] });
  const etat = await service.etatDureeVisio(db.rdvs[0], DEBUT, db);
  assert.equal(etat.fin_prevue_le, null);
  assert.equal(db.rdvs[0].visio_duree_minutes, null);
});

test("cron : clôture après l'échéance + marge, jamais avant", async () => {
  const db = fausseBase({ parametres: [{ pays_id: "pays-1", minutes: 20, actif: true }], rdvs: [rdvVisio()] });
  constats.length = 0;
  // 10:23 = fin prévue ; marge de 2 min : rien à 10:24.
  assert.equal((await service.cloturerVisiosEchues({ maintenant: new Date("2026-11-06T10:24:00Z") }, db)).cloturees, 0);
  const r = await service.cloturerVisiosEchues({ maintenant: new Date("2026-11-06T10:25:00Z") }, db);
  assert.equal(r.cloturees, 1);
  assert.ok(db.rdvs[0].visio_cloturee_le);
  assert.deepEqual(constats, ["rdv-1"]);
});
