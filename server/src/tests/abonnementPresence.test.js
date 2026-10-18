// src/tests/abonnementPresence.test.js
// Abonnements de présence (pharmacies, centres de santé, médecins) :
// résolution des droits (dont l'obligation des médecins par pays),
// restitution publique, activation, finalisation et paiement tardif.
// Prisma est SIMULÉ : aucune base requise.
// Lancement : node --experimental-test-module-mocks --test src/tests/abonnementPresence.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

process.env.STRIPE_SECRET_KEY ??= "sk_test_simule";

// ─── Prisma simulé ──────────────────────────────────────────────
let abonnements = [];
let transactions = [];
let remboursements = [];
let factures = [];
let configs = [];
let notifications = [];
let compteur = 0;
let vues = [];

const pharmacies = [
  { pharmacie_id: "ph1", nom: "Pharmacie du Lac", pays_id: "cm", statut_verification: "publie" },
  { pharmacie_id: "ph2", nom: "Pharmacie en revue", pays_id: "cm", statut_verification: "en_cours" },
  // Déjà publiée, repassée « en_cours » après une modification de l'agent.
  { pharmacie_id: "ph3", nom: "Pharmacie modifiée", pays_id: "cm", statut_verification: "en_cours", date_premiere_publication: new Date("2026-01-01") },
];
const medecins = [
  { medecin_id: "m1", utilisateur_id: "u-m1", pays_exercice_id: "cm", statut_verification: "publie", utilisateur: { nom: "Ngono", prenom: "Ada", statut_compte: "actif" } },
  { medecin_id: "m2", utilisateur_id: "u-m2", pays_exercice_id: "ga", statut_verification: "publie", utilisateur: { nom: "Obame", prenom: "Luc", statut_compte: "actif" } },
];

function correspond(ligne, where = {}) {
  return Object.entries(where).every(([k, v]) => {
    // Filtre relationnel { niveau: { rang: { lt } } }.
    if (k === "niveau" && v?.rang) return correspond({ rang: niveaux[ligne.niveau_id].rang }, v);
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("in" in v) return v.in.includes(ligne[k]);
      if ("not" in v) return ligne[k] !== v.not;
      return (v.gt === undefined || ligne[k] > v.gt)
        && (v.lt === undefined || ligne[k] < v.lt)
        && (v.lte === undefined || ligne[k] <= v.lte)
        && (v.gte === undefined || ligne[k] >= v.gte);
    }
    return ligne[k] === v;
  });
}

const niveaux = {
  std: { niveau_id: "std", type_acteur: "pharmacie", code: "standard", libelle: "Standard", rang: 1, actif: true,
    contact_direct: true, photos: true, description_enrichie: true, presentation_equipe: false, prise_rdv_en_ligne: false,
    multimedia: false, statistiques: true, statistiques_detaillees: false, multi_utilisateurs: false, support_prioritaire: false,
    max_photos: null, max_gestionnaires: null },
  prem: { niveau_id: "prem", type_acteur: "pharmacie", code: "premium", libelle: "Premium", rang: 2, actif: true,
    contact_direct: true, photos: true, description_enrichie: true, presentation_equipe: true, prise_rdv_en_ligne: false,
    multimedia: true, statistiques: true, statistiques_detaillees: true, multi_utilisateurs: false, support_prioritaire: true,
    max_photos: null, max_gestionnaires: null },
  // Niveau médecin sans RDV en ligne ni photos (cas limite de la fusion).
  medMini: { niveau_id: "medMini", type_acteur: "medecin", code: "mini", libelle: "Mini", rang: 3, actif: true,
    contact_direct: true, photos: false, description_enrichie: false, presentation_equipe: false, prise_rdv_en_ligne: false,
    multimedia: false, statistiques: false, statistiques_detaillees: false, multi_utilisateurs: false, support_prioritaire: false,
    max_photos: 0, max_gestionnaires: 1 },
  med: { niveau_id: "med", type_acteur: "medecin", code: "standard", libelle: "Standard", rang: 1, actif: true,
    contact_direct: true, photos: true, description_enrichie: true, presentation_equipe: false, prise_rdv_en_ligne: true,
    multimedia: false, statistiques: true, statistiques_detaillees: false, multi_utilisateurs: false, support_prioritaire: false,
    max_photos: null, max_gestionnaires: null },
};

