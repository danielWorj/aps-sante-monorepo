-- Annuaire laboratoires d'analyses : fiche, agents, examens, centres de
-- prélèvement, médiathèque, avis modérés et engagements (portail du
-- laboratoire). Voir schema.prisma, section « Annuaire laboratoires ».

-- Rôle des comptes agents de laboratoire (référentiel, idempotent).
INSERT INTO "role" ("role_id", "libelle", "description")
VALUES (gen_random_uuid(), 'agent_laboratoire', 'Agent représentant un laboratoire d''analyses')
ON CONFLICT ("libelle") DO NOTHING;

-- Enums
CREATE TYPE "StatutVerificationLaboratoire" AS ENUM ('non_publie', 'en_cours', 'publie');
CREATE TYPE "TypeMediaLaboratoire" AS ENUM ('image', 'video');
CREATE TYPE "TypeEngagementLaboratoire" AS ENUM (
  'clic_telephone', 'clic_email', 'clic_itineraire', 'partage', 'lecture_examens', 'lecture_avis'
);

-- Fiche laboratoire
CREATE TABLE "laboratoire" (
  "laboratoire_id" UUID NOT NULL,
  "nom" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "pays_id" UUID NOT NULL,
  "ville_id" UUID NOT NULL,
  "localisation" VARCHAR(255) NOT NULL,
  "geolocalisation" geography(Point, 4326),
  "telephone" VARCHAR(20) NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "agrement" VARCHAR(100) NOT NULL,
  "statut_verification" "StatutVerificationLaboratoire" NOT NULL,
  "date_premiere_publication" TIMESTAMP(3),
  "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "image_nom" VARCHAR(255) NOT NULL,
  "piece_identite_nom" VARCHAR(255) NOT NULL,
  "document_agrement_nom" VARCHAR(255) NOT NULL,
  CONSTRAINT "laboratoire_pkey" PRIMARY KEY ("laboratoire_id")
);
CREATE INDEX "laboratoire_pays_id_idx" ON "laboratoire"("pays_id");
CREATE INDEX "laboratoire_ville_id_idx" ON "laboratoire"("ville_id");
CREATE INDEX "laboratoire_statut_verification_idx" ON "laboratoire"("statut_verification");
-- Recherche par proximité (ST_DWithin / ST_Distance), comme pharmacie / assurance.
CREATE INDEX IF NOT EXISTS "laboratoire_geolocalisation_gist_idx" ON "laboratoire" USING GIST ("geolocalisation");
ALTER TABLE "laboratoire" ADD CONSTRAINT "laboratoire_pays_id_fkey"
  FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "laboratoire" ADD CONSTRAINT "laboratoire_ville_id_fkey"
  FOREIGN KEY ("ville_id") REFERENCES "ville"("ville_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Agents (comptes gestionnaires) — un compte peut gérer plusieurs laboratoires.
CREATE TABLE "agent_laboratoire" (
  "agent_id" UUID NOT NULL,
  "utilisateur_id" UUID NOT NULL,
  "laboratoire_id" UUID NOT NULL,
  "fonction" VARCHAR(100) NOT NULL,
  CONSTRAINT "agent_laboratoire_pkey" PRIMARY KEY ("agent_id")
);
CREATE UNIQUE INDEX "agent_laboratoire_utilisateur_id_laboratoire_id_key"
  ON "agent_laboratoire"("utilisateur_id", "laboratoire_id");
CREATE INDEX "agent_laboratoire_laboratoire_id_idx" ON "agent_laboratoire"("laboratoire_id");
CREATE INDEX "agent_laboratoire_utilisateur_id_idx" ON "agent_laboratoire"("utilisateur_id");
ALTER TABLE "agent_laboratoire" ADD CONSTRAINT "agent_laboratoire_utilisateur_id_fkey"
  FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_laboratoire" ADD CONSTRAINT "agent_laboratoire_laboratoire_id_fkey"
  FOREIGN KEY ("laboratoire_id") REFERENCES "laboratoire"("laboratoire_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Examens
CREATE TABLE "examen_laboratoire" (
  "examen_id" UUID NOT NULL,
  "laboratoire_id" UUID NOT NULL,
  "nom" VARCHAR(200) NOT NULL,
  "categorie" VARCHAR(100),
  "description" TEXT,
  "prix" DECIMAL(12,2),
  "delai_resultat" VARCHAR(100),
  "preparation" TEXT,
  "disponible" BOOLEAN NOT NULL DEFAULT true,
  "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "date_mise_a_jour" TIMESTAMP(3),
  CONSTRAINT "examen_laboratoire_pkey" PRIMARY KEY ("examen_id"),
  CONSTRAINT "examen_laboratoire_prix_check" CHECK ("prix" IS NULL OR "prix" >= 0)
);
CREATE INDEX "examen_laboratoire_laboratoire_id_categorie_idx" ON "examen_laboratoire"("laboratoire_id", "categorie");
ALTER TABLE "examen_laboratoire" ADD CONSTRAINT "examen_laboratoire_laboratoire_id_fkey"
  FOREIGN KEY ("laboratoire_id") REFERENCES "laboratoire"("laboratoire_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Centres de prélèvement
CREATE TABLE "centre_laboratoire" (
  "centre_id" UUID NOT NULL,
  "laboratoire_id" UUID NOT NULL,
  "nom" VARCHAR(150) NOT NULL,
  "ville_id" UUID,
  "localisation" VARCHAR(255) NOT NULL,
  "gps" geography(Point, 4326),
  "telephone" VARCHAR(20),
  "horaires" VARCHAR(255),
  "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "centre_laboratoire_pkey" PRIMARY KEY ("centre_id")
);
CREATE INDEX "centre_laboratoire_laboratoire_id_idx" ON "centre_laboratoire"("laboratoire_id");
CREATE INDEX IF NOT EXISTS "centre_laboratoire_gps_gist_idx" ON "centre_laboratoire" USING GIST ("gps");
ALTER TABLE "centre_laboratoire" ADD CONSTRAINT "centre_laboratoire_laboratoire_id_fkey"
  FOREIGN KEY ("laboratoire_id") REFERENCES "laboratoire"("laboratoire_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "centre_laboratoire" ADD CONSTRAINT "centre_laboratoire_ville_id_fkey"
  FOREIGN KEY ("ville_id") REFERENCES "ville"("ville_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Médiathèque
CREATE TABLE "media_laboratoire" (
  "media_id" UUID NOT NULL,
  "laboratoire_id" UUID NOT NULL,
  "type" "TypeMediaLaboratoire" NOT NULL,
  "fichier_nom" TEXT NOT NULL,
  "titre" VARCHAR(150),
  "ordre" INTEGER NOT NULL DEFAULT 0,
  "taille_octets" INTEGER,
  "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_laboratoire_pkey" PRIMARY KEY ("media_id")
);
CREATE INDEX "media_laboratoire_laboratoire_id_type_ordre_idx" ON "media_laboratoire"("laboratoire_id", "type", "ordre");
ALTER TABLE "media_laboratoire" ADD CONSTRAINT "media_laboratoire_laboratoire_id_fkey"
  FOREIGN KEY ("laboratoire_id") REFERENCES "laboratoire"("laboratoire_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Avis (modérés) : un par compte et par laboratoire.
CREATE TABLE "avis_laboratoire" (
  "avis_id" UUID NOT NULL,
  "utilisateur_id" UUID NOT NULL,
  "laboratoire_id" UUID NOT NULL,
  "note" SMALLINT NOT NULL,
  "commentaire" TEXT,
  "statut_moderation" "StatutModerationAvis" NOT NULL DEFAULT 'en_attente',
  "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "date_mise_a_jour" TIMESTAMP(3),
  CONSTRAINT "avis_laboratoire_pkey" PRIMARY KEY ("avis_id"),
  CONSTRAINT "avis_laboratoire_note_check" CHECK ("note" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "avis_laboratoire_utilisateur_id_laboratoire_id_key"
  ON "avis_laboratoire"("utilisateur_id", "laboratoire_id");
CREATE INDEX "avis_laboratoire_laboratoire_id_statut_moderation_idx"
  ON "avis_laboratoire"("laboratoire_id", "statut_moderation");
ALTER TABLE "avis_laboratoire" ADD CONSTRAINT "avis_laboratoire_utilisateur_id_fkey"
  FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "avis_laboratoire" ADD CONSTRAINT "avis_laboratoire_laboratoire_id_fkey"
  FOREIGN KEY ("laboratoire_id") REFERENCES "laboratoire"("laboratoire_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Engagements (agrégat jour UTC) + empreintes visiteurs (purgées chaque nuit).
CREATE TABLE "engagement_laboratoire" (
  "laboratoire_id" UUID NOT NULL,
  "jour" DATE NOT NULL,
  "type" "TypeEngagementLaboratoire" NOT NULL,
  "nombre" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "engagement_laboratoire_pkey" PRIMARY KEY ("laboratoire_id", "jour", "type")
);
CREATE INDEX "engagement_laboratoire_jour_idx" ON "engagement_laboratoire"("jour");
ALTER TABLE "engagement_laboratoire" ADD CONSTRAINT "engagement_laboratoire_laboratoire_id_fkey"
  FOREIGN KEY ("laboratoire_id") REFERENCES "laboratoire"("laboratoire_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "engagement_laboratoire_visiteur" (
  "laboratoire_id" UUID NOT NULL,
  "jour" DATE NOT NULL,
  "type" "TypeEngagementLaboratoire" NOT NULL,
  "empreinte" VARCHAR(64) NOT NULL,
  CONSTRAINT "engagement_laboratoire_visiteur_pkey" PRIMARY KEY ("laboratoire_id", "jour", "type", "empreinte")
);
CREATE INDEX "engagement_laboratoire_visiteur_jour_idx" ON "engagement_laboratoire_visiteur"("jour");
