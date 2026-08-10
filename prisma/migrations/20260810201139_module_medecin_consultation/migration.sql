-- CreateEnum
CREATE TYPE "StatutAbonnementMedecin" AS ENUM ('actif', 'expire', 'annule');

-- CreateEnum
CREATE TYPE "TypeRdv" AS ENUM ('physique', 'teleconsultation');

-- CreateEnum
CREATE TYPE "StatutRendezVous" AS ENUM ('cree', 'confirme', 'en_attente_presence', 'honore', 'non_honore', 'annule', 'conteste');

-- CreateTable
CREATE TABLE "compte_escrow" (
    "escrow_id" UUID NOT NULL,

    CONSTRAINT "compte_escrow_pkey" PRIMARY KEY ("escrow_id")
);

-- CreateTable
CREATE TABLE "avis_medecin" (
    "avis_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "note" SMALLINT NOT NULL,
    "commentaire" TEXT,
    "statut_moderation" "StatutModerationAvis" NOT NULL DEFAULT 'en_attente',
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avis_medecin_pkey" PRIMARY KEY ("avis_id")
);

-- CreateTable
CREATE TABLE "abonnement_medecin" (
    "abonnement_id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "duree_jours" INTEGER NOT NULL,
    "date_debut" DATE NOT NULL,
    "date_fin" DATE NOT NULL,
    "transaction_id" UUID NOT NULL,
    "statut" "StatutAbonnementMedecin" NOT NULL,

    CONSTRAINT "abonnement_medecin_pkey" PRIMARY KEY ("abonnement_id")
);

-- CreateTable
CREATE TABLE "ligne_abonnement_medecin" (
    "ligne_id" UUID NOT NULL,
    "abonnement_id" UUID NOT NULL,
    "libelle_avantage" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "ordre_affichage" SMALLINT NOT NULL,

    CONSTRAINT "ligne_abonnement_medecin_pkey" PRIMARY KEY ("ligne_id")
);

-- CreateTable
CREATE TABLE "rendez_vous" (
    "rdv_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "structure_id" UUID,
    "type_rdv" "TypeRdv" NOT NULL,
    "date_creneau" TIMESTAMP(3) NOT NULL,
    "statut" "StatutRendezVous" NOT NULL,
    "code_unique" VARCHAR(8) NOT NULL,
    "qr_token_secret" TEXT NOT NULL,

    CONSTRAINT "rendez_vous_pkey" PRIMARY KEY ("rdv_id")
);

-- CreateTable
CREATE TABLE "ordonnance" (
    "ordonnance_id" UUID NOT NULL,
    "rdv_id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "identifiant_unique" VARCHAR(50) NOT NULL,
    "pays_emission_id" UUID NOT NULL,
    "contenu" TEXT NOT NULL,
    "date_emission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ordonnance_pkey" PRIMARY KEY ("ordonnance_id")
);

-- CreateIndex
CREATE INDEX "avis_medecin_utilisateur_id_idx" ON "avis_medecin"("utilisateur_id");

-- CreateIndex
CREATE INDEX "avis_medecin_medecin_id_idx" ON "avis_medecin"("medecin_id");

-- CreateIndex
CREATE INDEX "abonnement_medecin_medecin_id_idx" ON "abonnement_medecin"("medecin_id");

-- CreateIndex
CREATE INDEX "abonnement_medecin_transaction_id_idx" ON "abonnement_medecin"("transaction_id");

-- CreateIndex
CREATE INDEX "ligne_abonnement_medecin_abonnement_id_idx" ON "ligne_abonnement_medecin"("abonnement_id");

-- CreateIndex
CREATE UNIQUE INDEX "rendez_vous_code_unique_key" ON "rendez_vous"("code_unique");

-- CreateIndex
CREATE INDEX "rendez_vous_patient_id_idx" ON "rendez_vous"("patient_id");

-- CreateIndex
CREATE INDEX "rendez_vous_medecin_id_idx" ON "rendez_vous"("medecin_id");

-- CreateIndex
CREATE INDEX "rendez_vous_structure_id_idx" ON "rendez_vous"("structure_id");

-- CreateIndex
CREATE UNIQUE INDEX "ordonnance_identifiant_unique_key" ON "ordonnance"("identifiant_unique");

-- CreateIndex
CREATE INDEX "ordonnance_rdv_id_idx" ON "ordonnance"("rdv_id");

-- CreateIndex
CREATE INDEX "ordonnance_medecin_id_idx" ON "ordonnance"("medecin_id");

-- CreateIndex
CREATE INDEX "ordonnance_patient_id_idx" ON "ordonnance"("patient_id");

-- CreateIndex
CREATE INDEX "ordonnance_pays_emission_id_idx" ON "ordonnance"("pays_emission_id");

-- AddForeignKey
ALTER TABLE "avis_medecin" ADD CONSTRAINT "avis_medecin_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avis_medecin" ADD CONSTRAINT "avis_medecin_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonnement_medecin" ADD CONSTRAINT "abonnement_medecin_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonnement_medecin" ADD CONSTRAINT "abonnement_medecin_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction_paiement"("transaction_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_abonnement_medecin" ADD CONSTRAINT "ligne_abonnement_medecin_abonnement_id_fkey" FOREIGN KEY ("abonnement_id") REFERENCES "abonnement_medecin"("abonnement_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_structure_id_fkey" FOREIGN KEY ("structure_id") REFERENCES "structure_sante"("structure_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordonnance" ADD CONSTRAINT "ordonnance_rdv_id_fkey" FOREIGN KEY ("rdv_id") REFERENCES "rendez_vous"("rdv_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordonnance" ADD CONSTRAINT "ordonnance_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordonnance" ADD CONSTRAINT "ordonnance_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordonnance" ADD CONSTRAINT "ordonnance_pays_emission_id_fkey" FOREIGN KEY ("pays_emission_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;
