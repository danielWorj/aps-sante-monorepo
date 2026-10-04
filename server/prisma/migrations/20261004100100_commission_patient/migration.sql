-- Commission patient (CP) — étape 2/2 : colonnes, contraintes, index.
-- À appliquer APRÈS 20261004100000_commission_patient_enums.
--
-- Aucune donnée existante n'est modifiée dans son sens :
--   * transaction_paiement.ligne_commission_patient_id reste NULL pour toutes
--     les transactions existantes => CP = 0, totaux déjà encaissés inchangés
--     (aucun backfill) ;
--   * les lignes commission_aps_versee existantes prennent origine = 'medecin'
--     (ce sont toutes des commissions prélevées sur le médecin) ;
--   * rendez_vous.annule_par reste NULL pour les RDV déjà annulés (traités
--     comme annulés par le patient par le code).

-- ---------------------------------------------------------------------------
-- 0. Garde-fou : l'index unique partiel « une seule ligne active par
-- (pays_id, type_frais) » doit exister (posé par
-- 20260923100000_configuration_tarifaire). Il couvre déjà 'commission_patient'
-- puisqu'il porte sur la colonne type_frais, sans filtre sur la valeur. On le
-- vérifie plutôt que de le supposer : s'il manquait, deux lignes CP actives
-- pour un même pays seraient possibles.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname = 'ligne_tarifaire_pays_id_type_frais_actif_key'
  ) THEN
    RAISE EXCEPTION 'Index unique partiel ligne_tarifaire_pays_id_type_frais_actif_key introuvable : la règle « une seule ligne active par (pays, type) » ne serait pas garantie pour commission_patient.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. transaction_paiement : ligne de commission patient FIGÉE (référence,
-- jamais un montant).
-- ---------------------------------------------------------------------------
ALTER TABLE "transaction_paiement" ADD COLUMN "ligne_commission_patient_id" UUID;

ALTER TABLE "transaction_paiement"
  ADD CONSTRAINT "transaction_paiement_ligne_commission_patient_id_fkey"
  FOREIGN KEY ("ligne_commission_patient_id") REFERENCES "ligne_tarifaire"("ligne_tarifaire_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "transaction_paiement_ligne_commission_patient_id_idx"
  ON "transaction_paiement"("ligne_commission_patient_id");

-- ---------------------------------------------------------------------------
-- 2. commission_aps_versee : distinguer CM (médecin) et CP (patient).
-- Deux lignes possibles par RDV/transaction (une par origine). Les anciennes
-- contraintes d'unicité (rdv_id seul, transaction_id seul) sont remplacées par
-- (rdv_id, origine) et (transaction_id, origine) : l'idempotence est conservée.
-- ---------------------------------------------------------------------------
CREATE TYPE "OrigineCommissionAps" AS ENUM ('medecin', 'patient');

ALTER TABLE "commission_aps_versee"
  ADD COLUMN "origine" "OrigineCommissionAps" NOT NULL DEFAULT 'medecin';

DROP INDEX "commission_aps_versee_rdv_id_key";
DROP INDEX "commission_aps_versee_transaction_id_key";

CREATE UNIQUE INDEX "commission_aps_versee_rdv_id_origine_key"
  ON "commission_aps_versee"("rdv_id", "origine");
CREATE UNIQUE INDEX "commission_aps_versee_transaction_id_origine_key"
  ON "commission_aps_versee"("transaction_id", "origine");

-- ---------------------------------------------------------------------------
-- 3. rendez_vous : qui a annulé (fait constaté). Réutilise l'enum existant
-- "PartieRendezVous" (patient | medecin). Sert à la règle « paiement tardif » :
-- RDV annulé par le médecin => CP rendue au patient.
-- ---------------------------------------------------------------------------
ALTER TABLE "rendez_vous" ADD COLUMN "annule_par" "PartieRendezVous";