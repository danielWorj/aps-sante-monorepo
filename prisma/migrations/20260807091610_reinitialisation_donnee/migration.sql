-- CreateEnum
CREATE TYPE "StatutActivationPays" AS ENUM ('pilote', 'actif', 'inactif');

-- CreateEnum
CREATE TYPE "StatutCompte" AS ENUM ('actif', 'suspendu');

-- CreateEnum
CREATE TYPE "StatutVerificationMedecin" AS ENUM ('non_publie', 'en_cours', 'publie');

-- CreateEnum
CREATE TYPE "StatutRefreshToken" AS ENUM ('actif', 'revoque', 'expire');

-- CreateEnum
CREATE TYPE "MotifRevocation" AS ENUM ('deconnexion', 'changement_mdp', 'compromission', 'admin');

-- CreateTable
CREATE TABLE "langue" (
    "langue_id" UUID NOT NULL,
    "nom" VARCHAR(50) NOT NULL,

    CONSTRAINT "langue_pkey" PRIMARY KEY ("langue_id")
);

-- CreateTable
CREATE TABLE "devise" (
    "devise_id" UUID NOT NULL,
    "libelle" VARCHAR(50) NOT NULL,

    CONSTRAINT "devise_pkey" PRIMARY KEY ("devise_id")
);

-- CreateTable
CREATE TABLE "pays" (
    "pays_id" UUID NOT NULL,
    "code_iso2" CHAR(2) NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "devise_id" UUID NOT NULL,
    "langue_id" UUID NOT NULL,
    "statut_activation" "StatutActivationPays" NOT NULL,

    CONSTRAINT "pays_pkey" PRIMARY KEY ("pays_id")
);

-- CreateTable
CREATE TABLE "ville" (
    "ville_id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "nom" VARCHAR(150) NOT NULL,
    "code_postal" VARCHAR(20),

    CONSTRAINT "ville_pkey" PRIMARY KEY ("ville_id")
);

-- CreateTable
CREATE TABLE "role" (
    "role_id" UUID NOT NULL,
    "libelle" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),

    CONSTRAINT "role_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "utilisateur" (
    "utilisateur_id" UUID NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "prenom" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "telephone" VARCHAR(20),
    "mot_de_passe_hash" VARCHAR(255) NOT NULL,
    "role_id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "statut_compte" "StatutCompte" NOT NULL,

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("utilisateur_id")
);

-- CreateTable
CREATE TABLE "medecin" (
    "medecin_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "specialite" VARCHAR(150) NOT NULL,
    "numero_ordre" VARCHAR(100) NOT NULL,
    "statut_verification" "StatutVerificationMedecin" NOT NULL,
    "pays_exercice_id" UUID NOT NULL,
    "ville_exercice_id" UUID NOT NULL,
    "teleconsultation_activee" BOOLEAN NOT NULL,
    "tarif_indicatif" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "medecin_pkey" PRIMARY KEY ("medecin_id")
);

-- CreateTable
CREATE TABLE "patient" (
    "patient_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "date_naissance" DATE NOT NULL,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("patient_id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "refresh_token_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_expiration" TIMESTAMP(3) NOT NULL,
    "date_revocation" TIMESTAMP(3),
    "user_agent" VARCHAR(255),
    "ip_creation" VARCHAR(45),
    "statut" "StatutRefreshToken" NOT NULL,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("refresh_token_id")
);

-- CreateTable
CREATE TABLE "jeton_revoque" (
    "jti" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "date_revocation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_expiration_initiale" TIMESTAMP(3) NOT NULL,
    "motif" "MotifRevocation" NOT NULL,

    CONSTRAINT "jeton_revoque_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "agent_structure_sante" (
    "agent_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "structure_id" UUID NOT NULL,
    "fonction" VARCHAR(100) NOT NULL,

    CONSTRAINT "agent_structure_sante_pkey" PRIMARY KEY ("agent_id")
);

-- CreateTable
CREATE TABLE "agent_pompes_funebres" (
    "agent_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "pompes_funebres_id" UUID NOT NULL,
    "fonction" VARCHAR(100) NOT NULL,

    CONSTRAINT "agent_pompes_funebres_pkey" PRIMARY KEY ("agent_id")
);

-- CreateTable
CREATE TABLE "agent_assurance" (
    "agent_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "service_assurance_id" UUID NOT NULL,
    "fonction" VARCHAR(100) NOT NULL,

    CONSTRAINT "agent_assurance_pkey" PRIMARY KEY ("agent_id")
);

-- CreateTable
CREATE TABLE "agent_pharmacie" (
    "agent_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "pharmacie_id" UUID NOT NULL,
    "fonction" VARCHAR(100) NOT NULL,

    CONSTRAINT "agent_pharmacie_pkey" PRIMARY KEY ("agent_id")
);

-- CreateTable
CREATE TABLE "agent_ambulance" (
    "agent_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "service_ambulance_id" UUID NOT NULL,
    "fonction" VARCHAR(100) NOT NULL,

    CONSTRAINT "agent_ambulance_pkey" PRIMARY KEY ("agent_id")
);

-- CreateTable
CREATE TABLE "structure_sante" (
    "structure_id" UUID NOT NULL,

    CONSTRAINT "structure_sante_pkey" PRIMARY KEY ("structure_id")
);

-- CreateTable
CREATE TABLE "pompes_funebres" (
    "pompes_funebres_id" UUID NOT NULL,

    CONSTRAINT "pompes_funebres_pkey" PRIMARY KEY ("pompes_funebres_id")
);

