-- Phase 6 : retrait du médecin (CamPay withdraw).
-- 1) Nouveau type de mouvement : recrédit d'un retrait rejeté / échoué.
--    (ALTER TYPE ... ADD VALUE : même pratique que 20260924100000_annulations_remboursements.)
ALTER TYPE "TypeMouvementPortefeuille" ADD VALUE 'credit_annulation_retrait';

-- 2) Statuts d'une demande de retrait.
CREATE TYPE "StatutDemandeRetrait" AS ENUM ('en_attente_validation', 'en_cours', 'reussie', 'echouee', 'rejetee');

-- 3) Table des demandes. mobile_money_id : colonne UUID sans FK (cliché ; `numero` fait foi).
CREATE TABLE "demande_retrait" (
    "demande_retrait_id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "mobile_money_id" UUID,
    "montant" DECIMAL(12,2) NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "titulaire_declare" VARCHAR(255),
    "titulaire_campay" VARCHAR(255),
    "titulaire_concordant" BOOLEAN,
    "statut" "StatutDemandeRetrait" NOT NULL DEFAULT 'en_attente_validation',
    "campay_reference" VARCHAR(100),
    "motif_rejet" VARCHAR(500),
    "derniere_erreur" VARCHAR(500),
    "traite_par" UUID,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_envoi" TIMESTAMP(3),
    "date_cloture" TIMESTAMP(3),

    CONSTRAINT "demande_retrait_pkey" PRIMARY KEY ("demande_retrait_id"),
    CONSTRAINT "demande_retrait_montant_positif" CHECK ("montant" > 0)
);

CREATE UNIQUE INDEX "demande_retrait_campay_reference_key" ON "demande_retrait"("campay_reference");
CREATE INDEX "demande_retrait_medecin_id_statut_idx" ON "demande_retrait"("medecin_id", "statut");
CREATE INDEX "demande_retrait_statut_date_creation_idx" ON "demande_retrait"("statut", "date_creation");

-- Une seule demande « active » par médecin, garantie en base (filet en plus du verrou applicatif).
CREATE UNIQUE INDEX "demande_retrait_une_active_par_medecin"
  ON "demande_retrait"("medecin_id")
  WHERE "statut" IN ('en_attente_validation', 'en_cours');

ALTER TABLE "demande_retrait" ADD CONSTRAINT "demande_retrait_medecin_id_fkey"
  FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE RESTRICT ON UPDATE CASCADE;