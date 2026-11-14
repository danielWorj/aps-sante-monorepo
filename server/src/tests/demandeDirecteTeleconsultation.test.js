// src/tests/demandeDirecteTeleconsultation.test.js
// Demande DIRECTE à un médecin sans créneau libre (accepte / refuse sous
// 24 h, puis le patient change de médecin ou diffuse sa demande) et règle
// « téléconsultation seulement après un RDV physique effectué ».
// Base SIMULÉE : aucune base requise.
// Lancement : node --experimental-test-module-mocks --test src/tests/demandeDirecteTeleconsultation.test.js

import test, { mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

const db = {};
mock.module("../lib/prisma.js", { defaultExport: db });

const notifications = [];
mock.module("../services/notification.service.js", {
  namedExports: {
    creerNotifications: async (liste) => {
      notifications.push(...liste);
      return { count: liste.length };
    },
  },
});
mock.module("../lib/cloudinaryService.js", { namedExports: { construireUrl: (u) => u } });
mock.module("../services/parametreDelaiConfirmation.service.js", {
  namedExports: { resoudreDelaiConfirmationMedecin: async () => ({ heures: 4 }) },
});
const droitsOuverts = { droits: { prise_rdv_en_ligne: true } };
mock.module("../lib/droitsPresence.js", {
  namedExports: {
    droitsPresencePublics: (d) => d,
    filtrerMedecin: (m) => m,
    resoudreDroitsPresence: async () => droitsOuverts,
    resoudreDroitsPresenceEnLot: async (_t, ids) => new Map(ids.map((id) => [id, droitsOuverts])),
  },
});
const etatAgenda = { creneauxLibres: false };
class ErreurCreneau extends Error {}
mock.module("../services/agendaCreneau.service.js", {
  namedExports: {
    ErreurCreneau,
    aDesCreneauxLibres: async () => etatAgenda.creneauxLibres,
    bornesCreneau: () => ({ debut: new Date(0), fin: new Date(0) }),
    fuseauDuMedecin: async () => "Africa/Douala",
    horizonAgendaJours: () => 60,
    reserverCreneau: async () => {},
  },
});

const offres = await import("../services/offreRdv.service.js");
const tele = await import("../services/teleconsultationPrealable.service.js");

const MAINTENANT = new Date("2026-11-06T08:00:00Z");
const H = 3_600_000;
const PATIENT = { patient_id: "pat-1" };
const MEDECIN = {
  medecin_id: "med-1",
  utilisateur_id: "u-med-1",
  specialite_id: "spe-1",
  pays_exercice_id: "pays-1",
  ville_exercice_id: "ville-1",
  teleconsultation_activee: true,
  tarif_indicatif: 15000,
  utilisateur: { nom: "Ngo", prenom: "Anne" },
  specialite: { nom: "Cardiologie" },
  pays_exercice: { fuseau_horaire: "Africa/Douala" },
};

/** Base simulée : chaque test ajuste `rdvPhysiquesEffectues` et l'offre stockée. */
let rdvPhysiquesEffectues;
let offreStockee;
let misesAJour;

beforeEach(() => {
  notifications.length = 0;
  etatAgenda.creneauxLibres = false;
  rdvPhysiquesEffectues = [];
  offreStockee = null;
  misesAJour = [];
  Object.assign(db, {
    medecin: {
      findUnique: async () => MEDECIN,
      count: async () => 1,
      findMany: async ({ where }) =>
        [MEDECIN, { ...MEDECIN, medecin_id: "med-2", utilisateur_id: "u-med-2" }].filter(
          (m) => !where.medecin_id?.not || m.medecin_id !== where.medecin_id.not
        ),
    },
    patient: { findUnique: async () => ({ utilisateur_id: "u-pat-1" }) },
    rendezVous: {
      findFirst: async () => null,
      count: async ({ where }) =>
        rdvPhysiquesEffectues.filter((r) => r.patient_id === where.patient_id && r.medecin_id === where.medecin_id).length,
      findMany: async ({ where }) =>
        rdvPhysiquesEffectues
          .filter((r) => r.patient_id === where.patient_id && where.medecin_id.in.includes(r.medecin_id))
          .map((r) => ({ medecin_id: r.medecin_id })),
    },
    creneauAgenda: { findMany: async () => [] },
    offreRdv: {
      count: async () => 0,
      create: async ({ data }) => {
        offreStockee = { offre_id: "off-1", ...data, medecin_cible: MEDECIN, specialite: MEDECIN.specialite, ville: { nom: "Douala" } };
        return offreStockee;
      },
      findFirst: async () => offreStockee,
      findMany: async ({ where }) =>
        offreStockee && offreStockee.statut === where.statut && offreStockee.echeance_reponse_medecin <= where.echeance_reponse_medecin.lte
          ? [offreStockee]
          : [],
      updateMany: async ({ where, data }) => {
        misesAJour.push({ where, data });
        const statuts = where.statut?.in ?? [where.statut];
        if (!offreStockee || (where.statut && !statuts.includes(offreStockee.statut))) return { count: 0 };
        if (where.offre_id && where.offre_id !== offreStockee.offre_id) return { count: 0 };
        if (where.date_souhaitee?.lte && offreStockee.date_souhaitee > where.date_souhaitee.lte) return { count: 0 };
        Object.assign(offreStockee, data);
        return { count: 1 };
      },
    },
  });
});

const demande = (extra = {}) => ({ medecin_id: "med-1", type_rdv: "physique", jour: "2026-11-09", heure: "10:00", ...extra });

test("téléconsultation refusée sans RDV physique effectué avec ce médecin", async () => {
  await assert.rejects(
    tele.exigerRdvPhysiquePrealable({ patient_id: "pat-1", medecin_id: "med-1", type_rdv: "teleconsultation" }),
    (e) => e.code === tele.CODE_TELECONSULTATION_SANS_RDV_PHYSIQUE && e.status === 409
  );
  // Un RDV physique ne demande rien.
  await tele.exigerRdvPhysiquePrealable({ patient_id: "pat-1", medecin_id: "med-1", type_rdv: "physique" });
  rdvPhysiquesEffectues.push({ patient_id: "pat-1", medecin_id: "med-1" });
  await tele.exigerRdvPhysiquePrealable({ patient_id: "pat-1", medecin_id: "med-1", type_rdv: "teleconsultation" });
});

test("le filtre « RDV physique effectué » exige termine_le ou honore, jamais annulé", () => {
  const f = tele.FILTRE_RDV_PHYSIQUE_EFFECTUE;
  assert.equal(f.type_rdv, "physique");
  assert.deepEqual(f.statut, { not: "annule" });
  assert.deepEqual(f.OR, [{ termine_le: { not: null } }, { statut: "honore" }]);
});

test("demande directe refusée si le médecin a encore des créneaux libres", async () => {
  etatAgenda.creneauxLibres = true;
  await assert.rejects(offres.publierDemandeDirecte(PATIENT, demande(), MAINTENANT), (e) => e.code === "MEDECIN_A_DES_CRENEAUX");
});

test("demande directe en téléconsultation sans RDV physique préalable : refusée", async () => {
  await assert.rejects(
    offres.publierDemandeDirecte(PATIENT, demande({ type_rdv: "teleconsultation" }), MAINTENANT),
    (e) => e.code === "TELECONSULTATION_SANS_RDV_PHYSIQUE"
  );
  // Le patient est aussi notifié du refus.
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "rdv_teleconsultation_refusee");
  assert.equal(notifications[0].utilisateur_id, "u-pat-1");
  assert.equal(notifications[0].donnees.lien, "/profil/med-1");
});

