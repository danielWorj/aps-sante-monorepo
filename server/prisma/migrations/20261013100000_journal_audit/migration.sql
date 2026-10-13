-- Abonnements assurance — Phase 0 : journal d'audit immuable (EF-AUD-01).
--
-- Cette migration ajoute uniquement :
--   1. la table "journal_audit" ;
--   2. la fonction générique "interdire_modification()" et le déclencheur
--      d'ajout seul sur "journal_audit" (UPDATE et DELETE interdits).
--
-- La fonction "interdire_modification()" est réutilisée par la migration
-- suivante (abonnement_assurance) pour rendre "facture_abonnement_assurance"
-- en ajout seul. Sans risque sur les données existantes : nouvelle table.

-- ---------------------------------------------------------------------------
-- 1. journal_audit
-- ---------------------------------------------------------------------------
CREATE TABLE "journal_audit" (
    "audit_id" UUID NOT NULL,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acteur_id" UUID,
    "type" VARCHAR(60) NOT NULL,
    "objet_type" VARCHAR(40) NOT NULL,
    "objet_id" UUID,
    "details" JSONB,

    CONSTRAINT "journal_audit_pkey" PRIMARY KEY ("audit_id")
);

-- CreateIndex
CREATE INDEX "journal_audit_objet_type_objet_id_idx" ON "journal_audit"("objet_type", "objet_id");

-- CreateIndex
CREATE INDEX "journal_audit_type_date_creation_idx" ON "journal_audit"("type", "date_creation");

-- ---------------------------------------------------------------------------
-- 2. Ajout seul
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION interdire_modification() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La table % est en ajout seul', TG_TABLE_NAME;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER journal_audit_ajout_seul
  BEFORE UPDATE OR DELETE ON "journal_audit"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();