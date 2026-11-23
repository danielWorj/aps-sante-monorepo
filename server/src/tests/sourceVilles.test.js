// src/tests/sourceVilles.test.js
// Source des villes : mode manuel / Google Maps, repli automatique quand
// la clé ou l'API ne répond pas, import d'une ville Google sans doublon.
// Base et Google SIMULÉS.
// Lancement : node --experimental-test-module-mocks --test src/tests/sourceVilles.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("../lib/prisma.js", { defaultExport: {} });
mock.module("../lib/perimetrePays.js", { namedExports: { horsPerimetre: (fn) => fn() } });

const { GoogleMapsError } = await import("../lib/googleMaps.js");
const service = await import("../services/sourceVilles.service.js");

function fausseBase({ source = "manuel", villes = [] } = {}) {
  const base = {
    config: { id: 1, source },
    villes,
    pays: [
      { pays_id: "cm", code_iso2: "CM", nom: "Cameroun" },
      { pays_id: "ci", code_iso2: "CI", nom: "Côte d'Ivoire" },
    ],
  };
  const correspond = (v, where = {}) =>
    Object.entries(where).every(([cle, cond]) => {
      if (cond && typeof cond === "object" && "contains" in cond) return v[cle].toLowerCase().includes(cond.contains.toLowerCase());
      if (cond && typeof cond === "object" && "equals" in cond) return v[cle].toLowerCase() === cond.equals.toLowerCase();
      return (v[cle] ?? null) === cond;
    });
  base.db = {
    configSourceVilles: {
      findUnique: async () => base.config,
      upsert: async ({ update }) => Object.assign(base.config, update),
    },
    pays: {
      findUnique: async ({ where }) =>
        base.pays.find((p) => (where.pays_id ? p.pays_id === where.pays_id : p.code_iso2 === where.code_iso2)) ?? null,
    },
    ville: {
      findMany: async ({ where }) => base.villes.filter((v) => correspond(v, where)),
      findUnique: async ({ where }) => base.villes.find((v) => correspond(v, where)) ?? null,
      create: async ({ data }) => {
        const v = { ville_id: `v${base.villes.length + 1}`, ...data };
        base.villes.push(v);
        return v;
      },
      update: async ({ where, data }) => Object.assign(base.villes.find((v) => v.ville_id === where.ville_id), data),
    },
  };
  return base;
}

function configurer(base, { google = {}, cle = true } = {}) {
  const appels = { autocompleter: 0, detailler: 0 };
  let horloge = Date.parse("2026-11-21T10:00:00Z");
  service._configurerPourTests({
    db: base.db,
    cleConfiguree: () => cle,
    maintenant: () => horloge,
    autocompleter: async (...args) => {
      appels.autocompleter += 1;
      return google.autocompleter ? google.autocompleter(...args) : [];
    },
    detailler: async (...args) => {
      appels.detailler += 1;
      return google.detailler ? google.detailler(...args) : null;
    },
  });
  return { appels, avancer: (ms) => (horloge += ms) };
}

const PANNE = () => {
  throw new GoogleMapsError("Recherche de villes Google indisponible.", "HTTP 403 (API not enabled)");
};

test("mode manuel : seules les villes en base, Google jamais appelé", async () => {
  const base = fausseBase({ villes: [{ ville_id: "v1", pays_id: "cm", nom: "Douala", google_place_id: null }] });
  const { appels } = configurer(base);

  const r = await service.rechercherVilles({ q: "dou", pays_id: "cm" });
  assert.equal(r.source, "manuel");
  assert.deepEqual(r.villes.map((v) => v.nom), ["Douala"]);
  assert.deepEqual(r.suggestions, []);
  assert.equal(appels.autocompleter, 0);
});

test("mode google sans clé : repli manuel", async () => {
  const base = fausseBase({ source: "google" });
  const { appels } = configurer(base, { cle: false });

  const etat = await service.etatSource();
  assert.equal(etat.source_effective, "manuel");
  assert.equal(etat.raison_repli, "cle_absente");
  const r = await service.rechercherVilles({ q: "Kribi", pays_id: "cm" });
  assert.equal(r.source, "manuel");
  assert.equal(appels.autocompleter, 0);
});

test("mode google : suggestions sans les villes déjà en base", async () => {
  const base = fausseBase({
    source: "google",
    villes: [{ ville_id: "v1", pays_id: "cm", nom: "Bafoussam", google_place_id: null }],
  });
  const { appels } = configurer(base, {
    google: {
      autocompleter: async (texte, { codePays }) => {
        assert.equal(texte, "Baf");
        assert.equal(codePays, "CM");
        return [
          { placeId: "PLACE_BAFOUSSAM_1", nom: "Bafoussam", description: "Bafoussam, Cameroun" },
          { placeId: "PLACE_BAFANG_0001", nom: "Bafang", description: "Bafang, Cameroun" },
        ];
      },
    },
  });

  const r = await service.rechercherVilles({ q: "Baf", pays_id: "cm" });
  assert.equal(r.source, "google");
  assert.deepEqual(r.villes.map((v) => v.nom), ["Bafoussam"]);
  assert.deepEqual(r.suggestions.map((s) => s.nom), ["Bafang"]);
  assert.equal(appels.autocompleter, 1);
});

