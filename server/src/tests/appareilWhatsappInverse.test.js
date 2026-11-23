// src/tests/appareilWhatsappInverse.test.js
// Vérification WhatsApp inversée (code affiché, envoyé par l'utilisateur,
// validé par le message entrant) et appareils de confiance (validation d'un
// nouvel appareil). Base SIMULÉE.
// Lancement : node --experimental-test-module-mocks --test src/tests/appareilWhatsappInverse.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const base = { codes: [], appareils: [], sessions: [], numeroActif: { numero: "237600000000" } };

const correspondChamp = (valeur, cond) => {
  if (cond === null) return valeur === null || valeur === undefined;
  if (cond && typeof cond === "object" && !(cond instanceof Date)) {
    if ("in" in cond) return cond.in.includes(valeur);
    if ("not" in cond) return valeur !== cond.not;
    if ("startsWith" in cond) return String(valeur ?? "").startsWith(cond.startsWith);
    if ("lt" in cond && !(valeur < cond.lt)) return false;
    if ("gt" in cond && !(valeur > cond.gt)) return false;
    if ("gte" in cond && !(valeur >= cond.gte)) return false;
    return true;
  }
  return valeur === cond;
};
function correspond(ligne, where = {}) {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return v.some((w) => correspond(ligne, w));
    if (k === "NOT") return !correspond(ligne, v);
    if (k === "utilisateur_id_empreinte") return ligne.utilisateur_id === v.utilisateur_id && ligne.empreinte === v.empreinte;
    return correspondChamp(ligne[k], v);
  });
}
const appliquer = (ligne, data) => {
  for (const [k, v] of Object.entries(data)) ligne[k] = v && typeof v === "object" && "increment" in v ? ligne[k] + v.increment : v;
  return ligne;
};

function table(lignes, cleId) {
  return {
    findUnique: async ({ where }) => lignes().find((l) => correspond(l, where)) ?? null,
    findFirst: async ({ where }) => lignes().filter((l) => correspond(l, where)).sort((a, b) => b.date_creation - a.date_creation)[0] ?? null,
    findMany: async ({ where }) => lignes().filter((l) => correspond(l, where)),
    count: async ({ where }) => lignes().filter((l) => correspond(l, where)).length,
    create: async ({ data }) => {
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
    upsert: async ({ where, update, create }) => {
      const l = lignes().find((x) => correspond(x, where));
      if (l) return appliquer(l, update);
      const n = { [cleId]: crypto.randomUUID(), ...create };
      lignes().push(n);
      return n;
    },
  };
}

mock.module("../lib/prisma.js", {
  defaultExport: {
    codeVerification: table(() => base.codes, "code_verification_id"),
    appareilConfiance: table(() => base.appareils, "appareil_confiance_id"),
    refreshToken: table(() => base.sessions, "refresh_token_id"),
    numeroWhatsapp: { findFirst: async () => base.numeroActif },
    messageWhatsapp: { update: async () => ({}) },
  },
});
mock.module("../services/whatsapp.service.js", {
  namedExports: { envoyerWhatsapp: async () => ({ message_whatsapp_id: "w1", statut: "envoye" }) },
});

// Clés JWT de test (token restreint de validation d'appareil).
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
process.env.JWT_ACCESS_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });
process.env.JWT_ACCESS_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" });
delete process.env.JWT_ACCESS_PRIVATE_KEY_PATH;
delete process.env.JWT_ACCESS_PUBLIC_KEY_PATH;

const verif = await import("../services/verificationTelephone.service.js");
const appareil = await import("../services/appareilConfiance.service.js");
const { verifierAccessToken } = await import("../utils/token.utils.js");

const NUMERO = "237690000001";

function reinitialiser() {
  base.codes.length = 0;
  base.appareils.length = 0;
  base.sessions.length = 0;
  base.numeroActif = { numero: "237600000000" };
  process.env.WHATSAPP_INVERSE_ACTIF = "true";
  process.env.VALIDATION_NOUVEL_APPAREIL = "true";
}

/* --------------------------- WhatsApp inversé --------------------------- */

test("inversé : code affiché + lien wa.me, rien n'est envoyé", async () => {
  reinitialiser();
  const r = await verif.demanderCodeVerification({ telephone: `+${NUMERO}`, objet: "connexion", canal: "whatsapp_inverse" });
  assert.match(r.code, /^\d{6}$/);
  assert.equal(r.numero_whatsapp, "+237600000000");
  assert.ok(r.lien_whatsapp.startsWith("https://wa.me/237600000000?text="));
  assert.ok(decodeURIComponent(r.lien_whatsapp).includes(r.code));
  assert.equal((await verif.statutVerificationInverse({ verification_id: r.verification_id })).statut, "en_attente");
});

test("inversé : indisponible sans activation ou sans numéro actif", async () => {
  reinitialiser();
  process.env.WHATSAPP_INVERSE_ACTIF = "false";
  await assert.rejects(
    verif.demanderCodeVerification({ telephone: `+${NUMERO}`, objet: "connexion", canal: "whatsapp_inverse" }),
    (e) => e.code === "WHATSAPP_INVERSE_INACTIF"
  );
  process.env.WHATSAPP_INVERSE_ACTIF = "true";
  base.numeroActif = null;
  assert.equal(await verif.whatsappInverseActif(), false);
});

