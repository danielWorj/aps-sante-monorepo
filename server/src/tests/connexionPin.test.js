// src/tests/connexionPin.test.js
// Connexion numéro + code PIN : PIN trop faibles refusés, connexion, réponse
// générique, blocage après 5 erreurs (durée doublée), administrateurs exclus,
// PIN provisoire, numéro déjà pris, espaces du compte. Base SIMULÉE.
// Lancement : node --experimental-test-module-mocks --test src/tests/connexionPin.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

const base = { utilisateurs: [] };

const trouver = (where) =>
  base.utilisateurs.find((u) => Object.entries(where).every(([k, v]) => u[k] === v)) ?? null;
const appliquer = (u, data) => {
  for (const [k, v] of Object.entries(data)) u[k] = v && typeof v === "object" && "increment" in v ? u[k] + v.increment : v;
  return u;
};

mock.module("../lib/prisma.js", {
  defaultExport: {
    pays: { findUnique: async () => ({ code_iso2: "CM" }) },
    utilisateur: {
      findUnique: async ({ where }) => trouver(where),
      update: async ({ where, data }) => appliquer(trouver(where), data),
    },
  },
});

// compte.service.js charge les clés JWT : seule la constante de hachage sert ici.
mock.module("../services/compte.service.js", { namedExports: { SALT_ROUNDS: 4 } });

const pin = await import("../services/pin.service.js");

async function compte(p = {}) {
  const u = {
    utilisateur_id: `u${base.utilisateurs.length + 1}`,
    role: { libelle: "patient" },
    statut_compte: "actif",
    pays_id: "cm",
    telephone: null,
    telephone_connexion: null,
    pin_hash: null,
    pin_provisoire: false,
    pin_echecs: 0,
    pin_nb_blocages: 0,
    pin_bloque_jusqu_au: null,
    patient: { date_naissance: new Date("1990-05-17") },
    ...p,
  };
  if (p.pin) u.pin_hash = await bcrypt.hash(p.pin, 4);
  base.utilisateurs.push(u);
  return u;
}

test("PIN trop faibles refusés, PIN correct accepté", () => {
  for (const faible of ["123456", "654321", "111111", "121212", "123123", "890123", "12345", "abcdef"]) {
    assert.ok(pin.controlerPin(faible), `${faible} devrait être refusé`);
  }
  assert.ok(pin.controlerPin("170590", { date_naissance: "1990-05-17" }), "date de naissance");
  assert.ok(pin.controlerPin("345678") !== null);
  assert.ok(pin.controlerPin("480012", { telephone: "237690480012" }), "fin du numéro");
  assert.equal(pin.controlerPin("483920"), null);
  assert.equal(pin.controlerPin(pin.genererPinProvisoire()), null);
});

test("connexion : bon PIN, numéro local ou international", async () => {
  base.utilisateurs.length = 0;
  await compte({ telephone_connexion: "237690000001", pin: "483920" });
  const u = await pin.verifierNumeroEtPin({ telephone: "690 00 00 01", pays_iso2: "CM", pin: "483920" });
  assert.equal(u.utilisateur_id, "u1");
  assert.equal((await pin.verifierNumeroEtPin({ telephone: "+237690000001", pin: "483920" })).utilisateur_id, "u1");
});

test("réponse identique : numéro inconnu ou PIN faux", async () => {
  base.utilisateurs.length = 0;
  await compte({ telephone_connexion: "237690000002", pin: "483920" });
  const inconnu = await pin.verifierNumeroEtPin({ telephone: "+237690009999", pin: "483920" }).catch((e) => e);
  const faux = await pin.verifierNumeroEtPin({ telephone: "+237690000002", pin: "000111" }).catch((e) => e);
  assert.equal(inconnu.message, faux.message);
  assert.equal(inconnu.status, 401);
  assert.equal(faux.essais_restants, 4);
});

