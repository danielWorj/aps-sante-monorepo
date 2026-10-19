// src/tests/reputationMedecin.test.js
// Réputation médecin : période et découpage du tableau de bord (jour /
// semaine / mois, seaux partiels, période précédente), totaux et séries,
// variations, carte des créneaux en heure murale ; validation et
// éligibilité des avis, identité publique de l'auteur, recalcul de la note
// moyenne. Base SIMULÉE.
// Lancement : node --experimental-test-module-mocks --test src/tests/reputationMedecin.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

const majs = [];
let avisPublies = [];
const prismaSimule = {
  avisMedecin: {
    aggregate: async ({ where }) => {
      const l = avisPublies.filter((a) => a.medecin_id === where.medecin_id);
      return { _count: { _all: l.length }, _avg: { note: l.length ? l.reduce((s, a) => s + a.note, 0) / l.length : null } };
    },
  },
  medecin: { update: async (args) => { majs.push(args); return args.data; } },
};
mock.module("../lib/prisma.js", { defaultExport: prismaSimule });

const {
  resoudrePeriode, periodePrecedente, construireSeaux, debutSeau, variation,
  totaliser, construireSeries, caseHebdomadaire,
} = await import("../services/tableauDeBordMedecin.service.js");
const {
  normaliserSaisieAvis, verifierEligibiliteAvis, nomPublicAuteur, presenterAvisPublic,
  recalculerNoteMedecin, DELAI_AVIS_JOURS,
} = await import("../services/avisMedecin.service.js");

const J = (s) => new Date(`${s}T00:00:00Z`);
const MAINTENANT = new Date("2026-10-19T10:00:00Z");

/* ------------------------------- Période ------------------------------- */

test("période par défaut : 30 derniers jours, par jour", () => {
  const p = resoudrePeriode({}, MAINTENANT);
  assert.equal(p.du.toISOString().slice(0, 10), "2026-09-20");
  assert.equal(p.au.toISOString().slice(0, 10), "2026-10-19");
  assert.equal(p.jours, 30);
  assert.equal(p.granularite, "jour");
});

test("granularité automatique selon la durée, fin future ramenée à aujourd'hui", () => {
  assert.equal(resoudrePeriode({ du: "2026-07-01", au: "2026-10-19" }, MAINTENANT).granularite, "semaine");
  assert.equal(resoudrePeriode({ du: "2025-11-01", au: "2026-10-19" }, MAINTENANT).granularite, "mois");
  assert.equal(resoudrePeriode({ du: "2026-10-01", au: "2027-01-01" }, MAINTENANT).au.toISOString().slice(0, 10), "2026-10-19");
});

test("période invalide : 400", () => {
  assert.ok(resoudrePeriode({ du: "2026-02-30" }, MAINTENANT).erreur);
  assert.ok(resoudrePeriode({ du: "2026-10-10", au: "2026-10-01" }, MAINTENANT).erreur);
  assert.ok(resoudrePeriode({ du: "2023-01-01" }, MAINTENANT).erreur);
  assert.ok(resoudrePeriode({ granularite: "heure" }, MAINTENANT).erreur);
  assert.ok(resoudrePeriode({ du: "2026-01-01", granularite: "jour" }, MAINTENANT).erreur);
});

test("période précédente : même durée, juste avant", () => {
  const p = periodePrecedente(resoudrePeriode({ du: "2026-10-01", au: "2026-10-10" }, MAINTENANT));
  assert.equal(p.du.toISOString().slice(0, 10), "2026-09-21");
  assert.equal(p.au.toISOString().slice(0, 10), "2026-09-30");
});

test("seaux : semaines du lundi et mois bornés à la période", () => {
  assert.equal(debutSeau(J("2026-10-18"), "semaine").toISOString().slice(0, 10), "2026-10-12"); // dimanche -> lundi
  const semaines = construireSeaux(J("2026-10-01"), J("2026-10-19"), "semaine");
  assert.deepEqual(semaines.map((s) => s.cle), ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]);
  assert.equal(semaines[0].debut, "2026-10-01");
  assert.equal(semaines[3].fin, "2026-10-19");
  const mois = construireSeaux(J("2026-01-15"), J("2026-03-02"), "mois");
  assert.deepEqual(mois.map((s) => [s.cle, s.debut, s.fin]), [
    ["2026-01-01", "2026-01-15", "2026-01-31"],
    ["2026-02-01", "2026-02-01", "2026-02-28"],
    ["2026-03-01", "2026-03-01", "2026-03-02"],
  ]);
});

