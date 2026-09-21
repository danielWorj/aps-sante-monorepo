-- Migration manquante du commit "Stripe: client platform et server" :
-- schema.prisma décrivait déjà ces colonnes/enums, mais aucune migration
-- ne les créait (transaction_paiement et compte_escrow n'avaient que leur
-- clé primaire) -> "column compte_escrow.rdv_id does not exist" au premier
-- clic sur "Payer maintenant".

-- CreateEnum
CREATE TYPE "StatutTransactionPaiement" AS ENUM ('en_attente', 'reussie', 'echouee', 'remboursee');

-- CreateEnum
CREATE TYPE "StatutCompteEscrow" AS ENUM ('sequestre', 'libere', 'rembourse');

-- AlterTable : transaction_paiement
-- Les colonnes NOT NULL sans valeur par défaut dans le schéma Prisma
-- (montant, devise, date_mise_a_jour) sont ajoutées avec une valeur
-- temporaire puis le DEFAULT est retiré : la migration passe même si des
-- lignes existent déjà, et l'état final reste identique à schema.prisma.
ALTER TABLE "transaction_paiement"
  ADD COLUMN "montant" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "devise" VARCHAR(3) NOT NULL DEFAULT 'xaf',
  ADD COLUMN "statut" "StatutTransactionPaiement" NOT NULL DEFAULT 'en_attente',
  ADD COLUMN "stripe_checkout_session_id" VARCHAR(255),
  ADD COLUMN "stripe_payment_intent_id" VARCHAR(255),
  ADD COLUMN "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "date_mise_a_jour" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "transaction_paiement"
  ALTER COLUMN "montant" DROP DEFAULT,
  ALTER COLUMN "devise" DROP DEFAULT,
  ALTER COLUMN "date_mise_a_jour" DROP DEFAULT;

-- AlterTable : compte_escrow
-- (la table n'était qu'un stub sans aucune colonne métier et aucun code
-- ne l'alimentait avant Stripe : elle est vide, les NOT NULL passent.)
ALTER TABLE "compte_escrow"
  ADD COLUMN "rdv_id" UUID NOT NULL,
  ADD COLUMN "transaction_id" UUID NOT NULL,
  ADD COLUMN "montant" DECIMAL(12,2) NOT NULL,
  ADD COLUMN "statut" "StatutCompteEscrow" NOT NULL DEFAULT 'sequestre',
  ADD COLUMN "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "transaction_paiement_stripe_checkout_session_id_key" ON "transaction_paiement"("stripe_checkout_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_paiement_stripe_payment_intent_id_key" ON "transaction_paiement"("stripe_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "compte_escrow_rdv_id_key" ON "compte_escrow"("rdv_id");

-- CreateIndex
CREATE UNIQUE INDEX "compte_escrow_transaction_id_key" ON "compte_escrow"("transaction_id");

-- AddForeignKey
ALTER TABLE "compte_escrow" ADD CONSTRAINT "compte_escrow_rdv_id_fkey" FOREIGN KEY ("rdv_id") REFERENCES "rendez_vous"("rdv_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compte_escrow" ADD CONSTRAINT "compte_escrow_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction_paiement"("transaction_id") ON DELETE RESTRICT ON UPDATE CASCADE;