// src/tests/liberationDifferee.test.js
// Libération différée des fonds — Phase 2 : tests des libs PURES
// (lib/delaiLiberation.js, lib/codeConsultation.js). Aucune base requise.
// Lancement : node --test src/tests/liberationDifferee.test.js

import test from "node:test";
import assert from "node:assert/strict";
import {
  HEURES_MAX,
  calculerDateLiberation,
  delaiLiberationEcoule,
  etatLiberation,
  heuresDelaiValides,
} from "../lib/delaiLiberation.js";
import {
  MAX_TENTATIVES,
  appliquerEchecCode,
  codeCorrespond,
  etatVerrou,
  normaliserCode,
} from "../lib/codeConsultation.js";

const T0 = new Date("2026-10-07T10:00:00.000Z");
const heures = (n) => n * 60 * 60 * 1000;

test("heuresDelaiValides : entiers de 0 à 720 uniquement", () => {
  assert.equal(heuresDelaiValides(0), true);
  assert.equal(heuresDelaiValides(48), true);
  assert.equal(heuresDelaiValides(HEURES_MAX), true);
  assert.equal(heuresDelaiValides(-1), false);
  assert.equal(heuresDelaiValides(HEURES_MAX + 1), false);
  assert.equal(heuresDelaiValides(12.5), false);
  assert.equal(heuresDelaiValides("24"), false);
  assert.equal(heuresDelaiValides(null), false);
  assert.equal(heuresDelaiValides(undefined), false);
});

test("calculerDateLiberation : termine_le + T heures", () => {
  assert.equal(calculerDateLiberation(T0, 24).getTime(), T0.getTime() + heures(24));
  assert.equal(calculerDateLiberation(T0.toISOString(), 0).getTime(), T0.getTime());
  assert.throws(() => calculerDateLiberation(T0, -3), /invalide/);
  assert.throws(() => calculerDateLiberation("pas une date", 3), /invalide/);
});

test("delaiLiberationEcoule : borne inclusive, T = 0 immédiat", () => {
  const rdv = { termine_le: T0, delai_liberation_heures: 24 };
  assert.equal(delaiLiberationEcoule(rdv, new Date(T0.getTime() + heures(24) - 1)), false);
  assert.equal(delaiLiberationEcoule(rdv, new Date(T0.getTime() + heures(24))), true);
  assert.equal(delaiLiberationEcoule(rdv, new Date(T0.getTime() + heures(25))), true);
  assert.equal(delaiLiberationEcoule({ termine_le: T0, delai_liberation_heures: 0 }, T0), true);
});

test("delaiLiberationEcoule : jamais libérable sans fin constatée ni T figé", () => {
  const loin = new Date(T0.getTime() + heures(10000));
  assert.equal(delaiLiberationEcoule({ termine_le: null, delai_liberation_heures: 24 }, loin), false);
  assert.equal(delaiLiberationEcoule({ termine_le: T0, delai_liberation_heures: null }, loin), false);
  assert.equal(delaiLiberationEcoule({}, loin), false);
  assert.equal(delaiLiberationEcoule(null, loin), false);
});

test("etatLiberation : non_termine / en_attente / echu", () => {
  const nonTermine = etatLiberation({ termine_le: null, delai_liberation_heures: null }, T0);
  assert.equal(nonTermine.etat, "non_termine");
  assert.equal(nonTermine.date_liberation, null);

  const rdv = { termine_le: T0, delai_liberation_heures: 6 };
  const attente = etatLiberation(rdv, new Date(T0.getTime() + heures(2)));
  assert.equal(attente.etat, "en_attente");
  assert.equal(attente.temps_restant_ms, heures(4));
  assert.equal(attente.date_liberation.getTime(), T0.getTime() + heures(6));

  const echu = etatLiberation(rdv, new Date(T0.getTime() + heures(6)));
  assert.equal(echu.etat, "echu");
  assert.equal(echu.temps_restant_ms, 0);
});

test("normaliserCode : espaces retirés, majuscules, non-texte => vide", () => {
  assert.equal(normaliserCode(" ab12 cd34 "), "AB12CD34");
  assert.equal(normaliserCode(12345678), "");
  assert.equal(normaliserCode(null), "");
});

test("codeCorrespond : insensible à la casse/espaces, jamais sur vide ou longueur différente", () => {
  assert.equal(codeCorrespond("ab12cd34", "AB12CD34"), true);
  assert.equal(codeCorrespond("AB12 CD34", "AB12CD34"), true);
  assert.equal(codeCorrespond("AB12CD35", "AB12CD34"), false);
  assert.equal(codeCorrespond("AB12CD3", "AB12CD34"), false);
  assert.equal(codeCorrespond("", ""), false);
  assert.equal(codeCorrespond(undefined, "AB12CD34"), false);
});

test("etatVerrou : actif tant que la date n'est pas atteinte (borne exclusive)", () => {
  const jusqua = new Date(T0.getTime() + 90 * 1000);
  const rdv = { code_verrouille_jusqu_a: jusqua };
  assert.deepEqual(etatVerrou(rdv, T0), { verrouille: true, reessayer_dans_secondes: 90 });
  assert.equal(etatVerrou(rdv, jusqua).verrouille, false);
  assert.equal(etatVerrou(rdv, new Date(jusqua.getTime() + 1)).verrouille, false);
  assert.equal(etatVerrou({ code_verrouille_jusqu_a: null }, T0).verrouille, false);
});

test("appliquerEchecCode : compteur croissant puis verrou et remise à zéro", () => {
  const options = { maxTentatives: 3, dureeVerrouMinutes: 10 };

  const premier = appliquerEchecCode({ tentatives_code_echouees: 0 }, T0, options);
  assert.equal(premier.verrouille, false);
  assert.equal(premier.donnees.tentatives_code_echouees, 1);
  assert.equal(premier.tentatives_restantes, 2);
  assert.equal(premier.donnees.code_verrouille_jusqu_a, null);

  const dernier = appliquerEchecCode({ tentatives_code_echouees: 2 }, T0, options);
  assert.equal(dernier.verrouille, true);
  assert.equal(dernier.donnees.tentatives_code_echouees, 0);
  assert.equal(dernier.donnees.code_verrouille_jusqu_a.getTime(), T0.getTime() + 10 * 60 * 1000);
  assert.equal(dernier.reessayer_dans_secondes, 600);
});

test("appliquerEchecCode : valeurs par défaut cohérentes", () => {
  assert.ok(Number.isInteger(MAX_TENTATIVES) && MAX_TENTATIVES > 0);
  const r = appliquerEchecCode({ tentatives_code_echouees: null }, T0);
  assert.equal(r.donnees.tentatives_code_echouees, 1);
});