-- Agenda — réservation des créneaux par les rendez-vous.
--
-- 1. pays.fuseau_horaire : fuseau IANA servant à convertir les heures
--    murales de l'agenda (creneau_agenda.date + horaire.heure_debut) en
--    instant (rendez_vous.date_creneau). "Africa/Douala" par défaut.
-- 2. rendez_vous.date_creation / delai_confirmation_heures : faits
--    permettant de recalculer l'échéance de confirmation d'un RDV « cree ».
--    Les RDV existants reçoivent date_creation = maintenant : un RDV non
--    payé déjà en base bénéficie donc du délai complet à partir du
--    déploiement (aucune annulation en masse au premier passage du cron).
-- 3. parametre_delai_confirmation : délai H par pays, versionné, un seul
--    actif par pays (index unique PARTIEL).
-- 4. Référentiel horaire : tranches de 30 min de 07h00 à 20h00 (idempotent).
-- 5. Rattrapage : les RDV actifs à venir sont rattachés à la case d'agenda
--    qui leur correspond, et les cases tenues par un RDV qui n'est plus
--    actif sont libérées.

-- ---------------------------------------------------------------------------
-- 1. pays
-- ---------------------------------------------------------------------------
ALTER TABLE "pays" ADD COLUMN "fuseau_horaire" VARCHAR(64) NOT NULL DEFAULT 'Africa/Douala';

-- ---------------------------------------------------------------------------
-- 2. rendez_vous
-- ---------------------------------------------------------------------------
ALTER TABLE "rendez_vous"
  ADD COLUMN "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "delai_confirmation_heures" INTEGER;

ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_delai_confirmation_heures_check"
  CHECK ("delai_confirmation_heures" IS NULL OR ("delai_confirmation_heures" >= 1 AND "delai_confirmation_heures" <= 720));

-- Recherche des RDV « cree » à expirer par le cron.
CREATE INDEX "rendez_vous_statut_idx" ON "rendez_vous"("statut");

-- ---------------------------------------------------------------------------
-- 3. parametre_delai_confirmation
-- ---------------------------------------------------------------------------
CREATE TABLE "parametre_delai_confirmation" (
    "parametre_delai_confirmation_id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "heures" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "date_debut_validite" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametre_delai_confirmation_pkey" PRIMARY KEY ("parametre_delai_confirmation_id"),
    CONSTRAINT "parametre_delai_confirmation_heures_check" CHECK ("heures" >= 1 AND "heures" <= 720)
);

ALTER TABLE "parametre_delai_confirmation" ADD CONSTRAINT "parametre_delai_confirmation_pays_id_fkey"
  FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "parametre_delai_confirmation_pays_id_idx" ON "parametre_delai_confirmation"("pays_id");

CREATE UNIQUE INDEX "parametre_delai_confirmation_pays_id_actif_key"
  ON "parametre_delai_confirmation"("pays_id") WHERE "actif";

-- ---------------------------------------------------------------------------
-- 4. Référentiel horaire (07h00 -> 20h00, tranches de 30 min)
-- ---------------------------------------------------------------------------
INSERT INTO "horaire" ("horaire_id", "heure_debut", "heure_fin")
SELECT gen_random_uuid(), t::time, (t + INTERVAL '30 minutes')::time
FROM generate_series(TIMESTAMP '1970-01-01 07:00', TIMESTAMP '1970-01-01 19:30', INTERVAL '30 minutes') AS t
ON CONFLICT ("heure_debut", "heure_fin") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Rattrapage du lien créneau <-> rendez-vous
-- ---------------------------------------------------------------------------
-- 5a. Cases tenues par un RDV qui n'est plus actif : libérées.
UPDATE "creneau_agenda" c
SET "rdv_id" = NULL, "statut" = 'disponible'
FROM "rendez_vous" r
WHERE c."rdv_id" = r."rdv_id"
  AND r."statut" NOT IN ('cree', 'confirme', 'en_attente_presence', 'a_reprogrammer');

-- 5b. RDV actifs à venir sans case : rattachés à la case libre qui
-- correspond exactement à leur date_creneau (heure murale du pays
-- d'exercice du médecin). Un RDV sans case correspondante reste non
-- rattaché (l'index partiel rendez_vous_medecin_creneau_actif_key protège
-- toujours contre une double réservation).
UPDATE "creneau_agenda" c
SET "rdv_id" = r."rdv_id", "statut" = 'reserve'
FROM "rendez_vous" r
JOIN "medecin" m ON m."medecin_id" = r."medecin_id"
JOIN "pays" p ON p."pays_id" = m."pays_exercice_id",
     "horaire" h
WHERE h."horaire_id" = c."horaire_id"
  AND c."medecin_id" = r."medecin_id"
  AND c."rdv_id" IS NULL
  AND c."statut" = 'disponible'
  AND r."statut" IN ('cree', 'confirme', 'en_attente_presence', 'a_reprogrammer')
  AND r."date_creneau" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  AND NOT EXISTS (SELECT 1 FROM "creneau_agenda" c2 WHERE c2."rdv_id" = r."rdv_id")
  AND ((c."date" + h."heure_debut") AT TIME ZONE p."fuseau_horaire") AT TIME ZONE 'UTC' = r."date_creneau";
