// src/tests/portailAssurance.test.js
// Portail assurance : suivi des demandes, médiathèque (quotas et
// visibilité selon les droits), complétude, série quotidienne,
// notification de demande reçue. Base SIMULÉE : aucune base requise.
// Lancement : node --experimental-test-module-mocks --test src/tests/portailAssurance.test.js

import test, { mock } from "node:test";
import assert from "node:assert/strict";

const base = { agents: [], notifications: [], utilisateur: { prenom: "Awa", nom: "Diallo" } };

mock.module("../lib/prisma.js", {
  defaultExport: {
    agentAssurance: { findMany: async () => base.agents.map((utilisateur_id) => ({ utilisateur_id })) },
    utilisateur: { findUnique: async () => base.utilisateur },
    notification: {
      createMany: async ({ data }) => {
        base.notifications.push(...data);
        return { count: data.length };
      },
    },
  },
});
mock.module("../lib/cloudinaryService.js", {
  namedExports: {
    construireUrl: (nom, { resourceType = "image" } = {}) => `https://cdn/${resourceType}/${nom}`,
    construireVignetteVideo: (nom) => `https://cdn/video/${nom}.jpg`,
  },
});

const svc = await import("../services/portailAssurance.service.js");

const media = (media_id, type, ordre) => ({ media_id, type, ordre, date_creation: new Date(2026, 0, 1 + ordre), fichier_nom: `f/${media_id}` });

/* ---------------------------- Demandes ---------------------------- */

test("statut : on ne revient jamais à « nouvelle »", () => {
  assert.match(svc.validerChangementStatut("en_cours", "nouvelle").erreur, /nouvelle/);
  assert.deepEqual(svc.validerChangementStatut("nouvelle", "nouvelle"), { data: {} });
});

test("statut : la clôture date le traitement, la réouverture l'efface", () => {
  const t = new Date("2026-10-18T10:00:00Z");
  assert.deepEqual(svc.validerChangementStatut("en_cours", "traitee", t), { data: { statut: "traitee", date_traitement: t } });
  assert.deepEqual(svc.validerChangementStatut("nouvelle", "archivee", t), { data: { statut: "archivee", date_traitement: t } });
  assert.deepEqual(svc.validerChangementStatut("traitee", "en_cours", t), { data: { statut: "en_cours", date_traitement: null } });
});

test("statut inconnu refusé", () => {
  assert.match(svc.validerChangementStatut("nouvelle", "supprimee").erreur, /invalide/);
});

test("demande reçue : les agents sont notifiés, pas le demandeur lui-même", async () => {
  base.agents = ["agent-1", "agent-2", "user-x"];
  base.notifications = [];
  const r = await svc.notifierDemandeRecue({ mise_en_relation_id: "mer-1", service_assurance_id: "sa-1", utilisateur_id: "user-x" });
  assert.equal(r.creees, 2);
  assert.deepEqual(base.notifications.map((n) => n.utilisateur_id), ["agent-1", "agent-2"]);
  assert.equal(base.notifications[0].type, "mise_en_relation_recue");
  assert.equal(base.notifications[0].cle, "mise_en_relation_recue:mer-1:agent-1");
  assert.match(base.notifications[0].message, /Awa Diallo/);
});

/* ---------------------------- Médiathèque ---------------------------- */

const medias = [media("p2", "image", 1), media("p1", "image", 0), media("p3", "image", 2), media("v1", "video", 0)];

test("visibilité : les N premières photos selon l'ordre de l'agent", () => {
  const ids = svc.mediasVisibles(medias, { max_photos: 2, video_presentation: false }).map((m) => m.media_id);
  assert.deepEqual(ids, ["p1", "p2"]);
});

test("visibilité : max_photos null = toutes ; vidéos si video_presentation", () => {
  const ids = svc.mediasVisibles(medias, { max_photos: null, video_presentation: true }).map((m) => m.media_id);
  assert.deepEqual(ids, ["p1", "p2", "p3", "v1"]);
});

test("visibilité : sans abonnement (droits minimaux), rien n'est public", () => {
  assert.deepEqual(svc.mediasVisibles(medias, { max_photos: 0, video_presentation: false }), []);
});

test("quotas : ajout refusé au plafond, et sans abonnement", () => {
  const q = svc.quotasMedias(medias, { max_photos: 3, video_presentation: true });
  assert.deepEqual(q, { photos: { utilise: 3, max: 3 }, videos: { utilise: 1, max: svc.MAX_VIDEOS_PAR_FICHE } });
  assert.equal(svc.refusAjoutMedia("image", q).code, "QUOTA_PHOTOS_ATTEINT");
  assert.equal(svc.refusAjoutMedia("video", q), null);

  const minimal = svc.quotasMedias([], { max_photos: 0, video_presentation: false });
  assert.equal(svc.refusAjoutMedia("image", minimal).code, "PHOTOS_NON_INCLUSES");
  assert.equal(svc.refusAjoutMedia("video", minimal).code, "VIDEOS_NON_INCLUSES");

  const illimite = svc.quotasMedias(medias, { max_photos: null, video_presentation: false });
  assert.equal(svc.refusAjoutMedia("image", illimite), null);
});

test("présentation : URL vidéo en resource_type video, avec vignette", () => {
  const v = svc.presenterMedia(media("v1", "video", 0));
  assert.equal(v.url, "https://cdn/video/f/v1");
  assert.equal(v.vignette_url, "https://cdn/video/f/v1.jpg");
  assert.equal(svc.presenterMedia(media("p1", "image", 0)).url, "https://cdn/image/f/p1");
  assert.equal("fichier_nom" in v, false);
});

/* ---------------------------- Tableau de bord ---------------------------- */

test("série quotidienne : jours vides à 0, bornée à la période", () => {
  const aujourdhui = new Date("2026-10-18T00:00:00Z");
  const serie = svc.serieQuotidienne(
    [new Date("2026-10-18T09:00:00Z"), new Date("2026-10-18T15:00:00Z"), new Date("2026-10-16T08:00:00Z")],
    3,
    aujourdhui
  );
  assert.deepEqual(serie, [
    { jour: "2026-10-16", demandes: 1 },
    { jour: "2026-10-17", demandes: 0 },
    { jour: "2026-10-18", demandes: 2 },
  ]);
});

test("complétude : score et éléments manquants", () => {
  const c = svc.completudeFiche({
    fiche: { description: "  ", file_url: "logo.png" },
    nbActivites: 2,
    nbAgences: 0,
    nbPhotos: 1,
    aGeolocalisation: true,
  });
  assert.equal(c.score, 67);
  assert.deepEqual(c.elements.filter((e) => !e.ok).map((e) => e.cle), ["description", "agences"]);
});
