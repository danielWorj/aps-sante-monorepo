/*
  Warnings:

  - Added the required column `nom` to the `structure_sante` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pays_id` to the `structure_sante` table without a default value. This is not possible if the table is not empty.
  - Added the required column `statut_verification` to the `structure_sante` table without a default value. This is not possible if the table is not empty.
  - Added the required column `telephone` to the `structure_sante` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type_structure` to the `structure_sante` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ville_id` to the `structure_sante` table without a default value. This is not possible if the table is not empty.

*/
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "StatutVerificationStructure" AS ENUM ('non_publie', 'en_cours', 'publie');

-- CreateEnum
CREATE TYPE "TypeStructure" AS ENUM ('clinique', 'hopital', 'centre_medical', 'dispensaire', 'laboratoire');

-- AlterTable
ALTER TABLE "structure_sante" ADD COLUMN     "geolocalisation" geography(Point, 4326),
ADD COLUMN     "nom" VARCHAR(200) NOT NULL,
ADD COLUMN     "pays_id" UUID NOT NULL,
ADD COLUMN     "statut_verification" "StatutVerificationStructure" NOT NULL,
ADD COLUMN     "telephone" VARCHAR(20) NOT NULL,
ADD COLUMN     "type_structure" "TypeStructure" NOT NULL,
ADD COLUMN     "ville_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "structure_sante_pays_id_idx" ON "structure_sante"("pays_id");

-- CreateIndex
CREATE INDEX "structure_sante_ville_id_idx" ON "structure_sante"("ville_id");

-- AddForeignKey
ALTER TABLE "structure_sante" ADD CONSTRAINT "structure_sante_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structure_sante" ADD CONSTRAINT "structure_sante_ville_id_fkey" FOREIGN KEY ("ville_id") REFERENCES "ville"("ville_id") ON DELETE RESTRICT ON UPDATE CASCADE;
