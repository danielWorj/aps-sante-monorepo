// src/tests/onmc.test.js
// Tableau de l'Ordre (ONMC) : analyse du HTML du registre, normalisation des
// numéros, vérification (copie locale, recherche directe, site injoignable),
// synchronisation (lecture complète, lecture tronquée refusée) et statut des
// fiches Medecin. Base et site ONMC SIMULÉS (fetch remplacé).
// Lancement : node --experimental-test-module-mocks --test src/tests/onmc.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.ONMC_PAUSE_ENTRE_PAGES_MS = "0";

const base = { registre: [], synchros: [], medecins: [], pays: [] };

const correspondChamp = (valeur, cond) => {
  if (cond === null) return valeur === null || valeur === undefined;
  if (cond && typeof cond === "object" && !(cond instanceof Date)) {
    if ("in" in cond && !cond.in.includes(valeur)) return false;
    if ("notIn" in cond && cond.notIn.includes(valeur)) return false;
    if ("not" in cond && valeur === cond.not) return false;
    if ("lt" in cond && !(valeur < cond.lt)) return false;
    if ("gte" in cond && !(valeur >= cond.gte)) return false;
    return true;
  }
  return valeur === cond;
};
const correspond = (ligne, where = {}) => Object.entries(where).every(([k, v]) => correspondChamp(ligne[k], v));

function table(lignes, cleId) {
  return {
    findUnique: async ({ where }) => lignes().find((l) => correspond(l, where)) ?? null,
    findFirst: async ({ where } = {}) =>
      lignes().filter((l) => correspond(l, where)).sort((a, b) => b.demarree_le - a.demarree_le)[0] ?? null,
    findMany: async ({ where } = {}) => lignes().filter((l) => correspond(l, where)),
    count: async ({ where } = {}) => lignes().filter((l) => correspond(l, where)).length,
    create: async ({ data }) => {
      const l = { [cleId]: crypto.randomUUID(), demarree_le: new Date(), ...data };
      lignes().push(l);
      return l;
    },
    createMany: async ({ data }) => {
      data.forEach((d) => lignes().push({ [cleId]: crypto.randomUUID(), ...d }));
      return { count: data.length };
    },
    update: async ({ where, data }) => Object.assign(lignes().find((l) => correspond(l, where)), data),
    updateMany: async ({ where, data }) => {
      const cibles = lignes().filter((l) => correspond(l, where));
      cibles.forEach((l) => Object.assign(l, data));
      return { count: cibles.length };
    },
    deleteMany: async () => {
      const n = lignes().length;
      lignes().splice(0, n);
      return { count: n };
    },
  };
}

const medecinTable = table(() => base.medecins, "medecin_id");
const prismaSimule = {
  onmcMedecin: table(() => base.registre, "onmc_medecin_id"),
  synchronisationOnmc: table(() => base.synchros, "synchronisation_onmc_id"),
  medecin: {
    ...medecinTable,
    findUnique: async ({ where }) => {
      const m = base.medecins.find((l) => l.medecin_id === where.medecin_id);
      if (!m) return null;
      const pays = base.pays.find((p) => p.pays_id === m.pays_exercice_id);
      return { ...m, pays_exercice: pays ? { code_iso2: pays.code_iso2 } : null };
    },
    groupBy: async () => [],
  },
  pays: table(() => base.pays, "pays_id"),
  $transaction: async (fn) => fn(prismaSimule),
};
mock.module("../lib/prisma.js", { defaultExport: prismaSimule });
mock.module("../lib/perimetrePays.js", { namedExports: { horsPerimetre: (fn) => fn() } });

/* ---- Site ONMC simulé ---- */

const fiche = (nom, numero, photo = "onmc_connect/media/images/onmc_logo_PHOTO.svg") => `
  <div class="bloc-medecin m-l-55 m-r-10 float-l">
    <div class="tableSizefullW bloc-containt">
      <div class="grid-12"><img src="${photo}" class="bloc-photo"></div>
      <h2 class="bloc-nom fs-17"> ${nom}</h2>
      <span class="bloc-numero m-t-10">${numero}</span>
      <span class="bloc-specialite  m-t-10">Médecin</span>
    </div>
  </div>`;

const pageListe = (fiches, nombrePages, total) => `
  <span class="nombre_medecin fs-28">
    ${total}   </span>
  <form action="tableau_de_lordre.php" method="GET">
    <select class="grid-2 oc_PageSearch" onchange="submit();" name="page">
      <option> Pages </option>
      ${Array.from({ length: nombrePages }, (_, i) => `<option value="${i + 1}" > Pages ${i + 1}</option>`).join("")}
    </select>
  </form>
  ${fiches.join("")}`;