const avecNiveau = (a, include) => (include?.niveau ? { ...a, niveau: niveaux[a.niveau_id] } : { ...a });

const tx = {
  $queryRaw: async (strings) => {
    if (String(strings[0]).includes("compteur_facture_abonnement")) {
      compteur += 1;
      return [{ dernier: compteur }];
    }
    return [];
  },
  $queryRawUnsafe: async () => [],
  pharmacie: {
    findUnique: async ({ where }) => pharmacies.find((p) => p.pharmacie_id === where.pharmacie_id) ?? null,
    findMany: async ({ where }) => pharmacies.filter((p) => correspond(p, where)),
  },
  medecin: {
    findUnique: async ({ where }) => medecins.find((m) => m.medecin_id === where.medecin_id) ?? null,
    findMany: async ({ where }) => medecins.filter((m) => correspond(m, where)),
  },
  agentPharmacie: {
    findMany: async ({ where }) => (where.pharmacie_id === "ph1"
      ? [{ utilisateur_id: "u-ph1", utilisateur: { statut_compte: "actif" } }]
      : []),
  },
  configAbonnementPresence: {
    findMany: async ({ where }) => configs.filter((c) => correspond(c, where)),
    findUnique: async ({ where }) => configs.find((c) =>
      c.type_acteur === where.type_acteur_pays_id.type_acteur && c.pays_id === where.type_acteur_pays_id.pays_id) ?? null,
  },
  abonnementPresence: {
    findUnique: async ({ where, include }) => {
      const a = abonnements.find((x) => x.abonnement_id === where.abonnement_id);
      return a ? avecNiveau(a, include) : null;
    },
    findFirst: async ({ where, orderBy }) => {
      let l = abonnements.filter((a) => correspond(a, where));
      if (orderBy?.date_fin === "desc") l = l.sort((x, y) => y.date_fin - x.date_fin);
      return l[0] ? { ...l[0] } : null;
    },
    findMany: async ({ where, include }) => abonnements.filter((a) => correspond(a, where)).map((a) => avecNiveau(a, include)),
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const a of abonnements) if (correspond(a, where)) { Object.assign(a, data); count += 1; }
      return { count };
    },
    update: async ({ where, data }) => {
      const a = abonnements.find((x) => x.abonnement_id === where.abonnement_id);
      Object.assign(a, data);
      return a;
    },
  },
  transactionPaiement: {
    findUnique: async ({ where }) => transactions.find((t) => t.transaction_id === where.transaction_id) ?? null,
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const t of transactions) if (correspond(t, where)) { Object.assign(t, data); count += 1; }
      return { count };
    },
  },
  remboursementPaiement: {
    findFirst: async ({ where }) => remboursements.find((r) => correspond(r, where)) ?? null,
    create: async ({ data }) => { remboursements.push(data); return data; },
  },
  tarifAbonnementPresence: {
    findFirst: async ({ where }) => ({
      niveau_id: where.niveau_id, pays_id: where.pays_id, devise: "xaf", prix_mensuel: where.niveau_id === "prem" ? 20000 : 5000,
    }),
  },
  remiseDureeAbonnementPresence: {
    findUnique: async ({ where }) => ({ ...where.type_acteur_duree_mois, remise_pourcent: 0 }),
  },
  factureAbonnementPresence: { create: async ({ data }) => { factures.push(data); return data; } },
  niveauAbonnementPresence: {
    findUnique: async ({ where }) => niveaux[where.niveau_id] ?? null,
    findMany: async ({ where }) => Object.values(niveaux).filter((n) => where.niveau_id.in.includes(n.niveau_id)),
  },
  vueFiche: {
    findMany: async ({ where }) => vues.filter((v) => correspond(v, { ...where })).sort((x, y) => x.jour - y.jour),
    aggregate: async ({ where }) => {
      const l = vues.filter((v) => correspond(v, where));
      return { _sum: { vues: l.reduce((a, v) => a + v.vues, 0), visiteurs: l.reduce((a, v) => a + v.visiteurs, 0) } };
    },
  },
  journalAudit: { create: async ({ data }) => data },
  notification: { createMany: async ({ data }) => { notifications.push(...data); return { count: data.length }; } },
};

const prismaSimule = { ...tx, $transaction: async (fn) => fn(tx) };
mock.module("../lib/prisma.js", { defaultExport: prismaSimule });

