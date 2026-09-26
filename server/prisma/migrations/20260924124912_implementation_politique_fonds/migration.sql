-- DropForeignKey
ALTER TABLE "transaction_paiement" DROP CONSTRAINT "transaction_paiement_ligne_commission_id_fkey";

-- DropForeignKey
ALTER TABLE "transaction_paiement" DROP CONSTRAINT "transaction_paiement_ligne_frais_agregateur_id_fkey";

-- DropForeignKey
ALTER TABLE "transaction_paiement" DROP CONSTRAINT "transaction_paiement_ligne_taxe_id_fkey";

-- DropIndex
DROP INDEX "agence_gps_gist_idx";

-- DropIndex
DROP INDEX "pharmacie_geolocalisation_gist_idx";

-- DropIndex
DROP INDEX "service_assurance_geolocalisation_gist_idx";

-- DropIndex
DROP INDEX "structure_sante_geolocalisation_gist_idx";

-- AddForeignKey
ALTER TABLE "transaction_paiement" ADD CONSTRAINT "transaction_paiement_ligne_commission_id_fkey" FOREIGN KEY ("ligne_commission_id") REFERENCES "ligne_tarifaire"("ligne_tarifaire_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_paiement" ADD CONSTRAINT "transaction_paiement_ligne_taxe_id_fkey" FOREIGN KEY ("ligne_taxe_id") REFERENCES "ligne_tarifaire"("ligne_tarifaire_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_paiement" ADD CONSTRAINT "transaction_paiement_ligne_frais_agregateur_id_fkey" FOREIGN KEY ("ligne_frais_agregateur_id") REFERENCES "ligne_tarifaire"("ligne_tarifaire_id") ON DELETE SET NULL ON UPDATE CASCADE;
