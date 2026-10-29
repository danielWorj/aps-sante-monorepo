// src/tests/miseAJourOta.test.js
// Réglages OTA d'une version mobile (gestionapk.controller.js) : build minimal
// requis et pourcentage de déploiement. Base SIMULÉE.
// Lancement : node --experimental-test-module-mocks --test src/tests/miseAJourOta.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("../lib/prisma.js", { defaultExport: {} });

const { lireChampsOta } = await import("../controllers/gestionapk.controller.js");

test("champs absents : rien n'est modifié", () => {
  assert.deepEqual(lireChampsOta({}, 5), { donnees: {} });
});

test("build minimal vide : obligation retirée", () => {
  assert.deepEqual(lireChampsOta({ build_minimum: "" }, 5).donnees, { build_minimum: null });
  assert.deepEqual(lireChampsOta({ build_minimum: "null" }, 5).donnees, { build_minimum: null });
});

test("build minimal valide, jusqu'au build de la version", () => {
  assert.deepEqual(lireChampsOta({ build_minimum: "5" }, 5).donnees, { build_minimum: 5 });
  assert.deepEqual(lireChampsOta({ build_minimum: 3 }, null).donnees, { build_minimum: 3 });
});

test("build minimal refusé : non entier, nul ou supérieur à la version", () => {
  assert.ok(lireChampsOta({ build_minimum: "abc" }, 5).erreur);
  assert.ok(lireChampsOta({ build_minimum: "0" }, 5).erreur);
  assert.ok(lireChampsOta({ build_minimum: "2.5" }, 5).erreur);
  assert.match(lireChampsOta({ build_minimum: "6" }, 5).erreur, /ne peut pas dépasser/);
});

test("pourcentage de déploiement entre 1 et 100", () => {
  assert.deepEqual(lireChampsOta({ deploiement_pourcentage: "25" }, 5).donnees, { deploiement_pourcentage: 25 });
  assert.deepEqual(lireChampsOta({ deploiement_pourcentage: 100 }, 5).donnees, { deploiement_pourcentage: 100 });
  for (const v of ["0", "101", "", "dix", "12.5"]) {
    assert.ok(lireChampsOta({ deploiement_pourcentage: v }, 5).erreur, `refus attendu pour « ${v} »`);
  }
});