const { ajouterMois, ajouterJours } = await import("../lib/dates.js");
const { debutDuJourUtc } = await import("../lib/droitsAssurance.js");
const {
  resoudreDroitsPresence,
  filtrerPharmacie,
  filtrerMedecin,
  DROITS_MINIMAUX,
} = await import("../lib/droitsPresence.js");
const { activerAbonnementPresence, evaluerAchatPresence, exigerFichePubliee } = await import("../services/abonnementPresence.service.js");
const { finaliserAbonnementPresence, MOTIF_PAIEMENT_TARDIF_PRESENCE } = await import("../services/finalisationAbonnementPresence.service.js");
const { estRobot, empreinteVisiteur, installationDe, enregistrerVueFiche, statistiquesFiche } = await import("../services/vuesFiche.service.js");

const AUJ = debutDuJourUtc();

function reinitialiser() {
  abonnements = [];
  transactions = [];
  remboursements = [];
  factures = [];
  configs = [];
  notifications = [];
  compteur = 0;
  vues = [];
}

function aboActif(id, acteur, niveau_id, fin = ajouterMois(AUJ, 1)) {
  const champ = acteur.startsWith("ph") ? "pharmacie_id" : "medecin_id";
  return {
    abonnement_id: id, type_acteur: champ === "pharmacie_id" ? "pharmacie" : "medecin", [champ]: acteur,
    niveau_id, statut: "actif", date_debut: AUJ, date_fin: fin, devise: "xaf", montant_total: 5000,
  };
}

// ─── Droits ─────────────────────────────────────────────────────
test("pharmacie sans abonnement : palier Basique (aucun droit enrichi)", async () => {
  reinitialiser();
  const r = await resoudreDroitsPresence("pharmacie", "ph1");
  assert.equal(r.statut_abonnement, "aucun");
  assert.deepEqual(r.droits, DROITS_MINIMAUX);
  assert.equal(r.abonnement_requis, true);
});

test("pharmacie abonnée : droits du niveau ; jamais publiée : aucun droit ; re-modération : droits gardés", async () => {
  reinitialiser();
  abonnements.push(aboActif("a1", "ph1", "std"), aboActif("a2", "ph2", "std"), aboActif("a3", "ph3", "std"));
  const r1 = await resoudreDroitsPresence("pharmacie", "ph1");
  assert.equal(r1.statut_abonnement, "actif");
  assert.equal(r1.droits.contact_direct, true);
  const r2 = await resoudreDroitsPresence("pharmacie", "ph2");
  assert.equal(r2.droits.contact_direct, false);
  const r3 = await resoudreDroitsPresence("pharmacie", "ph3");
  assert.equal(r3.statut_abonnement, "actif");
  assert.equal(r3.droits.contact_direct, true);
});

test("souscription : fiche jamais publiée refusée, fiche en re-modération acceptée", () => {
  assert.throws(() => exigerFichePubliee({ statut_verification: "en_cours" }), { code: "FICHE_NON_PUBLIEE" });
  assert.throws(() => exigerFichePubliee({ statut_verification: "non_publie", date_premiere_publication: new Date() }));
  assert.doesNotThrow(() => exigerFichePubliee({ statut_verification: "en_cours", date_premiere_publication: new Date() }));
});

test("échéance passée : grâce (droits minimaux) puis aucun", async () => {
  reinitialiser();
  configs.push({ type_acteur: "pharmacie", pays_id: "cm", grace_jours: 7 });
  abonnements.push({ ...aboActif("a1", "ph1", "std"), date_debut: ajouterJours(AUJ, -40), date_fin: ajouterJours(AUJ, -3) });
  const r = await resoudreDroitsPresence("pharmacie", "ph1");
  assert.equal(r.statut_abonnement, "grace");
  assert.equal(r.en_grace, true);
  assert.equal(r.droits.contact_direct, false);
  abonnements[0].date_fin = ajouterJours(AUJ, -10);
  assert.equal((await resoudreDroitsPresence("pharmacie", "ph1")).statut_abonnement, "aucun");
});

test("médecin, obligation désactivée (défaut) : RDV en ligne, photo et biographie conservés, contact non exposé", async () => {
  reinitialiser();
  const r = await resoudreDroitsPresence("medecin", "m1");
  assert.equal(r.statut_abonnement, "non_requis");
  assert.equal(r.abonnement_requis, false);
  assert.equal(r.droits.prise_rdv_en_ligne, true);
  assert.equal(r.droits.photos, true);
  assert.equal(r.droits.contact_direct, false);
});

