// src/tests/visioLancee.test.js
// Visio lancée par le médecin : le patient ne peut la rejoindre qu'après
// (409 VISIO_NON_LANCEE), et la voit comme un appel entrant
// (GET /visio/appel-entrant). Base SIMULÉE.
// Lancement : node --experimental-test-module-mocks --test src/tests/visioLancee.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

const base = { rdv: null, ecritures: [], notifications: [], filtreAppel: null, signaux: [] };

mock.module("../lib/prisma.js", {
  defaultExport: {
    rendezVous: {
      findUnique: async () => (base.rdv ? structuredClone(base.rdv) : null),
      findMany: async ({ where }) => {
        base.filtreAppel = where;
        return base.rdv ? [structuredClone(base.rdv)] : [];
      },
      update: async ({ data }) => {
        base.ecritures.push(data);
        Object.assign(base.rdv, data);
        return base.rdv;
      },
    },
  },
});
mock.module("../services/jitsi.service.js", { namedExports: { genererJitsiToken: () => "jeton-jitsi" } });
mock.module("../services/notification.service.js", {
  namedExports: {
    creerNotifications: async (lignes) => {
      base.notifications.push(...lignes);
    },
  },
});
mock.module("../services/push.service.js", {
  namedExports: {
    signalerAppareils: (utilisateur_id, donnees) => {
      base.signaux.push({ utilisateur_id, ...donnees });
    },
  },
});
mock.module("../services/finConsultation.service.js", { namedExports: { constaterFinConsultation: async () => ({}) } });
mock.module("../services/parametreDelaiLiberation.service.js", {
  namedExports: { ErreurParametreDelai: class extends Error {}, exigerParametreDelai: async () => ({ heures: 24 }) },
});
mock.module("../lib/jitsiWebhookService.js", { namedExports: { verifierSignatureWebhookVisio: () => true } });
mock.module("../services/presence.service.js", { namedExports: { enregistrerPresence: async () => ({ enregistree: true }) } });
mock.module("../services/reglesPresenceReprogrammation.service.js", { namedExports: { partieDepuisParticipant: () => null } });
mock.module("../services/avisMedecin.service.js", { namedExports: { inviterAvisPatient: () => {} } });

const { obtenirTokenVisio, obtenirAppelEntrant, refuserAppelVisio, cloturerVisio, visioLanceeParMedecin } = await import(
  "../controllers/visio.controller.js"
);

const MEDECIN = "user-medecin";
const PATIENT = "user-patient";

function rdv(extra = {}) {
  return {
    rdv_id: "11111111-1111-4111-8111-111111111111",
    type_rdv: "teleconsultation",
    statut: "confirme",
    date_creneau: new Date("2026-10-26T10:00:00Z"),
    visio_lancee_le: null,
    visio_cloturee_le: null,
    termine_le: null,
    medecin: {
      utilisateur_id: MEDECIN,
      photo_url: "https://exemple.test/photo.jpg",
      specialite: { nom: "Cardiologie" },
      utilisateur: { utilisateur_id: MEDECIN, prenom: "Awa", nom: "Ndiaye", email: "awa@test" },
    },
    patient: {
      utilisateur_id: PATIENT,
      utilisateur: { utilisateur_id: PATIENT, prenom: "Paul", nom: "Mbida", email: "paul@test" },
    },
    ...extra,
  };
}

function reinitialiser(r) {
  base.rdv = r;
  base.ecritures = [];
  base.notifications = [];
  base.filtreAppel = null;
  base.signaux = [];
}

async function appeler(handler, utilisateur_id, body = {}, params = {}) {
  const res = {
    statusCode: 200,
    corps: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(c) {
      this.corps = c;
      return this;
    },
  };
  let erreur = null;
  await handler({ body, params, utilisateur: { utilisateur_id } }, res, (e) => {
    erreur = e;
  });
  if (erreur) throw erreur;
  return res;
}

test("visioLanceeParMedecin : lancée, puis clôturée ou terminée", () => {
  assert.equal(visioLanceeParMedecin({ visio_lancee_le: null }), false);
  assert.equal(visioLanceeParMedecin({ visio_lancee_le: new Date() }), true);
  assert.equal(visioLanceeParMedecin({ visio_lancee_le: new Date(), visio_cloturee_le: new Date() }), false);
  assert.equal(visioLanceeParMedecin({ visio_lancee_le: new Date(), termine_le: new Date() }), false);
});

test("le patient ne peut pas rejoindre tant que le médecin n'a pas lancé la visio", async () => {
  reinitialiser(rdv());
  const res = await appeler(obtenirTokenVisio, PATIENT, { rdv_id: base.rdv.rdv_id });
  assert.equal(res.statusCode, 409);
  assert.equal(res.corps.code, "VISIO_NON_LANCEE");
  assert.equal(base.ecritures.length, 0);
});