const site = {
  pages: {
    1: [fiche("AYUK TAMBE EDWIN", "6979/2014", "onmc_connect/data_avatar/6979_photo.jpg"), fiche("ABANG MBOZO&#039;O Emile", "P4984/2005")],
    2: [fiche("ADAÏTO BERMENDORA MARFE ", "08242/2016")],
  },
  total: 3,
  recherche: [],
  enPanne: false,
  appels: [],
};

globalThis.fetch = async (url, options = {}) => {
  site.appels.push({ url: String(url), corps: options.body });
  if (site.enPanne) throw new Error("ECONNREFUSED");
  const u = new URL(String(url));
  if (u.pathname.endsWith("/tableau_de_lordre.php")) {
    const page = Number(u.searchParams.get("page"));
    const nbPages = Object.keys(site.pages).length;
    return new Response(pageListe(site.pages[page] ?? [], nbPages, site.total), { status: 200 });
  }
  if (u.pathname.endsWith("/onmc_shearch.php")) {
    const html = site.recherche.length ? site.recherche.join("") : "<style></style>Aucun résultat pour votre recherche";
    return new Response(html, { status: 200 });
  }
  return new Response("introuvable", { status: 404 });
};

const scraper = await import("../lib/onmcScraper.js");
const service = await import("../services/onmc.service.js");

function reinitialiser() {
  base.registre = [];
  base.synchros = [];
  base.medecins = [];
  base.pays = [
    { pays_id: "pays-cm", code_iso2: "CM" },
    { pays_id: "pays-ga", code_iso2: "GA" },
  ];
  site.recherche = [];
  site.enPanne = false;
  site.appels = [];
  site.total = 3;
}

/* ---- Analyse ---- */

test("extraireMedecins lit nom, numéro, qualité et photo, décode les entités", () => {
  const fiches = scraper.extraireMedecins(pageListe(site.pages[1], 2, 3));
  assert.equal(fiches.length, 2);
  assert.deepEqual(fiches[0], {
    numero_ordre: "6979/2014",
    numero_normalise: "6979/2014",
    nom_complet: "AYUK TAMBE EDWIN",
    qualite: "Médecin",
    photo_chemin: "onmc_connect/data_avatar/6979_photo.jpg",
  });
  assert.equal(fiches[1].nom_complet, "ABANG MBOZO'O Emile");
  assert.equal(fiches[1].numero_normalise, "4984/2005");
  assert.equal(fiches[1].photo_chemin, null, "logo par défaut ignoré");
  assert.equal(scraper.extraireNombrePages(pageListe([], 66, 13016)), 66);
  assert.equal(scraper.extraireTotalAnnonce(pageListe([], 66, 13016)), 13016);
});

test("normaliserNumeroOrdre rapproche les formes hétérogènes du registre", () => {
  assert.equal(scraper.normaliserNumeroOrdre("P4984/2005"), "4984/2005");
  assert.equal(scraper.normaliserNumeroOrdre(" p 04984 / 2005"), "4984/2005");
  assert.equal(scraper.normaliserNumeroOrdre("08242/2016"), "8242/2016");
  assert.equal(scraper.normaliserNumeroOrdre("5148 /2006"), "5148/2006");
  assert.equal(scraper.normaliserNumeroOrdre("001-04/2025"), "1-04/2025");
  assert.equal(scraper.normaliserNumeroOrdre(""), "");
});

test("scoreCorrespondanceNom ignore accents, casse et ordre des mots", () => {
  assert.equal(scraper.scoreCorrespondanceNom("Edwin Ayuk", "AYUK TAMBE EDWIN"), 1);
  assert.equal(scraper.scoreCorrespondanceNom("Adaito Marfe", "ADAÏTO BERMENDORA MARFE"), 1);
  assert.equal(scraper.scoreCorrespondanceNom("Jean Dupont", "AYUK TAMBE EDWIN"), 0);
});

/* ---- Synchronisation ---- */

