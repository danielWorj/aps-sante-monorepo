/*
  Warnings:

  - Added the required column `attestation_url` to the `medecin` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cni_url` to the `medecin` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "medecin" ADD COLUMN     "attestation_url" VARCHAR(255) NOT NULL,
ADD COLUMN     "cni_url" VARCHAR(255) NOT NULL;
