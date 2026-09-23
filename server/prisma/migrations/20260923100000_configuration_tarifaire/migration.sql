-- Phase 0 : décomposition du montant capturé (honoraires / commission /
-- taxes / frais d'agrégateur) via des lignes tarifaires génériques,
-- sans jamais stocker les montants dérivés.
-- Voir prisma/schema.prisma : LigneTarifaire, TransactionPaiement.

-- CreateEnum
CREATE TYPE "TypeFraisTarifaire" AS ENUM ('commission', 'taxe', 'frais_agregateur');

-- CreateTable
CREATE TABLE "ligne_tarifaire" (
    "ligne_tarifaire_id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "type_frais" "TypeFraisTarifaire" NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "taux" DECIMAL(5,4) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "date_debut_validite" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ligne_tarifaire_pkey" PRIMARY KEY ("ligne_tarifaire_id")
);

-- AlterTable : transaction_paiement
-- Nullable : une transaction d'abonnement (medecin/pharmacie) n'a pas
-- d'honoraires ni de lignes tarifaires — seule une transaction liée à
-- un rendez-vous (compte_escrow) les renseigne. Une FK par type_frais
-- (et non une seule) : chaque transaction peut avoir capturé sa
-- commission, sa taxe et son frais d'agrégateur sous des lignes
-- tarifaires distinctes, chacune versionnée indépendamment.
ALTER TABLE "transaction_paiement"
  ADD COLUMN "montant_honoraires" DECIMAL(12,2),
  ADD COLUMN "ligne_commission_id" UUID,
  ADD COLUMN "ligne_taxe_id" UUID,
  ADD COLUMN "ligne_frais_agregateur_id" UUID;

-- CreateIndex
CREATE INDEX "ligne_tarifaire_pays_id_type_frais_idx" ON "ligne_tarifaire"("pays_id", "type_frais");

-- Contrainte métier centrale : une seule ligne active à la fois pour un
-- (pays_id, type_frais) donné. Index unique PARTIEL (WHERE actif) :
-- l'historique des lignes désactivées n'est jamais concerné, seule
-- l'unicité de la ligne EN COURS est garantie. Imposé en base plutôt
-- que laissé à la seule discipline du contrôleur (voir
-- ligneTarifaire.controller.js, qui désactive déjà l'ancienne ligne
-- dans la même transaction Prisma que la création de la nouvelle,
-- mais un INSERT concurrent ou un accès direct à la base pourrait sinon
-- créer deux lignes actives pour le même type).
CREATE UNIQUE INDEX "ligne_tarifaire_pays_id_type_frais_actif_key" ON "ligne_tarifaire"("pays_id", "type_frais") WHERE "actif";

-- CreateIndex
CREATE INDEX "transaction_paiement_ligne_commission_id_idx" ON "transaction_paiement"("ligne_commission_id");

-- CreateIndex
CREATE INDEX "transaction_paiement_ligne_taxe_id_idx" ON "transaction_paiement"("ligne_taxe_id");

-- CreateIndex
CREATE INDEX "transaction_paiement_ligne_frais_agregateur_id_idx" ON "transaction_paiement"("ligne_frais_agregateur_id");

-- AddForeignKey
ALTER TABLE "ligne_tarifaire" ADD CONSTRAINT "ligne_tarifaire_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_paiement" ADD CONSTRAINT "transaction_paiement_ligne_commission_id_fkey" FOREIGN KEY ("ligne_commission_id") REFERENCES "ligne_tarifaire"("ligne_tarifaire_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_paiement" ADD CONSTRAINT "transaction_paiement_ligne_taxe_id_fkey" FOREIGN KEY ("ligne_taxe_id") REFERENCES "ligne_tarifaire"("ligne_tarifaire_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_paiement" ADD CONSTRAINT "transaction_paiement_ligne_frais_agregateur_id_fkey" FOREIGN KEY ("ligne_frais_agregateur_id") REFERENCES "ligne_tarifaire"("ligne_tarifaire_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed : une ligne active par pays déjà actif (statut_activation =
-- 'actif') pour chacun des 3 types de frais, sinon la première capture
-- après cette migration n'aurait aucune ligne à lire
-- (obtenirLignesTarifairesActives lèverait une erreur explicite).
-- Taux validés en séance de cadrage (2026-09-23) :
--   - commission APS  : 15 %  (cahier des charges, §2)
--   - taxe APS        : 15 %  (valeur métier confirmée, non précisée au §1)
--   - frais agrégateur : 2,9 % (taux Stripe international standard, estimé
--     à la capture — le frais réel remonté par Stripe est enregistré tel
--     quel lors d'un remboursement, voir Phase 3/4, jamais recalculé)
-- Pays "pilote"/"inactif" volontairement exclus : ils recevront leurs
-- lignes tarifaires via POST /api/lignes-tarifaires à l'activation.
INSERT INTO "ligne_tarifaire" ("ligne_tarifaire_id", "pays_id", "type_frais", "libelle", "taux", "actif", "date_debut_validite")
SELECT gen_random_uuid(), "pays_id", 'commission', 'Commission APS', 0.15, true, CURRENT_TIMESTAMP
FROM "pays" WHERE "statut_activation" = 'actif';

INSERT INTO "ligne_tarifaire" ("ligne_tarifaire_id", "pays_id", "type_frais", "libelle", "taux", "actif", "date_debut_validite")
SELECT gen_random_uuid(), "pays_id", 'taxe', 'Taxe APS', 0.15, true, CURRENT_TIMESTAMP
FROM "pays" WHERE "statut_activation" = 'actif';

INSERT INTO "ligne_tarifaire" ("ligne_tarifaire_id", "pays_id", "type_frais", "libelle", "taux", "actif", "date_debut_validite")
SELECT gen_random_uuid(), "pays_id", 'frais_agregateur', 'Frais Stripe', 0.029, true, CURRENT_TIMESTAMP
FROM "pays" WHERE "statut_activation" = 'actif';