test("demande directe : en attente du médecin 24 h, médecin notifié", async () => {
  const { offre } = await offres.publierDemandeDirecte(PATIENT, demande(), MAINTENANT);
  assert.equal(offre.statut, "en_attente_medecin");
  assert.equal(offre.medecin_cible_id, "med-1");
  // 10:00 à Douala = 09:00 UTC le 09/11 : l'échéance est bien 24 h après la demande.
  assert.equal(offre.date_souhaitee.toISOString(), "2026-11-09T09:00:00.000Z");
  assert.equal(offre.echeance_reponse_medecin.toISOString(), new Date(MAINTENANT.getTime() + 24 * H).toISOString());
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "demande_rdv_directe");
  assert.equal(notifications[0].utilisateur_id, "u-med-1");
});

test("échéance = heure du RDV si elle tombe avant les 24 h", async () => {
  const { offre } = await offres.publierDemandeDirecte(PATIENT, demande({ jour: "2026-11-06", heure: "19:00" }), MAINTENANT);
  assert.equal(offre.echeance_reponse_medecin.toISOString(), "2026-11-06T18:00:00.000Z");
});

test("refus du médecin : demande « refusee », patient invité à choisir", async () => {
  await offres.publierDemandeDirecte(PATIENT, demande(), MAINTENANT);
  notifications.length = 0;
  await offres.refuserDemandeDirecte(MEDECIN, "off-1", { motif: "En congé" }, new Date(MAINTENANT.getTime() + H));
  assert.equal(offreStockee.statut, "refusee");
  assert.equal(offreStockee.motif_refus, "En congé");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "demande_rdv_directe_refusee");
  assert.equal(notifications[0].utilisateur_id, "u-pat-1");
  assert.match(notifications[0].message, /changer de médecin/);
});

