-- CreateEnum
CREATE TYPE "StatutModerationAvis" AS ENUM ('en_attente', 'publie', 'rejete');

-- CreateEnum
CREATE TYPE "StatutAbonnementPharmacie" AS ENUM ('actif', 'expire', 'annule');

-- CreateEnum
CREATE TYPE "StatutModerationPublicite" AS ENUM ('en_attente', 'validee', 'rejetee');

-- CreateEnum
CREATE TYPE "StatutPlanningGarde" AS ENUM ('brouillon', 'publie', 'expire', 'annule');

-- CreateTable
CREATE TABLE "avis_pharmacie" (
    "avis_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "pharmacie_id" UUID NOT NULL,
    "note" SMALLINT NOT NULL,
    "commentaire" TEXT,
    "statut_moderation" "StatutModerationAvis" NOT NULL DEFAULT 'en_attente',
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avis_pharmacie_pkey" PRIMARY KEY ("avis_id")
);

-- CreateTable
CREATE TABLE "abonnement_pharmacie" (
    "abonnement_id" UUID NOT NULL,
    "pharmacie_id" UUID NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "duree_jours" INTEGER NOT NULL,
    "date_debut" DATE NOT NULL,
    "date_fin" DATE NOT NULL,
    "transaction_id" UUID NOT NULL,
    "statut" "StatutAbonnementPharmacie" NOT NULL,

    CONSTRAINT "abonnement_pharmacie_pkey" PRIMARY KEY ("abonnement_id")
);

-- CreateTable
CREATE TABLE "ligne_abonnement_pharmacie" (
    "ligne_id" UUID NOT NULL,
    "abonnement_id" UUID NOT NULL,
    "libelle_avantage" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "ordre_affichage" SMALLINT NOT NULL,

    CONSTRAINT "ligne_abonnement_pharmacie_pkey" PRIMARY KEY ("ligne_id")
);

-- CreateTable
CREATE TABLE "page_website" (
    "page_web_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),

    CONSTRAINT "page_website_pkey" PRIMARY KEY ("page_web_id")
);

-- CreateTable
CREATE TABLE "publicite_pharmacie" (
    "publicite_id" UUID NOT NULL,
    "pharmacie_id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "page_web_id" UUID NOT NULL,
    "formule_publicitaire_id" UUID NOT NULL,
    "date_debut" DATE NOT NULL,
    "date_fin" DATE NOT NULL,
    "transaction_id" UUID NOT NULL,
    "statut_moderation" "StatutModerationPublicite" NOT NULL,
    "visuel_nom" VARCHAR(255) NOT NULL,

    CONSTRAINT "publicite_pharmacie_pkey" PRIMARY KEY ("publicite_id")
);

-- CreateTable
CREATE TABLE "planning_garde" (
    "planning_garde_id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "statut" "StatutPlanningGarde" NOT NULL,
    "periode_debut" DATE NOT NULL,
    "periode_fin" DATE NOT NULL,

    CONSTRAINT "planning_garde_pkey" PRIMARY KEY ("planning_garde_id")
);

-- CreateTable
CREATE TABLE "garde_pharmacie" (
    "garde_id" UUID NOT NULL,
    "planning_garde_id" UUID NOT NULL,
    "pharmacie_id" UUID NOT NULL,
    "ville_id" UUID NOT NULL,
    "date_debut" TIMESTAMP(3) NOT NULL,
    "date_fin" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "garde_pharmacie_pkey" PRIMARY KEY ("garde_id")
);

-- CreateTable
CREATE TABLE "transaction_paiement" (
    "transaction_id" UUID NOT NULL,

    CONSTRAINT "transaction_paiement_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "formule_publicitaire" (
    "formule_publicitaire_id" UUID NOT NULL,

    CONSTRAINT "formule_publicitaire_pkey" PRIMARY KEY ("formule_publicitaire_id")
);

-- CreateIndex
CREATE INDEX "avis_pharmacie_utilisateur_id_idx" ON "avis_pharmacie"("utilisateur_id");

-- CreateIndex
CREATE INDEX "avis_pharmacie_pharmacie_id_idx" ON "avis_pharmacie"("pharmacie_id");

-- CreateIndex
CREATE INDEX "abonnement_pharmacie_pharmacie_id_idx" ON "abonnement_pharmacie"("pharmacie_id");

