/*
  Warnings:

  - Added the required column `document_agrement_nom` to the `structure_sante` table without a default value. This is not possible if the table is not empty.
  - Added the required column `image_nom` to the `structure_sante` table without a default value. This is not possible if the table is not empty.
  - Added the required column `piece_identite_nom` to the `structure_sante` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "structure_sante" ADD COLUMN     "document_agrement_nom" VARCHAR(255) NOT NULL,
ADD COLUMN     "image_nom" VARCHAR(255) NOT NULL,
ADD COLUMN     "piece_identite_nom" VARCHAR(255) NOT NULL;
