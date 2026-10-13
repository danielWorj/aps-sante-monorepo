-- Abonnements des assurances — Phase 1 : modèle de données.
--
-- Aucune logique métier ici. Cette migration ajoute :
--   1. les enums StatutAbonnementAssurance et OrigineAbonnementAssurance ;
--   2. les tables : niveau_abonnement_assurance, abonnement_assurance,
--      tarif_abonnement_assurance, remise_duree_abonnement_assurance,
--      config_abonnement_assurance, facture_abonnement_assurance,
--      compteur_facture_abonnement ;
--   3. la colonne "abonnement_assurance_id_cible" sur "transaction_paiement" ;
--   4. les contraintes que Prisma ne sait pas exprimer (CHECK, index uniques
--      partiels, déclencheur d'ajout seul).
--
-- Prérequis : la migration 20261013100000_journal_audit (fonction
-- interdire_modification()).
--
-- Sans risque sur les données existantes : seules des tables sont créées, et
-- la seule colonne ajoutée à une table existante est nullable.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
CREATE TYPE "StatutAbonnementAssurance" AS ENUM ('en_attente_paiement', 'actif', 'expire', 'annule', 'suspendu', 'remplace');

CREATE TYPE "OrigineAbonnementAssurance" AS ENUM ('self_service', 'admin', 'virement', 'geste', 'gratuite');

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE "niveau_abonnement_assurance" (
    "niveau_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "rang" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "siege_complet" BOOLEAN NOT NULL DEFAULT true,
    "afficher_activites" BOOLEAN NOT NULL DEFAULT true,
    "afficher_agences" BOOLEAN NOT NULL DEFAULT true,
    "formulaire_contact" BOOLEAN NOT NULL DEFAULT true,
    "suivi_demandes" BOOLEAN NOT NULL DEFAULT true,
    "video_presentation" BOOLEAN NOT NULL DEFAULT false,
    "vitrine_premium" BOOLEAN NOT NULL DEFAULT false,
    "stats_completes" BOOLEAN NOT NULL DEFAULT false,
    "export_stats" BOOLEAN NOT NULL DEFAULT false,
    "max_agences" INTEGER,
    "max_photos" INTEGER,
    "max_gestionnaires" INTEGER,

    CONSTRAINT "niveau_abonnement_assurance_pkey" PRIMARY KEY ("niveau_id")
);

CREATE TABLE "abonnement_assurance" (
    "abonnement_id" UUID NOT NULL,
    "service_assurance_id" UUID NOT NULL,
    "niveau_id" UUID NOT NULL,
    "duree_mois" INTEGER NOT NULL,
    "prix_mensuel_applique" DECIMAL(12,2) NOT NULL,
    "remise_pourcent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "credit_prorata" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "montant_total" DECIMAL(12,2) NOT NULL,
    "devise" VARCHAR(3) NOT NULL,
    "date_debut" DATE,
    "date_fin" DATE,
    "statut" "StatutAbonnementAssurance" NOT NULL DEFAULT 'en_attente_paiement',
    "abonnement_remplace_id" UUID,
    "dernier_rappel_jours" INTEGER,
    "transaction_id" UUID,
    "motif" TEXT,
    "origine" "OrigineAbonnementAssurance" NOT NULL DEFAULT 'self_service',
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_mise_a_jour" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "abonnement_assurance_pkey" PRIMARY KEY ("abonnement_id")
);

CREATE TABLE "tarif_abonnement_assurance" (
    "tarif_id" UUID NOT NULL,
    "niveau_id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "type_acteur" "TypeActeurAssurance",
    "devise" VARCHAR(3) NOT NULL,
    "prix_mensuel" DECIMAL(12,2) NOT NULL,
    "prix_usd_indicatif" DECIMAL(12,2),
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tarif_abonnement_assurance_pkey" PRIMARY KEY ("tarif_id")
);

CREATE TABLE "remise_duree_abonnement_assurance" (
    "duree_mois" INTEGER NOT NULL,
    "remise_pourcent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "remise_duree_abonnement_assurance_pkey" PRIMARY KEY ("duree_mois")
);

CREATE TABLE "config_abonnement_assurance" (
    "pays_id" UUID NOT NULL,
    "gratuite_active" BOOLEAN NOT NULL DEFAULT false,
    "gratuite_niveau_id" UUID,
    "gratuite_jusqu_au" DATE,
    "grace_jours" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "config_abonnement_assurance_pkey" PRIMARY KEY ("pays_id")
);

CREATE TABLE "facture_abonnement_assurance" (
    "facture_id" UUID NOT NULL,
    "numero" VARCHAR(30) NOT NULL,
    "abonnement_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "date_emission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "devise" VARCHAR(3) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "facture_abonnement_assurance_pkey" PRIMARY KEY ("facture_id")
);

CREATE TABLE "compteur_facture_abonnement" (
    "annee" INTEGER NOT NULL,
    "dernier" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "compteur_facture_abonnement_pkey" PRIMARY KEY ("annee")
);

-- ---------------------------------------------------------------------------
-- 3. transaction_paiement : abonnement visé (sans clé étrangère, comme
--    rdv_id_cible)
-- ---------------------------------------------------------------------------
ALTER TABLE "transaction_paiement" ADD COLUMN "abonnement_assurance_id_cible" UUID;

-- ---------------------------------------------------------------------------
-- 4. Index et unicités
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "niveau_abonnement_assurance_code_key" ON "niveau_abonnement_assurance"("code");

CREATE INDEX "abonnement_assurance_service_assurance_id_statut_idx" ON "abonnement_assurance"("service_assurance_id", "statut");

CREATE INDEX "abonnement_assurance_statut_date_fin_idx" ON "abonnement_assurance"("statut", "date_fin");

CREATE INDEX "abonnement_assurance_niveau_id_idx" ON "abonnement_assurance"("niveau_id");

CREATE INDEX "abonnement_assurance_transaction_id_idx" ON "abonnement_assurance"("transaction_id");

CREATE INDEX "tarif_abonnement_assurance_niveau_id_pays_id_idx" ON "tarif_abonnement_assurance"("niveau_id", "pays_id");

CREATE INDEX "tarif_abonnement_assurance_pays_id_idx" ON "tarif_abonnement_assurance"("pays_id");

CREATE UNIQUE INDEX "facture_abonnement_assurance_numero_key" ON "facture_abonnement_assurance"("numero");

CREATE UNIQUE INDEX "facture_abonnement_assurance_abonnement_id_key" ON "facture_abonnement_assurance"("abonnement_id");

CREATE UNIQUE INDEX "facture_abonnement_assurance_transaction_id_key" ON "facture_abonnement_assurance"("transaction_id");

CREATE INDEX "transaction_paiement_abonnement_assurance_id_cible_idx" ON "transaction_paiement"("abonnement_assurance_id_cible");

-- ---------------------------------------------------------------------------
-- 5. Clés étrangères
-- ---------------------------------------------------------------------------
ALTER TABLE "abonnement_assurance" ADD CONSTRAINT "abonnement_assurance_service_assurance_id_fkey" FOREIGN KEY ("service_assurance_id") REFERENCES "service_assurance"("service_assurance_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "abonnement_assurance" ADD CONSTRAINT "abonnement_assurance_niveau_id_fkey" FOREIGN KEY ("niveau_id") REFERENCES "niveau_abonnement_assurance"("niveau_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "abonnement_assurance" ADD CONSTRAINT "abonnement_assurance_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction_paiement"("transaction_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tarif_abonnement_assurance" ADD CONSTRAINT "tarif_abonnement_assurance_niveau_id_fkey" FOREIGN KEY ("niveau_id") REFERENCES "niveau_abonnement_assurance"("niveau_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tarif_abonnement_assurance" ADD CONSTRAINT "tarif_abonnement_assurance_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "config_abonnement_assurance" ADD CONSTRAINT "config_abonnement_assurance_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "facture_abonnement_assurance" ADD CONSTRAINT "facture_abonnement_assurance_abonnement_id_fkey" FOREIGN KEY ("abonnement_id") REFERENCES "abonnement_assurance"("abonnement_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Contraintes que Prisma ne sait pas exprimer (déclarées ici seulement)
-- ---------------------------------------------------------------------------

-- Une transaction vise un RDV OU un abonnement, jamais les deux.
ALTER TABLE "transaction_paiement" ADD CONSTRAINT "transaction_objet_unique"
  CHECK (NOT ("rdv_id_cible" IS NOT NULL AND "abonnement_assurance_id_cible" IS NOT NULL));

-- Tarifs : unicité qui tient compte des NULL (type_acteur). Sous PostgreSQL,
-- deux NULL sont distincts : un @@unique classique laisserait passer des
-- doublons de tarif générique.
CREATE UNIQUE INDEX "tarif_abo_assurance_specifique"
  ON "tarif_abonnement_assurance" ("niveau_id", "pays_id", "type_acteur") WHERE "type_acteur" IS NOT NULL;

CREATE UNIQUE INDEX "tarif_abo_assurance_generique"
  ON "tarif_abonnement_assurance" ("niveau_id", "pays_id") WHERE "type_acteur" IS NULL;

-- Un seul brouillon ouvert par fiche.
CREATE UNIQUE INDEX "abo_assurance_un_brouillon"
  ON "abonnement_assurance" ("service_assurance_id") WHERE "statut" = 'en_attente_paiement';

-- Facture archivée : ajout seul (fonction définie dans la migration
-- 20261013100000_journal_audit).
CREATE TRIGGER facture_abo_assurance_ajout_seul
  BEFORE UPDATE OR DELETE ON "facture_abonnement_assurance"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();