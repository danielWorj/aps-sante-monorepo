-- Portail assurance (espace de l'agent d'une compagnie / d'un courtier) :
--   1. suivi des demandes de mise en relation (statut + note interne) ;
--   2. médiathèque de la fiche (photos et vidéos Cloudinary).
-- Les demandes existantes passent « nouvelle ».

-- 1. Suivi des demandes
CREATE TYPE "StatutMiseEnRelation" AS ENUM ('nouvelle', 'en_cours', 'traitee', 'archivee');

ALTER TABLE "mise_en_relation"
  ADD COLUMN "statut" "StatutMiseEnRelation" NOT NULL DEFAULT 'nouvelle',
  ADD COLUMN "note_interne" TEXT,
  ADD COLUMN "date_traitement" TIMESTAMP(3),
  ADD COLUMN "date_mise_a_jour" TIMESTAMP(3);

DROP INDEX IF EXISTS "mise_en_relation_service_assurance_id_idx";
CREATE INDEX "mise_en_relation_service_assurance_id_statut_idx"
  ON "mise_en_relation"("service_assurance_id", "statut");

-- 2. Médiathèque
CREATE TYPE "TypeMediaAssurance" AS ENUM ('image', 'video');

CREATE TABLE "media_assurance" (
  "media_id" UUID NOT NULL,
  "service_assurance_id" UUID NOT NULL,
  "type" "TypeMediaAssurance" NOT NULL,
  "fichier_nom" TEXT NOT NULL,
  "titre" VARCHAR(150),
  "ordre" INTEGER NOT NULL DEFAULT 0,
  "taille_octets" INTEGER,
  "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_assurance_pkey" PRIMARY KEY ("media_id")
);

CREATE INDEX "media_assurance_service_assurance_id_type_ordre_idx"
  ON "media_assurance"("service_assurance_id", "type", "ordre");

ALTER TABLE "media_assurance"
  ADD CONSTRAINT "media_assurance_service_assurance_id_fkey"
  FOREIGN KEY ("service_assurance_id") REFERENCES "service_assurance"("service_assurance_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