test("panne Google : repli manuel, pause puis nouvel essai", async () => {
  const base = fausseBase({ source: "google", villes: [{ ville_id: "v1", pays_id: "cm", nom: "Yaoundé", google_place_id: null }] });
  const { appels, avancer } = configurer(base, { google: { autocompleter: PANNE } });

  const r1 = await service.rechercherVilles({ q: "Yao", pays_id: "cm" });
  assert.equal(r1.source, "manuel");
  assert.deepEqual(r1.villes.map((v) => v.nom), ["Yaoundé"]);
  assert.equal(base.config.dernier_test_ok, false);

  // Pendant la pause : Google n'est plus sollicité.
  await service.rechercherVilles({ q: "Yao", pays_id: "cm" });
  assert.equal(appels.autocompleter, 1);
  assert.equal((await service.etatSource()).raison_repli, "google_indisponible");

  // Après la pause : nouvel essai.
  avancer(service.PAUSE_APRES_PANNE_MS + 1);
  await service.rechercherVilles({ q: "Yao", pays_id: "cm" });
  assert.equal(appels.autocompleter, 2);
});

test("test de la clé réussi : lève la pause", async () => {
  const base = fausseBase({ source: "google" });
  let enPanne = true;
  configurer(base, { google: { autocompleter: async () => (enPanne ? PANNE() : [{ placeId: "P", nom: "Douala" }]) } });

  await service.rechercherVilles({ q: "Dou", pays_id: "cm" });
  assert.equal((await service.etatSource()).source_effective, "manuel");

  enPanne = false;
  const etat = await service.testerGoogle();
  assert.equal(etat.source_effective, "google");
  assert.equal(etat.dernier_test_ok, true);
});

test("import : création, puis ville renvoyée sans doublon", async () => {
  const base = fausseBase({ source: "google" });
  const { appels } = configurer(base, {
    google: {
      detailler: async (placeId) => ({
        placeId,
        nom: "Kribi",
        codePays: "CM",
        latitude: 2.94,
        longitude: 9.91,
        codePostal: null,
      }),
    },
  });

  const a = await service.importerVilleGoogle({ place_id: "PLACE_KRIBI_00001", pays_id: "cm" });
  assert.equal(a.creee, true);
  assert.equal(a.ville.nom, "Kribi");
  assert.equal(a.ville.google_place_id, "PLACE_KRIBI_00001");
  assert.equal(a.ville.latitude, 2.94);

  const b = await service.importerVilleGoogle({ place_id: "PLACE_KRIBI_00001", pays_id: "cm" });
  assert.equal(b.creee, false);
  assert.equal(b.ville.ville_id, a.ville.ville_id);
  assert.equal(base.villes.length, 1);
  assert.equal(appels.detailler, 1);
});

test("import : complète la ville saisie à la main du même nom", async () => {
  const base = fausseBase({
    source: "google",
    villes: [{ ville_id: "v1", pays_id: "cm", nom: "Ngaoundere", google_place_id: null, code_postal: null }],
  });
  configurer(base, {
    google: {
      detailler: async (placeId) => ({ placeId, nom: "Ngaoundéré", codePays: "CM", latitude: 7.3, longitude: 13.6, codePostal: null }),
    },
  });

  const r = await service.importerVilleGoogle({ place_id: "PLACE_NGAOUNDERE", pays_id: "cm" });
  assert.equal(r.creee, false);
  assert.equal(r.ville.ville_id, "v1");
  assert.equal(r.ville.google_place_id, "PLACE_NGAOUNDERE");
  assert.equal(base.villes.length, 1);
});

test("import refusé : pays hors référentiel ou autre pays que celui du formulaire", async () => {
  const base = fausseBase({ source: "google" });
  configurer(base, {
    google: {
      detailler: async (placeId) =>
        placeId === "PLACE_LAGOS_00001"
          ? { placeId, nom: "Lagos", codePays: "NG", latitude: 6.5, longitude: 3.4, codePostal: null }
          : { placeId, nom: "Abidjan", codePays: "CI", latitude: 5.3, longitude: -4.0, codePostal: null },
    },
  });

  await assert.rejects(service.importerVilleGoogle({ place_id: "PLACE_LAGOS_00001" }), { status: 422 });
  await assert.rejects(service.importerVilleGoogle({ place_id: "PLACE_ABIDJAN_001", pays_id: "cm" }), { status: 400 });
  assert.equal(base.villes.length, 0);
});

test("import en mode manuel : refusé (503)", async () => {
  const base = fausseBase({ source: "manuel" });
  configurer(base);
  await assert.rejects(service.importerVilleGoogle({ place_id: "PLACE_KRIBI_00001" }), { status: 503 });
});

test("changement de source : valeur contrôlée", async () => {
  const base = fausseBase();
  configurer(base);
  await assert.rejects(service.changerSource("osm"), { status: 400 });
  const etat = await service.changerSource("google");
  assert.equal(etat.source_choisie, "google");
  assert.equal(etat.source_effective, "google");
});
