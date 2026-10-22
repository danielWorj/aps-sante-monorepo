// src/tests/portailLaboratoire.test.js
// Règles pures du portail laboratoire (services/portailLaboratoire.service.js) :
// saisie des examens, quotas de la médiathèque, synthèse des avis, auteur
// public, agrégation des engagements, complétude.
// Lancement : node --experimental-test-module-mocks --test src/tests/portailLaboratoire.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("../lib/prisma.js", { defaultExport: {} });

const {
  MAX_PHOTOS,
  MAX_VIDEOS,
  agregerEngagements,
  auteurPublic,
  completudeFiche,
  normaliserExamen,
  quotasMedias,
  refusAjoutMedia,
  resumeAvis,
  tauxEngagement,
} = await import("../services/portailLaboratoire.service.js");

test("normaliserExamen : nom requis, prix et disponibilité normalisés", () => {
  assert.match(normaliserExamen({}).erreur, /nom/);
  const { data } = normaliserExamen({ nom: "  Glycémie ", prix: "2500,5", categorie: "", disponible: "false" });
  assert.deepEqual(data, { nom: "Glycémie", prix: 2500.5, categorie: null, disponible: false });
  assert.match(normaliserExamen({ nom: "NFS", prix: "-3" }).erreur, /Prix/);
  assert.equal(normaliserExamen({ nom: "NFS", prix: "" }).data.prix, null);
});

test("normaliserExamen partiel : seuls les champs fournis", () => {
  assert.deepEqual(normaliserExamen({ delai_resultat: "24 h" }, { partiel: true }).data, { delai_resultat: "24 h" });
  assert.match(normaliserExamen({ nom: "" }, { partiel: true }).erreur, /nom/);
});

test("quotas de la médiathèque", () => {
  const photos = Array.from({ length: MAX_PHOTOS }, () => ({ type: "image" }));
  const q = quotasMedias([...photos, { type: "video" }]);
  assert.deepEqual(q.photos, { utilise: MAX_PHOTOS, max: MAX_PHOTOS });
  assert.equal(refusAjoutMedia("image", q).code, "QUOTA_PHOTOS_ATTEINT");
  assert.equal(refusAjoutMedia("video", q), null);
  const videos = quotasMedias(Array.from({ length: MAX_VIDEOS }, () => ({ type: "video" })));
  assert.equal(refusAjoutMedia("video", videos).code, "QUOTA_VIDEOS_ATTEINT");
});

test("resumeAvis : moyenne à une décimale et répartition", () => {
  assert.deepEqual(resumeAvis([]), { nombre: 0, moyenne: null, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } });
  const r = resumeAvis([{ note: 5 }, { note: 4 }, { note: 4 }, { note: 9 }]);
  assert.equal(r.nombre, 3);
  assert.equal(r.moyenne, 4.3);
  assert.equal(r.distribution[4], 2);
});

test("auteurPublic : prénom + initiale, jamais le nom complet", () => {
  assert.equal(auteurPublic({ prenom: "Awa", nom: "ngono" }), "Awa N.");
  assert.equal(auteurPublic(null), "Utilisateur");
});

test("agregerEngagements : totaux par type, série complète", () => {
  const aujourdhui = new Date("2026-10-22T00:00:00Z");
  const lignes = [
    { jour: new Date("2026-10-22T00:00:00Z"), type: "clic_telephone", nombre: 3 },
    { jour: new Date("2026-10-10T00:00:00Z"), type: "partage", nombre: 2 },
    { jour: new Date("2026-08-01T00:00:00Z"), type: "partage", nombre: 50 }, // hors période
  ];
  const a = agregerEngagements(lignes, 30, aujourdhui);
  assert.equal(a.total_periode, 5);
  assert.equal(a.sept_jours, 3);
  assert.equal(a.par_type.partage.periode, 2);
  assert.equal(a.serie.length, 30);
  assert.equal(a.serie.at(-1).engagements, 3);
  assert.equal(tauxEngagement(0, 3), null);
  assert.equal(tauxEngagement(40, 5), 12.5);
});

test("completudeFiche", () => {
  const c = completudeFiche({
    fiche: { description: "Labo", image_nom: "x" },
    nbExamens: 2,
    nbCentres: 0,
    nbPhotos: 0,
    aGeolocalisation: true,
  });
  assert.equal(c.score, 67);
  assert.equal(c.elements.find((e) => e.cle === "centres").ok, false);
});
