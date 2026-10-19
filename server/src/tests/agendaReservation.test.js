// src/tests/agendaReservation.test.js
// Agenda — réservation des créneaux : conversions de fuseau, délai de
// confirmation, synchronisation gabarit -> cases et réservation
// conditionnelle. Base SIMULÉE : aucune base requise.
// Lancement : node --experimental-test-module-mocks --test src/tests/agendaReservation.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("../lib/prisma.js", { defaultExport: {} });

const fuseau = await import("../lib/fuseauHoraire.js");
const delai = await import("../lib/delaiConfirmation.js");
const agenda = await import("../services/agendaCreneau.service.js");

const H = 60 * 60 * 1000;

test("heure murale de Douala (UTC+1) <-> instant", () => {
  const debut = fuseau.instantDeCase(new Date("2026-10-19T00:00:00Z"), new Date("1970-01-01T09:00:00Z"), "Africa/Douala");
  assert.equal(debut.toISOString(), "2026-10-19T08:00:00.000Z");
  const c = fuseau.caseDepuisInstant(debut, "Africa/Douala");
  assert.equal(c.date.toISOString(), "2026-10-19T00:00:00.000Z");
  assert.equal(c.heure.toISOString(), "1970-01-01T09:00:00.000Z");
  assert.equal(c.alignee, true);
  assert.equal(fuseau.caseDepuisInstant(new Date("2026-10-19T08:00:30Z"), "Africa/Douala").alignee, false);
});

test("changement d'heure pris en compte (Europe/Paris)", () => {
  const ete = fuseau.instantDeCase(new Date("2026-03-29T00:00:00Z"), new Date("1970-01-01T09:30:00Z"), "Europe/Paris");
  assert.equal(ete.toISOString(), "2026-03-29T07:30:00.000Z");
});

test("date murale du jour : minuit passé à Douala, pas encore en UTC", () => {
  const d = fuseau.dateMuraleDuJour("Africa/Douala", new Date("2026-10-18T23:30:00Z"));
  assert.equal(d.toISOString(), "2026-10-19T00:00:00.000Z");
  assert.equal(fuseau.fuseauOuDefaut("Pas/Un_Fuseau"), fuseau.FUSEAU_PAR_DEFAUT);
});

test("échéance de confirmation = min(création + H, heure du créneau)", () => {
  const creation = new Date("2026-10-17T08:00:00Z");
  const loin = { date_creation: creation, date_creneau: new Date("2026-10-20T08:00:00Z"), delai_confirmation_heures: 4 };
  assert.equal(delai.echeanceConfirmation(loin).toISOString(), "2026-10-17T12:00:00.000Z");

  const proche = { ...loin, date_creneau: new Date("2026-10-17T10:00:00Z") };
  assert.equal(delai.echeanceConfirmation(proche).toISOString(), "2026-10-17T10:00:00.000Z");

  // H non figé (RDV antérieur) : délai par défaut fourni par l'appelant.
  const ancien = { ...loin, delai_confirmation_heures: null };
  assert.equal(delai.echeanceConfirmation(ancien, 2).toISOString(), "2026-10-17T10:00:00.000Z");

  assert.equal(delai.confirmationExpiree(loin, new Date(creation.getTime() + 4 * H - 1)), false);
  assert.equal(delai.confirmationExpiree(loin, new Date(creation.getTime() + 4 * H)), true);
});

test("bornes du délai H", () => {
  assert.equal(delai.heuresDelaiConfirmationValides(4), true);
  assert.equal(delai.heuresDelaiConfirmationValides(0), false);
  assert.equal(delai.heuresDelaiConfirmationValides(721), false);
  assert.equal(delai.heuresDelaiConfirmationValides("4"), false);
  assert.equal(delai.heuresDelaiConfirmationValides(4.5), false);
});

