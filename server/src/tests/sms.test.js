// src/tests/sms.test.js
// SMS (Twilio) : mode test, pays autorisés, envoi réel simulé, idempotence,
// échecs journalisés sans exception, rappel de statut signé, codes de
// vérification (délai, essais, preuve à usage unique). Base et Twilio SIMULÉS.
// Lancement : node --experimental-test-module-mocks --test src/tests/sms.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const base = { messages: [], codes: [], utilisateurs: {}, appels: [], reponse: null };

const correspondChamp = (valeur, cond) => {
  if (cond === null) return valeur === null || valeur === undefined;
  if (cond instanceof Date) return valeur?.getTime() === cond.getTime();
  if (cond && typeof cond === "object") {
    if ("in" in cond) return cond.in.includes(valeur);
    if ("lt" in cond && !(valeur < cond.lt)) return false;
    if ("gt" in cond && !(valeur > cond.gt)) return false;
    if ("gte" in cond && !(valeur >= cond.gte)) return false;
    return true;
  }
  return valeur === cond;
};
const correspond = (ligne, where = {}) => Object.entries(where).every(([k, v]) => correspondChamp(ligne[k], v));
const appliquer = (ligne, data) => {
  for (const [k, v] of Object.entries(data)) ligne[k] = v && typeof v === "object" && "increment" in v ? ligne[k] + v.increment : v;
  return ligne;
};
const parDateDesc = (a, b) => b.date_creation - a.date_creation;

function table(lignes, cleId) {
  return {
    findUnique: async ({ where }) => lignes().find((l) => correspond(l, where)) ?? null,
    findFirst: async ({ where }) => lignes().filter((l) => correspond(l, where)).sort(parDateDesc)[0] ?? null,
    findMany: async ({ where }) => lignes().filter((l) => correspond(l, where)),
    count: async ({ where }) => lignes().filter((l) => correspond(l, where)).length,
    create: async ({ data }) => {
      if (data.cle && lignes().some((l) => l.cle === data.cle)) throw Object.assign(new Error("dup"), { code: "P2002" });
      const l = { [cleId]: crypto.randomUUID(), tentatives: 0, verifie_le: null, consomme_le: null, date_creation: new Date(), ...data };
      lignes().push(l);
      return l;
    },
    update: async ({ where, data }) => appliquer(lignes().find((l) => correspond(l, where)), data),
    updateMany: async ({ where, data }) => {
      const cibles = lignes().filter((l) => correspond(l, where));
      cibles.forEach((l) => appliquer(l, data));
      return { count: cibles.length };
    },
  };
}

mock.module("../lib/prisma.js", {
  defaultExport: {
    utilisateur: { findUnique: async ({ where }) => base.utilisateurs[where.utilisateur_id] ?? null },
    messageSms: table(() => base.messages, "message_sms_id"),
    codeVerification: table(() => base.codes, "code_verification_id"),
    messageWhatsapp: { update: async () => ({}) },
  },
});
mock.module("../services/whatsapp.service.js", {
  namedExports: { envoyerWhatsapp: async () => ({ message_whatsapp_id: "w1", statut: "envoye" }) },
});

process.env.TWILIO_ACCOUNT_SID = "ACtest";
process.env.TWILIO_AUTH_TOKEN = "jeton-test";
process.env.TWILIO_FROM = "APSSANTE";
process.env.SMS_PAYS_AUTORISES = "CM,GA";

// Le vrai client Twilio est importé : seul fetch est simulé.
globalThis.fetch = async (url, init) => {
  base.appels.push({ url, corps: Object.fromEntries(new URLSearchParams(init.body)) });
  const { status = 201, corps } = base.reponse ?? { corps: { sid: `SM${base.appels.length}`, status: "queued", num_segments: "1" } };
  return { ok: status < 400, status, json: async () => corps };
};

const sms = await import("../services/sms.service.js");
const verif = await import("../services/verificationTelephone.service.js");
const { signatureTwilioValide } = await import("../lib/twilioSmsService.js");

function reinitialiser(mode = "reel") {
  base.messages.length = 0;
  base.codes.length = 0;
  base.appels.length = 0;
  base.reponse = null;
  process.env.SMS_MODE = mode;
}

test("mode test : rien n'est envoyé, le SMS est journalisé « simule »", async () => {
  reinitialiser("test");
  const r = await sms.envoyerSms({ destinataire: "690000001", pays_iso2: "CM", texte: "Bonjour", origine: "essai" });
  assert.equal(r.statut, "simule");
  assert.equal(base.appels.length, 0);
  assert.equal(base.messages[0].destinataire, "237690000001");
});

test("pays non autorisé : refus avant tout envoi", async () => {
  reinitialiser();
  await assert.rejects(
    sms.envoyerSms({ destinataire: "+33612345678", texte: "x", origine: "essai" }),
    (e) => e.code === "PAYS_NON_AUTORISE"
  );
  assert.equal(base.appels.length, 0);
});

test("envoi réel : appel Twilio (To, From, Body) et identifiant SM… enregistré", async () => {
  reinitialiser();
  const r = await sms.envoyerSms({ destinataire: "+237690000002", texte: "Votre RDV est confirmé", origine: "essai" });
  assert.equal(r.statut, "envoye");
  assert.match(base.appels[0].url, /Accounts\/ACtest\/Messages\.json$/);
  assert.deepEqual(
    { To: base.appels[0].corps.To, From: base.appels[0].corps.From, Body: base.appels[0].corps.Body },
    { To: "+237690000002", From: "APSSANTE", Body: "Votre RDV est confirmé" }
  );
  assert.equal(base.messages[0].identifiant_fournisseur, r.identifiant_fournisseur);
});