test("variation : % arrondi, null quand la base est nulle", () => {
  assert.equal(variation(15, 10), 50);
  assert.equal(variation(5, 10), -50);
  assert.equal(variation(0, 0), 0);
  assert.equal(variation(3, 0), null);
});

/* ------------------------------ Agrégation ------------------------------ */

const collecte = {
  vues: [
    { jour: J("2026-10-05"), vues: 10, visiteurs: 8 },
    { jour: J("2026-10-13"), vues: 30, visiteurs: 12 },
  ],
  engagements: [
    { jour: J("2026-10-05"), type: "clic_rdv", nombre: 3 },
    { jour: J("2026-10-13"), type: "partage", nombre: 1 },
  ],
  rdvCrees: [
    { date_creation: new Date("2026-10-05T09:00:00Z"), type_rdv: "physique", compte_escrow: { escrow_id: "e1" } },
    { date_creation: new Date("2026-10-06T09:00:00Z"), type_rdv: "physique", compte_escrow: null },
    { date_creation: new Date("2026-10-14T09:00:00Z"), type_rdv: "teleconsultation", compte_escrow: { escrow_id: "e2" } },
  ],
  consultations: [
    { termine_le: new Date("2026-10-07T11:00:00Z"), type_rdv: "physique" },
    { termine_le: new Date("2026-10-15T11:00:00Z"), type_rdv: "teleconsultation" },
  ],
  annulations: [{ date_annulation: new Date("2026-10-08T08:00:00Z"), annule_par: "medecin" }],
  avis: [
    { date_creation: new Date("2026-10-08T08:00:00Z"), note: 5 },
    { date_creation: new Date("2026-10-09T08:00:00Z"), note: 4 },
  ],
  nouveauxPatients: [new Date("2026-10-05T09:00:00Z")],
};

test("totaux : audience, activité, conversion et note de la période", () => {
  const t = totaliser(collecte);
  assert.equal(t.audience.vues, 40);
  assert.equal(t.audience.visiteurs, 20);
  assert.equal(t.audience.engagements, 4);
  assert.equal(t.audience.engagements_par_type.clic_rdv, 3);
  assert.equal(t.activite.rdv_demandes, 3);
  assert.equal(t.activite.rdv_payes, 2);
  assert.equal(t.activite.taux_paiement, 66.7);
  assert.equal(t.activite.teleconsultations, 1);
  assert.equal(t.activite.annulations_par_vous, 1);
  assert.equal(t.activite.taux_conversion, 15);
  assert.equal(t.reputation.note_moyenne, 4.5);
});

test("séries par semaine : chaque fait tombe dans son seau", () => {
  const seaux = construireSeaux(J("2026-10-05"), J("2026-10-18"), "semaine");
  const s = construireSeries(collecte, seaux, "semaine");
  assert.deepEqual(s.audience.map((x) => x.vues), [10, 30]);
  assert.deepEqual(s.audience.map((x) => x.clic_rdv), [3, 0]);
  assert.deepEqual(s.activite.map((x) => x.rdv_demandes), [2, 1]);
  assert.deepEqual(s.activite.map((x) => x.consultations), [1, 1]);
  assert.deepEqual(s.reputation.map((x) => x.note_moyenne), [4.5, null]);
});

test("carte des créneaux : jour et tranche en heure murale du pays", () => {
  // Lundi 19/10 à 11h30 UTC = 12h30 à Douala (UTC+1) -> après-midi.
  assert.deepEqual(caseHebdomadaire(new Date("2026-10-19T11:30:00Z"), "Africa/Douala"), { jourSemaine: 0, tranche: 1 });
  // Dimanche 18/10 à 23h30 UTC = lundi 00h30 à Douala -> lundi matin.
  assert.deepEqual(caseHebdomadaire(new Date("2026-10-18T23:30:00Z"), "Africa/Douala"), { jourSemaine: 0, tranche: 0 });
});

