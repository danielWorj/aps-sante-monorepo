// src/tests/perimetrePays.test.js
// ABAC « périmètre pays » (lib/perimetrePays.js) : un admin ne lit et
// n'écrit que les données de son pays ; superadmin et visiteurs ne sont
// pas restreints. Sans base : on appelle directement le crochet de
// l'extension Prisma avec une fausse fonction `query`.
// Lancement : node --experimental-test-module-mocks --test src/tests/perimetrePays.test.js

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
process.env.JWT_ACCESS_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });
process.env.JWT_ACCESS_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" });
delete process.env.JWT_ACCESS_PRIVATE_KEY_PATH;
delete process.env.JWT_ACCESS_PUBLIC_KEY_PATH;

const {
  extensionPerimetrePays,
  executerDansPerimetre,
  horsPerimetre,
  poserPerimetrePays,
  paysDuPerimetre,
  ErreurHorsPerimetre,
} = await import("../lib/perimetrePays.js");
const { genererAccessToken } = await import("../utils/token.utils.js");

const CM = "11111111-1111-4111-8111-111111111111";
const GA = "22222222-2222-4222-8222-222222222222";

const fauxClient = {
  abonnementAssurance: { findMany: async () => [{ abonnement_id: "aa" }] },
  abonnementPresence: { findMany: async () => [{ abonnement_id: "ap" }] },
  publicite: { findMany: async () => [{ publicite_id: "pu" }] },
};
const crochet = extensionPerimetrePays(fauxClient).query.$allModels.$allOperations;
const appeler = (model, operation, args) => crochet({ model, operation, args, query: async (a) => a });

test("hors contexte : requête inchangée", async () => {
  const args = { where: { nom: "x" } };
  assert.equal(await appeler("Pharmacie", "findMany", args), args);
});

test("lecture : filtre pays ajouté sans écraser le where existant", async () => {
  const a = await executerDansPerimetre(CM, () =>
    appeler("Pharmacie", "findUnique", { where: { pharmacie_id: "p1", AND: { actif: true } } })
  );
  assert.equal(a.where.pharmacie_id, "p1");
  assert.deepEqual(a.where.AND, [{ actif: true }, { pays_id: CM }]);
});

test("lecture : modèle relié par le médecin", async () => {
  const a = await executerDansPerimetre(CM, () => appeler("RendezVous", "count", {}));
  assert.deepEqual(a.where.AND, [{ medecin: { is: { pays_exercice_id: CM } } }]);
});

test("modèle global (sans règle) : non filtré", async () => {
  const args = { where: {} };
  assert.equal(await executerDansPerimetre(CM, () => appeler("Langue", "findMany", args)), args);
});

test("création dans un autre pays : refusée", async () => {
  await assert.rejects(
    executerDansPerimetre(CM, () => appeler("Ville", "create", { data: { nom: "Libreville", pays_id: GA } })),
    ErreurHorsPerimetre
  );
  await assert.rejects(
    executerDansPerimetre(CM, () =>
      appeler("Pharmacie", "create", { data: { nom: "P", pays: { connect: { pays_id: GA } } } })
    ),
    ErreurHorsPerimetre
  );
  await assert.rejects(
    executerDansPerimetre(CM, () => appeler("Medecin", "create", { data: { numero_ordre: "1" } })),
    ErreurHorsPerimetre,
    "un pays absent à la création est refusé"
  );
  const ok = await executerDansPerimetre(CM, () => appeler("Ville", "create", { data: { nom: "Douala", pays_id: CM } }));
  assert.equal(ok.data.pays_id, CM);
});

test("mise à jour : ciblée sur le pays, déplacement vers un autre pays refusé", async () => {
  const a = await executerDansPerimetre(CM, () =>
    appeler("Pharmacie", "update", { where: { pharmacie_id: "p1" }, data: { nom: "N" } })
  );
  assert.deepEqual(a.where.AND, [{ pays_id: CM }]);
  await assert.rejects(
    executerDansPerimetre(CM, () =>
      appeler("Pharmacie", "update", { where: { pharmacie_id: "p1" }, data: { pays_id: GA } })
    ),
    ErreurHorsPerimetre
  );
  await assert.rejects(
    executerDansPerimetre(CM, () =>
      appeler("ConfigAbonnementPresence", "upsert", { where: { id: "c" }, create: { pays_id: GA }, update: {} })
    ),
    ErreurHorsPerimetre
  );
});

test("forfait publicitaire : forfaits historiques (sans pays) visibles en lecture", async () => {
  const a = await executerDansPerimetre(CM, () => appeler("ForfaitPublicitaire", "findMany", {}));
  assert.deepEqual(a.where.AND, [{ OR: [{ pays_id: CM }, { pays_id: null }] }]);
  const b = await executerDansPerimetre(CM, () => appeler("ForfaitPublicitaire", "delete", { where: { id: "f" } }));
  assert.deepEqual(b.where.AND, [{ pays_id: CM }]);
});

test("transactions : seules les listes sont filtrées, par cibles du pays", async () => {
  const a = await executerDansPerimetre(CM, () => appeler("TransactionPaiement", "findMany", {}));
  const ou = a.where.AND[0].OR;
  assert.ok(ou.some((c) => c.abonnement_assurance_id_cible?.in?.[0] === "aa"));
  assert.ok(ou.some((c) => c.publicite_id_cible?.in?.[0] === "pu"));
  const r = await executerDansPerimetre(CM, () => appeler("RemboursementPaiement", "count", {}));
  assert.ok(r.where.AND[0].transaction.is.OR);
  const args = { where: { transaction_id: "t" } };
  assert.equal(await executerDansPerimetre(CM, () => appeler("TransactionPaiement", "findUnique", args)), args);
});

test("horsPerimetre lève la restriction", async () => {
  const args = { where: {} };
  assert.equal(await executerDansPerimetre(CM, () => horsPerimetre(() => appeler("Pharmacie", "findMany", args))), args);
});

function requete(role, pays_id) {
  const { token } = genererAccessToken({ utilisateur_id: "u1", role, pays_id });
  return { headers: { authorization: `Bearer ${token}` } };
}

function paysVuParLaRoute(req) {
  return new Promise((resolve) => poserPerimetrePays(req, {}, () => resolve(paysDuPerimetre())));
}

test("middleware : seul un admin reçoit un périmètre", async () => {
  assert.equal(await paysVuParLaRoute(requete("admin", CM)), CM);
  assert.equal(await paysVuParLaRoute(requete("superadmin", CM)), null);
  assert.equal(await paysVuParLaRoute(requete("patient", CM)), null);
  assert.equal(await paysVuParLaRoute({ headers: {} }), null);
  assert.equal(await paysVuParLaRoute({ headers: { authorization: "Bearer invalide" } }), null);
});
