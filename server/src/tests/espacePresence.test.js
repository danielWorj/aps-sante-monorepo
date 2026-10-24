// src/tests/espacePresence.test.js
// Espaces pharmacie et centre de santé : horaires (lib/horairesFiche.js),
// règles pures de services/espacePresence.service.js et contrôle d'accès du
// gestionnaire (lib/acteursPresence.js — peutGererFichePresence).
// Lancement : node --experimental-test-module-mocks --test src/tests/espacePresence.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

const agentsPharmacie = [{ agent_id: "a1", utilisateur_id: "u1", pharmacie_id: "ph1" }, { agent_id: "a2", utilisateur_id: "u1", pharmacie_id: "ph2" }];
const correspond = (ligne, where) => Object.entries(where).every(([k, v]) => ligne[k] === v);

mock.module("../lib/prisma.js", {
  defaultExport: {
    agentPharmacie: { findFirst: async ({ where }) => agentsPharmacie.find((a) => correspond(a, where)) ?? null },
    agentStructureSante: { findFirst: async () => null },
  },
});
mock.module("../lib/cloudinaryService.js", {
  namedExports: { construireUrl: (nom) => (nom ? `https://cdn/${nom}` : null) },
});
mock.module("../services/notification.service.js", { namedExports: { creerNotifications: async () => ({ count: 0 }) } });

const { normaliserHoraires, normaliserNoteHoraires, etatOuverture, estOuvert24h, minutesDe } = await import("../lib/horairesFiche.js");
const {
  MAX_PHOTOS_STOCKEES,
  actualiteEnLigne,
  completudeFiche,
  normaliserActualite,
  normaliserCoordonnees,
  normaliserMessage,
  normaliserPrestation,
  photosVisibles,
  presenterPhoto,
  rattachement,
  refusAjoutPhoto,
  statutActualite,
} = await import("../services/espacePresence.service.js");
const { peutGererFichePresence } = await import("../lib/acteursPresence.js");

/* ============================ Horaires ============================ */

const SEMAINE_VIDE = { lundi: [], mardi: [], mercredi: [], jeudi: [], vendredi: [], samedi: [], dimanche: [] };

test("minutesDe : HH:MM jusqu'à 24:00", () => {
  assert.equal(minutesDe("08:30"), 510);
  assert.equal(minutesDe("24:00"), 1440);
  assert.equal(minutesDe("24:30"), null);
  assert.equal(minutesDe("8:30"), null);
});

test("normaliserHoraires : jours complétés, plages triées, null efface", () => {
  const { data } = normaliserHoraires({ lundi: [{ debut: "14:00", fin: "19:00" }, { debut: "08:00", fin: "12:00" }] });
  assert.deepEqual(data.lundi, [{ debut: "08:00", fin: "12:00" }, { debut: "14:00", fin: "19:00" }]);
  assert.deepEqual(data.dimanche, []);
  assert.equal(Object.keys(data).length, 7);
  assert.deepEqual(normaliserHoraires(null), { data: null });
});

test("normaliserHoraires : refuse chevauchement, plage inversée, jour inconnu, format", () => {
  assert.match(normaliserHoraires({ mardi: [{ debut: "08:00", fin: "12:00" }, { debut: "11:00", fin: "13:00" }] }).erreur, /chevauchent/);
  assert.match(normaliserHoraires({ mardi: [{ debut: "20:00", fin: "08:00" }] }).erreur, /minuit/);
  assert.match(normaliserHoraires({ funday: [] }).erreur, /inconnu/);
  assert.match(normaliserHoraires({ lundi: [{ debut: "8h", fin: "12:00" }] }).erreur, /invalide/);
  assert.match(normaliserHoraires([]).erreur, /objet/);
  const trop = Array.from({ length: 5 }, (_, i) => ({ debut: `0${i}:00`, fin: `0${i}:30` }));
  assert.match(normaliserHoraires({ lundi: trop }).erreur, /4 plages/);
});

test("normaliserNoteHoraires", () => {
  assert.deepEqual(normaliserNoteHoraires(undefined), { data: undefined });
  assert.deepEqual(normaliserNoteHoraires(""), { data: null });
  assert.deepEqual(normaliserNoteHoraires("  Fermé les jours fériés "), { data: "Fermé les jours fériés" });
  assert.match(normaliserNoteHoraires("x".repeat(300)).erreur, /trop longue/);
});

// Africa/Douala = UTC+1 sans heure d'été. Lundi 19/10/2026.
const lundiA = (h, m = 0) => new Date(Date.UTC(2026, 9, 19, h - 1, m));