-- CreateIndex
CREATE INDEX "abonnement_pharmacie_transaction_id_idx" ON "abonnement_pharmacie"("transaction_id");

-- CreateIndex
CREATE INDEX "ligne_abonnement_pharmacie_abonnement_id_idx" ON "ligne_abonnement_pharmacie"("abonnement_id");

-- CreateIndex
CREATE UNIQUE INDEX "page_website_code_key" ON "page_website"("code");

-- CreateIndex
CREATE INDEX "publicite_pharmacie_pharmacie_id_idx" ON "publicite_pharmacie"("pharmacie_id");

-- CreateIndex
CREATE INDEX "publicite_pharmacie_pays_id_idx" ON "publicite_pharmacie"("pays_id");

-- CreateIndex
CREATE INDEX "publicite_pharmacie_page_web_id_idx" ON "publicite_pharmacie"("page_web_id");

-- CreateIndex
CREATE INDEX "publicite_pharmacie_formule_publicitaire_id_idx" ON "publicite_pharmacie"("formule_publicitaire_id");

-- CreateIndex
CREATE INDEX "publicite_pharmacie_transaction_id_idx" ON "publicite_pharmacie"("transaction_id");

-- CreateIndex
CREATE INDEX "planning_garde_pays_id_idx" ON "planning_garde"("pays_id");

-- CreateIndex
CREATE INDEX "garde_pharmacie_planning_garde_id_idx" ON "garde_pharmacie"("planning_garde_id");

-- CreateIndex
CREATE INDEX "garde_pharmacie_pharmacie_id_idx" ON "garde_pharmacie"("pharmacie_id");

-- CreateIndex
CREATE INDEX "garde_pharmacie_ville_id_idx" ON "garde_pharmacie"("ville_id");

-- AddForeignKey
ALTER TABLE "avis_pharmacie" ADD CONSTRAINT "avis_pharmacie_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avis_pharmacie" ADD CONSTRAINT "avis_pharmacie_pharmacie_id_fkey" FOREIGN KEY ("pharmacie_id") REFERENCES "pharmacie"("pharmacie_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonnement_pharmacie" ADD CONSTRAINT "abonnement_pharmacie_pharmacie_id_fkey" FOREIGN KEY ("pharmacie_id") REFERENCES "pharmacie"("pharmacie_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonnement_pharmacie" ADD CONSTRAINT "abonnement_pharmacie_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction_paiement"("transaction_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_abonnement_pharmacie" ADD CONSTRAINT "ligne_abonnement_pharmacie_abonnement_id_fkey" FOREIGN KEY ("abonnement_id") REFERENCES "abonnement_pharmacie"("abonnement_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicite_pharmacie" ADD CONSTRAINT "publicite_pharmacie_pharmacie_id_fkey" FOREIGN KEY ("pharmacie_id") REFERENCES "pharmacie"("pharmacie_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicite_pharmacie" ADD CONSTRAINT "publicite_pharmacie_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicite_pharmacie" ADD CONSTRAINT "publicite_pharmacie_page_web_id_fkey" FOREIGN KEY ("page_web_id") REFERENCES "page_website"("page_web_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicite_pharmacie" ADD CONSTRAINT "publicite_pharmacie_formule_publicitaire_id_fkey" FOREIGN KEY ("formule_publicitaire_id") REFERENCES "formule_publicitaire"("formule_publicitaire_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicite_pharmacie" ADD CONSTRAINT "publicite_pharmacie_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction_paiement"("transaction_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_garde" ADD CONSTRAINT "planning_garde_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garde_pharmacie" ADD CONSTRAINT "garde_pharmacie_planning_garde_id_fkey" FOREIGN KEY ("planning_garde_id") REFERENCES "planning_garde"("planning_garde_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garde_pharmacie" ADD CONSTRAINT "garde_pharmacie_pharmacie_id_fkey" FOREIGN KEY ("pharmacie_id") REFERENCES "pharmacie"("pharmacie_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garde_pharmacie" ADD CONSTRAINT "garde_pharmacie_ville_id_fkey" FOREIGN KEY ("ville_id") REFERENCES "ville"("ville_id") ON DELETE RESTRICT ON UPDATE CASCADE;
