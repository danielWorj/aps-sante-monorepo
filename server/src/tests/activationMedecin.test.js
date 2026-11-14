// src/tests/activationMedecin.test.js
// Médecin « activé » : règle commune (lib/activationMedecin.js), espace
// médecin fermé tant que le compte n'est pas activé (services/espaces.service.js),
// e-mail d'activation (services/activationMedecin.service.js, gabarit
// lib/gabaritEmail.js). Base et envoi d'e-mails SIMULÉS.
// Lancement : node --experimental-test-module-mocks --test src/tests/activationMedecin.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

const base = { utilisateurs: {}, medecins: {}, iosActif: false };
const emailsEnvoyes = [];

mock.module("../lib/prisma.js", {
  defaultExport: {
    utilisateur: {
      findUnique: async ({ where }) => base.utilisateurs[where.utilisateur_id] ?? null,
      update: async () => ({}),
    },
    medecin: { findUnique: async ({ where }) => base.medecins[where.medecin_id] ?? null },
    mobileApk: { count: async () => (base.iosActif ? 1 : 0) },
  },
});
mock.module("../lib/perimetrePays.js", { namedExports: { horsPerimetre: (fn) => fn() } });
const { construireEmailHtml } = await import("../lib/gabaritEmail.js");
mock.module("../services/email.service.js", {
  namedExports: {
    construireEmailHtml,
    envoyerEmail: async (p) => {
      emailsEnvoyes.push(p);
      return { statut: "envoye" };
    },
  },
});

process.env.FRONTEND_URL = "https://azasante.com";
process.env.API_PUBLIC_URL = "https://api.azasante.com/";
process.env.CONTACT_EMAIL = "contact@azasante.com";

const { estMedecinActive, filtreMedecinsActives } = await import("../lib/activationMedecin.js");
const { listerEspaces, espaceParDefaut, assurerEspaceOuvrable } = await import("../services/espaces.service.js");
const { contenuEmailActivation, envoyerEmailActivationMedecin, notifierActivationSiNecessaire } = await import(
  "../services/activationMedecin.service.js"
);

const compteVide = { agents_pharmacie: [], agents_structure_sante: [], agents_assurance: [], agents_laboratoire: [], agents_ambulance: [], agents_pompes_funebres: [], _count: { publicites: 0 } };

/* ---- Règle « activé » ---- */

test("estMedecinActive : publié + compte actif, ou en vérification après une première activation", () => {
  assert.equal(estMedecinActive({ statut_verification: "publie" }, "actif"), true);
  assert.equal(estMedecinActive({ statut_verification: "publie" }, "suspendu"), false);
  assert.equal(estMedecinActive({ statut_verification: "non_publie" }, "actif"), false);
  assert.equal(estMedecinActive({ statut_verification: "en_cours", date_premiere_publication: null }, "actif"), false);
  assert.equal(estMedecinActive({ statut_verification: "en_cours", date_premiere_publication: new Date() }, "actif"), true);
  assert.equal(estMedecinActive(null, "actif"), false);
});

test("filtreMedecinsActives : compte actif ET (publié OU en vérification déjà activé)", () => {
  const f = filtreMedecinsActives();
  assert.deepEqual(f.utilisateur, { statut_compte: "actif" });
  assert.equal(f.OR.length, 2);
});

/* ---- Espace médecin ---- */

