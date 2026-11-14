-- Tableau de l'Ordre National des Médecins du Cameroun (ONMC) : copie locale
-- du registre public, journal des synchronisations et statut par médecin.
CREATE TYPE "StatutOrdreMedecin" AS ENUM ('inscrit', 'non_inscrit', 'non_verifie');
CREATE TYPE "StatutSynchronisationOnmc" AS ENUM ('en_cours', 'reussie', 'echouee');

ALTER TABLE "medecin"
  ADD COLUMN "statut_ordre" "StatutOrdreMedecin" NOT NULL DEFAULT 'non_verifie',
  ADD COLUMN "ordre_verifie_le" TIMESTAMP(3),
  ADD COLUMN "ordre_nom_onmc" VARCHAR(255);

CREATE TABLE "onmc_medecin" (
  "onmc_medecin_id" UUID NOT NULL,
  "numero_ordre" VARCHAR(50) NOT NULL,
  "numero_normalise" VARCHAR(50) NOT NULL,
  "nom_complet" VARCHAR(255) NOT NULL,
  "nom_normalise" VARCHAR(255) NOT NULL,
  "qualite" VARCHAR(100) NOT NULL,
  "photo_chemin" VARCHAR(255),
  "date_synchronisation" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "onmc_medecin_pkey" PRIMARY KEY ("onmc_medecin_id")
);
CREATE INDEX "onmc_medecin_numero_normalise_idx" ON "onmc_medecin"("numero_normalise");
CREATE INDEX "onmc_medecin_nom_normalise_idx" ON "onmc_medecin"("nom_normalise");

CREATE TABLE "synchronisation_onmc" (
  "synchronisation_onmc_id" UUID NOT NULL,
  "statut" "StatutSynchronisationOnmc" NOT NULL,
  "declenchee_par" VARCHAR(64) NOT NULL,
  "total_annonce" INTEGER,
  "total_recupere" INTEGER NOT NULL DEFAULT 0,
  "pages_lues" INTEGER NOT NULL DEFAULT 0,
  "medecins_inscrits" INTEGER,
  "medecins_non_inscrits" INTEGER,
  "erreur" TEXT,
  "demarree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "terminee_le" TIMESTAMP(3),
  CONSTRAINT "synchronisation_onmc_pkey" PRIMARY KEY ("synchronisation_onmc_id")
);
CREATE INDEX "synchronisation_onmc_demarree_le_idx" ON "synchronisation_onmc"("demarree_le");
