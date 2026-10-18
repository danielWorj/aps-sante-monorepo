-- Abonnements de présence — suite :
--   1. compteur de vues des fiches (statistiques de consultation) ;
--   2. gratuité d'amorçage ACTIVÉE d'office pour les pharmacies et les
--      centres de santé de tous les pays (décision du 2026-10-17, avant
--      déploiement) : sans elle, toutes les fiches perdraient leur
--      téléphone et leur photo publics dès la mise en production.
--      Sans date de fin : la bascule vers le payant se fait depuis le
--      back-office (Tarifs & paramètres -> Paramètres par pays).
--      Médecins : non concernés (abonnement non obligatoire par défaut).
--
-- Prérequis : 20261017120100_abonnement_presence. Sans risque sur les
-- données existantes (tables créées, lignes de configuration ajoutées).

-- ---------------------------------------------------------------------------
-- 1. Compteur de vues
-- ---------------------------------------------------------------------------
CREATE TABLE "vue_fiche" (
    "type_acteur" "TypeActeurPresence" NOT NULL,
    "acteur_id" UUID NOT NULL,
    "jour" DATE NOT NULL,
    "vues" INTEGER NOT NULL DEFAULT 0,
    "visiteurs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vue_fiche_pkey" PRIMARY KEY ("type_acteur","acteur_id","jour")
);

CREATE INDEX "vue_fiche_type_acteur_jour_idx" ON "vue_fiche"("type_acteur", "jour");

CREATE TABLE "vue_fiche_visiteur" (
    "type_acteur" "TypeActeurPresence" NOT NULL,
    "acteur_id" UUID NOT NULL,
    "jour" DATE NOT NULL,
    "empreinte" VARCHAR(64) NOT NULL,
    "derniere_vue" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vue_fiche_visiteur_pkey" PRIMARY KEY ("type_acteur","acteur_id","jour","empreinte")
);

CREATE INDEX "vue_fiche_visiteur_jour_idx" ON "vue_fiche_visiteur"("jour");

-- ---------------------------------------------------------------------------
-- 2. Gratuité d'amorçage : niveau de rang 1 offert, pharmacies et centres
-- ---------------------------------------------------------------------------
INSERT INTO "config_abonnement_presence" ("type_acteur", "pays_id", "gratuite_active", "gratuite_niveau_id")
SELECT n."type_acteur", p."pays_id", true, n."niveau_id"
FROM "niveau_abonnement_presence" n
CROSS JOIN "pays" p
WHERE n."rang" = 1 AND n."type_acteur" IN ('pharmacie', 'structure')
ON CONFLICT ("type_acteur", "pays_id") DO UPDATE
  SET "gratuite_active" = true, "gratuite_niveau_id" = EXCLUDED."gratuite_niveau_id"
  WHERE "config_abonnement_presence"."gratuite_niveau_id" IS NULL;
