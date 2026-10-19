// src/tests/droitsRoles.test.js
// Droits par rôle sur TOUTE l'API : chaque route protégée par autoriser(...)
// doit répondre 403 à un token valide de n'importe quel autre rôle (patient,
// médecin, agents, annonceur… et admin sur les routes réservées au
// superadmin), et 401 sans token. Les routeurs sont montés exactement comme
// dans index.js (montages relus depuis ce fichier). Base SIMULÉE : toute
// requête Prisma hors denylist des jetons échoue, donc un 403 prouve que le
// refus a lieu AVANT le contrôleur.
// Lancement : node --experimental-test-module-mocks --test src/tests/droitsRoles.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Paire de clés éphémère : le test ne dépend pas des clés du serveur.
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
process.env.JWT_ACCESS_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });
process.env.JWT_ACCESS_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" });
delete process.env.JWT_ACCESS_PRIVATE_KEY_PATH;
delete process.env.JWT_ACCESS_PUBLIC_KEY_PATH;
// Requis au chargement de certains modules ; jamais appelés ici.
process.env.STRIPE_SECRET_KEY ||= "sk_test_factice";
process.env.JITSI_APP_ID ||= "jitsi-factice";
process.env.JITSI_APP_SECRET ||= "jitsi-factice";

const requetesPrisma = [];
const modele = (nom) =>
  new Proxy({}, {
    get: (_cible, methode) => async () => {
      if (nom === "jetonRevoque" && methode === "findUnique") return null;
      requetesPrisma.push(`${nom}.${String(methode)}`);
      throw new Error(`Prisma non attendu dans ce test : ${nom}.${String(methode)}`);
    },
  });
mock.module("../lib/prisma.js", {
  defaultExport: new Proxy({}, { get: (_c, nom) => (nom === "then" ? undefined : modele(String(nom))) }),
});

const express = (await import("express")).default;
const { genererAccessToken } = await import("../utils/token.utils.js");

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROLES = [
  "patient",
  "medecin",
  "agent_structure_sante",
  "agent_pharmacie",
  "agent_ambulance",
  "agent_pompes_funebres",
  "agent_assurance",
  "annonceur",
  "admin",
  "superadmin",
];
const ID = "00000000-0000-4000-8000-000000000000";
// Routes protégées volontairement ouvertes à un rôle de la plateforme
// publique ("METHODE /chemin [roles]") : vide aujourd'hui, tout ajout doit
// être une décision consciente.
const EXCEPTIONS_METIER = [];

// Montages relus depuis index.js : import xRoutes from "./src/routes/…" + app.use("/prefixe", xRoutes).
async function monterApplication() {
  const source = fs.readFileSync(path.join(RACINE, "index.js"), "utf8");
  const imports = new Map(
    [...source.matchAll(/import\s+(\w+)\s+from\s+"(\.\/src\/routes\/[^"]+)"/g)].map((m) => [m[1], m[2]])
  );
  const app = express();
  app.use(express.json());
  const montages = [];
  for (const [, prefixe, nom] of source.matchAll(/app\.use\(\s*"([^"]+)"\s*,\s*(\w+)\s*\)/g)) {
    if (!imports.has(nom)) continue;
    const routeur = (await import(path.join(RACINE, imports.get(nom)).replace(/\\/g, "/").replace(/^/, "file:///"))).default;
    app.use(prefixe, routeur);
    montages.push({ prefixe, routeur });
  }
  app.use((err, _req, res, _next) => res.status(500).json({ message: err.message }));
  return { app, montages };
}

// Routes dont la pile contient autoriser(...) (marqué par .rolesAutorises).
function routesProtegees(montages) {
  const routes = [];
  for (const { prefixe, routeur } of montages) {
    for (const couche of routeur.stack) {
      if (!couche.route) continue;
      const garde = couche.route.stack.find((c) => Array.isArray(c.handle?.rolesAutorises));
      if (!garde) continue;
      const chemin = `${prefixe}${couche.route.path === "/" ? "" : couche.route.path}`.replace(/:type\b/g, "pharmacie").replace(/:\w+/g, ID);
      for (const methode of Object.keys(couche.route.methods)) {
        routes.push({ methode: methode.toUpperCase(), chemin, roles: garde.handle.rolesAutorises, garde: garde.handle });
      }
    }
  }
  return routes;
}

const { app, montages } = await monterApplication();
const serveur = app.listen(0);
const base = `http://127.0.0.1:${serveur.address().port}`;
test.after(() => serveur.close());

const tokens = Object.fromEntries(
  ROLES.map((role) => [role, genererAccessToken({ utilisateur_id: crypto.randomUUID(), role, pays_id: ID }).token])
);

async function appeler({ methode, chemin }, token) {
  const res = await fetch(`${base}${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: ["GET", "HEAD"].includes(methode) ? undefined : "{}",
  });
  return res.status;
}

const routes = routesProtegees(montages);

test("les routes d'administration sont bien détectées", () => {
  assert.ok(routes.length > 50, `seulement ${routes.length} routes protégées trouvées`);
  assert.ok(routes.some((r) => r.chemin.startsWith("/api/utilisateurs")));
  assert.ok(routes.some((r) => r.chemin.startsWith("/api/whatsapp")));
});

test("sans token : 401 sur toute route protégée", async () => {
  const echecs = [];
  for (const route of routes) {
    const statut = await appeler(route);
    if (statut !== 401) echecs.push(`${route.methode} ${route.chemin} → ${statut}`);
  }
  assert.deepEqual(echecs, []);
});

test("token d'un rôle non admis : 403 avant le contrôleur", async () => {
  const echecs = [];
  for (const route of routes) {
    for (const role of ROLES.filter((r) => !route.roles.includes(r))) {
      const statut = await appeler(route, tokens[role]);
      if (statut !== 403) echecs.push(`${role} : ${route.methode} ${route.chemin} → ${statut}`);
    }
  }
  assert.deepEqual(echecs, []);
});

test("aucun rôle de la plateforme publique n'est admis sur une route protégée", () => {
  const publics = ROLES.filter((r) => r !== "admin" && r !== "superadmin");
  const fuites = routes.filter((r) => r.roles.some((role) => publics.includes(role)));
  // Seules exceptions attendues : routes volontairement ouvertes à un rôle
  // métier précis (listées ici pour qu'un ajout soit une décision consciente).
  assert.deepEqual(
    fuites.map((r) => `${r.methode} ${r.chemin} [${r.roles.join(", ")}]`).sort(),
    EXCEPTIONS_METIER.sort()
  );
});

// Appel direct de la garde (sans HTTP) : la laisser passer exécuterait le
// vrai contrôleur, qui peut joindre des services externes (CamPay…).
test("un rôle admis passe la garde", () => {
  const echecs = [];
  for (const route of routes) {
    for (const role of route.roles) {
      let suivant = false;
      route.garde({ utilisateur: { role } }, { status: () => ({ json: () => {} }) }, () => { suivant = true; });
      if (!suivant) echecs.push(`${role} : ${route.methode} ${route.chemin}`);
    }
  }
  assert.deepEqual(echecs, []);
});
