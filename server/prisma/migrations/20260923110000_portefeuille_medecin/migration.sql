-- Phase 1 : portefeuille médecin & grand-livre. Aucun solde stocké —
-- voir prisma/schema.prisma : PortefeuilleMedecin, MouvementPortefeuille.
-- Le solde se recalcule à la demande comme la somme signée des
-- mouvements (voir src/services/portefeuille.service.js).

-- CreateEnum
CREATE TYPE "TypeMouvementPortefeuille" AS ENUM ('credit_honoraires', 'debit_retenue_annulation_tardive', 'debit_frais_no_show', 'debit_retrait');

-- CreateTable
CREATE TABLE "portefeuille_medecin" (
    "medecin_id" UUID NOT NULL,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portefeuille_medecin_pkey" PRIMARY KEY ("medecin_id")
);

-- CreateTable
-- rdv_id / demande_retrait_id : simples colonnes UUID nullable, SANS
-- FK — un mouvement référence soit un rendez-vous (crédit honoraires,
-- retenue d'annulation tardive, frais de no-show), soit une demande de
-- retrait (table introduite en Phase 6), jamais les deux à la fois.
CREATE TABLE "mouvement_portefeuille" (
    "mouvement_id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "type" "TypeMouvementPortefeuille" NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rdv_id" UUID,
    "demande_retrait_id" UUID,
    "reference_idempotence" TEXT NOT NULL,

    CONSTRAINT "mouvement_portefeuille_pkey" PRIMARY KEY ("mouvement_id")
);

-- CreateIndex
-- Garantit qu'un même événement métier (ex. libération d'escrow pour
-- un rdv_id donné) ne peut jamais créer deux mouvements : c'est cette
-- contrainte qui rend l'écriture idempotente (voir creerMouvement).
CREATE UNIQUE INDEX "mouvement_portefeuille_reference_idempotence_key" ON "mouvement_portefeuille"("reference_idempotence");

-- CreateIndex
CREATE INDEX "mouvement_portefeuille_medecin_id_idx" ON "mouvement_portefeuille"("medecin_id");

-- AddForeignKey
ALTER TABLE "portefeuille_medecin" ADD CONSTRAINT "portefeuille_medecin_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_portefeuille" ADD CONSTRAINT "mouvement_portefeuille_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "portefeuille_medecin"("medecin_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migration de rattrapage : crée un portefeuille pour chaque médecin
-- déjà existant en base. Sans cette étape, un médecin créé avant cette
-- migration n'aurait aucun PortefeuilleMedecin, et
-- soldePortefeuille()/creerMouvement() échoueraient pour lui (FK
-- mouvement_portefeuille -> portefeuille_medecin non satisfaite).
INSERT INTO "portefeuille_medecin" ("medecin_id", "date_creation")
SELECT "medecin_id", CURRENT_TIMESTAMP
FROM "medecin";