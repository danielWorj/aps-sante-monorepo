/*
  Warnings:

  - Added the required column `agrement` to the `service_assurance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `email` to the `service_assurance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `file_url` to the `service_assurance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nom` to the `service_assurance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pays_id` to the `service_assurance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `statut_verification` to the `service_assurance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `telephone` to the `service_assurance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type_acteur` to the `service_assurance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ville_id` to the `service_assurance` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StatutVerificationAssurance" AS ENUM ('non_publie', 'en_cours', 'publie');

-- CreateEnum
CREATE TYPE "TypeActeurAssurance" AS ENUM ('compagnie', 'courtier');

-- AlterTable
ALTER TABLE "service_assurance" ADD COLUMN     "agrement" VARCHAR(100) NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "email" VARCHAR(255) NOT NULL,
ADD COLUMN     "file_url" TEXT NOT NULL,
ADD COLUMN     "geolocalisation" geography(Point, 4326),
ADD COLUMN     "nom" VARCHAR(200) NOT NULL,
ADD COLUMN     "pays_id" UUID NOT NULL,
ADD COLUMN     "statut_verification" "StatutVerificationAssurance" NOT NULL,
ADD COLUMN     "telephone" VARCHAR(20) NOT NULL,
ADD COLUMN     "type_acteur" "TypeActeurAssurance" NOT NULL,
ADD COLUMN     "ville_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "mise_en_relation" (
    "mise_en_relation_id" UUID NOT NULL,
    "service_assurance_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mise_en_relation_pkey" PRIMARY KEY ("mise_en_relation_id")
);

-- CreateTable
CREATE TABLE "activite" (
    "activite_id" UUID NOT NULL,
    "service_assurance_id" UUID NOT NULL,
    "titre" VARCHAR(200) NOT NULL,
    "public_cible" VARCHAR(200) NOT NULL,
    "description" TEXT,

    CONSTRAINT "activite_pkey" PRIMARY KEY ("activite_id")
);

-- CreateTable
CREATE TABLE "option_activite" (
    "option_activite_id" UUID NOT NULL,
    "activite_id" UUID NOT NULL,
    "libelle" VARCHAR(150) NOT NULL,
    "description" TEXT,

    CONSTRAINT "option_activite_pkey" PRIMARY KEY ("option_activite_id")
);

-- CreateTable
CREATE TABLE "agence" (
    "agence_id" UUID NOT NULL,
    "service_assurance_id" UUID NOT NULL,
    "libelle" VARCHAR(150) NOT NULL,
    "localisation" VARCHAR(255) NOT NULL,
    "gps" geography(Point, 4326),
    "contact" VARCHAR(20) NOT NULL,

    CONSTRAINT "agence_pkey" PRIMARY KEY ("agence_id")
);

-- CreateIndex
CREATE INDEX "mise_en_relation_service_assurance_id_idx" ON "mise_en_relation"("service_assurance_id");

-- CreateIndex
CREATE INDEX "mise_en_relation_utilisateur_id_idx" ON "mise_en_relation"("utilisateur_id");

-- CreateIndex
CREATE INDEX "activite_service_assurance_id_idx" ON "activite"("service_assurance_id");

-- CreateIndex
CREATE INDEX "option_activite_activite_id_idx" ON "option_activite"("activite_id");

-- CreateIndex
CREATE INDEX "agence_service_assurance_id_idx" ON "agence"("service_assurance_id");

-- CreateIndex
CREATE INDEX "service_assurance_pays_id_idx" ON "service_assurance"("pays_id");

-- CreateIndex
CREATE INDEX "service_assurance_ville_id_idx" ON "service_assurance"("ville_id");

-- AddForeignKey
ALTER TABLE "service_assurance" ADD CONSTRAINT "service_assurance_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_assurance" ADD CONSTRAINT "service_assurance_ville_id_fkey" FOREIGN KEY ("ville_id") REFERENCES "ville"("ville_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mise_en_relation" ADD CONSTRAINT "mise_en_relation_service_assurance_id_fkey" FOREIGN KEY ("service_assurance_id") REFERENCES "service_assurance"("service_assurance_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mise_en_relation" ADD CONSTRAINT "mise_en_relation_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activite" ADD CONSTRAINT "activite_service_assurance_id_fkey" FOREIGN KEY ("service_assurance_id") REFERENCES "service_assurance"("service_assurance_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_activite" ADD CONSTRAINT "option_activite_activite_id_fkey" FOREIGN KEY ("activite_id") REFERENCES "activite"("activite_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agence" ADD CONSTRAINT "agence_service_assurance_id_fkey" FOREIGN KEY ("service_assurance_id") REFERENCES "service_assurance"("service_assurance_id") ON DELETE RESTRICT ON UPDATE CASCADE;