test("inversé : le message du BON numéro avec le code valide, puis preuve à usage unique", async () => {
  reinitialiser();
  const r = await verif.demanderCodeVerification({ telephone: `+${NUMERO}`, objet: "connexion", canal: "whatsapp_inverse" });

  // Le code envoyé depuis un AUTRE numéro ne valide rien.
  assert.equal(await verif.traiterMessageEntrantVerification({ de: "237690000002", texte: r.texte_a_envoyer }), null);
  assert.equal((await verif.statutVerificationInverse({ verification_id: r.verification_id })).statut, "en_attente");

  const ligne = await verif.traiterMessageEntrantVerification({ de: NUMERO, texte: `Bonjour ${r.texte_a_envoyer}` });
  assert.equal(ligne?.code_verification_id, r.verification_id);
  const statut = await verif.statutVerificationInverse({ verification_id: r.verification_id });
  assert.equal(statut.statut, "verifie");
  assert.equal(statut.preuve, r.verification_id);

  assert.equal(await verif.consommerPreuveTelephone({ preuve: statut.preuve, objet: "connexion", telephone: `+${NUMERO}` }), NUMERO);
  await assert.rejects(verif.consommerPreuveTelephone({ preuve: statut.preuve, objet: "connexion", telephone: `+${NUMERO}` }));
  assert.equal((await verif.statutVerificationInverse({ verification_id: r.verification_id })).statut, "expiree");
});

test("inversé : le code affiché ne peut pas être simplement recopié dans /verifier", async () => {
  reinitialiser();
  const r = await verif.demanderCodeVerification({ telephone: `+${NUMERO}`, objet: "connexion", canal: "whatsapp_inverse" });
  await assert.rejects(
    verif.verifierCodeVerification({ telephone: `+${NUMERO}`, objet: "connexion", code: r.code }),
    (e) => e.code === "CODE_EXPIRE"
  );
});

test("inversé : un mauvais code ne valide pas", async () => {
  reinitialiser();
  const r = await verif.demanderCodeVerification({ telephone: `+${NUMERO}`, objet: "connexion", canal: "whatsapp_inverse" });
  const faux = r.code === "111111" ? "222222" : "111111";
  assert.equal(await verif.traiterMessageEntrantVerification({ de: NUMERO, texte: `Code : ${faux}` }), null);
  assert.equal((await verif.statutVerificationInverse({ verification_id: r.verification_id })).statut, "en_attente");
});

/* ------------------------- Appareils de confiance ------------------------- */

const utilisateur = { utilisateur_id: "u1", telephone_connexion: NUMERO, role: { libelle: "patient" } };
const requete = (id, extra = {}) => ({ headers: { "x-appareil-id": id, "user-agent": "Test", ...extra }, cookies: {} });
const reponse = () => ({ cookies: {}, cookie(nom, valeur) { this.cookies[nom] = valeur; } });

test("appareil : validation coupée -> la session s'ouvre", async () => {
  reinitialiser();
  process.env.VALIDATION_NOUVEL_APPAREIL = "false";
  assert.equal(await appareil.controlerAppareil(requete("a".repeat(32)), reponse(), utilisateur), null);
});

test("appareil : appareil de confiance -> la session s'ouvre", async () => {
  reinitialiser();
  const id = "b".repeat(32);
  await appareil.faireConfianceAppareil({ utilisateur_id: "u1", empreinte: appareil.empreinteAppareil(id), valide_par: "inscription" });
  assert.equal(await appareil.controlerAppareil(requete(id), reponse(), utilisateur), null);
});

test("appareil : inconnu + application connectée ailleurs -> les deux moyens, token lié à l'appareil", async () => {
  reinitialiser();
  base.sessions.push({ utilisateur_id: "u1", statut: "actif", date_expiration: new Date(Date.now() + 3_600_000), mobile: true, appareil_empreinte: "autre" });
  const id = "c".repeat(32);
  const r = await appareil.controlerAppareil(requete(id), reponse(), utilisateur, { pinVerifie: true });
  assert.equal(r.appareil_a_valider, true);
  assert.deepEqual(r.methodes, ["application", "whatsapp"]);
  const jeton = verifierAccessToken(r.token_validation_appareil);
  assert.equal(jeton.scope, "validation_appareil");
  assert.equal(jeton.app, appareil.empreinteAppareil(id));
  assert.equal(jeton.pin, true);
});

test("appareil : la session du MÊME appareil ne compte pas comme « autre application »", async () => {
  reinitialiser();
  process.env.WHATSAPP_INVERSE_ACTIF = "false";
  const id = "d".repeat(32);
  base.sessions.push({ utilisateur_id: "u1", statut: "actif", date_expiration: new Date(Date.now() + 3_600_000), mobile: true, appareil_empreinte: appareil.empreinteAppareil(id) });
  // Aucun moyen disponible : on ne bloque pas, l'appareil est enregistré.
  assert.equal(await appareil.controlerAppareil(requete(id), reponse(), utilisateur), null);
  assert.equal(base.appareils.length, 1);
  assert.equal(base.appareils[0].valide_par, "sans_moyen");
});

test("appareil : administrateurs et comptes sans numéro ne sont pas concernés", async () => {
  reinitialiser();
  assert.equal(await appareil.controlerAppareil(requete("e".repeat(32)), reponse(), { ...utilisateur, role: { libelle: "admin" } }), null);
  assert.equal(await appareil.controlerAppareil(requete("e".repeat(32)), reponse(), { ...utilisateur, telephone_connexion: null }), null);
});

test("appareil : navigateur sans identifiant -> cookie httpOnly posé, même empreinte ensuite", async () => {
  reinitialiser();
  const req = { headers: {}, cookies: {} };
  const res = reponse();
  const e1 = appareil.appareilDeLaRequete(req, res);
  assert.ok(res.cookies.appareil_id);
  assert.equal(appareil.appareilDeLaRequete({ headers: {}, cookies: { appareil_id: res.cookies.appareil_id } }), e1);
  assert.equal(appareil.appareilDeLaRequete({ headers: {}, cookies: {} }), null);
});
