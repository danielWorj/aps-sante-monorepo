// src/tests/publicite.test.js
// Publicité v9 : disponibilité des rangs, délai de paiement, validation du
// formulaire, devis (montant initial + frais d'agrégateur), rendu des
// messages WhatsApp éditables et finalisation du paiement (payée, rejeu,
// paiement tardif). Base, Cloudinary et WhatsApp SIMULÉS.
// Lancement : node --experimental-test-module-mocks --test src/tests/publicite.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

const base = { publicites: [], transactions: [], remboursements: [], factures: [], envois: [], modeles: {} };

const correspond = (o, where = {}) =>
  Object.entries(where).every(([k, v]) => {
    if (k === "OR") return v.some((w) => correspond(o, w));
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("not" in v) return o[k] !== v.not;
      if ("lt" in v && !(o[k] < v.lt)) return false;
      if ("gt" in v && !(o[k] > v.gt)) return false;
      if ("lte" in v && !(o[k] <= v.lte)) return false;
      return true;
    }
    return o[k] === v;
  });

const avecRelations = (p) =>
  p && {
    ...p,
    emplacement_publicitaire: { libelle: "Annuaire médecins" },
    pays: { code_iso2: "CM" },
    utilisateur: { prenom: "Awa", nom: "Ngo", telephone: "690000000" },
    facture: base.factures.find((f) => f.publicite_id === p.publicite_id) ?? null,
  };

const client = {
  $queryRaw: async () => [{ dernier: 7 }],
  publicite: {
    findUnique: async ({ where, include }) => {
      const p = base.publicites.find((x) => x.publicite_id === where.publicite_id);
      return include ? avecRelations(p) : p ?? null;
    },
    findFirst: async ({ where }) => base.publicites.find((p) => correspond(p, where)) ?? null,
    update: async ({ where, data }) => Object.assign(base.publicites.find((p) => p.publicite_id === where.publicite_id), data),
  },
  transactionPaiement: {
    findUnique: async ({ where }) => base.transactions.find((t) => t.transaction_id === where.transaction_id) ?? null,
    updateMany: async ({ where, data }) => {
      const cibles = base.transactions.filter((t) => correspond(t, where));
      cibles.forEach((t) => Object.assign(t, data));
      return { count: cibles.length };
    },
  },
  remboursementPaiement: {
    findFirst: async ({ where }) => base.remboursements.find((r) => correspond(r, where)) ?? null,
    create: async ({ data }) => (base.remboursements.push(data), data),
  },
  facturePublicite: { create: async ({ data }) => (base.factures.push(data), data) },
  fraisAgregateur: { findUnique: async () => ({ taux: 0.03, montant_fixe: 0 }) },
  modeleMessageWhatsapp: { findUnique: async ({ where }) => base.modeles[where.code] ?? null },
};
client.$transaction = async (fn) => fn(client);

mock.module("../lib/prisma.js", { defaultExport: client });
mock.module("../lib/audit.js", { namedExports: { journaliserAudit: async () => {} } });
mock.module("../lib/cloudinaryService.js", { namedExports: { construireUrl: (n) => `https://cdn/${n}`, televerserFichier: async () => ({ nom: "x" }), supprimerFichier: async () => {} } });
mock.module("../services/whatsapp.service.js", {
  namedExports: {
    envoyerWhatsapp: async (p) => (base.envois.push(p), { statut: "envoye" }),
    ErreurWhatsapp: class extends Error {},
  },
});

const svc = await import("../services/publicite.service.js");
const { construireDevisPublicite } = await import("../services/facturePublicite.service.js");
const { rendreTexte, aplatirPourMeta } = await import("../services/modeleMessageWhatsapp.service.js");
const { finaliserPaiementPublicite, MOTIF_PAIEMENT_TARDIF_PUBLICITE } = await import("../services/finalisationPublicite.service.js");

const J = (s) => svc.lireJour(s);

test("lireJour : format strict AAAA-MM-JJ, date réelle", () => {
  assert.equal(svc.versJourIso(J("2026-11-05")), "2026-11-05");
  assert.equal(J("2026-02-30"), null);
  assert.equal(J("05/11/2026"), null);
});

test("prochaineDateLibre : saute les périodes prises, se glisse dans un trou assez long", () => {
  const periodes = [
    { debut: J("2026-11-01"), fin: J("2026-11-08") },
    { debut: J("2026-11-15"), fin: J("2026-11-22") },
  ];
  assert.equal(svc.versJourIso(svc.prochaineDateLibre(periodes, 7, J("2026-10-25"))), "2026-10-25");
  assert.equal(svc.versJourIso(svc.prochaineDateLibre(periodes, 7, J("2026-10-28"))), "2026-11-08");
  assert.equal(svc.versJourIso(svc.prochaineDateLibre(periodes, 8, J("2026-10-28"))), "2026-11-22");
});

test("calculerDateLimitePaiement : délai, plafonné à la fin du premier jour de diffusion", () => {
  const maintenant = new Date("2026-10-18T10:00:00Z");
  assert.equal(svc.calculerDateLimitePaiement(maintenant, J("2026-12-01")).toISOString(), new Date(maintenant.getTime() + svc.DELAI_PAIEMENT_H * 3_600_000).toISOString());
  assert.equal(svc.calculerDateLimitePaiement(maintenant, J("2026-10-19")).toISOString(), "2026-10-20T00:00:00.000Z");
});