/** Base simulée minimale pour synchroniserCreneauxMedecin. */
function fausseBase({ gabarit, existants = [] }) {
  const appels = { crees: [], supprimes: null };
  return {
    appels,
    medecin: { findUnique: async () => ({ pays_exercice: { fuseau_horaire: "Africa/Douala" } }) },
    disponibiliteMedecin: { findMany: async () => gabarit },
    creneauAgenda: {
      createMany: async ({ data }) => {
        appels.crees.push(...data);
        return { count: data.length };
      },
      findMany: async () => existants,
      deleteMany: async ({ where }) => {
        appels.supprimes = where;
        return { count: where.creneau_id.in.length };
      },
    },
  };
}

test("synchronisation : crée les cases du gabarit sur l'horizon", async () => {
  // 2026-10-19 = lundi.
  const db = fausseBase({ gabarit: [{ jour_semaine: "lundi", horaire_id: "h9" }, { jour_semaine: "mardi", horaire_id: "h9" }] });
  const r = await agenda.synchroniserCreneauxMedecin(
    "m1",
    { maintenant: new Date("2026-10-19T06:00:00Z"), horizonJours: 14 },
    db
  );
  assert.equal(r.crees, 4);
  assert.deepEqual(
    db.appels.crees.map((c) => c.date.toISOString().slice(0, 10)),
    ["2026-10-19", "2026-10-20", "2026-10-26", "2026-10-27"]
  );
  assert.ok(db.appels.crees.every((c) => c.statut === "disponible" && c.origine === "genere"));
});

test("synchronisation : supprime les cases libres générées hors gabarit, jamais les autres", async () => {
  const db = fausseBase({
    gabarit: [{ jour_semaine: "lundi", horaire_id: "h9" }],
    existants: [
      { creneau_id: "garde", date: new Date("2026-10-19T00:00:00Z"), horaire_id: "h9" },
      { creneau_id: "retire", date: new Date("2026-10-20T00:00:00Z"), horaire_id: "h9" },
    ],
  });
  const r = await agenda.synchroniserCreneauxMedecin("m1", { maintenant: new Date("2026-10-19T06:00:00Z"), horizonJours: 1 }, db);
  assert.equal(r.supprimes, 1);
  assert.deepEqual(db.appels.supprimes.creneau_id.in, ["retire"]);
  // Re-vérification à l'écriture : seules les cases libres, générées, sans RDV.
  assert.equal(db.appels.supprimes.statut, "disponible");
  assert.equal(db.appels.supprimes.rdv_id, null);
  assert.equal(db.appels.supprimes.origine, "genere");
});

/** Base simulée pour definirTranchesDuJour : journal des écritures. */
function baseJournee(existantes) {
  const journal = { ouvertes: [], fermees: [], supprimees: [], creees: [] };
  const tx = {
    creneauAgenda: {
      findMany: async () => existantes,
      updateMany: async ({ where, data }) => {
        (data.statut === "disponible" ? journal.ouvertes : journal.fermees).push(where.creneau_id);
        return { count: 1 };
      },
      deleteMany: async ({ where }) => {
        journal.supprimees.push(where.creneau_id);
        return { count: 1 };
      },
      createMany: async ({ data }) => {
        journal.creees.push(...data);
        return { count: data.length };
      },
    },
  };
  return { journal, $transaction: (fn) => fn(tx) };
}

test("exception datée : ouvre, ferme et ne touche jamais une case réservée", async () => {
  const date = new Date("2026-10-21T00:00:00Z");
  const db = baseJournee([
    { creneau_id: "libre-genere", horaire_id: "h8", statut: "disponible", origine: "genere", rdv_id: null },
    { creneau_id: "libre-manuel", horaire_id: "h9", statut: "disponible", origine: "manuel", rdv_id: null },
    { creneau_id: "ferme", horaire_id: "h10", statut: "bloque", origine: "manuel", rdv_id: null },
    { creneau_id: "rdv", horaire_id: "h11", statut: "reserve", origine: "genere", rdv_id: "r1" },
  ]);
  const bilan = await agenda.definirTranchesDuJour({ medecin_id: "m1", date, horaire_ids: ["h10", "h14"] }, db);

  assert.deepEqual(db.journal.fermees, ["libre-genere"]);
  assert.deepEqual(db.journal.supprimees, ["libre-manuel"]);
  assert.deepEqual(db.journal.ouvertes, ["ferme"]);
  assert.deepEqual(db.journal.creees.map((c) => [c.horaire_id, c.statut, c.origine]), [["h14", "disponible", "manuel"]]);
  assert.deepEqual(bilan, { ouverts: 2, fermes: 2, maintenus: 1 });
});

