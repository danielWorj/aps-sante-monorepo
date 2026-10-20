// src/tests/espacesConnexion.test.js
// Espaces multiples (un compte, plusieurs fiches), espace par défaut, fiche
// de l'espace actif, garde « PIN récent », connexion web validée depuis
// l'application (bon code, mauvais code, usage unique, leurre), code de
// vérification exigé quand la vérification est active. Base SIMULÉE.
// Lancement : node --experimental-test-module-mocks --test src/tests/espacesConnexion.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

const base = { utilisateurs: [], demandes: [], preuvesConsommees: [] };

const champOk = (v, c) => {
  if (c && typeof c === "object" && !(c instanceof Date)) {
    if ("gt" in c) return v > c.gt;
    if ("lt" in c) return v < c.lt;
    return true;
  }
  return v === c;
};
const trouve = (liste, where) => liste.find((l) => Object.entries(where).every(([k, v]) => champOk(l[k], v))) ?? null;
const filtre = (liste, where) => liste.filter((l) => Object.entries(where).every(([k, v]) => champOk(l[k], v)));

mock.module("../lib/prisma.js", {
  defaultExport: {
    pays: { findUnique: async () => ({ code_iso2: "CM" }) },
    utilisateur: {
      findUnique: async ({ where }) => trouve(base.utilisateurs, where),
      update: async ({ where, data }) => Object.assign(trouve(base.utilisateurs, where), data),
    },
    demandeConnexionWeb: {
      create: async ({ data }) => {
        const d = { demande_connexion_id: crypto.randomUUID(), statut: "en_attente", date_creation: new Date(), ...data };
        base.demandes.push(d);
        return d;
      },
      findUnique: async ({ where }) => trouve(base.demandes, where),
      findFirst: async ({ where }) => trouve(base.demandes, where),
      findMany: async ({ where }) => filtre(base.demandes, where),
      updateMany: async ({ where, data }) => {
        const cibles = filtre(base.demandes, where);
        cibles.forEach((d) => Object.assign(d, data));
        return { count: cibles.length };
      },
    },
  },
});
mock.module("../services/compte.service.js", { namedExports: { SALT_ROUNDS: 4 } });
mock.module("../services/verificationTelephone.service.js", {
  namedExports: {
    consommerPreuveTelephone: async ({ preuve, objet, telephone }) => {
      if (preuve !== "preuve-ok") throw Object.assign(new Error("Preuve invalide"), { name: "ErreurSms", status: 400, code: "PREUVE_INVALIDE" });
      base.preuvesConsommees.push({ objet, telephone });
      return telephone.slice(1);
    },
  },
});

const espaces = await import("../services/espaces.service.js");
const { pinRecent } = await import("../middlewares/pin.middleware.js");
const connexionApp = await import("../services/connexionApplication.service.js");
const pin = await import("../services/pin.service.js");

/* ------------------------------ Espaces ------------------------------ */

function compteMulti(dernier = null) {
  return {
    utilisateur_id: "u1",
    dernier_espace: dernier,
    role: { libelle: "patient" },
    patient: { patient_id: "p1" },
    medecin: null,
    agents_pharmacie: [
      { pharmacie: { pharmacie_id: "ph1", nom: "Pharmacie du Centre", statut_verification: "publie" } },
      { pharmacie: { pharmacie_id: "ph2", nom: "Pharmacie de la Gare", statut_verification: "en_cours" } },
    ],
    agents_structure_sante: [],
    agents_assurance: [{ service_assurance: { service_assurance_id: "as1", nom: "Assur+", statut_verification: "publie" } }],
    agents_ambulance: [],
    agents_pompes_funebres: [],
    _count: { publicites: 2 },
  };
}

test("un compte, plusieurs fiches : un espace par fiche, avec le rôle de l'espace", async () => {
  base.utilisateurs = [compteMulti()];
  const liste = await espaces.listerEspaces("u1");
  assert.deepEqual(liste.map((e) => e.cle), ["patient", "pharmacie:ph1", "pharmacie:ph2", "assurance:as1", "publicites"]);
  assert.deepEqual(liste.map((e) => e.role), ["patient", "agent_pharmacie", "agent_pharmacie", "agent_assurance", "annonceur"]);
  assert.equal(liste.find((e) => e.cle === "pharmacie:ph2").detail, "Pharmacie · Fiche en vérification");
  assert.equal(liste[0].professionnel, false);
});

test("espace par défaut : le dernier utilisé, sinon celui du rôle du compte", async () => {
  base.utilisateurs = [compteMulti("pharmacie:ph2")];
  const liste = await espaces.listerEspaces("u1");
  assert.equal(liste[0].cle, "pharmacie:ph2", "le dernier utilisé est en tête");
  assert.equal(espaces.espaceParDefaut(liste, "patient").cle, "pharmacie:ph2");

  base.utilisateurs = [compteMulti("pharmacie:supprimee")];
  assert.equal(espaces.espaceParDefaut(await espaces.listerEspaces("u1"), "patient").cle, "patient");
});