test("etatOuverture : ouvert, fermé avec prochaine ouverture, non renseigné", () => {
  const horaires = { ...SEMAINE_VIDE, lundi: [{ debut: "08:00", fin: "12:00" }, { debut: "14:00", fin: "19:00" }], mardi: [{ debut: "08:00", fin: "19:00" }] };
  assert.deepEqual(etatOuverture(horaires, "Africa/Douala", lundiA(9)), { ouvert: true, jusqu_a: "12:00" });
  assert.deepEqual(etatOuverture(horaires, "Africa/Douala", lundiA(12, 30)), { ouvert: false, prochaine_ouverture: { jour: "lundi", heure: "14:00" } });
  assert.deepEqual(etatOuverture(horaires, "Africa/Douala", lundiA(20)), { ouvert: false, prochaine_ouverture: { jour: "mardi", heure: "08:00" } });
  assert.equal(etatOuverture(null, "Africa/Douala"), null);
  assert.deepEqual(etatOuverture(SEMAINE_VIDE, "Africa/Douala", lundiA(9)), { ouvert: false, prochaine_ouverture: null });
});

test("etatOuverture : ouverture de nuit sur deux jours et 24 h/24", () => {
  const nuit = { ...SEMAINE_VIDE, lundi: [{ debut: "20:00", fin: "24:00" }], mardi: [{ debut: "00:00", fin: "08:00" }] };
  assert.deepEqual(etatOuverture(nuit, "Africa/Douala", lundiA(22)), { ouvert: true, jusqu_a: "08:00" });
  const toujours = Object.fromEntries(Object.keys(SEMAINE_VIDE).map((j) => [j, [{ debut: "00:00", fin: "24:00" }]]));
  assert.equal(estOuvert24h(toujours), true);
  assert.equal(estOuvert24h(nuit), false);
  assert.deepEqual(etatOuverture(toujours, "Africa/Douala", lundiA(3)), { ouvert: true, jusqu_a: null });
});

/* ============================ Photos ============================ */

test("photosVisibles : selon le droit photos et max_photos, dans l'ordre choisi", () => {
  const photos = [{ media_id: "b", ordre: 1 }, { media_id: "a", ordre: 0 }, { media_id: "c", ordre: 2 }];
  assert.deepEqual(photosVisibles(photos, { photos: false, max_photos: null }), []);
  assert.deepEqual(photosVisibles(photos, { photos: true, max_photos: null }).map((p) => p.media_id), ["a", "b", "c"]);
  assert.deepEqual(photosVisibles(photos, { photos: true, max_photos: 2 }).map((p) => p.media_id), ["a", "b"]);
  assert.deepEqual(photosVisibles(photos, { photos: true, max_photos: 0 }), []);
});

test("refusAjoutPhoto et présentation publique", () => {
  assert.equal(refusAjoutPhoto(MAX_PHOTOS_STOCKEES - 1), null);
  assert.equal(refusAjoutPhoto(MAX_PHOTOS_STOCKEES).code, "QUOTA_PHOTOS_ATTEINT");
  const p = presenterPhoto({ media_id: "m1", fichier_nom: "x.jpg", titre: "Façade", ordre: 0 });
  assert.equal(p.image_id, "m1");
  assert.equal(p.legende, "Façade");
  assert.equal(p.url, "https://cdn/x.jpg");
});

test("rattachement : une seule fiche, celle du type", () => {
  assert.deepEqual(rattachement("pharmacie", "ph1"), { type_acteur: "pharmacie", pharmacie_id: "ph1" });
  assert.deepEqual(rattachement("structure", "s1"), { type_acteur: "structure", structure_id: "s1" });
  assert.throws(() => rattachement("medecin", "m1"));
});

/* ============================ Actualités ============================ */

test("normaliserActualite : titre et texte requis, dates ordonnées", () => {
  assert.match(normaliserActualite({ contenu: "x" }).erreur, /titre/);
  assert.match(normaliserActualite({ titre: "Fermeture" }).erreur, /texte/);
  const { data } = normaliserActualite({ titre: " Fermeture ", contenu: " Le 1er novembre ", publiee: "false" });
  assert.deepEqual(data, { titre: "Fermeture", contenu: "Le 1er novembre", publiee: false });
  assert.match(
    normaliserActualite({ titre: "a", contenu: "b", date_publication: "2026-11-02", date_expiration: "2026-11-01" }).erreur,
    /date de fin/
  );
  assert.match(normaliserActualite({ titre: "a", contenu: "b", date_expiration: "pas une date" }).erreur, /invalide/);
});

test("normaliserActualite partiel : vérifie l'ordre des dates avec l'existant", () => {
  const existante = { date_publication: new Date("2026-11-10"), date_expiration: null };
  assert.match(normaliserActualite({ date_expiration: "2026-11-05" }, { partiel: true, existante }).erreur, /date de fin/);
  assert.deepEqual(normaliserActualite({ date_expiration: "" }, { partiel: true, existante }).data, { date_expiration: null });
});

