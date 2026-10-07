// src/tests/parametreDelaiLiberation.phase4.test.js
// Libération différée des fonds — Phase 4 : API admin du délai T.
// Le service est SIMULÉ : aucune base requise.
// Lancement : node --experimental-test-module-mocks --test src/tests/parametreDelaiLiberation.phase4.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

class ErreurParametreDelai extends Error {
  constructor(message, status = 400, code = "PARAMETRE_DELAI_INVALIDE") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let appels = [];
let comportement = {};

mock.module("../services/parametreDelaiLiberation.service.js", {
  namedExports: {
    ErreurParametreDelai,
    listerParametresDelai: async (f) => { appels.push(["lister", f]); return comportement.lister?.(f) ?? []; },
    obtenirParametreDelaiActif: async (p) => { appels.push(["actif", p]); return comportement.actif(p); },
    creerParametreDelai: async (d) => { appels.push(["creer", d]); return comportement.creer(d); },
  },
});

const ctrl = await import("../controllers/parametreDelaiLiberation.controller.js");

function fakeRes() {
  return {
    code: null, corps: null,
    status(c) { this.code = c; return this; },
    json(b) { this.corps = b; return this; },
  };
}
const reset = () => { appels = []; comportement = {}; };

test("liste : transmet les filtres et convertit actif en booléen", async () => {
  reset();
  const res = fakeRes();
  await ctrl.listerParametresDelaiLiberation({ query: { pays_id: "p1", actif: "true" } }, res, assert.fail);
  assert.equal(res.code, 200);
  assert.deepEqual(appels[0], ["lister", { pays_id: "p1", actif: true }]);
});

test("liste : sans filtre, historique complet", async () => {
  reset();
  const res = fakeRes();
  await ctrl.listerParametresDelaiLiberation({ query: {} }, res, assert.fail);
  assert.deepEqual(appels[0][1], { pays_id: undefined, actif: undefined });
});

test("liste : actif invalide -> 400 sans appel service", async () => {
  reset();
  const res = fakeRes();
  await ctrl.listerParametresDelaiLiberation({ query: { actif: "oui" } }, res, assert.fail);
  assert.equal(res.code, 400);
  assert.equal(appels.length, 0);
});

test("création : 201 et renvoie le paramètre créé", async () => {
  reset();
  comportement.creer = async (d) => ({ parametre_delai_id: "x", ...d, actif: true });
  const res = fakeRes();
  await ctrl.creerParametreDelaiLiberation({ body: { pays_id: "p1", libelle: "T", heures: 48 } }, res, assert.fail);
  assert.equal(res.code, 201);
  assert.equal(res.corps.parametre_delai_liberation.heures, 48);
});

test("création : erreur métier du service traduite avec status et code", async () => {
  reset();
  comportement.creer = async () => { throw new ErreurParametreDelai("Pays introuvable.", 404, "PAYS_INTROUVABLE"); };
  const res = fakeRes();
  await ctrl.creerParametreDelaiLiberation({ body: { pays_id: "zz", libelle: "T", heures: 1 } }, res, assert.fail);
  assert.equal(res.code, 404);
  assert.equal(res.corps.code, "PAYS_INTROUVABLE");
});

test("création : body absent -> 400 via le service", async () => {
  reset();
  comportement.creer = async () => { throw new ErreurParametreDelai("Champ requis manquant : pays_id."); };
  const res = fakeRes();
  await ctrl.creerParametreDelaiLiberation({}, res, assert.fail);
  assert.equal(res.code, 400);
  assert.deepEqual(appels[0], ["creer", { pays_id: undefined, libelle: undefined, heures: undefined }]);
});

test("création : P2002 (deux actifs concurrents) -> 409", async () => {
  reset();
  comportement.creer = async () => { throw Object.assign(new Error("unique"), { code: "P2002" }); };
  const res = fakeRes();
  await ctrl.creerParametreDelaiLiberation({ body: {} }, res, assert.fail);
  assert.equal(res.code, 409);
  assert.equal(res.corps.code, "PARAMETRE_DELAI_CONFLIT");
});

test("création : erreur technique inconnue -> next(err)", async () => {
  reset();
  const boom = new Error("db down");
  comportement.creer = async () => { throw boom; };
  let recu;
  await ctrl.creerParametreDelaiLiberation({ body: {} }, fakeRes(), (e) => { recu = e; });
  assert.equal(recu, boom);
});

test("actif par pays : 200 si présent, 409 PARAMETRE_DELAI_ABSENT sinon", async () => {
  reset();
  comportement.actif = async (p) => ({ pays_id: p, heures: 24, actif: true });
  let res = fakeRes();
  await ctrl.obtenirParametreDelaiLiberationActif({ params: { pays_id: "p1" } }, res, assert.fail);
  assert.equal(res.code, 200);
  assert.equal(res.corps.parametre_delai_liberation.heures, 24);

  comportement.actif = async () => { throw new ErreurParametreDelai("absent", 409, "PARAMETRE_DELAI_ABSENT"); };
  res = fakeRes();
  await ctrl.obtenirParametreDelaiLiberationActif({ params: { pays_id: "p2" } }, res, assert.fail);
  assert.equal(res.code, 409);
  assert.equal(res.corps.code, "PARAMETRE_DELAI_ABSENT");
});