test("le médecin lance la visio : horodatage, alerte patient, puis le patient rejoint", async () => {
  reinitialiser(rdv({ visio_cloturee_le: new Date("2026-10-26T09:00:00Z") }));
  const resMedecin = await appeler(obtenirTokenVisio, MEDECIN, { rdv_id: base.rdv.rdv_id });
  assert.equal(resMedecin.statusCode, 200);
  assert.equal(resMedecin.corps.token, "jeton-jitsi");
  assert.ok(base.rdv.visio_lancee_le instanceof Date);
  assert.equal(base.rdv.visio_cloturee_le, null);

  const [alerte] = base.notifications;
  assert.equal(alerte.type, "rdv_visio_demarree");
  assert.equal(alerte.utilisateur_id, PATIENT);
  assert.equal(alerte.donnees.appelant, "Dr Awa Ndiaye");
  assert.equal(alerte.donnees.appelant_photo, "https://exemple.test/photo.jpg");
  // Même horodatage que la colonne : l'application reconnaît l'appel déjà sonné.
  assert.equal(alerte.donnees.lancee_le, base.rdv.visio_lancee_le.toISOString());

  const resPatient = await appeler(obtenirTokenVisio, PATIENT, { rdv_id: base.rdv.rdv_id });
  assert.equal(resPatient.statusCode, 200);
});

test("appel entrant : visio récente non clôturée du patient connecté", async () => {
  const lancee = new Date();
  reinitialiser(rdv({ visio_lancee_le: lancee }));
  const res = await appeler(obtenirAppelEntrant, PATIENT);
  assert.equal(res.corps.appel.rdv_id, base.rdv.rdv_id);
  assert.deepEqual(res.corps.appel.lancee_le, lancee);
  assert.deepEqual(res.corps.appel.medecin, {
    prenom: "Awa",
    nom: "Ndiaye",
    photo_url: "https://exemple.test/photo.jpg",
    specialite: "Cardiologie",
  });
  assert.equal(base.filtreAppel.patient.utilisateur_id, PATIENT);
  assert.equal(base.filtreAppel.visio_cloturee_le, null);
  assert.equal(base.filtreAppel.termine_le, null);

  reinitialiser(null);
  assert.deepEqual((await appeler(obtenirAppelEntrant, PATIENT)).corps, { appel: null });
});

test("le médecin redemande un jeton (rechargement, double effet React) : même appel, une seule alerte", async () => {
  reinitialiser(rdv());
  await appeler(obtenirTokenVisio, MEDECIN, { rdv_id: base.rdv.rdv_id });
  const premier = base.rdv.visio_lancee_le;
  await appeler(obtenirTokenVisio, MEDECIN, { rdv_id: base.rdv.rdv_id });
  await appeler(obtenirTokenVisio, MEDECIN, { rdv_id: base.rdv.rdv_id });
  assert.equal(base.rdv.visio_lancee_le.getTime(), premier.getTime());
  assert.equal(base.notifications.length, 1);
});

test("refus du patient : enregistré, sonnerie arrêtée partout, l'appel n'est plus présenté", async () => {
  reinitialiser(rdv({ visio_lancee_le: new Date() }));
  const res = await appeler(refuserAppelVisio, PATIENT, {}, { id: base.rdv.rdv_id });
  assert.equal(res.statusCode, 200);
  assert.ok(base.rdv.visio_appel_repondu_le instanceof Date);
  assert.deepEqual(base.signaux, [{ utilisateur_id: PATIENT, type: "visio_appel_termine", rdv_id: base.rdv.rdv_id }]);
  assert.deepEqual((await appeler(obtenirAppelEntrant, PATIENT)).corps, { appel: null });

  // Le médecin se reconnecte : l'appel refusé ne resonne pas…
  await appeler(obtenirTokenVisio, MEDECIN, { rdv_id: base.rdv.rdv_id });
  assert.equal(base.notifications.length, 0);
  assert.deepEqual((await appeler(obtenirAppelEntrant, PATIENT)).corps, { appel: null });
  // …mais le patient peut toujours rejoindre depuis ses rendez-vous.
  assert.equal((await appeler(obtenirTokenVisio, PATIENT, { rdv_id: base.rdv.rdv_id })).statusCode, 200);
});

test("refus : réservé au patient", async () => {
  reinitialiser(rdv({ visio_lancee_le: new Date() }));
  assert.equal((await appeler(refuserAppelVisio, MEDECIN, {}, { id: base.rdv.rdv_id })).statusCode, 403);
});

test("le patient rejoint : appel répondu, sonnerie arrêtée sur ses autres appareils", async () => {
  reinitialiser(rdv({ visio_lancee_le: new Date() }));
  await appeler(obtenirTokenVisio, PATIENT, { rdv_id: base.rdv.rdv_id });
  assert.ok(base.rdv.visio_appel_repondu_le instanceof Date);
  assert.equal(base.signaux.length, 1);
  assert.deepEqual((await appeler(obtenirAppelEntrant, PATIENT)).corps, { appel: null });
});

test("le médecin termine la visio pendant que ça sonne : sonnerie arrêtée", async () => {
  reinitialiser(rdv({ visio_lancee_le: new Date() }));
  await appeler(cloturerVisio, MEDECIN, {}, { id: base.rdv.rdv_id });
  assert.deepEqual(base.signaux, [{ utilisateur_id: PATIENT, type: "visio_appel_termine", rdv_id: base.rdv.rdv_id }]);
});

test("après clôture, ou un lancement expiré sans réponse, le médecin ouvre un nouvel appel", async () => {
  reinitialiser(rdv({ visio_lancee_le: new Date(Date.now() - 60_000), visio_cloturee_le: new Date() }));
  await appeler(obtenirTokenVisio, MEDECIN, { rdv_id: base.rdv.rdv_id });
  assert.equal(base.notifications.length, 1);

  reinitialiser(rdv({ visio_lancee_le: new Date(Date.now() - 11 * 60_000) }));
  await appeler(obtenirTokenVisio, MEDECIN, { rdv_id: base.rdv.rdv_id });
  assert.equal(base.notifications.length, 1);
});
