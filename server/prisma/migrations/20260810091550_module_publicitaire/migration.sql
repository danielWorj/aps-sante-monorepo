/*
  Warnings:

  - You are about to drop the `formule_publicitaire` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `page_website` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `publicite_pharmacie` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "publicite_pharmacie" DROP CONSTRAINT "publicite_pharmacie_formule_publicitaire_id_fkey";

-- DropForeignKey
ALTER TABLE "publicite_pharmacie" DROP CONSTRAINT "publicite_pharmacie_page_web_id_fkey";

-- DropForeignKey
ALTER TABLE "publicite_pharmacie" DROP CONSTRAINT "publicite_pharmacie_pays_id_fkey";

-- DropForeignKey
ALTER TABLE "publicite_pharmacie" DROP CONSTRAINT "publicite_pharmacie_pharmacie_id_fkey";

-- DropForeignKey
ALTER TABLE "publicite_pharmacie" DROP CONSTRAINT "publicite_pharmacie_transaction_id_fkey";

-- DropTable
DROP TABLE "formule_publicitaire";

-- DropTable
DROP TABLE "page_website";

-- DropTable
DROP TABLE "publicite_pharmacie";

-- CreateTable
CREATE TABLE "emplacement_publicitaire" (
    "emplacement_publicitaire_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "libelle" VARCHAR(150) NOT NULL,
    "description" TEXT,

    CONSTRAINT "emplacement_publicitaire_pkey" PRIMARY KEY ("emplacement_publicitaire_id")
);

-- CreateTable
CREATE TABLE "forfait_publicitaire" (
    "forfait_publicitaire_id" UUID NOT NULL,
    "emplacement_publicitaire_id" UUID NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "prix" DECIMAL(12,2) NOT NULL,
    "duree_jours" INTEGER NOT NULL,

    CONSTRAINT "forfait_publicitaire_pkey" PRIMARY KEY ("forfait_publicitaire_id")
);

-- CreateTable
CREATE TABLE "ligne_forfait_publicitaire" (
    "ligne_id" UUID NOT NULL,
    "forfait_publicitaire_id" UUID NOT NULL,
    "libelle_avantage" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "ordre_affichage" SMALLINT NOT NULL,

    CONSTRAINT "ligne_forfait_publicitaire_pkey" PRIMARY KEY ("ligne_id")
);

-- CreateTable
CREATE TABLE "publicite" (
    "publicite_id" UUID NOT NULL,
    "forfait_publicitaire_id" UUID NOT NULL,
    "emplacement_publicitaire_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "titre" VARCHAR(150) NOT NULL,
    "visuel_url" TEXT NOT NULL,
    "lien_cible_url" TEXT NOT NULL,
    "date_debut" DATE NOT NULL,
    "date_fin" DATE NOT NULL,
    "statut_moderation" "StatutModerationPublicite" NOT NULL DEFAULT 'en_attente',

    CONSTRAINT "publicite_pkey" PRIMARY KEY ("publicite_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emplacement_publicitaire_code_key" ON "emplacement_publicitaire"("code");

-- CreateIndex
CREATE INDEX "forfait_publicitaire_emplacement_publicitaire_id_idx" ON "forfait_publicitaire"("emplacement_publicitaire_id");

-- CreateIndex
CREATE INDEX "ligne_forfait_publicitaire_forfait_publicitaire_id_idx" ON "ligne_forfait_publicitaire"("forfait_publicitaire_id");

-- CreateIndex
CREATE INDEX "publicite_forfait_publicitaire_id_idx" ON "publicite"("forfait_publicitaire_id");

-- CreateIndex
CREATE INDEX "publicite_emplacement_publicitaire_id_idx" ON "publicite"("emplacement_publicitaire_id");

-- CreateIndex
CREATE INDEX "publicite_utilisateur_id_idx" ON "publicite"("utilisateur_id");

-- CreateIndex
CREATE INDEX "publicite_pays_id_idx" ON "publicite"("pays_id");

-- AddForeignKey
ALTER TABLE "forfait_publicitaire" ADD CONSTRAINT "forfait_publicitaire_emplacement_publicitaire_id_fkey" FOREIGN KEY ("emplacement_publicitaire_id") REFERENCES "emplacement_publicitaire"("emplacement_publicitaire_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_forfait_publicitaire" ADD CONSTRAINT "ligne_forfait_publicitaire_forfait_publicitaire_id_fkey" FOREIGN KEY ("forfait_publicitaire_id") REFERENCES "forfait_publicitaire"("forfait_publicitaire_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicite" ADD CONSTRAINT "publicite_forfait_publicitaire_id_fkey" FOREIGN KEY ("forfait_publicitaire_id") REFERENCES "forfait_publicitaire"("forfait_publicitaire_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicite" ADD CONSTRAINT "publicite_emplacement_publicitaire_id_fkey" FOREIGN KEY ("emplacement_publicitaire_id") REFERENCES "emplacement_publicitaire"("emplacement_publicitaire_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicite" ADD CONSTRAINT "publicite_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicite" ADD CONSTRAINT "publicite_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;
