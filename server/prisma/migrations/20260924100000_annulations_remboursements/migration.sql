-- Phase 3 : annulations motivées & remboursements différenciés
-- (politique de gestion des fonds §3-5). Aucune valeur dérivée n'est
-- stockée : seuls des faits constatés (motif, date d'annulation, montant
-- réellement remboursé par Stripe) et un paramétrage saisi par le
-- médecin (taux de frais d'annulation tardive) — voir schema.prisma.

-- CreateEnum
CREATE TYPE "MotifAnnulation" AS ENUM ('changement_horaire_patient', 'urgence_personnelle', 'erreur_reservation', 'professionnel_indisponible', 'autre');

-- AlterEnum
-- Frais d'annulation tardive retenus au patient puis crédités au
-- médecin (le plan d'origine ne prévoyait aucun mouvement de crédit
-- pour cette retenue). La valeur n'est pas utilisée dans cette
-- migration, ce qui est requis par PostgreSQL pour un ADD VALUE.
ALTER TYPE "TypeMouvementPortefeuille" ADD VALUE 'credit_frais_annulation';

-- AlterTable
-- Colonnes nullables : aucune valeur par défaut à gérer pour les
-- lignes existantes.
ALTER TABLE "medecin" ADD COLUMN     "taux_frais_annulation_tardive" DECIMAL(5,4);

-- AlterTable
ALTER TABLE "rendez_vous" ADD COLUMN     "commentaire_annulation" TEXT,
ADD COLUMN     "date_annulation" TIMESTAMP(3),
ADD COLUMN     "motif_annulation" "MotifAnnulation";

-- CreateTable
CREATE TABLE "remboursement_paiement" (
    "remboursement_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "motif" VARCHAR(50) NOT NULL,
    "stripe_refund_id" TEXT NOT NULL,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remboursement_paiement_pkey" PRIMARY KEY ("remboursement_id")
);

-- CreateIndex
-- Un même remboursement Stripe ne peut être enregistré qu'une fois.
CREATE UNIQUE INDEX "remboursement_paiement_stripe_refund_id_key" ON "remboursement_paiement"("stripe_refund_id");

-- CreateIndex
CREATE INDEX "remboursement_paiement_transaction_id_idx" ON "remboursement_paiement"("transaction_id");

-- AddForeignKey
ALTER TABLE "remboursement_paiement" ADD CONSTRAINT "remboursement_paiement_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction_paiement"("transaction_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migration de rattrapage : crée le portefeuille des médecins créés
-- depuis la migration Phase 1 (20260923110000_portefeuille_medecin), qui
-- n'a créé un portefeuille que pour les médecins alors existants —
-- creerMedecin n'en créait pas. Sans portefeuille, l'écriture d'un
-- mouvement (libération, frais d'annulation, retenue) échoue sur la FK
-- mouvement_portefeuille -> portefeuille_medecin. Idempotent.
INSERT INTO "portefeuille_medecin" ("medecin_id", "date_creation")
SELECT m."medecin_id", CURRENT_TIMESTAMP
FROM "medecin" m
WHERE NOT EXISTS (
    SELECT 1 FROM "portefeuille_medecin" p WHERE p."medecin_id" = m."medecin_id"
);