-- CreateTable
CREATE TABLE "service_assurance" (
    "service_assurance_id" UUID NOT NULL,

    CONSTRAINT "service_assurance_pkey" PRIMARY KEY ("service_assurance_id")
);

-- CreateTable
CREATE TABLE "pharmacie" (
    "pharmacie_id" UUID NOT NULL,

    CONSTRAINT "pharmacie_pkey" PRIMARY KEY ("pharmacie_id")
);

-- CreateTable
CREATE TABLE "service_ambulance" (
    "service_ambulance_id" UUID NOT NULL,

    CONSTRAINT "service_ambulance_pkey" PRIMARY KEY ("service_ambulance_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pays_code_iso2_key" ON "pays"("code_iso2");

-- CreateIndex
CREATE INDEX "pays_devise_id_idx" ON "pays"("devise_id");

-- CreateIndex
CREATE INDEX "pays_langue_id_idx" ON "pays"("langue_id");

-- CreateIndex
CREATE INDEX "ville_pays_id_idx" ON "ville"("pays_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_libelle_key" ON "role"("libelle");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur"("email");

-- CreateIndex
CREATE INDEX "utilisateur_pays_id_idx" ON "utilisateur"("pays_id");

-- CreateIndex
CREATE INDEX "utilisateur_role_id_idx" ON "utilisateur"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "medecin_utilisateur_id_key" ON "medecin"("utilisateur_id");

-- CreateIndex
CREATE INDEX "medecin_pays_exercice_id_idx" ON "medecin"("pays_exercice_id");

-- CreateIndex
CREATE INDEX "medecin_ville_exercice_id_idx" ON "medecin"("ville_exercice_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_utilisateur_id_key" ON "patient"("utilisateur_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_utilisateur_id_idx" ON "refresh_token"("utilisateur_id");

-- CreateIndex
CREATE INDEX "jeton_revoque_utilisateur_id_idx" ON "jeton_revoque"("utilisateur_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_structure_sante_utilisateur_id_key" ON "agent_structure_sante"("utilisateur_id");

-- CreateIndex
CREATE INDEX "agent_structure_sante_structure_id_idx" ON "agent_structure_sante"("structure_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_pompes_funebres_utilisateur_id_key" ON "agent_pompes_funebres"("utilisateur_id");

-- CreateIndex
CREATE INDEX "agent_pompes_funebres_pompes_funebres_id_idx" ON "agent_pompes_funebres"("pompes_funebres_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_assurance_utilisateur_id_key" ON "agent_assurance"("utilisateur_id");

-- CreateIndex
CREATE INDEX "agent_assurance_service_assurance_id_idx" ON "agent_assurance"("service_assurance_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_pharmacie_utilisateur_id_key" ON "agent_pharmacie"("utilisateur_id");

-- CreateIndex
CREATE INDEX "agent_pharmacie_pharmacie_id_idx" ON "agent_pharmacie"("pharmacie_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_ambulance_utilisateur_id_key" ON "agent_ambulance"("utilisateur_id");

-- CreateIndex
CREATE INDEX "agent_ambulance_service_ambulance_id_idx" ON "agent_ambulance"("service_ambulance_id");

-- AddForeignKey
ALTER TABLE "pays" ADD CONSTRAINT "pays_devise_id_fkey" FOREIGN KEY ("devise_id") REFERENCES "devise"("devise_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pays" ADD CONSTRAINT "pays_langue_id_fkey" FOREIGN KEY ("langue_id") REFERENCES "langue"("langue_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ville" ADD CONSTRAINT "ville_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("role_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medecin" ADD CONSTRAINT "medecin_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medecin" ADD CONSTRAINT "medecin_pays_exercice_id_fkey" FOREIGN KEY ("pays_exercice_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medecin" ADD CONSTRAINT "medecin_ville_exercice_id_fkey" FOREIGN KEY ("ville_exercice_id") REFERENCES "ville"("ville_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient" ADD CONSTRAINT "patient_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jeton_revoque" ADD CONSTRAINT "jeton_revoque_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_structure_sante" ADD CONSTRAINT "agent_structure_sante_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_structure_sante" ADD CONSTRAINT "agent_structure_sante_structure_id_fkey" FOREIGN KEY ("structure_id") REFERENCES "structure_sante"("structure_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_pompes_funebres" ADD CONSTRAINT "agent_pompes_funebres_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_pompes_funebres" ADD CONSTRAINT "agent_pompes_funebres_pompes_funebres_id_fkey" FOREIGN KEY ("pompes_funebres_id") REFERENCES "pompes_funebres"("pompes_funebres_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_assurance" ADD CONSTRAINT "agent_assurance_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_assurance" ADD CONSTRAINT "agent_assurance_service_assurance_id_fkey" FOREIGN KEY ("service_assurance_id") REFERENCES "service_assurance"("service_assurance_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_pharmacie" ADD CONSTRAINT "agent_pharmacie_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_pharmacie" ADD CONSTRAINT "agent_pharmacie_pharmacie_id_fkey" FOREIGN KEY ("pharmacie_id") REFERENCES "pharmacie"("pharmacie_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_ambulance" ADD CONSTRAINT "agent_ambulance_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_ambulance" ADD CONSTRAINT "agent_ambulance_service_ambulance_id_fkey" FOREIGN KEY ("service_ambulance_id") REFERENCES "service_ambulance"("service_ambulance_id") ON DELETE RESTRICT ON UPDATE CASCADE;
