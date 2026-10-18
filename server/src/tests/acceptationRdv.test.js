// src/tests/acceptationRdv.test.js
// Acceptation d'un RDV physique par le médecin (lieu obligatoire) et
// notification « rdv_accepte » du patient. Base SIMULÉE : aucune base requise.
// Lancement : node --experimental-test-module-mocks --test src/tests/acceptationRdv.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

const base = { rdv: null, ecritures: [], notifications: [], statutAuMomentEcriture: null };

mock.module("../lib/prisma.js", {
  defaultExport: {
    rendezVous: {
      findUnique: async () => (base.rdv ? structuredClone(base.rdv) : null),
      updateMany: async ({ where, data }) => {
        const statut = base.statutAuMomentEcriture ?? base.rdv.statut;
        if (!where.statut.in.includes(statut)) return { count: 0 };
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

const svc = await import("../services/acceptationRdv.service.js");

const MEDECIN = "med-1";
const MAINTENANT = new Date("2026-10-17T10:00:00Z");

function rdvPhysique(extra = {}) {
  return {
    rdv_id: "rdv-1",
    medecin_id: MEDECIN,
    type_rdv: "physique",
    statut: "confirme",
    date_creneau: new Date("2026-10-20T09:00:00Z"),
    lieu_rdv: null,
    accepte_le: null,
    patient: { utilisateur_id: "user-patient" },
    ...extra,
  };
}

function reinitialiser(rdv) {
  base.rdv = rdv;
  base.ecritures = [];
  base.notifications = [];
  base.statutAuMomentEcriture = null;
}

const accepter = (lieu, maintenant = MAINTENANT) =>
  svc.accepterRendezVous({ rdv_id: "rdv-1", medecin_id: MEDECIN, lieu }, { maintenant });

test("lieu : obligatoire, espaces normalisés, longueur bornée", () => {
  assert.equal(svc.normaliserLieu(undefined).erreur.code, "LIEU_REQUIS");
  assert.equal(svc.normaliserLieu("   ").erreur.code, "LIEU_REQUIS");
  assert.equal(svc.normaliserLieu(42).erreur.code, "LIEU_REQUIS");
  assert.equal(svc.normaliserLieu("  Clinique   X,\n Akwa ").lieu, "Clinique X, Akwa");
  assert.equal(svc.normaliserLieu("a".repeat(svc.LONGUEUR_MAX_LIEU + 1)).erreur.code, "LIEU_TROP_LONG");
});

test("acceptation : lieu + date enregistrés, patient notifié avec date et lieu", async () => {
  reinitialiser(rdvPhysique());
  const r = await accepter(" Cabinet Bonapriso, Douala ");
  assert.equal(r.deja_accepte, false);
  assert.equal(r.modification, false);
  assert.deepEqual(base.ecritures, [{ lieu_rdv: "Cabinet Bonapriso, Douala", accepte_le: MAINTENANT }]);
  assert.equal(base.notifications.length, 1);
  const n = base.notifications[0];
  assert.equal(n.utilisateur_id, "user-patient");
  assert.equal(n.type, "rdv_accepte");
  assert.equal(n.titre, "Rendez-vous accepté");
  assert.match(n.message, /Cabinet Bonapriso, Douala/);
  assert.deepEqual(n.donnees, {
    date_creneau: "2026-10-20T09:00:00.000Z",
    lieu_rdv: "Cabinet Bonapriso, Douala",
    modification: false,
  });
});

test("même lieu renvoyé : aucun effet, aucune notification", async () => {
  reinitialiser(rdvPhysique({ lieu_rdv: "Cabinet A", accepte_le: MAINTENANT }));
  const r = await accepter("Cabinet A");
  assert.equal(r.deja_accepte, true);
  assert.equal(base.ecritures.length, 0);
  assert.equal(base.notifications.length, 0);
});

test("changement de lieu : accepte_le conservé, patient renotifié", async () => {
  reinitialiser(rdvPhysique({ lieu_rdv: "Cabinet A", accepte_le: MAINTENANT }));
  const plusTard = new Date("2026-10-18T08:00:00Z");
  const r = await accepter("Cabinet B", plusTard);
  assert.equal(r.modification, true);
  assert.deepEqual(base.ecritures, [{ lieu_rdv: "Cabinet B", accepte_le: MAINTENANT }]);
  assert.equal(base.notifications[0].titre, "Lieu du rendez-vous modifié");
  assert.equal(base.notifications[0].donnees.modification, true);
});

test("refus : non payé (D8), autre médecin, téléconsultation, mauvais statut, introuvable", async () => {
  reinitialiser(rdvPhysique({ statut: "cree" }));
  assert.equal((await accepter("X")).erreur.code, "RDV_NON_PAYE");

  reinitialiser(rdvPhysique({ medecin_id: "autre" }));
  assert.equal((await accepter("X")).erreur.status, 403);

  reinitialiser(rdvPhysique({ type_rdv: "teleconsultation" }));
  assert.equal((await accepter("X")).erreur.code, "TYPE_RDV_INVALIDE");

  for (const statut of ["annule", "en_attente_presence", "honore", "a_reprogrammer"]) {
    reinitialiser(rdvPhysique({ statut }));
    assert.equal((await accepter("X")).erreur.code, "STATUT_INVALIDE", statut);
  }

  reinitialiser(null);
  assert.equal((await accepter("X")).erreur.status, 404);
  assert.equal(base.notifications.length, 0);
});

test("lieu absent : refusé avant toute écriture", async () => {
  reinitialiser(rdvPhysique());
  assert.equal((await accepter("")).erreur.code, "LIEU_REQUIS");
  assert.equal(base.ecritures.length, 0);
});

test("RDV annulé entre lecture et écriture : refusé, aucune notification", async () => {
  reinitialiser(rdvPhysique());
  base.statutAuMomentEcriture = "annule";
  assert.equal((await accepter("Cabinet A")).erreur.code, "STATUT_INVALIDE");
  assert.equal(base.notifications.length, 0);
});
