-- Intégration CamPay (Mobile Money) : colonnes fournisseur sur la transaction
-- et adaptation de remboursement_paiement (pas de remboursement natif CamPay).

-- AlterTable : transaction_paiement
-- Les transactions existantes sont toutes Stripe -> DEFAULT 'stripe'.
ALTER TABLE "transaction_paiement"
  ADD COLUMN "fournisseur" VARCHAR(20) NOT NULL DEFAULT 'stripe',
  ADD COLUMN "campay_reference" VARCHAR(100),
  ADD COLUMN "campay_operator" VARCHAR(30),
  ADD COLUMN "numero_payeur" VARCHAR(20),
  ADD COLUMN "rdv_id_cible" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "transaction_paiement_campay_reference_key" ON "transaction_paiement"("campay_reference");

-- CreateIndex
CREATE INDEX "transaction_paiement_fournisseur_statut_idx" ON "transaction_paiement"("fournisseur", "statut");

-- CreateIndex
CREATE INDEX "transaction_paiement_rdv_id_cible_idx" ON "transaction_paiement"("rdv_id_cible");

-- AlterTable : remboursement_paiement
-- stripe_refund_id devient facultatif (NULL pour CamPay ; l'unicité Postgres
-- tolère plusieurs NULL). Les lignes existantes sont des remboursements Stripe
-- déjà effectués -> DEFAULT 'effectue'.
ALTER TABLE "remboursement_paiement"
  ALTER COLUMN "stripe_refund_id" DROP NOT NULL,
  ADD COLUMN "statut" VARCHAR(20) NOT NULL DEFAULT 'effectue';

-- CreateIndex : rend idempotent l'enregistrement d'un remboursement CamPay
-- (erreur P2002 attrapée dans finalisationPaiement.service.js).
-- Échoue s'il existe déjà deux remboursements de même motif pour une même
-- transaction : vérifier avant déploiement (voir requête dans la réponse).
CREATE UNIQUE INDEX "remboursement_paiement_transaction_id_motif_key" ON "remboursement_paiement"("transaction_id", "motif");