test("actualité en ligne et statut", () => {
  const maintenant = new Date("2026-10-23T10:00:00Z");
  const base = { publiee: true, date_publication: new Date("2026-10-20"), date_expiration: null };
  assert.equal(actualiteEnLigne(base, maintenant), true);
  assert.equal(statutActualite(base, maintenant), "en_ligne");
  assert.equal(statutActualite({ ...base, publiee: false }, maintenant), "brouillon");
  assert.equal(statutActualite({ ...base, date_publication: new Date("2026-10-30") }, maintenant), "programmee");
  const expiree = { ...base, date_expiration: new Date("2026-10-22") };
  assert.equal(actualiteEnLigne(expiree, maintenant), false);
  assert.equal(statutActualite(expiree, maintenant), "expiree");
});

/* ============================ Messages ============================ */

test("normaliserMessage : e-mail requis, champ « message » accepté", () => {
  assert.match(normaliserMessage({ message: "Bonjour, avez-vous ce produit ?" }).erreur, /e-mail/);
  const { data } = normaliserMessage({ email: " Awa@Mail.CM ", message: "Bonjour, avez-vous ce produit ?" });
  assert.deepEqual(data, { nom: null, email: "awa@mail.cm", telephone: null, contenu: "Bonjour, avez-vous ce produit ?" });
  assert.match(normaliserMessage({ email: "a@b.cm", contenu: "ok" }).erreur, /court/);
  assert.match(normaliserMessage({ email: "a@b.cm", contenu: "Bonjour", telephone: "abc" }).erreur, /téléphone/);
  assert.match(normaliserMessage({ email: "a@b.cm", contenu: "x".repeat(3001) }).erreur, /trop long/);
});

/* ============================ Prestations, coordonnées, complétude ============================ */

test("normaliserPrestation", () => {
  assert.match(normaliserPrestation({}).erreur, /nom/);
  assert.deepEqual(normaliserPrestation({ nom: " Échographie ", prix: "15000,5", categorie: "", disponible: "false" }).data, {
    nom: "Échographie", prix: 15000.5, categorie: null, disponible: false,
  });
  assert.match(normaliserPrestation({ nom: "x", prix: "-1" }).erreur, /Prix/);
  assert.deepEqual(normaliserPrestation({ description: "À jeun" }, { partiel: true }).data, { description: "À jeun" });
});

test("normaliserCoordonnees : absent inchangé, vide effacé, e-mail contrôlé", () => {
  assert.deepEqual(normaliserCoordonnees({}).data, {});
  assert.deepEqual(normaliserCoordonnees({ adresse: "", email: "" }).data, { adresse: null, email: null });
  assert.deepEqual(normaliserCoordonnees({ email: " Contact@Pharma.CM " }).data, { email: "contact@pharma.cm" });
  assert.match(normaliserCoordonnees({ email: "pas-un-mail" }).erreur, /e-mail/);
});

test("completudeFiche : éléments propres au type", () => {
  const vide = completudeFiche("pharmacie", { fiche: {}, nbPhotos: 0, aGeolocalisation: false });
  assert.equal(vide.score, 0);
  assert.ok(vide.elements.some((e) => e.cle === "services"));
  const centre = completudeFiche("structure", {
    fiche: { adresse: "Rue 1", horaires: {}, email: "a@b.cm", image_nom: "x", description_enrichie: "d", presentation_equipe: "e" },
    nbPhotos: 1, nbPrestations: 1, aGeolocalisation: true,
  });
  assert.equal(centre.score, 100);
  assert.ok(centre.elements.some((e) => e.cle === "prestations"));
});

/* ============================ Contrôle d'accès ============================ */

test("peutGererFichePresence : rattachement à la fiche demandée et rôle de l'espace actif", async () => {
  const agent = { utilisateur_id: "u1", role: "agent_pharmacie" };
  assert.equal(await peutGererFichePresence(agent, "pharmacie", "ph1"), true);
  // Deuxième pharmacie du même compte (espaces multiples).
  assert.equal(await peutGererFichePresence(agent, "pharmacie", "ph2"), true);
  assert.equal(await peutGererFichePresence(agent, "pharmacie", "ph3"), false);
  // Même compte connecté dans son espace patient : aucun droit de gestion.
  assert.equal(await peutGererFichePresence({ utilisateur_id: "u1", role: "patient" }, "pharmacie", "ph1"), false);
  assert.equal(await peutGererFichePresence(agent, "structure", "ph1"), false);
  assert.equal(await peutGererFichePresence({ role: "admin" }, "pharmacie", "ph9"), true);
  assert.equal(await peutGererFichePresence(null, "pharmacie", "ph1"), false);
});
