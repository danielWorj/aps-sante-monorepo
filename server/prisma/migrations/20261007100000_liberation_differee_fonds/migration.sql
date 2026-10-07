-- Libération différée des fonds — Phase 1 : fondations en base.
--
-- Aucune logique métier ici. Cette migration ajoute uniquement :
--   1. quatre colonnes sur "rendez_vous" (fin de consultation constatée,
--      T figé, protection anti force-brute sur la saisie du code) ;
--   2. la table "parametre_delai_liberation" (T en heures, par pays,
--      versionné, un seul paramètre actif par pays).
--
-- Sans risque sur les données existantes : toutes les colonnes ajoutées
-- sont nullables ou ont une valeur par défaut. Les RDV existants auront
-- termine_le = NULL et tentatives_code_echouees = 0.
-- "code_unique" reste en VARCHAR(8) (les RDV existants ont 8 caractères).

-- ---------------------------------------------------------------------------
-- 1. rendez_vous
-- ---------------------------------------------------------------------------
ALTER TABLE "rendez_vous"
  ADD COLUMN "termine_le" TIMESTAMP(3),
  ADD COLUMN "delai_liberation_heures" INTEGER,
  ADD COLUMN "tentatives_code_echouees" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "code_verrouille_jusqu_a" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- 2. parametre_delai_liberation
-- ---------------------------------------------------------------------------
-- Délai T (heures) avant libération des fonds, par pays, versionné, saisi
-- par le super admin. Aucune valeur par défaut : sans paramètre actif, la
-- fin de consultation échoue explicitement.
CREATE TABLE "parametre_delai_liberation" (
    "parametre_delai_id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "heures" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "date_debut_validite" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametre_delai_liberation_pkey" PRIMARY KEY ("parametre_delai_id"),
    CONSTRAINT "parametre_delai_liberation_heures_check" CHECK ("heures" >= 0 AND "heures" <= 720)
);

-- Clé étrangère
ALTER TABLE "parametre_delai_liberation" ADD CONSTRAINT "parametre_delai_liberation_pays_id_fkey"
  FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Index
CREATE INDEX "parametre_delai_liberation_pays_id_idx" ON "parametre_delai_liberation"("pays_id");

-- Un seul paramètre actif par pays (index unique PARTIEL, même principe que
-- parametre_amende_pays_id_actif_key). Prisma ne sait pas l'exprimer : il
-- n'est déclaré que dans cette migration.
CREATE UNIQUE INDEX "parametre_delai_liberation_pays_id_actif_key"
  ON "parametre_delai_liberation"("pays_id") WHERE "actif";