/*
  Warnings:

  - You are about to drop the column `specialite` on the `medecin` table. All the data in the column will be lost.
  - Added the required column `specialite_id` to the `medecin` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "medecin" DROP COLUMN "specialite",
ADD COLUMN     "specialite_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "specialite" (
    "specialite_id" UUID NOT NULL,
    "nom" VARCHAR(150) NOT NULL,
    "description" TEXT,

    CONSTRAINT "specialite_pkey" PRIMARY KEY ("specialite_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "specialite_nom_key" ON "specialite"("nom");

-- CreateIndex
CREATE INDEX "medecin_specialite_id_idx" ON "medecin"("specialite_id");

-- AddForeignKey
ALTER TABLE "medecin" ADD CONSTRAINT "medecin_specialite_id_fkey" FOREIGN KEY ("specialite_id") REFERENCES "specialite"("specialite_id") ON DELETE RESTRICT ON UPDATE CASCADE;