test("espace médecin fermé tant que le compte n'est pas activé", async () => {
  base.utilisateurs.u1 = {
    ...compteVide,
    statut_compte: "actif",
    dernier_espace: "medecin",
    role: { libelle: "medecin" },
    patient: null,
    medecin: { statut_verification: "non_publie", date_premiere_publication: null, specialite: { nom: "Cardiologie" } },
  };
  const espaces = await listerEspaces("u1");
  assert.equal(espaces.length, 1);
  assert.equal(espaces[0].ouvrable, false);
  assert.match(espaces[0].detail, /attente d'activation/);

  const actif = espaceParDefaut(espaces, "medecin");
  assert.throws(() => assurerEspaceOuvrable(actif, "medecin"), (err) => err.status === 403 && err.code === "COMPTE_NON_ACTIVE");
  // Aucun espace du tout pour un compte médecin : refusé aussi.
  assert.throws(() => assurerEspaceOuvrable(null, "medecin"), (err) => err.code === "COMPTE_NON_ACTIVE");
});

test("médecin non activé avec un espace patient : la session s'ouvre sur l'espace patient", async () => {
  base.utilisateurs.u2 = {
    ...compteVide,
    statut_compte: "actif",
    dernier_espace: "medecin",
    role: { libelle: "medecin" },
    patient: { patient_id: "p2" },
    medecin: { statut_verification: "en_cours", date_premiere_publication: null, specialite: null },
  };
  const espaces = await listerEspaces("u2");
  const actif = espaceParDefaut(espaces, "medecin");
  assert.equal(actif.cle, "patient");
  assert.doesNotThrow(() => assurerEspaceOuvrable(actif, "medecin"));
});

test("médecin activé : espace médecin ouvrable", async () => {
  base.utilisateurs.u3 = {
    ...compteVide,
    statut_compte: "actif",
    dernier_espace: null,
    role: { libelle: "medecin" },
    patient: null,
    medecin: { statut_verification: "publie", date_premiere_publication: new Date(), specialite: { nom: "Pédiatrie" } },
  };
  const [espace] = await listerEspaces("u3");
  assert.equal(espace.ouvrable, true);
  assert.doesNotThrow(() => assurerEspaceOuvrable(espaceParDefaut([espace], "medecin"), "medecin"));
});

/* ---- E-mail d'activation ---- */

test("contenu de l'e-mail : logo, bouton de connexion, liens de l'application, identité", () => {
  const { sujet, texte, html } = contenuEmailActivation({
    prenom: "Edwin", nom: "Ayuk", email: "e.ayuk@exemple.cm", telephone: "+237690000000",
    specialite: "Cardiologie", ville: "Douala", numeroOrdre: "6979/2014", iosDisponible: true,
  });
  assert.equal(sujet, "Votre compte médecin APS Santé est activé");
  assert.match(html, /src="cid:logo-aps@apssante"/);
  assert.match(html, /href="https:\/\/azasante\.com\/login"/);
  assert.match(html, /https:\/\/api\.azasante\.com\/api\/apks\/telecharger\/android/);
  assert.match(html, /https:\/\/api\.azasante\.com\/api\/apks\/telecharger\/ios/);
  assert.match(html, /Dr Edwin Ayuk/);
  assert.match(html, /6979\/2014/);
  assert.match(html, /contact@azasante\.com/);
  assert.match(texte, /Accéder à mon espace médecin : https:\/\/azasante\.com\/login/);
  assert.match(texte, /Télécharger pour Android/);
});

test("sans version iPhone active : pas de lien iOS ; noms échappés dans le HTML", () => {
  const { html } = contenuEmailActivation({ prenom: "<b>A</b>", nom: "B", email: "a@b.cm", iosDisponible: false });
  assert.doesNotMatch(html, /telecharger\/ios/);
  assert.doesNotMatch(html, /<b>A<\/b>/);
  assert.match(html, /&lt;b&gt;A&lt;\/b&gt;/);
});

const ficheMedecin = (statut, statutCompte = "actif") => ({
  medecin_id: "m1",
  numero_ordre: "6979/2014",
  statut_verification: statut,
  date_premiere_publication: statut === "publie" ? new Date() : null,
  utilisateur: { utilisateur_id: "u9", nom: "Ayuk", prenom: "Edwin", email: "e.ayuk@exemple.cm", telephone: null, statut_compte: statutCompte },
  specialite: { nom: "Cardiologie" },
  ville_exercice: { nom: "Douala" },
});

test("envoi seulement si le médecin est activé", async () => {
  emailsEnvoyes.length = 0;
  base.medecins.m1 = ficheMedecin("non_publie");
  assert.equal(await envoyerEmailActivationMedecin("m1"), null);
  base.medecins.m1 = ficheMedecin("publie", "suspendu");
  assert.equal(await envoyerEmailActivationMedecin("m1"), null);
  assert.equal(emailsEnvoyes.length, 0);

  base.medecins.m1 = ficheMedecin("publie");
  await envoyerEmailActivationMedecin("m1", { cle: "k1" });
  assert.equal(emailsEnvoyes.length, 1);
  assert.equal(emailsEnvoyes[0].destinataire, "e.ayuk@exemple.cm");
  assert.equal(emailsEnvoyes[0].origine, "medecin_active");
  assert.equal(emailsEnvoyes[0].cle, "k1");
});

test("notifierActivationSiNecessaire : rien si le médecin était déjà activé", async () => {
  emailsEnvoyes.length = 0;
  base.medecins.m1 = ficheMedecin("publie");
  notifierActivationSiNecessaire("m1", true);
  notifierActivationSiNecessaire("m1", false);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(emailsEnvoyes.length, 1);
  assert.match(emailsEnvoyes[0].cle, /^medecin_active:m1:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});