test("validerChampsReservation : requis, formats, mode partiel", () => {
  const ok = {
    titre: " Pharmacie du Lac ", description: "Promo", telephone_contact: "+237 690 00 00 00",
    annonceur_nom: "Awa", annonceur_telephone: "690000000", annonceur_email: "awa@exemple.cm",
  };
  assert.equal(svc.validerChampsReservation(ok).titre, "Pharmacie du Lac");
  assert.throws(() => svc.validerChampsReservation({ ...ok, description: "" }), { code: "CHAMPS_REQUIS" });
  assert.throws(() => svc.validerChampsReservation({ ...ok, annonceur_email: "pas-un-email" }), { code: "EMAIL_INVALIDE" });
  assert.deepEqual(svc.validerChampsReservation({ titre: "Nouveau" }, { partiel: true }), { titre: "Nouveau" });
  assert.throws(() => svc.validerChampsReservation({ titre: "  " }, { partiel: true }), { code: "CHAMPS_REQUIS" });
});

test("devis : montant initial, frais d'agrégateur en sus, montant final", () => {
  const devis = construireDevisPublicite({
    publicite: { publicite_id: "p", titre: "Promo", rang: 1, montant: "50000", devise: "xaf", date_debut: J("2026-11-01"), date_fin: J("2026-11-08") },
    emplacement: { libelle: "Accueil" },
    frais_agregateur: { agregateur: "campay", ligne: { taux: 0.03 }, montant: 1500 },
  });
  assert.equal(devis.sous_total, 50000);
  assert.equal(devis.frais_agregateur, 1500);
  assert.equal(devis.total, 51500);
  assert.equal(devis.entete.duree_jours, 7);
  assert.equal(devis.entete.date_fin_incluse, "2026-11-07");
});

test("modèles de message : variables remplacées, inconnues conservées, aplati pour Meta", () => {
  assert.equal(rendreTexte("Bonjour {annonceur}, {inconnue}", { annonceur: "Awa" }), "Bonjour Awa, {inconnue}");
  assert.equal(aplatirPourMeta("Ligne 1\n  Ligne 2\tfin"), "Ligne 1 — Ligne 2 fin");
});

function reinitialiser() {
  base.publicites = [];
  base.transactions = [];
  base.remboursements = [];
  base.factures = [];
  base.envois = [];
  base.modeles = { publicite_payee: { code: "publicite_payee", actif: true, texte: "Merci {annonceur} : facture {numero_facture}, {recapitulatif}", langue: "fr" } };
}

const demain = svc.ajouterJours(svc.jourUtc(), 1);
const pub = (extra = {}) => ({
  publicite_id: "pub-1", utilisateur_id: "u-1", emplacement_publicitaire_id: "e-1", pays_id: "cm", rang: 1,
  titre: "Promo", montant: 50000, devise: "xaf", annonceur_nom: "Awa", annonceur_telephone: "690000000",
  date_debut: demain, date_fin: svc.ajouterJours(demain, 7), statut: "en_attente_paiement", ...extra,
});

test("finalisation : publicité payée, facture émise, WhatsApp de confirmation", async () => {
  reinitialiser();
  base.publicites.push(pub());
  base.transactions.push({ transaction_id: "t-1", publicite_id_cible: "pub-1", statut: "en_attente", montant: 51500, fournisseur: "campay", frais_envoi_id: "f" });

  const r = await finaliserPaiementPublicite({ transaction_id: "t-1", campay_reference: "ref" });
  assert.equal(r.effet, true);
  assert.equal(base.publicites[0].statut, "payee");
  assert.equal(base.transactions[0].statut, "reussie");
  assert.equal(base.factures.length, 1);
  assert.equal(base.factures[0].numero, `FAC-PUB-${new Date().getUTCFullYear()}-000007`);
  assert.equal(base.factures[0].snapshot.frais_agregateur, 1500);
  assert.equal(base.envois.length, 1);
  assert.match(base.envois[0].texte, /FAC-PUB-.*total payé 51\s500 FCFA/);
  assert.equal(base.envois[0].cle, "publicite_payee:pub-1");

  // Rejeu (webhook + cron) : aucun effet.
  const rejeu = await finaliserPaiementPublicite({ transaction_id: "t-1", campay_reference: "ref" });
  assert.equal(rejeu.effet, false);
  assert.equal(base.factures.length, 1);
});

test("finalisation : expirée mais place libre -> encore payable", async () => {
  reinitialiser();
  base.publicites.push(pub({ statut: "expiree" }));
  base.transactions.push({ transaction_id: "t-2", publicite_id_cible: "pub-1", statut: "en_attente", montant: 50000, fournisseur: "stripe" });
  const r = await finaliserPaiementPublicite({ transaction_id: "t-2", payment_intent_id: "pi" });
  assert.equal(r.effet, true);
  assert.equal(base.publicites[0].statut, "payee");
});

test("finalisation : expirée et place reprise -> paiement tardif, remboursement manuel", async () => {
  reinitialiser();
  base.publicites.push(pub({ statut: "expiree" }));
  base.publicites.push(pub({ publicite_id: "pub-2", statut: "payee" }));
  base.transactions.push({ transaction_id: "t-3", publicite_id_cible: "pub-1", statut: "en_attente", montant: 50000, fournisseur: "stripe" });
  const r = await finaliserPaiementPublicite({ transaction_id: "t-3", payment_intent_id: "pi" });
  assert.equal(r.paiementTardif, true);
  assert.equal(base.publicites[0].statut, "expiree");
  assert.equal(base.remboursements.length, 1);
  assert.equal(base.remboursements[0].motif, MOTIF_PAIEMENT_TARDIF_PUBLICITE);
  assert.equal(base.envois.length, 0);
});