/* --------------------------------- Avis --------------------------------- */

test("saisie d'avis : note globale obligatoire, critères bornés, commentaire nettoyé", () => {
  assert.ok(normaliserSaisieAvis({}).erreur);
  assert.ok(normaliserSaisieAvis({ note: 6 }).erreur);
  assert.ok(normaliserSaisieAvis({ note: 4, note_ecoute: 0 }).erreur);
  assert.ok(normaliserSaisieAvis({ note: 4, recommande: "oui" }).erreur);
  const ok = normaliserSaisieAvis({ note: "4", note_ecoute: 5, recommande: true, commentaire: "  Très bien  ", anonyme: true });
  assert.deepEqual(ok.donnees, { note: 4, note_ecoute: 5, recommande: true, commentaire: "Très bien", anonyme: true });
  assert.deepEqual(normaliserSaisieAvis({ commentaire: "" }, { partiel: true }).donnees, { commentaire: null });
});

test("éligibilité : patient du RDV, consultation terminée, un seul avis, délai", () => {
  const rdv = { patient: { utilisateur_id: "u1" }, termine_le: new Date("2026-10-10T10:00:00Z"), statut: "confirme", avis_medecin: null };
  assert.equal(verifierEligibiliteAvis(rdv, "u1", MAINTENANT), null);
  assert.equal(verifierEligibiliteAvis(null, "u1", MAINTENANT).erreur.status, 404);
  assert.equal(verifierEligibiliteAvis(rdv, "u2", MAINTENANT).erreur.code, "PAS_LE_PATIENT");
  assert.equal(verifierEligibiliteAvis({ ...rdv, termine_le: null }, "u1", MAINTENANT).erreur.code, "CONSULTATION_NON_TERMINEE");
  assert.equal(verifierEligibiliteAvis({ ...rdv, termine_le: null, statut: "honore", date_creneau: rdv.termine_le }, "u1", MAINTENANT), null);
  assert.equal(verifierEligibiliteAvis({ ...rdv, avis_medecin: { avis_id: "a" } }, "u1", MAINTENANT).erreur.code, "AVIS_DEJA_DEPOSE");
  const tropTard = new Date(MAINTENANT.getTime() - (DELAI_AVIS_JOURS + 1) * 86_400_000);
  assert.equal(verifierEligibiliteAvis({ ...rdv, termine_le: tropTard }, "u1", MAINTENANT).erreur.code, "DELAI_AVIS_DEPASSE");
});

test("identité publique : « Prénom N. », jamais le nom complet ni l'identifiant", () => {
  assert.equal(nomPublicAuteur({ prenom: "Aïcha", nom: "mballa" }), "Aïcha M.");
  assert.equal(nomPublicAuteur({ prenom: "Aïcha", nom: "Mballa" }, true), "Patient vérifié");
  const a = presenterAvisPublic({
    avis_id: "a1", note: 5, utilisateur_id: "u1", rdv_id: "r1", anonyme: false,
    utilisateur: { prenom: "Paul", nom: "Etoa" }, rendez_vous: { type_rdv: "physique" },
    reponse_medecin: "Merci", date_reponse: MAINTENANT, date_creation: MAINTENANT,
  });
  assert.equal(a.auteur, "Paul E.");
  assert.equal(a.patient_verifie, true);
  assert.equal(a.reponse.texte, "Merci");
  assert.equal(JSON.stringify(a).includes("u1"), false);
});

test("note moyenne de la fiche : avis publiés seulement, NULL sans avis", async () => {
  avisPublies = [{ medecin_id: "m1", note: 5 }, { medecin_id: "m1", note: 4 }, { medecin_id: "m1", note: 4 }];
  assert.deepEqual(await recalculerNoteMedecin("m1"), { nombre_avis: 3, note_moyenne: 4.33 });
  avisPublies = [];
  assert.deepEqual(await recalculerNoteMedecin("m1"), { nombre_avis: 0, note_moyenne: null });
  assert.equal(majs.length, 2);
});