test("administrateur : aucun espace", async () => {
  base.utilisateurs = [{ ...compteMulti(), role: { libelle: "admin" } }];
  assert.deepEqual(await espaces.listerEspaces("u1"), []);
});

test("fiche de l'espace actif lue dans la session", () => {
  assert.equal(espaces.ficheEspaceActif({ espace: "pharmacie:ph2" }, "pharmacie"), "ph2");
  assert.equal(espaces.ficheEspaceActif({ espace: "patient" }, "pharmacie"), null);
  assert.equal(espaces.ficheEspaceActif({ espace: "structure:x" }, "pharmacie"), null);
});

/* ------------------------------ PIN récent ------------------------------ */

test("PIN récent : moins de 5 minutes", () => {
  const maintenant = Math.floor(Date.now() / 1000);
  assert.equal(pinRecent({ pin_le: maintenant - 60 }), true);
  assert.equal(pinRecent({ pin_le: maintenant - 301 }), false);
  assert.equal(pinRecent({ pin_le: null }), false);
});

/* ----------------------- Connexion par l'application ----------------------- */

async function comptePin() {
  base.utilisateurs = [{
    utilisateur_id: "u9", telephone_connexion: "237690000099", statut_compte: "actif",
    pin_hash: await bcrypt.hash("483920", 4), role: { libelle: "patient" },
  }];
  base.demandes = [];
}

test("connexion par l'application : bon code -> session remise une seule fois", async () => {
  await comptePin();
  const d = await connexionApp.demanderConnexionApplication({ telephone: "690000099", pays_iso2: "CM" });
  assert.match(d.code, /^\d{2}$/);
  assert.equal((await connexionApp.sonderConnexionApplication({ demande_id: d.demande_id, secret: d.secret })).statut, "en_attente");

  const [enAttente] = await connexionApp.demandesEnAttente("u9");
  assert.equal(enAttente.codes.length, 3);
  assert.ok(enAttente.codes.includes(d.code));

  assert.equal(await connexionApp.repondreDemandeConnexion({ utilisateur_id: "u9", demande_id: d.demande_id, accepter: true, code: d.code }), "approuvee");
  const ok = await connexionApp.sonderConnexionApplication({ demande_id: d.demande_id, secret: d.secret });
  assert.deepEqual(ok, { statut: "approuvee", utilisateur_id: "u9" });
  assert.equal((await connexionApp.sonderConnexionApplication({ demande_id: d.demande_id, secret: d.secret })).statut, "expiree", "usage unique");
});

test("connexion par l'application : mauvais code refusé, mauvais secret rejeté, numéro inconnu = leurre", async () => {
  await comptePin();
  const d = await connexionApp.demanderConnexionApplication({ telephone: "+237690000099" });
  const faux = String((Number(d.code) % 89) + 10 === Number(d.code) ? 11 : (Number(d.code) % 89) + 10);
  await assert.rejects(
    connexionApp.repondreDemandeConnexion({ utilisateur_id: "u9", demande_id: d.demande_id, accepter: true, code: faux }),
    (e) => e.code === "CODE_DIFFERENT"
  );
  assert.equal((await connexionApp.sonderConnexionApplication({ demande_id: d.demande_id, secret: d.secret })).statut, "refusee");
  await assert.rejects(connexionApp.sonderConnexionApplication({ demande_id: d.demande_id, secret: "x" }), (e) => e.status === 404);

  const leurre = await connexionApp.demanderConnexionApplication({ telephone: "+237690001234" });
  assert.match(leurre.code, /^\d{2}$/, "même réponse pour un numéro inconnu");
  assert.equal(base.demandes.at(-1).utilisateur_id, null);
});

/* --------------------- Vérification du numéro par code --------------------- */

test("vérification active : nouveau numéro prouvé par code, sinon refus", async () => {
  base.utilisateurs = [{
    utilisateur_id: "u5", role: { libelle: "patient" }, pays_id: "cm", statut_compte: "actif",
    telephone: "690000055", telephone_connexion: null, telephone_verifie: false, pin_hash: null,
    patient: { date_naissance: new Date("1990-01-01") },
  }];
  process.env.VERIFICATION_TELEPHONE_ACTIVE = "true";
  try {
    const sansPreuve = await pin.definirPin({ utilisateur_id: "u5", pin: "483920" }).catch((e) => e);
    assert.equal(sansPreuve.code, "PREUVE_TELEPHONE_REQUISE");

    await pin.definirPin({ utilisateur_id: "u5", pin: "483920", preuve_telephone: "preuve-ok" });
    assert.equal(base.utilisateurs[0].telephone_verifie, true);
    assert.deepEqual(base.preuvesConsommees.at(-1), { objet: "changement_telephone", telephone: "+237690000055" });
  } finally {
    delete process.env.VERIFICATION_TELEPHONE_ACTIVE;
  }

  // Vérification coupée : aucun code demandé, numéro « non vérifié ».
  base.utilisateurs[0].pin_hash = null;
  await pin.definirPin({ utilisateur_id: "u5", telephone: "+237690000056", pin: "583920" });
  assert.equal(base.utilisateurs[0].telephone_verifie, false);
});