test("médecin, obligation activée dans SON pays seulement : sans abonnement plus de RDV en ligne", async () => {
  reinitialiser();
  configs.push({ type_acteur: "medecin", pays_id: "cm", abonnement_obligatoire: true, grace_jours: 7 });
  const cm = await resoudreDroitsPresence("medecin", "m1");
  assert.equal(cm.statut_abonnement, "aucun");
  assert.equal(cm.droits.prise_rdv_en_ligne, false);
  const ga = await resoudreDroitsPresence("medecin", "m2");
  assert.equal(ga.statut_abonnement, "non_requis");
  assert.equal(ga.droits.prise_rdv_en_ligne, true);

  abonnements.push(aboActif("a1", "m1", "med"));
  const abonne = await resoudreDroitsPresence("medecin", "m1");
  assert.equal(abonne.statut_abonnement, "actif");
  assert.equal(abonne.droits.prise_rdv_en_ligne, true);
  assert.equal(abonne.droits.contact_direct, true);
});

test("médecin abonné d'un pays SANS obligation : jamais moins que les droits sans obligation", async () => {
  reinitialiser();
  abonnements.push(aboActif("a1", "m2", "medMini"));
  const r = await resoudreDroitsPresence("medecin", "m2");
  assert.equal(r.statut_abonnement, "actif");
  assert.equal(r.droits.niveau_presence, "mini");
  assert.equal(r.droits.contact_direct, true); // apporté par le niveau
  assert.equal(r.droits.prise_rdv_en_ligne, true); // conservé (sans obligation)
  assert.equal(r.droits.photos, true);
  assert.equal(r.droits.statistiques, true);
  assert.equal(r.droits.max_photos, null);
});

// ─── Restitution publique ───────────────────────────────────────
test("pharmacie filtrée : identité, adresse, géolocalisation conservées (EF-PHA-06)", () => {
  const fiche = {
    pharmacie_id: "ph1", nom: "Pharmacie du Lac", ville: { nom: "Douala" }, geolocalisation: { latitude: 4, longitude: 9 },
    telephone: "699000000", image_url: "https://img", description_enrichie: "Ouvert 24h", services_particuliers: "Tests",
  };
  const f = filtrerPharmacie(fiche, DROITS_MINIMAUX);
  assert.equal(f.nom, "Pharmacie du Lac");
  assert.deepEqual(f.geolocalisation, fiche.geolocalisation);
  assert.equal(f.telephone, null);
  assert.equal(f.image_url, null);
  assert.equal(f.description_enrichie, null);
  assert.equal(filtrerPharmacie(fiche, niveaux.std).telephone, "699000000");
});

test("médecin filtré : le téléphone du compte ne sort jamais de `utilisateur`", () => {
  const m = { medecin_id: "m1", photo_url: "p", biographie: "bio", utilisateur: { nom: "N", prenom: "A", telephone: "677" } };
  const sans = filtrerMedecin(m, DROITS_MINIMAUX, "677");
  assert.equal(sans.utilisateur.telephone, undefined);
  assert.equal(sans.contact_telephone, null);
  assert.equal(sans.photo_url, null);
  const avec = filtrerMedecin(m, niveaux.med, "677");
  assert.equal(avec.utilisateur.telephone, undefined);
  assert.equal(avec.contact_telephone, "677");
});

// ─── Activation et finalisation ─────────────────────────────────
test("renouvellement chaîné : la nouvelle période démarre à l'échéance en cours", async () => {
  reinitialiser();
  const fin = ajouterMois(AUJ, 1);
  abonnements.push(aboActif("ancien", "ph1", "std", fin));
  abonnements.push({ abonnement_id: "nouveau", type_acteur: "pharmacie", pharmacie_id: "ph1", niveau_id: "std", statut: "en_attente_paiement", duree_mois: 3, montant_total: 0 });
  const r = await activerAbonnementPresence(tx, { ...abonnements[1] });
  assert.equal(r.effet, true);
  assert.deepEqual(abonnements[1].date_debut, fin);
  assert.deepEqual(abonnements[1].date_fin, ajouterMois(fin, 3));
});