test("rendez-vous hors gabarit : seulement les réservations futures non couvertes", async () => {
  const db = {
    medecin: { findUnique: async () => ({ pays_exercice: { fuseau_horaire: "Africa/Douala" } }) },
    disponibiliteMedecin: { findMany: async () => [{ jour_semaine: "lundi", horaire_id: "h9" }] },
    creneauAgenda: {
      findMany: async () => [
        { creneau_id: "couvert", date: new Date("2026-10-26T00:00:00Z"), horaire_id: "h9", horaire: { heure_debut: new Date("1970-01-01T09:00:00Z"), heure_fin: new Date("1970-01-01T09:30:00Z") } },
        { creneau_id: "decoche", date: new Date("2026-10-27T00:00:00Z"), horaire_id: "h9", horaire: { heure_debut: new Date("1970-01-01T09:00:00Z"), heure_fin: new Date("1970-01-01T09:30:00Z") } },
      ],
    },
  };
  const r = await agenda.rdvHorsGabarit("m1", { maintenant: new Date("2026-10-19T06:00:00Z") }, db);
  assert.deepEqual(r.map((c) => c.creneau_id), ["decoche"]);
  assert.equal(r[0].debut, "2026-10-27T08:00:00.000Z");
});

test("réservation conditionnelle : la seconde demande sur la même case échoue", async () => {
  let libre = true;
  const tx = {
    creneauAgenda: {
      updateMany: async ({ where, data }) => {
        assert.deepEqual(where, { creneau_id: "c1", statut: "disponible", rdv_id: null });
        assert.equal(data.statut, "reserve");
        if (!libre) return { count: 0 };
        libre = false;
        return { count: 1 };
      },
    },
  };
  await agenda.reserverCreneau(tx, "c1", "rdv1");
  await assert.rejects(() => agenda.reserverCreneau(tx, "c1", "rdv2"), (err) => {
    assert.ok(err instanceof agenda.ErreurCreneau);
    assert.equal(err.status, 409);
    assert.equal(err.code, agenda.CODES_CRENEAU.INDISPONIBLE);
    return true;
  });
});

test("résolution : case déjà réservée ou passée refusée", async () => {
  const base = (creneau) => ({
    medecin: { findUnique: async () => ({ pays_exercice: { fuseau_horaire: "Africa/Douala" } }) },
    creneauAgenda: { findUnique: async () => creneau },
  });
  const horaire = { heure_debut: new Date("1970-01-01T09:00:00Z"), heure_fin: new Date("1970-01-01T09:30:00Z") };
  const libre = { creneau_id: "c1", medecin_id: "m1", date: new Date("2026-10-19T00:00:00Z"), statut: "disponible", rdv_id: null, horaire };

  const ok = await agenda.resoudreCreneauReservable(
    { medecin_id: "m1", creneau_id: "c1", maintenant: new Date("2026-10-18T00:00:00Z") },
    base(libre)
  );
  assert.equal(ok.debut.toISOString(), "2026-10-19T08:00:00.000Z");

  await assert.rejects(
    () => agenda.resoudreCreneauReservable({ medecin_id: "m1", creneau_id: "c1" }, base({ ...libre, statut: "reserve", rdv_id: "r" })),
    (err) => err.code === agenda.CODES_CRENEAU.INDISPONIBLE
  );
  await assert.rejects(
    () => agenda.resoudreCreneauReservable({ medecin_id: "m1", creneau_id: "c1", maintenant: new Date("2026-10-19T08:00:00Z") }, base(libre)),
    (err) => err.code === agenda.CODES_CRENEAU.PASSE
  );
  await assert.rejects(
    () => agenda.resoudreCreneauReservable({ medecin_id: "autre", creneau_id: "c1" }, base(libre)),
    (err) => err.status === 404
  );
});
