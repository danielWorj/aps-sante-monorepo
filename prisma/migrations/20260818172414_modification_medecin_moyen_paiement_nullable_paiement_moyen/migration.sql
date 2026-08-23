-- AlterTable
ALTER TABLE "medecin" ADD COLUMN     "biographie" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cv_url" VARCHAR(255),
ADD COLUMN     "linkedInUrl" VARCHAR(255);

-- CreateTable
CREATE TABLE "type_mobile_money" (
    "id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,

    CONSTRAINT "type_mobile_money_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobile_money" (
    "id" UUID NOT NULL,
    "type_mobile_money_id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "numero" VARCHAR(50) NOT NULL,
    "titulaire" VARCHAR(255) NOT NULL,

    CONSTRAINT "mobile_money_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compte_bancaire" (
    "id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "nom_banque" VARCHAR(150) NOT NULL,
    "titulaire" VARCHAR(255) NOT NULL,
    "iban" VARCHAR(100) NOT NULL,

    CONSTRAINT "compte_bancaire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "type_mobile_money_pays_id_idx" ON "type_mobile_money"("pays_id");

-- CreateIndex
CREATE INDEX "mobile_money_type_mobile_money_id_idx" ON "mobile_money"("type_mobile_money_id");

-- CreateIndex
CREATE INDEX "mobile_money_medecin_id_idx" ON "mobile_money"("medecin_id");

-- CreateIndex
CREATE INDEX "compte_bancaire_medecin_id_idx" ON "compte_bancaire"("medecin_id");

-- AddForeignKey
ALTER TABLE "type_mobile_money" ADD CONSTRAINT "type_mobile_money_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_money" ADD CONSTRAINT "mobile_money_type_mobile_money_id_fkey" FOREIGN KEY ("type_mobile_money_id") REFERENCES "type_mobile_money"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_money" ADD CONSTRAINT "mobile_money_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compte_bancaire" ADD CONSTRAINT "compte_bancaire_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE RESTRICT ON UPDATE CASCADE;
