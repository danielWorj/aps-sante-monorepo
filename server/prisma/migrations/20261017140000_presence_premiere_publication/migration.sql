-- Abonnements de présence — corrections :
--   1. date de première publication des fiches (pharmacie, centre de
--      santé, médecin). Une fiche déjà publiée qui repasse « en_cours »
--      après une modification de son gestionnaire reste en ligne (elle
--      l'a toujours été) : elle garde ses droits d'abonnement pendant la
--      modération au lieu de perdre téléphone et photo. Posée par
--      déclencheur pour couvrir tous les chemins d'écriture.
--   2. configuration de présence des pays créés APRÈS la migration
--      20261017130000 : rattrapage, puis déclencheur sur "pays" pour
--      tout nouveau pays (API, seed_referentiel.sql, scripts) — sinon les
--      pharmacies et centres d'un nouveau pays perdraient téléphone et
--      photo dès leur publication.
--
-- Prérequis : 20261017130000_vues_fiche_gratuite_amorcage.

-- ---------------------------------------------------------------------------
-- 1. Date de première publication
-- ---------------------------------------------------------------------------
ALTER TABLE "pharmacie" ADD COLUMN "date_premiere_publication" TIMESTAMP(3);
ALTER TABLE "structure_sante" ADD COLUMN "date_premiere_publication" TIMESTAMP(3);
ALTER TABLE "medecin" ADD COLUMN "date_premiere_publication" TIMESTAMP(3);

-- Fiches déjà publiées : date inconnue, on retient la migration.
-- Fiches « en_cours » : impossible de savoir si elles ont déjà été
-- publiées ; elles le seront à leur prochaine validation.
UPDATE "pharmacie" SET "date_premiere_publication" = CURRENT_TIMESTAMP WHERE "statut_verification" = 'publie';
UPDATE "structure_sante" SET "date_premiere_publication" = CURRENT_TIMESTAMP WHERE "statut_verification" = 'publie';
UPDATE "medecin" SET "date_premiere_publication" = CURRENT_TIMESTAMP WHERE "statut_verification" = 'publie';

CREATE OR REPLACE FUNCTION marquer_premiere_publication() RETURNS trigger AS $$
BEGIN
  IF NEW."statut_verification"::text = 'publie' AND NEW."date_premiere_publication" IS NULL THEN
    NEW."date_premiere_publication" := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pharmacie_premiere_publication
  BEFORE INSERT OR UPDATE ON "pharmacie"
  FOR EACH ROW EXECUTE FUNCTION marquer_premiere_publication();
CREATE TRIGGER structure_sante_premiere_publication
  BEFORE INSERT OR UPDATE ON "structure_sante"
  FOR EACH ROW EXECUTE FUNCTION marquer_premiere_publication();
CREATE TRIGGER medecin_premiere_publication
  BEFORE INSERT OR UPDATE ON "medecin"
  FOR EACH ROW EXECUTE FUNCTION marquer_premiere_publication();

-- ---------------------------------------------------------------------------
-- 2. Pays sans configuration -> gratuité d'amorçage du niveau de rang 1
--    (pharmacies et centres), comme la migration précédente. Médecins :
--    pas de ligne (abonnement non obligatoire). La bascule vers le payant
--    se fait ensuite depuis le back-office.
-- ---------------------------------------------------------------------------
INSERT INTO "config_abonnement_presence" ("type_acteur", "pays_id", "gratuite_active", "gratuite_niveau_id")
SELECT n."type_acteur", p."pays_id", true, n."niveau_id"
FROM "niveau_abonnement_presence" n
CROSS JOIN "pays" p
WHERE n."rang" = 1 AND n."type_acteur" IN ('pharmacie', 'structure')
ON CONFLICT ("type_acteur", "pays_id") DO NOTHING;

CREATE OR REPLACE FUNCTION configurer_presence_nouveau_pays() RETURNS trigger AS $$
BEGIN
  INSERT INTO "config_abonnement_presence" ("type_acteur", "pays_id", "gratuite_active", "gratuite_niveau_id")
  SELECT n."type_acteur", NEW."pays_id", true, n."niveau_id"
  FROM "niveau_abonnement_presence" n
  WHERE n."rang" = 1 AND n."type_acteur" IN ('pharmacie', 'structure')
  ON CONFLICT ("type_acteur", "pays_id") DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pays_configuration_presence
  AFTER INSERT ON "pays"
  FOR EACH ROW EXECUTE FUNCTION configurer_presence_nouveau_pays();
