-- Réputation médecin : avis de patients vérifiés (rattachés à un RDV
-- terminé), critères, réponse et signalement du médecin, note moyenne
-- dénormalisée, engagements sur la fiche publique (tableau de bord).
--
-- Prérequis : 20261019120000_reputation_medecin_enums. Sans risque sur les
-- données existantes : colonnes facultatives ou à valeur par défaut, les
-- avis existants restent valides (rdv_id NULL = avis antérieur).

-- ---------------------------------------------------------------------------
-- 1. Avis médecin
-- ---------------------------------------------------------------------------
ALTER TABLE "avis_medecin"
    ADD COLUMN "rdv_id" UUID,
    ADD COLUMN "note_ponctualite" SMALLINT,
    ADD COLUMN "note_ecoute" SMALLINT,
    ADD COLUMN "note_explications" SMALLINT,
    ADD COLUMN "recommande" BOOLEAN,
    ADD COLUMN "anonyme" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "date_moderation" TIMESTAMP(3),
    ADD COLUMN "reponse_medecin" TEXT,
    ADD COLUMN "date_reponse" TIMESTAMP(3),
    ADD COLUMN "signale_le" TIMESTAMP(3),
    ADD COLUMN "motif_signalement" TEXT;

CREATE UNIQUE INDEX "avis_medecin_rdv_id_key" ON "avis_medecin"("rdv_id");
CREATE INDEX "avis_medecin_medecin_id_statut_moderation_date_creation_idx"
    ON "avis_medecin"("medecin_id", "statut_moderation", "date_creation");

ALTER TABLE "avis_medecin" ADD CONSTRAINT "avis_medecin_rdv_id_fkey"
    FOREIGN KEY ("rdv_id") REFERENCES "rendez_vous"("rdv_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Notes bornées (la note globale l'était déjà côté API seulement).
ALTER TABLE "avis_medecin" ADD CONSTRAINT "avis_medecin_notes_bornees" CHECK (
    "note" BETWEEN 1 AND 5
    AND ("note_ponctualite" IS NULL OR "note_ponctualite" BETWEEN 1 AND 5)
    AND ("note_ecoute" IS NULL OR "note_ecoute" BETWEEN 1 AND 5)
    AND ("note_explications" IS NULL OR "note_explications" BETWEEN 1 AND 5)
) NOT VALID;

-- ---------------------------------------------------------------------------
-- 2. Note moyenne dénormalisée sur la fiche médecin (+ rattrapage)
-- ---------------------------------------------------------------------------
ALTER TABLE "medecin"
    ADD COLUMN "note_moyenne" DECIMAL(3,2),
    ADD COLUMN "nombre_avis" INTEGER NOT NULL DEFAULT 0;

UPDATE "medecin" m
SET "note_moyenne" = a.moyenne, "nombre_avis" = a.nombre
FROM (
    SELECT "medecin_id", ROUND(AVG("note")::numeric, 2) AS moyenne, COUNT(*)::int AS nombre
    FROM "avis_medecin"
    WHERE "statut_moderation" = 'publie'
    GROUP BY "medecin_id"
) a
WHERE a."medecin_id" = m."medecin_id";

-- ---------------------------------------------------------------------------
-- 3. Engagements sur la fiche publique
-- ---------------------------------------------------------------------------
CREATE TABLE "engagement_medecin" (
    "medecin_id" UUID NOT NULL,
    "jour" DATE NOT NULL,
    "type" "TypeEngagementMedecin" NOT NULL,
    "nombre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "engagement_medecin_pkey" PRIMARY KEY ("medecin_id","jour","type")
);

CREATE INDEX "engagement_medecin_jour_idx" ON "engagement_medecin"("jour");

ALTER TABLE "engagement_medecin" ADD CONSTRAINT "engagement_medecin_medecin_id_fkey"
    FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "engagement_medecin_visiteur" (
    "medecin_id" UUID NOT NULL,
    "jour" DATE NOT NULL,
    "type" "TypeEngagementMedecin" NOT NULL,
    "empreinte" VARCHAR(64) NOT NULL,

    CONSTRAINT "engagement_medecin_visiteur_pkey" PRIMARY KEY ("medecin_id","jour","type","empreinte")
);

CREATE INDEX "engagement_medecin_visiteur_jour_idx" ON "engagement_medecin_visiteur"("jour");
