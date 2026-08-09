/*
  Warnings:

  - Added the required column `document_agrement_nom` to the `pharmacie` table without a default value. This is not possible if the table is not empty.
  - Added the required column `image_nom` to the `pharmacie` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nom` to the `pharmacie` table without a default value. This is not possible if the table is not empty.
  - Added the required column `numero_ordre_titulaire` to the `pharmacie` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pays_id` to the `pharmacie` table without a default value. This is not possible if the table is not empty.
  - Added the required column `piece_identite_nom` to the `pharmacie` table without a default value. This is not possible if the table is not empty.
  - Added the required column `statut_verification` to the `pharmacie` table without a default value. This is not possible if the table is not empty.
  - Added the required column `telephone` to the `pharmacie` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ville_id` to the `pharmacie` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StatutVerificationPharmacie" AS ENUM ('non_publie', 'en_cours', 'publie');

-- AlterTable
ALTER TABLE "pharmacie" ADD COLUMN     "document_agrement_nom" VARCHAR(255) NOT NULL,
ADD COLUMN     "geolocalisation" geography(Point, 4326),
ADD COLUMN     "image_nom" VARCHAR(255) NOT NULL,
ADD COLUMN     "nom" VARCHAR(200) NOT NULL,
ADD COLUMN     "numero_ordre_titulaire" VARCHAR(100) NOT NULL,
ADD COLUMN     "pays_id" UUID NOT NULL,
ADD COLUMN     "piece_identite_nom" VARCHAR(255) NOT NULL,
ADD COLUMN     "statut_verification" "StatutVerificationPharmacie" NOT NULL,
ADD COLUMN     "telephone" VARCHAR(20) NOT NULL,
ADD COLUMN     "ville_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "pharmacie_pays_id_idx" ON "pharmacie"("pays_id");

-- CreateIndex
CREATE INDEX "pharmacie_ville_id_idx" ON "pharmacie"("ville_id");

-- AddForeignKey
ALTER TABLE "pharmacie" ADD CONSTRAINT "pharmacie_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacie" ADD CONSTRAINT "pharmacie_ville_id_fkey" FOREIGN KEY ("ville_id") REFERENCES "ville"("ville_id") ON DELETE RESTRICT ON UPDATE CASCADE;
