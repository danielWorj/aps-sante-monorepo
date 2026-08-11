/*
  Warnings:

  - You are about to drop the column `medecin_id` on the `abonnement_medecin` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "abonnement_medecin" DROP CONSTRAINT "abonnement_medecin_medecin_id_fkey";

-- DropIndex
DROP INDEX "abonnement_medecin_medecin_id_idx";

-- AlterTable
ALTER TABLE "abonnement_medecin" DROP COLUMN "medecin_id";

-- CreateTable
CREATE TABLE "forfait_abonnement_medecin" (
    "forfait_abonnement_medecin_id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "abonnement_id" UUID NOT NULL,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forfait_abonnement_medecin_pkey" PRIMARY KEY ("forfait_abonnement_medecin_id")
);

-- CreateIndex
CREATE INDEX "forfait_abonnement_medecin_medecin_id_idx" ON "forfait_abonnement_medecin"("medecin_id");

-- CreateIndex
CREATE INDEX "forfait_abonnement_medecin_abonnement_id_idx" ON "forfait_abonnement_medecin"("abonnement_id");

-- CreateIndex
CREATE UNIQUE INDEX "forfait_abonnement_medecin_medecin_id_abonnement_id_key" ON "forfait_abonnement_medecin"("medecin_id", "abonnement_id");

-- AddForeignKey
ALTER TABLE "forfait_abonnement_medecin" ADD CONSTRAINT "forfait_abonnement_medecin_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forfait_abonnement_medecin" ADD CONSTRAINT "forfait_abonnement_medecin_abonnement_id_fkey" FOREIGN KEY ("abonnement_id") REFERENCES "abonnement_medecin"("abonnement_id") ON DELETE RESTRICT ON UPDATE CASCADE;
