// src/tests/changementTypeRdv.test.js
// Changement du type d'un RDV par le médecin (physique <-> téléconsultation)
// et notification « rdv_type_modifie » du patient. Base SIMULÉE.
// Lancement : node --experimental-test-module-mocks --test src/tests/changementTypeRdv.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

const base = { rdv: null, ecritures: [], notifications: [], statutAuMomentEcriture: null };

mock.module("../lib/prisma.js", {
  defaultExport: {
    rendezVous: {
      findUnique: async () => (base.rdv ? structuredClone(base.rdv) : null),
      updateMany: async ({ where, data }) => {
        const statut = base.statutAuMomentEcriture ?? base.rdv.statut;
        if (!where.statut.in.includes(statut) || where.type_rdv !== base.rdv.type_rdv) return { count: 0 };
        base.ecritures.push(data);
        Object.assign(base.rdv, data);
        return { count: 1 };
      },
    },
    notification: {
      createMany: async ({ data }) => {
        base.notifications.push(...data);
        return { count: data.length };
      },
    },
  },
});

const svc = await import("../services/changementTypeRdv.service.js");

const MEDECIN = "med-1";
const MAINTENANT = new Date("2026-10-24T10:00:00Z");

function rdv(extra = {}) {
  return {
    rdv_id: "rdv-1",
    medecin_id: MEDECIN,
    type_rdv: "physique",
    statut: "confirme",
    date_creneau: new Date("2026-10-27T09:00:00Z"),
    lieu_rdv: "Cabinet A",
    accepte_le: MAINTENANT,
    medecin_present_le: null,
    patient_present_le: null,
    visio_cloturee_le: null,
    termine_le: null,
    medecin: { teleconsultation_activee: true },
    patient: { utilisateur_id: "user-patient" },
    ...extra,
  };
}

function reinitialiser(r) {
  base.rdv = r;
  base.ecritures = [];
  base.notifications = [];
  base.statutAuMomentEcriture = null;
}

const changer = (type_rdv) =>
  svc.changerTypeRendezVous({ rdv_id: "rdv-1", medecin_id: MEDECIN, type_rdv }, { maintenant: MAINTENANT });

test("physique -> téléconsultation : lieu effacé, patient notifié", async () => {
  reinitialiser(rdv());
  const r = await changer("teleconsultation");
  assert.deepEqual(r, { inchange: false, type_rdv: "teleconsultation" });
  assert.deepEqual(base.ecritures, [{ type_rdv: "teleconsultation", lieu_rdv: null, accepte_le: null }]);
  assert.equal(base.notifications.length, 1);
  const n = base.notifications[0];
  assert.equal(n.utilisateur_id, "user-patient");
  assert.equal(n.type, "rdv_type_modifie");
  assert.deepEqual(n.donnees, { date_creneau: "2026-10-27T09:00:00.000Z", type_rdv: "teleconsultation" });
});

test("téléconsultation -> physique : acceptation à refaire", async () => {
  reinitialiser(rdv({ type_rdv: "teleconsultation", lieu_rdv: null, accepte_le: null }));
  const r = await changer("physique");
  assert.equal(r.type_rdv, "physique");
  assert.equal(base.rdv.accepte_le, null);
  assert.match(base.notifications[0].message, /lieu/);
});

test("même type : aucun effet, aucune notification", async () => {
  reinitialiser(rdv());
  assert.equal((await changer("physique")).inchange, true);
  assert.equal(base.ecritures.length, 0);
  assert.equal(base.notifications.length, 0);
});

test("refus : type invalide, non payé, autre médecin, statut, consultation commencée, téléconsultation inactive", async () => {
  reinitialiser(rdv());
  assert.equal((await changer("domicile")).erreur.code, "TYPE_RDV_INVALIDE");

  reinitialiser(rdv({ statut: "cree" }));
  assert.equal((await changer("teleconsultation")).erreur.code, "RDV_NON_PAYE");

  reinitialiser(rdv({ medecin_id: "autre" }));
  assert.equal((await changer("teleconsultation")).erreur.status, 403);

  for (const statut of ["annule", "en_attente_presence", "honore", "a_reprogrammer"]) {
    reinitialiser(rdv({ statut }));
    assert.equal((await changer("teleconsultation")).erreur.code, "STATUT_INVALIDE", statut);
  }

  for (const champ of ["medecin_present_le", "patient_present_le", "visio_cloturee_le", "termine_le"]) {
    reinitialiser(rdv({ [champ]: MAINTENANT }));
    assert.equal((await changer("teleconsultation")).erreur.code, "CONSULTATION_COMMENCEE", champ);
  }

  reinitialiser(rdv({ medecin: { teleconsultation_activee: false } }));
  assert.equal((await changer("teleconsultation")).erreur.code, "TELECONSULTATION_INACTIVE");

  reinitialiser(null);
  assert.equal((await changer("teleconsultation")).erreur.status, 404);
  assert.equal(base.notifications.length, 0);
});

test("RDV annulé entre lecture et écriture : refusé, aucune notification", async () => {
  reinitialiser(rdv());
  base.statutAuMomentEcriture = "annule";
  assert.equal((await changer("teleconsultation")).erreur.code, "STATUT_INVALIDE");
  assert.equal(base.notifications.length, 0);
});
