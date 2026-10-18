// src/tests/whatsapp.test.js
// WhatsApp : normalisation des numéros, validation du contenu, envoi depuis
// le numéro actif, idempotence par clé, échecs journalisés sans exception,
// relance des échecs transitoires. Base et Meta SIMULÉES.
// Lancement : node --experimental-test-module-mocks --test src/tests/whatsapp.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

const base = { numeros: [], messages: [], utilisateurs: {}, appelsMeta: [], reponseMeta: null };

const correspond = (m, where) =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("lt" in v) return m[k] < v.lt;
      if ("gte" in v) return m[k] >= v.gte;
      return true;
    }
    return m[k] === v;
  });

const appliquer = (m, data) => {
  for (const [k, v] of Object.entries(data)) m[k] = v && typeof v === "object" && "increment" in v ? m[k] + v.increment : v;
  return m;
};

mock.module("../lib/prisma.js", {
  defaultExport: {
    numeroWhatsapp: { findFirst: async ({ where }) => base.numeros.find((n) => correspond(n, where)) ?? null },
    utilisateur: { findUnique: async ({ where }) => base.utilisateurs[where.utilisateur_id] ?? null },
    messageWhatsapp: {
      findUnique: async ({ where }) => base.messages.find((m) => correspond(m, where)) ?? null,
      findMany: async ({ where }) => base.messages.filter((m) => correspond(m, where)),
      create: async ({ data }) => {
        if (data.cle && base.messages.some((m) => m.cle === data.cle)) throw Object.assign(new Error("dup"), { code: "P2002" });
        const m = { message_whatsapp_id: `msg-${base.messages.length + 1}`, tentatives: 0, date_creation: new Date(), ...data };
        base.messages.push(m);
        return m;
      },
      update: async ({ where, data }) => appliquer(base.messages.find((m) => correspond(m, where)), data),
      updateMany: async ({ where, data }) => {
        const cibles = base.messages.filter((m) => correspond(m, where));
        cibles.forEach((m) => appliquer(m, data));
        return { count: cibles.length };
      },
    },
  },
});
mock.module("../lib/audit.js", { namedExports: { journaliserAudit: async () => {} } });

// Le vrai client Meta est importé : seul fetch est simulé.
process.env.WHATSAPP_ACCESS_TOKEN = "jeton-test";
globalThis.fetch = async (url, init) => {
  base.appelsMeta.push({ url, corps: init?.body ? JSON.parse(init.body) : null });
  const { status = 200, corps } = base.reponseMeta ?? { corps: { messages: [{ id: "wamid.OK" }], contacts: [{ wa_id: "x" }] } };
  return { ok: status < 400, status, json: async () => corps };
};

const { normaliserNumeroInternational } = await import("../lib/telephone.js");
const svc = await import("../services/whatsapp.service.js");
const { validerChampsNumero } = await import("../services/numeroWhatsapp.service.js");

const ACTIF = { numero_whatsapp_id: "num-1", numero: "237690000000", phone_number_id: "1234567890", actif: true };
function reinitialiser() {
  base.numeros = [{ ...ACTIF }];
  base.messages = [];
  base.appelsMeta = [];
  base.reponseMeta = null;
}

/* ------------------------------ Numéros ------------------------------ */

test("numéro : formats international, local avec pays, rejets", () => {
  assert.equal(normaliserNumeroInternational("+237 690 00 00 00"), "237690000000");
  assert.equal(normaliserNumeroInternational("00237690000000"), "237690000000");
  assert.equal(normaliserNumeroInternational("690 00 00 00", "CM"), "237690000000");
  assert.equal(normaliserNumeroInternational("237690000000", "CM"), "237690000000");
  assert.equal(normaliserNumeroInternational("06 12 34 56 78", "FR"), "33612345678");
  assert.equal(normaliserNumeroInternational("690000000"), null); // local sans pays : ambigu
  assert.equal(normaliserNumeroInternational("690000000", "ZZ"), null);
  assert.equal(normaliserNumeroInternational("+12"), null);
  assert.equal(normaliserNumeroInternational(""), null);
});

test("numéro expéditeur : saisie internationale obligatoire, phone_number_id numérique", () => {
  const ok = validerChampsNumero({ libelle: " Principal ", numero: "+237 690 00 00 00", phone_number_id: "1234567890" });
  assert.deepEqual(ok, { libelle: "Principal", numero: "237690000000", phone_number_id: "1234567890" });
  assert.throws(() => validerChampsNumero({ libelle: "x", numero: "690000000", phone_number_id: "1234567890" }), /international/);
  assert.throws(() => validerChampsNumero({ libelle: "x", numero: "+237690000000", phone_number_id: "abc" }), /phone_number_id/);
  assert.deepEqual(validerChampsNumero({ waba_id: "" }, { partiel: true }), { waba_id: null });
});

/* ------------------------------ Contenu ------------------------------ */

