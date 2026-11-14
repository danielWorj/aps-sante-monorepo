-- Durée maximale d'une téléconsultation, par pays, versionnée (back-office).
CREATE TABLE "parametre_duree_teleconsultation" (
  "parametre_duree_teleconsultation_id" UUID NOT NULL,
  "pays_id" UUID NOT NULL,
  "libelle" VARCHAR(100) NOT NULL,
  "minutes" INTEGER NOT NULL,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  "date_debut_validite" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parametre_duree_teleconsultation_pkey" PRIMARY KEY ("parametre_duree_teleconsultation_id"),
  CONSTRAINT "parametre_duree_teleconsultation_minutes_check" CHECK ("minutes" >= 5 AND "minutes" <= 240)
);
CREATE INDEX "parametre_duree_teleconsultation_pays_id_idx" ON "parametre_duree_teleconsultation"("pays_id");
-- Un seul paramètre actif par pays.
CREATE UNIQUE INDEX "parametre_duree_teleconsultation_actif_par_pays"
  ON "parametre_duree_teleconsultation"("pays_id") WHERE "actif" = true;
ALTER TABLE "parametre_duree_teleconsultation"
  ADD CONSTRAINT "parametre_duree_teleconsultation_pays_id_fkey"
  FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Durée figée sur le RDV dès que les deux parties sont présentes.
ALTER TABLE "rendez_vous" ADD COLUMN "visio_duree_minutes" INTEGER;

-- Alerte « fin de téléconsultation proche » (médecin et patient).
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'rdv_visio_fin_proche';