test("5 erreurs : compte bloqué 15 min, puis 30 min au blocage suivant ; réussite = remise à zéro", async () => {
  base.utilisateurs.length = 0;
  const u = await compte({ telephone_connexion: "237690000003", pin: "483920" });
  const essai = (p) => pin.verifierNumeroEtPin({ telephone: "+237690000003", pin: p }).catch((e) => e);

  for (let i = 0; i < 4; i += 1) assert.equal((await essai("000111")).status, 401);
  const blocage = await essai("000111");
  assert.equal(blocage.code, "PIN_BLOQUE");
  assert.equal(blocage.minutes_restantes, 15);
  assert.equal((await essai("483920")).code, "PIN_BLOQUE", "même le bon PIN est refusé pendant le blocage");

  u.pin_bloque_jusqu_au = new Date(Date.now() - 1000);
  for (let i = 0; i < 4; i += 1) await essai("000111");
  assert.equal((await essai("000111")).minutes_restantes, 30);

  u.pin_bloque_jusqu_au = new Date(Date.now() - 1000);
  await pin.verifierNumeroEtPin({ telephone: "+237690000003", pin: "483920" });
  assert.deepEqual([u.pin_echecs, u.pin_nb_blocages, u.pin_bloque_jusqu_au], [0, 0, null]);
});

test("administrateur : jamais de connexion par PIN, ni de PIN à définir", async () => {
  base.utilisateurs.length = 0;
  const admin = await compte({ role: { libelle: "admin" }, telephone_connexion: "237690000004", pin: "483920" });
  assert.equal((await pin.verifierNumeroEtPin({ telephone: "+237690000004", pin: "483920" }).catch((e) => e)).status, 401);
  assert.equal((await pin.definirPin({ utilisateur_id: admin.utilisateur_id, telephone: "+237690000005", pin: "483920" }).catch((e) => e)).code, "PIN_INTERDIT_ADMIN");
});

test("définir son PIN : numéro du compte complété, numéro déjà pris refusé, ancien PIN exigé ensuite", async () => {
  base.utilisateurs.length = 0;
  await compte({ telephone_connexion: "237690000010", pin: "483920" });
  const u = await compte({ telephone: "690000011" });

  const pris = await pin.definirPin({ utilisateur_id: u.utilisateur_id, telephone: "+237690000010", pin: "583920" }).catch((e) => e);
  assert.equal(pris.code, "TELEPHONE_DEJA_UTILISE");

  await pin.definirPin({ utilisateur_id: u.utilisateur_id, telephone: null, pin: "583920" });
  assert.equal(u.telephone_connexion, "237690000011");
  assert.equal(u.telephone_verifie, false);

  const sansAncien = await pin.definirPin({ utilisateur_id: u.utilisateur_id, pin: "683920" }).catch((e) => e);
  assert.equal(sansAncien.code, "ANCIEN_PIN_INCORRECT");
  await pin.definirPin({ utilisateur_id: u.utilisateur_id, pin: "683920", ancien_pin: "583920" });
  assert.ok(await bcrypt.compare("683920", u.pin_hash));
});

test("PIN provisoire : doit être remplacé, et par un PIN différent", async () => {
  base.utilisateurs.length = 0;
  const u = await compte({ telephone_connexion: "237690000020", pin: "483920", pin_provisoire: true });
  const connecte = await pin.verifierNumeroEtPin({ telephone: "+237690000020", pin: "483920" });
  assert.equal(connecte.pin_provisoire, true);
  assert.equal((await pin.remplacerPinProvisoire({ utilisateur_id: u.utilisateur_id, pin: "483920" }).catch((e) => e)).code, "PIN_IDENTIQUE");
  await pin.remplacerPinProvisoire({ utilisateur_id: u.utilisateur_id, pin: "583921" });
  assert.equal(u.pin_provisoire, false);
  assert.equal((await pin.remplacerPinProvisoire({ utilisateur_id: u.utilisateur_id, pin: "683921" }).catch((e) => e)).code, "PIN_DEJA_DEFINI");
});
