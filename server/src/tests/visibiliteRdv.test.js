// src/tests/visibiliteRdv.test.js
// Libération différée des fonds — Phase 2 : projection d'un RDV selon le rôle
// (visibiliteRole.service.js, projeterRdvPourRole). Aucune base requise.
// Lancement : node --test src/tests/visibiliteRdv.test.js

import test from "node:test";
import assert from "node:assert/strict";
import { ROLES_VISIBILITE, projeterRdvPourRole } from "../services/visibiliteRole.service.js";

const T0 = new Date("2026-10-07T10:00:00.000Z");

function rdvBrut(surcharge = {}) {
  return {
    rdv_id: "rdv-1",
    statut: "confirme",
    code_unique: "K7M2XP",
    qr_token_secret: "secret-qr",
    tentatives_code_echouees: 3,
    code_verrouille_jusqu_a: new Date("2026-10-07T11:00:00.000Z"),
    termine_le: null,
    delai_liberation_heures: null,
    medecin: { utilisateur: { nom: "Dupont", prenom: "Anne" } },
    ...surcharge,
  };
}

test("médecin : jamais code_unique, ni secret QR, ni état anti force-brute", () => {
  const sortie = projeterRdvPourRole(rdvBrut(), ROLES_VISIBILITE.MEDECIN);
  assert.equal("code_unique" in sortie, false);
  assert.equal("qr_token_secret" in sortie, false);
  assert.equal("tentatives_code_echouees" in sortie, false);
  assert.equal("code_verrouille_jusqu_a" in sortie, false);
  assert.equal(sortie.rdv_id, "rdv-1");
});

test("patient et admin : code_unique conservé, jamais le secret QR ni l'état anti force-brute", () => {
  for (const role of [ROLES_VISIBILITE.PATIENT, ROLES_VISIBILITE.ADMIN]) {
    const sortie = projeterRdvPourRole(rdvBrut(), role);
    assert.equal(sortie.code_unique, "K7M2XP");
    assert.equal("qr_token_secret" in sortie, false);
    assert.equal("tentatives_code_echouees" in sortie, false);
    assert.equal("code_verrouille_jusqu_a" in sortie, false);
  }
});

test("rôle inconnu ou absent : vue la plus restrictive (sans code)", () => {
  assert.equal("code_unique" in projeterRdvPourRole(rdvBrut(), "intrus"), false);
  assert.equal("code_unique" in projeterRdvPourRole(rdvBrut(), undefined), false);
});

test("liberation_prevue_le : null avant la fin, termine_le + T après (recalculée)", () => {
  assert.equal(projeterRdvPourRole(rdvBrut(), ROLES_VISIBILITE.PATIENT).liberation_prevue_le, null);

  const termine = rdvBrut({ termine_le: T0, delai_liberation_heures: 48 });
  const sortie = projeterRdvPourRole(termine, ROLES_VISIBILITE.MEDECIN);
  assert.equal(sortie.liberation_prevue_le.getTime(), T0.getTime() + 48 * 60 * 60 * 1000);
  assert.equal(sortie.delai_liberation_heures, 48);
});

test("fonction pure : l'objet d'origine n'est pas modifié ; les objets imbriqués sont conservés", () => {
  const brut = rdvBrut();
  const avant = JSON.stringify(brut);
  const sortie = projeterRdvPourRole(brut, ROLES_VISIBILITE.MEDECIN);
  assert.equal(JSON.stringify(brut), avant);
  assert.deepEqual(sortie.medecin, brut.medecin);
});