test("montée de niveau : le renouvellement déjà payé de l'ancien niveau est crédité puis remplacé", async () => {
  reinitialiser();
  const fin = ajouterMois(AUJ, 1);
  abonnements.push(aboActif("courant", "ph1", "std", fin));
  abonnements.push({ ...aboActif("suite", "ph1", "std", ajouterMois(fin, 1)), date_debut: fin });
  const fiche = { acteur_id: "ph1", pays_id: "cm", statut_verification: "publie" };
  const data = await evaluerAchatPresence(tx, { type: "pharmacie", fiche, niveau: niveaux.prem, duree_mois: 3, aujourdhui: AUJ });
  // Crédit : reste du courant (tout, il démarre aujourd'hui) + toute la suite.
  assert.equal(Number(data.credit_prorata), 10000);
  assert.equal(Number(data.montant_total), 60000 - 10000);
  assert.equal(data.abonnement_remplace_id, "courant");

  abonnements.push({ abonnement_id: "monte", statut: "en_attente_paiement", origine: "self_service", ...data });
  const r = await activerAbonnementPresence(tx, { ...abonnements[2] });
  assert.equal(r.effet, true);
  assert.equal(abonnements[0].statut, "remplace");
  assert.equal(abonnements[1].statut, "remplace");
  assert.equal(abonnements[2].statut, "actif");
  assert.deepEqual(abonnements[2].date_debut, AUJ);
});

function brouillonPaye() {
  abonnements.push({
    abonnement_id: "a", type_acteur: "pharmacie", pharmacie_id: "ph1", niveau_id: "std", statut: "en_attente_paiement",
    duree_mois: 1, prix_mensuel_applique: 5000, remise_pourcent: 0, credit_prorata: 0, montant_total: 5000, devise: "xaf",
  });
  transactions.push({ transaction_id: "t1", abonnement_presence_id_cible: "a", statut: "en_attente", montant: 5000, fournisseur: "campay" });
}

test("finalisation : active, facture FAC-ABO numérotée, agent notifié ; rejeu sans effet", async () => {
  reinitialiser();
  brouillonPaye();
  const r1 = await finaliserAbonnementPresence({ transaction_id: "t1", campay_reference: "ref-1" });
  assert.equal(r1.effet, true);
  assert.equal(abonnements[0].statut, "actif");
  assert.equal(factures.length, 1);
  assert.match(factures[0].numero, /^FAC-ABO-\d{4}-000001$/);
  assert.equal(factures[0].snapshot.entete.souscripteur, "Pharmacie du Lac");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "abonnement_presence_active");
  assert.equal(notifications[0].utilisateur_id, "u-ph1");

  const r2 = await finaliserAbonnementPresence({ transaction_id: "t1", campay_reference: "ref-1" });
  assert.equal(r2.effet, false);
  assert.equal(factures.length, 1);
});

test("paiement tardif : rien n'est activé, un seul remboursement « a_traiter »", async () => {
  reinitialiser();
  brouillonPaye();
  abonnements[0].statut = "annule";
  const r = await finaliserAbonnementPresence({ transaction_id: "t1", payment_intent_id: "pi_1" });
  assert.equal(r.paiementTardif, true);
  assert.equal(abonnements[0].statut, "annule");
  await finaliserAbonnementPresence({ transaction_id: "t1", payment_intent_id: "pi_1" });
  assert.equal(remboursements.length, 1);
  assert.equal(remboursements[0].motif, MOTIF_PAIEMENT_TARDIF_PRESENCE);
  assert.equal(factures.length, 0);
});

// ─── Gratuité d'amorçage automatique ────────────────────────────
test("gratuité active : toute fiche publiée a les droits du niveau offert, sans souscrire", async () => {
  reinitialiser();
  configs.push({ type_acteur: "pharmacie", pays_id: "cm", gratuite_active: true, gratuite_niveau_id: "std", gratuite_jusqu_au: null, grace_jours: 7 });
  const r = await resoudreDroitsPresence("pharmacie", "ph1");
  assert.equal(r.statut_abonnement, "gratuite");
  assert.equal(r.droits.contact_direct, true);
  // Fiche jamais publiée : pas de droits, même gratuits ; déjà publiée et
  // en re-modération : droits conservés.
  assert.equal((await resoudreDroitsPresence("pharmacie", "ph2")).droits.contact_direct, false);
  assert.equal((await resoudreDroitsPresence("pharmacie", "ph3")).droits.contact_direct, true);
  // Date de fin passée : retour au palier Basique.
  configs[0].gratuite_jusqu_au = ajouterJours(AUJ, -1);
  assert.equal((await resoudreDroitsPresence("pharmacie", "ph1")).statut_abonnement, "aucun");
});

