-- Phase 0 : décomposition du montant capturé (honoraires / commission /
-- taxes / frais d'agrégateur), sans jamais stocker les montants dérivés.
-- Voir prisma/schema.prisma : ConfigurationTarifaire, TransactionPaiement.

-- CreateTable
CREATE TABLE "configuration_tarifaire" (
    "configuration_id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "taux_commission" DECIMAL(5,4) NOT NULL,
    "taux_taxes" DECIMAL(5,4) NOT NULL,
    "taux_frais_agregateur" DECIMAL(5,4) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "date_debut_validite" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuration_tarifaire_pkey" PRIMARY KEY ("configuration_id")
);

-- AlterTable : transaction_paiement
-- Nullable : une transaction d'abonnement (medecin/pharmacie) n'a pas
-- d'honoraires ni de configuration tarifaire — seule une transaction
-- liée à un rendez-vous (compte_escrow) les renseigne.
ALTER TABLE "transaction_paiement"
  ADD COLUMN "montant_honoraires" DECIMAL(12,2),
  ADD COLUMN "configuration_tarifaire_id" UUID;

-- CreateIndex
CREATE INDEX "configuration_tarifaire_pays_id_idx" ON "configuration_tarifaire"("pays_id");

-- CreateIndex
CREATE INDEX "transaction_paiement_configuration_tarifaire_id_idx" ON "transaction_paiement"("configuration_tarifaire_id");

-- AddForeignKey
ALTER TABLE "configuration_tarifaire" ADD CONSTRAINT "configuration_tarifaire_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_paiement" ADD CONSTRAINT "transaction_paiement_configuration_tarifaire_id_fkey" FOREIGN KEY ("configuration_tarifaire_id") REFERENCES "configuration_tarifaire"("configuration_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed : une ConfigurationTarifaire active par pays déjà actif
-- (statut_activation = 'actif'), sinon la première capture après cette
-- migration n'aurait aucune config à lire (obtenirConfigurationActive
-- lèverait une erreur explicite — voir tarification.service.js).
-- Taux validés en séance de cadrage (2026-09-23) :
--   - commission APS  : 15 %  (cahier des charges, §2)
--   - taxes APS       : 15 %  (valeur métier confirmée, non précisée au §1)
--   - frais agrégateur : 2,9 % (taux Stripe international standard, estimé
--     à la capture — le frais réel remonté par Stripe est enregistré tel
--     quel lors d'un remboursement, voir Phase 3/4, jamais recalculé)
-- Pays "pilote"/"inactif" volontairement exclus : ils recevront leur
-- configuration via POST /api/configurations-tarifaires à l'activation.
INSERT INTO "configuration_tarifaire"
  ("configuration_id", "pays_id", "taux_commission", "taux_taxes", "taux_frais_agregateur", "actif", "date_debut_validite")
SELECT gen_random_uuid(), "pays_id", 0.15, 0.15, 0.029, true, CURRENT_TIMESTAMP
FROM "pays"
WHERE "statut_activation" = 'actif';