test("contenu : texte XOR modèle ; paramètres convertis en composant body", () => {
  assert.throws(() => svc.validerContenuWhatsapp({}), /exactement/);
  assert.throws(() => svc.validerContenuWhatsapp({ texte: "a", modele: { nom: "b" } }), /exactement/);
  assert.throws(() => svc.validerContenuWhatsapp({ texte: "  " }), /vide/);
  assert.throws(() => svc.validerContenuWhatsapp({ modele: { nom: "Rdv Accepte" } }), /modèle invalide/);
  assert.deepEqual(svc.validerContenuWhatsapp({ modele: { nom: "rdv_accepte", parametres: ["Dr Ngo", 14] } }), {
    type: "modele",
    contenu: {
      nom: "rdv_accepte",
      langue: "fr",
      composants: [{ type: "body", parameters: [{ type: "text", text: "Dr Ngo" }, { type: "text", text: "14" }] }],
    },
  });
});

/* ------------------------------ Envoi ------------------------------ */

test("envoi : depuis le numéro actif, journalisé « envoye » avec le wamid", async () => {
  reinitialiser();
  const r = await svc.envoyerWhatsapp({ destinataire: "699 11 22 33", pays_iso2: "CM", texte: "Bonjour", origine: "test" });
  assert.equal(r.statut, "envoye");
  assert.equal(r.identifiant_fournisseur, "wamid.OK");
  assert.match(base.appelsMeta[0].url, /\/v21\.0\/1234567890\/messages$/);
  assert.deepEqual(base.appelsMeta[0].corps.text, { preview_url: false, body: "Bonjour" });
  assert.equal(base.appelsMeta[0].corps.to, "237699112233");
  assert.equal(base.messages[0].numero_whatsapp_id, "num-1");
  assert.equal(base.messages[0].tentatives, 1);
});

test("idempotence : même clé = un seul appel à Meta", async () => {
  reinitialiser();
  const p = { destinataire: "+237699112233", texte: "Rappel", origine: "rappel", cle: "rappel:rdv-1:u-1" };
  await svc.envoyerWhatsapp(p);
  const second = await svc.envoyerWhatsapp(p);
  assert.equal(second.deja_traite, true);
  assert.equal(base.appelsMeta.length, 1);
  assert.equal(base.messages.length, 1);
});

test("sans numéro actif : échec journalisé, relançable, aucune exception", async () => {
  reinitialiser();
  base.numeros = [];
  const r = await svc.envoyerWhatsapp({ destinataire: "+237699112233", texte: "x", origine: "test" });
  assert.equal(r.statut, "echec");
  assert.equal(r.erreur_code, "AUCUN_NUMERO_ACTIF");
  assert.equal(base.messages[0].relancable, true);
  assert.equal(base.appelsMeta.length, 0);
});

test("refus définitif de Meta (hors fenêtre 24 h) : non relançable", async () => {
  reinitialiser();
  base.reponseMeta = { status: 400, corps: { error: { code: 131047, message: "Re-engagement message" } } };
  const r = await svc.envoyerWhatsapp({ destinataire: "+237699112233", texte: "x", origine: "test" });
  assert.equal(r.statut, "echec");
  assert.equal(r.erreur_code, "131047");
  assert.match(r.erreur, /24 h/);
  assert.equal(base.messages[0].relancable, false);
});

test("relance : un échec transitoire est renvoyé par le job, puis réussit", async () => {
  reinitialiser();
  base.reponseMeta = { status: 429, corps: { error: { code: 130429, message: "Rate limit" } } };
  await svc.envoyerWhatsapp({ destinataire: "+237699112233", texte: "x", origine: "test" });
  assert.equal(base.messages[0].relancable, true);

  base.reponseMeta = null;
  const bilan = await svc.relancerMessagesWhatsapp();
  assert.deepEqual(bilan, { envoyes: 1, echecs: 0 });
  assert.equal(base.messages[0].statut, "envoye");
  assert.equal(base.messages[0].tentatives, 2);
});

test("utilisateur : téléphone local complété par l'indicatif de son pays ; sans téléphone, ignoré", async () => {
  reinitialiser();
  base.utilisateurs = {
    "u-1": { telephone: "677 00 11 22", pays: { code_iso2: "CM" } },
    "u-2": { telephone: null, pays: { code_iso2: "CM" } },
  };
  const r = await svc.envoyerWhatsappUtilisateur({ utilisateur_id: "u-1", modele: { nom: "hello_world", langue: "en_US" }, origine: "test" });
  assert.equal(r.statut, "envoye");
  assert.equal(base.appelsMeta[0].corps.to, "237677001122");
  assert.deepEqual(base.appelsMeta[0].corps.template, { name: "hello_world", language: { code: "en_US" } });
  assert.equal(base.messages[0].utilisateur_id, "u-1");

  const ignore = await svc.envoyerWhatsappUtilisateur({ utilisateur_id: "u-2", texte: "x", origine: "test" });
  assert.deepEqual(ignore, { statut: "ignore", raison: "SANS_TELEPHONE" });
});

test("paramètres invalides de l'appelant : exception (bug à corriger, pas un échec d'envoi)", async () => {
  reinitialiser();
  await assert.rejects(svc.envoyerWhatsapp({ destinataire: "abc", texte: "x", origine: "test" }), /destinataire/);
  await assert.rejects(svc.envoyerWhatsapp({ destinataire: "+237699112233", texte: "x" }), /origine/);
});