// ─── Pièces justificatives ──────────────────────────────────────
test("restitution publique : pièces d'identité, agréments, CNI et attestation jamais exposés", () => {
  const p = filtrerPharmacie({
    nom: "X", piece_identite_nom: "a", piece_identite_url: "b", document_agrement_nom: "c", document_agrement_url: "d",
  }, niveaux.std);
  for (const cle of ["piece_identite_nom", "piece_identite_url", "document_agrement_nom", "document_agrement_url"]) {
    assert.equal(cle in p, false, cle);
  }
  const m = filtrerMedecin({ medecin_id: "m1", cni_url: "c", attestation_url: "a", utilisateur: {} }, niveaux.med);
  assert.equal("cni_url" in m, false);
  assert.equal("attestation_url" in m, false);
});

// ─── Compteur de vues ───────────────────────────────────────────
test("vues : robots écartés, empreinte stable par jour et non réversible", async () => {
  assert.equal(estRobot("Googlebot/2.1"), true);
  assert.equal(estRobot(undefined), true);
  assert.equal(estRobot("Mozilla/5.0 (Windows NT 10.0)"), false);
  assert.equal(estRobot("Dart/3.5 (dart:io)"), false);
  const base = { type: "pharmacie", acteur_id: "ph1", jour: AUJ, ip: "1.2.3.4", userAgent: "Mozilla" };
  const e1 = empreinteVisiteur(base);
  assert.equal(e1, empreinteVisiteur(base));
  assert.notEqual(e1, empreinteVisiteur({ ...base, jour: ajouterJours(AUJ, 1) }));
  assert.equal(e1.includes("1.2.3.4"), false);
  // Identifiant d'installation : deux mobiles derrière la même IP (NAT) et
  // le même User-Agent restent deux visiteurs.
  const nat = { ...base, userAgent: "Dart/3.5 (dart:io)" };
  assert.notEqual(
    empreinteVisiteur({ ...nat, installation: "a".repeat(32) }),
    empreinteVisiteur({ ...nat, installation: "b".repeat(32) })
  );
  assert.equal(installationDe({ headers: { "x-installation-id": "0123456789abcdef0123" } }), "0123456789abcdef0123");
  assert.equal(installationDe({ headers: { "x-installation-id": "court" } }), null);
  assert.equal(installationDe({ headers: { "x-installation-id": "identifiant avec espaces;;" } }), null);
  // Admin et gestionnaire : jamais comptés (aucune requête SQL).
  assert.deepEqual(await enregistrerVueFiche({ req: { utilisateur: { role: "admin" }, headers: {} }, type: "pharmacie", acteur_id: "ph1" }), { comptee: false });
  assert.deepEqual(await enregistrerVueFiche({ req: { headers: { "user-agent": "Mozilla" } }, type: "pharmacie", acteur_id: "ph1", gestionnaire: true }), { comptee: false });
});

test("statistiques : totaux 7 j / période / total, série complète avec jours à 0", async () => {
  reinitialiser();
  vues.push(
    { type_acteur: "pharmacie", acteur_id: "ph1", jour: AUJ, vues: 5, visiteurs: 3 },
    { type_acteur: "pharmacie", acteur_id: "ph1", jour: ajouterJours(AUJ, -10), vues: 2, visiteurs: 2 },
    { type_acteur: "pharmacie", acteur_id: "ph1", jour: ajouterJours(AUJ, -100), vues: 7, visiteurs: 4 },
  );
  const s = await statistiquesFiche({ type: "pharmacie", acteur_id: "ph1", jours: 30, detaillees: true });
  assert.deepEqual(s.totaux.sept_jours, { vues: 5, visiteurs: 3 });
  assert.deepEqual(s.totaux.periode, { jours: 30, vues: 7, visiteurs: 5 });
  assert.deepEqual(s.totaux.depuis_le_debut, { vues: 14, visiteurs: 9 });
  assert.equal(s.serie.length, 30);
  assert.equal(s.serie.at(-1).vues, 5);
  assert.equal(s.serie.filter((j) => j.vues > 0).length, 2);
});