test("idempotence : même clé, un seul envoi", async () => {
  reinitialiser();
  const p = { destinataire: "+237690000003", texte: "Rappel", origine: "rdv_rappel", cle: "rdv_rappel:1" };
  await sms.envoyerSms(p);
  const second = await sms.envoyerSms(p);
  assert.equal(second.deja_traite, true);
  assert.equal(base.appels.length, 1);
});

test("refus Twilio : échec journalisé sans exception, relançable si transitoire", async () => {
  reinitialiser();
  base.reponse = { status: 429, corps: { code: 20429, message: "Too Many Requests" } };
  const r = await sms.envoyerSms({ destinataire: "+237690000004", texte: "x", origine: "essai" });
  assert.equal(r.statut, "echec");
  assert.equal(base.messages[0].relancable, true);

  base.reponse = { status: 400, corps: { code: 21211, message: "Invalid To" } };
  const r2 = await sms.envoyerSms({ destinataire: "+237690000005", texte: "x", origine: "essai" });
  assert.equal(r2.erreur, "Numéro destinataire invalide.");
  assert.equal(base.messages[1].relancable, false);

  base.reponse = null;
  const relance = await sms.relancerMessagesSms();
  assert.deepEqual(relance, { envoyes: 1, echecs: 0 });
});

test("rappel de statut : delivered -> delivre, puis aucune régression", async () => {
  reinitialiser();
  const r = await sms.envoyerSms({ destinataire: "+237690000006", texte: "x", origine: "essai" });
  assert.equal(await sms.traiterStatutSmsTwilio({ MessageSid: r.identifiant_fournisseur, MessageStatus: "delivered" }), true);
  assert.equal(base.messages[0].statut, "delivre");
  assert.equal(await sms.traiterStatutSmsTwilio({ MessageSid: r.identifiant_fournisseur, MessageStatus: "failed", ErrorCode: "30003" }), false);
  assert.equal(base.messages[0].statut, "delivre");
});

test("signature Twilio : HMAC-SHA1 de l'URL + paramètres triés", () => {
  const url = "https://api.exemple.com/api/sms/webhook/statut";
  const parametres = { MessageStatus: "delivered", MessageSid: "SM1" };
  const signature = crypto.createHmac("sha1", "jeton-test").update(`${url}MessageSidSM1MessageStatusdelivered`).digest("base64");
  assert.equal(signatureTwilioValide({ signature, url, parametres }), true);
  assert.equal(signatureTwilioValide({ signature, url, parametres: { ...parametres, MessageStatus: "failed" } }), false);
});

const codeEnvoye = () => base.appels.at(-1).corps.Body.match(/^(\d{6})/)[1];

test("code de vérification : envoyé par SMS, masqué au journal, vérifié une fois", async () => {
  reinitialiser();
  const d = await verif.demanderCodeVerification({ telephone: "690000010", pays_iso2: "CM", objet: "inscription", adresse_ip: "1.2.3.4" });
  assert.equal(d.telephone_masque, "+2376••••••10");
  const code = codeEnvoye();
  assert.ok(!base.messages[0].texte.includes(code), "le code ne doit pas être journalisé");
  assert.ok(!base.codes[0].code_hache.includes(code));

  const faux = code === "000000" ? "111111" : "000000";
  await assert.rejects(verif.verifierCodeVerification({ telephone: "690000010", pays_iso2: "CM", objet: "inscription", code: faux }), (e) => e.code === "CODE_INCORRECT" && e.tentatives_restantes === 4);

  const ok = await verif.verifierCodeVerification({ telephone: "+237690000010", objet: "inscription", code });
  assert.equal(ok.telephone, "237690000010");

  // Preuve : bon objet et bon numéro, une seule fois.
  await assert.rejects(verif.consommerPreuveTelephone({ preuve: ok.preuve, objet: "connexion" }), (e) => e.code === "PREUVE_INVALIDE");
  assert.equal(await verif.consommerPreuveTelephone({ preuve: ok.preuve, objet: "inscription", telephone: "690000010", pays_iso2: "CM" }), "237690000010");
  await assert.rejects(verif.consommerPreuveTelephone({ preuve: ok.preuve, objet: "inscription" }), (e) => e.code === "PREUVE_INVALIDE");
});

test("code de vérification : délai avant renvoi, essais limités", async () => {
  reinitialiser();
  await verif.demanderCodeVerification({ telephone: "+237690000020", objet: "connexion" });
  await assert.rejects(verif.demanderCodeVerification({ telephone: "+237690000020", objet: "connexion" }), (e) => e.code === "RENVOI_TROP_TOT" && e.attente_s > 0);

  const code = codeEnvoye();
  const faux = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(verif.verifierCodeVerification({ telephone: "+237690000020", objet: "connexion", code: faux }));
  }
  await assert.rejects(verif.verifierCodeVerification({ telephone: "+237690000020", objet: "connexion", code }), (e) => e.code === "TROP_DE_TENTATIVES");
});

test("code de vérification : SMS non parti -> erreur ENVOI_IMPOSSIBLE et code annulé", async () => {
  reinitialiser();
  base.reponse = { status: 400, corps: { code: 21614, message: "not a mobile" } };
  await assert.rejects(verif.demanderCodeVerification({ telephone: "+237690000030", objet: "inscription" }), (e) => e.code === "ENVOI_IMPOSSIBLE" && e.status === 502);
  assert.ok(base.codes[0].expire_le <= new Date());
  assert.equal(base.messages[0].relancable, false, "un code ne doit jamais être relancé");
});