test("refus après le délai de 24 h : impossible", async () => {
  await offres.publierDemandeDirecte(PATIENT, demande(), MAINTENANT);
  await assert.rejects(
    offres.refuserDemandeDirecte(MEDECIN, "off-1", {}, new Date(MAINTENANT.getTime() + 25 * H)),
    (e) => e.code === "DELAI_REPONSE_DEPASSE"
  );
});

test("sans réponse sous 24 h : le cron passe la demande « refusee » et prévient le patient", async () => {
  await offres.publierDemandeDirecte(PATIENT, demande(), MAINTENANT);
  notifications.length = 0;
  const r = await offres.expirerOffresEchues({ maintenant: new Date(MAINTENANT.getTime() + 24 * H + 1) });
  assert.equal(r.demandes_directes_sans_reponse, 1);
  assert.equal(offreStockee.statut, "refusee");
  assert.equal(offreStockee.sans_reponse, true);
  assert.equal(notifications[0].type, "demande_rdv_directe_refusee");
  assert.match(notifications[0].message, /n'a pas répondu/);
});

test("diffusion après refus : offre ouverte, signalée aux autres médecins seulement", async () => {
  await offres.publierDemandeDirecte(PATIENT, demande(), MAINTENANT);
  await offres.refuserDemandeDirecte(MEDECIN, "off-1", {}, MAINTENANT);
  notifications.length = 0;
  const { medecins_notifies } = await offres.diffuserDemande(PATIENT, "off-1", new Date(MAINTENANT.getTime() + H));
  assert.equal(offreStockee.statut, "ouverte");
  assert.ok(offreStockee.diffusee_le);
  assert.equal(medecins_notifies, 1);
  assert.deepEqual(
    notifications.map((n) => n.utilisateur_id),
    ["u-med-2"]
  );
});

test("diffusion d'une téléconsultation : seulement vers des médecins qui ont déjà reçu le patient", async () => {
  rdvPhysiquesEffectues.push({ patient_id: "pat-1", medecin_id: "med-1" });
  await offres.publierDemandeDirecte(PATIENT, demande({ type_rdv: "teleconsultation" }), MAINTENANT);
  await offres.refuserDemandeDirecte(MEDECIN, "off-1", {}, MAINTENANT);
  // Seul med-1 (qui a refusé) a reçu le patient : aucun autre médecin possible.
  await assert.rejects(
    offres.diffuserDemande(PATIENT, "off-1", MAINTENANT),
    (e) => e.code === "TELECONSULTATION_SANS_RDV_PHYSIQUE"
  );
  assert.equal(offreStockee.statut, "refusee");
});

test("« changer de médecin » : une demande refusée peut être annulée", async () => {
  await offres.publierDemandeDirecte(PATIENT, demande(), MAINTENANT);
  await offres.refuserDemandeDirecte(MEDECIN, "off-1", {}, MAINTENANT);
  await offres.annulerOffre(PATIENT, "off-1", MAINTENANT);
  assert.equal(offreStockee.statut, "annulee");
});