test("synchronisation complète : copie locale remplacée et statuts recalculés", async () => {
  reinitialiser();
  base.medecins = [
    { medecin_id: "m1", numero_ordre: "4984/2005", pays_exercice_id: "pays-cm", statut_ordre: "non_verifie" },
    { medecin_id: "m2", numero_ordre: "1234/2020", pays_exercice_id: "pays-cm", statut_ordre: "inscrit" },
    { medecin_id: "m3", numero_ordre: "6979/2014", pays_exercice_id: "pays-ga", statut_ordre: "inscrit" },
  ];
  base.registre = [{ onmc_medecin_id: "ancien", numero_normalise: "0/0" }];

  const synchro = await service.synchroniserRegistreOnmc({ declencheePar: "planifiee" });

  assert.equal(synchro.statut, "reussie");
  assert.equal(synchro.total_recupere, 3);
  assert.equal(synchro.pages_lues, 2);
  assert.equal(base.registre.length, 3, "ancienne copie remplacée");
  assert.ok(!base.registre.some((r) => r.onmc_medecin_id === "ancien"));
  const [m1, m2, m3] = base.medecins;
  assert.equal(m1.statut_ordre, "inscrit");
  assert.equal(m1.ordre_nom_onmc, "ABANG MBOZO'O Emile");
  assert.equal(m2.statut_ordre, "non_inscrit");
  assert.equal(m3.statut_ordre, "non_verifie", "hors Cameroun : non vérifiable");
  assert.equal(synchro.medecins_inscrits, 1);
  assert.equal(synchro.medecins_non_inscrits, 1);
});

test("lecture tronquée : synchronisation refusée, copie et statuts conservés", async () => {
  reinitialiser();
  site.total = 13016; // le site annonce bien plus que ce qui est lu
  base.registre = [{ onmc_medecin_id: "ancien", numero_normalise: "4984/2005", nom_complet: "X" }];
  base.medecins = [{ medecin_id: "m1", numero_ordre: "4984/2005", pays_exercice_id: "pays-cm", statut_ordre: "inscrit" }];

  await assert.rejects(service.synchroniserRegistreOnmc(), /Lecture incomplète/);

  assert.equal(base.synchros[0].statut, "echouee");
  assert.equal(base.registre.length, 1);
  assert.equal(base.registre[0].onmc_medecin_id, "ancien");
  assert.equal(base.medecins[0].statut_ordre, "inscrit");
});

/* ---- Vérification ---- */

async function avecCopieLocale() {
  reinitialiser();
  await service.synchroniserRegistreOnmc();
  site.appels = [];
}

test("vérification trouvée dans la copie locale, sans appel au site", async () => {
  await avecCopieLocale();
  const r = await service.verifierNumeroOrdre({ numeroOrdre: "8242/2016", nom: "Marfe Adaïto" });
  assert.equal(r.appartient_ordre, true);
  assert.equal(r.source, "registre_local");
  assert.equal(r.numero_ordre_onmc, "08242/2016");
  assert.equal(r.nom_correspond, true);
  assert.equal(site.appels.length, 0);
});

test("absent de la copie locale : recherche directe (inscription récente), filtre exact", async () => {
  await avecCopieLocale();
  site.recherche = [fiche("NOUVEAU MEDECIN", "13600/2026"), fiche("AUTRE", "113600/2026")];
  const r = await service.verifierNumeroOrdre({ numeroOrdre: "13600/2026" });
  assert.equal(r.appartient_ordre, true);
  assert.equal(r.source, "onmc_direct");
  assert.equal(r.correspondances.length, 1, "le résultat partiel 113600 est écarté");
  // Formulaire sérialisé puis encodé dans myData, comme $(form).serialize() + $.post.
  const myData = new URLSearchParams(site.appels[0].corps).get("myData");
  assert.equal(new URLSearchParams(myData).get("nordre_search"), "13600/2026");
});

test("introuvable partout : appartient_ordre=false", async () => {
  await avecCopieLocale();
  const r = await service.verifierNumeroOrdre({ numeroOrdre: "99999/1900" });
  assert.equal(r.appartient_ordre, false);
  assert.equal(r.source, "onmc_direct");
});

test("site injoignable sans copie locale : ErreurOnmc (jamais « non inscrit »)", async () => {
  reinitialiser();
  site.enPanne = true;
  await assert.rejects(service.verifierNumeroOrdre({ numeroOrdre: "11111/2011" }), (err) => err instanceof service.ErreurOnmc);
});

test("site injoignable avec copie locale : réponse locale signalée, fiche non déclassée", async () => {
  await avecCopieLocale();
  site.enPanne = true;
  base.medecins = [{ medecin_id: "m9", numero_ordre: "22222/2022", pays_exercice_id: "pays-cm", statut_ordre: "inscrit", utilisateur: { nom: "A", prenom: "B" } }];

  const r = await service.verifierNumeroOrdre({ numeroOrdre: "22222/2022" });
  assert.equal(r.appartient_ordre, false);
  assert.equal(r.verification_directe_indisponible, true);

  const { medecin } = await service.verifierEtMettreAJourMedecin("m9");
  assert.equal(medecin.statut_ordre, "inscrit", "statut conservé faute de vérification complète");
});

test("numéro invalide : erreur 400", async () => {
  reinitialiser();
  await assert.rejects(service.verifierNumeroOrdre({ numeroOrdre: "  abc " }), (err) => err.status === 400);
});
