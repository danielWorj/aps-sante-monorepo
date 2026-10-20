// src/tests/pushRappels.test.js
// Push mobile et rappels de RDV : choix du palier (J-3, J-1, H-3, à l'heure),
// textes par rôle, données jointes au push, envoi unique et nettoyage des
// jetons invalides. Base et FCM SIMULÉS.
// Lancement : node --experimental-test-module-mocks --test src/tests/pushRappels.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

const base = { notifications: [], appareils: [], envois: [] };

mock.module("../lib/prisma.js", {
  defaultExport: {
    notification: {
      findMany: async ({ where }) =>
        base.notifications.filter((n) => where.cle.in.includes(n.cle) && n.push_envoye_le == null),
      updateMany: async ({ where, data }) => {
        const n = base.notifications.find((x) => x.notification_id === where.notification_id && x.push_envoye_le == null);
        if (!n) return { count: 0 };
        Object.assign(n, data);
        return { count: 1 };
      },
    },
    appareilPush: {
      findMany: async ({ where }) => base.appareils.filter((a) => a.utilisateur_id === where.utilisateur_id),
      deleteMany: async ({ where }) => {
        const avant = base.appareils.length;
        base.appareils = base.appareils.filter((a) => a.jeton !== where.jeton);
        return { count: avant - base.appareils.length };
      },
    },
  },
});

mock.module("../lib/fcmService.js", {
  namedExports: {
    estConfigure: () => true,
    envoyerMessage: async (jeton, message) => {
      if (jeton === "perime") {
        const err = new Error("UNREGISTERED");
        err.jetonInvalide = true;
        throw err;
      }
      base.envois.push({ jeton, message });
      return { id: "m1" };
    },
  },
});

const { palierDu, texteRappel } = await import("../services/rappelRdv.service.js");
const { cibleNotification, donneesPush, pousserNotifications } = await import("../services/push.service.js");

const RDV = new Date("2026-10-24T13:30:00Z");
const ANCIEN = new Date("2026-10-01T00:00:00Z");

test("palier : le plus proche atteint, à partir de 3 jours", () => {
  assert.equal(palierDu({ date_creneau: RDV, date_creation: ANCIEN }, new Date("2026-10-20T13:00:00Z")), null);
  assert.equal(palierDu({ date_creneau: RDV, date_creation: ANCIEN }, new Date("2026-10-21T14:00:00Z")), "j3");
  assert.equal(palierDu({ date_creneau: RDV, date_creation: ANCIEN }, new Date("2026-10-23T14:00:00Z")), "j1");
  assert.equal(palierDu({ date_creneau: RDV, date_creation: ANCIEN }, new Date("2026-10-24T11:00:00Z")), "h3");
  assert.equal(palierDu({ date_creneau: RDV, date_creation: ANCIEN }, new Date("2026-10-24T13:29:30Z")), "h0");
  assert.equal(palierDu({ date_creneau: RDV, date_creation: ANCIEN }, new Date("2026-10-24T13:50:00Z")), "h0");
  assert.equal(palierDu({ date_creneau: RDV, date_creation: ANCIEN }, new Date("2026-10-24T14:10:00Z")), null);
});

test("palier déjà dépassé à la prise du RDV : pas de rappel, sauf « c'est l'heure »", () => {
  const prisTard = { date_creneau: RDV, date_creation: new Date("2026-10-24T12:00:00Z") };
  assert.equal(palierDu(prisTard, new Date("2026-10-24T12:01:00Z")), null);
  assert.equal(palierDu(prisTard, new Date("2026-10-24T13:30:00Z")), "h0");
});

test("textes : interlocuteur selon le rôle, visio rappelée", () => {
  const commun = { typeRdv: "teleconsultation", jour: "samedi 24 octobre", heure: "14:30", lieu: null };
  const patient = texteRappel("j1", "patient", { ...commun, interlocuteur: "Dr Awa Ndiaye" });
  assert.match(patient.message, /avec Dr Awa Ndiaye/);
  assert.match(patient.message, /samedi 24 octobre à 14:30/);
  const medecin = texteRappel("h0", "medecin", { ...commun, interlocuteur: "Paul Mbida" });
  assert.equal(medecin.titre, "C'est l'heure de votre rendez-vous");
  assert.match(medecin.message, /votre patient Paul Mbida/);
  assert.match(medecin.message, /rejoindre la visio/);
});

test("données push : cible d'écran et valeurs chaînes", () => {
  assert.equal(cibleNotification("rdv_rappel"), "rendez_vous");
  assert.equal(cibleNotification("rdv_paye"), "rendez_vous");
  assert.equal(cibleNotification("offre_rdv_nouvelle"), "demandes");
  assert.equal(cibleNotification("offre_rdv_candidature_retenue"), "demandes");
  assert.equal(cibleNotification("avis_medecin_invitation"), "avis");
  const d = donneesPush({ notification_id: "n1", type: "rdv_rappel", rdv_id: "r1", donnees: { palier: "h3", role: "patient" } });
  assert.deepEqual(d, { notification_id: "n1", type: "rdv_rappel", cible: "rendez_vous", rdv_id: "r1", palier: "h3" });
  assert.ok(Object.values(d).every((v) => typeof v === "string"));
});

test("push : envoyé une seule fois, jeton invalide supprimé", async () => {
  base.notifications = [
    { notification_id: "n1", cle: "k1", utilisateur_id: "u1", type: "rdv_rappel", titre: "T", message: "M", rdv_id: "r1", donnees: null, push_envoye_le: null },
  ];
  base.appareils = [
    { utilisateur_id: "u1", jeton: "bon" },
    { utilisateur_id: "u1", jeton: "perime" },
  ];
  base.envois = [];

  const bilan = await pousserNotifications(["k1"]);
  assert.deepEqual(bilan, { envoyes: 1, echecs: 1 });
  assert.equal(base.envois[0].jeton, "bon");
  assert.equal(base.envois[0].message.titre, "T");
  assert.deepEqual(base.appareils.map((a) => a.jeton), ["bon"]);

  const rejoue = await pousserNotifications(["k1"]);
  assert.deepEqual(rejoue, { envoyes: 0, echecs: 0 });
  assert.equal(base.envois.length, 1);
});
