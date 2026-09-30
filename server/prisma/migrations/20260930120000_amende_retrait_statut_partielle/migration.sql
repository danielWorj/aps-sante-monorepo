-- Politique de fonds v2 §7 — retrait du statut d'amende « partielle ».
--
-- Règle retenue : une amende est imputée EN ENTIER ou pas du tout ; celle qui
-- ne tient pas dans le crédit d'une libération reste « en_attente » pour la
-- suivante. Aucune imputation partielle n'existe donc : « partielle » n'a
-- jamais été écrit par l'application.
--
-- Garde-fou : on échoue explicitement si une ligne porte ce statut (rien n'est
-- converti silencieusement), puis on recrée le type (on ne peut pas retirer une
-- valeur d'un enum Postgres existant).

DO $$
DECLARE
  nb integer;
BEGIN
  SELECT count(*) INTO nb FROM "amende_medecin" WHERE "statut" = 'partielle';
  IF nb > 0 THEN
    RAISE EXCEPTION 'Migration interrompue : % amende(s) au statut « partielle ». Traitez-les manuellement (en_attente ou imputee) puis relancez.', nb;
  END IF;
END
$$;

DROP INDEX IF EXISTS "amende_medecin_medecin_id_statut_idx";

ALTER TYPE "StatutAmende" RENAME TO "StatutAmende_old";
CREATE TYPE "StatutAmende" AS ENUM ('en_attente', 'imputee');

ALTER TABLE "amende_medecin" ALTER COLUMN "statut" DROP DEFAULT;
ALTER TABLE "amende_medecin"
  ALTER COLUMN "statut" TYPE "StatutAmende"
  USING ("statut"::text::"StatutAmende");
ALTER TABLE "amende_medecin" ALTER COLUMN "statut" SET DEFAULT 'en_attente';

DROP TYPE "StatutAmende_old";

CREATE INDEX "amende_medecin_medecin_id_statut_idx" ON "amende_medecin"("medecin_id", "statut");