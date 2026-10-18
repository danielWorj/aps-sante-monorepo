-- RDV aléatoire (RDV sur offre) : le patient publie une offre (spécialité,
-- pays + ville, jour et heure, type, motif), les médecins éligibles y
-- répondent avec leur profil, le patient valide l'un d'eux (RDV classique).
--
-- Prérequis : 20261018100000_rdv_offre_enums. Sans risque sur les données
-- existantes (types et tables créés).

CREATE TYPE "StatutOffreRdv" AS ENUM ('ouverte', 'attribuee', 'expiree', 'annulee');
CREATE TYPE "StatutReponseOffreRdv" AS ENUM ('proposee', 'retiree', 'retenue');

CREATE TABLE "offre_rdv" (
    "offre_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "specialite_id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "ville_id" UUID NOT NULL,
    "type_rdv" "TypeRdv" NOT NULL,
    "date_souhaitee" TIMESTAMP(3) NOT NULL,
    "motif" TEXT,
    "statut" "StatutOffreRdv" NOT NULL DEFAULT 'ouverte',
    "rdv_id" UUID,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_annulation" TIMESTAMP(3),

    CONSTRAINT "offre_rdv_pkey" PRIMARY KEY ("offre_id")
);

CREATE UNIQUE INDEX "offre_rdv_rdv_id_key" ON "offre_rdv"("rdv_id");
CREATE INDEX "offre_rdv_patient_id_idx" ON "offre_rdv"("patient_id");
CREATE INDEX "offre_rdv_statut_specialite_id_ville_id_idx" ON "offre_rdv"("statut", "specialite_id", "ville_id");
CREATE INDEX "offre_rdv_date_souhaitee_idx" ON "offre_rdv"("date_souhaitee");

ALTER TABLE "offre_rdv" ADD CONSTRAINT "offre_rdv_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offre_rdv" ADD CONSTRAINT "offre_rdv_specialite_id_fkey" FOREIGN KEY ("specialite_id") REFERENCES "specialite"("specialite_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offre_rdv" ADD CONSTRAINT "offre_rdv_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offre_rdv" ADD CONSTRAINT "offre_rdv_ville_id_fkey" FOREIGN KEY ("ville_id") REFERENCES "ville"("ville_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offre_rdv" ADD CONSTRAINT "offre_rdv_rdv_id_fkey" FOREIGN KEY ("rdv_id") REFERENCES "rendez_vous"("rdv_id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "reponse_offre_rdv" (
    "reponse_id" UUID NOT NULL,
    "offre_id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "message" VARCHAR(500),
    "statut" "StatutReponseOffreRdv" NOT NULL DEFAULT 'proposee',
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_retrait" TIMESTAMP(3),

    CONSTRAINT "reponse_offre_rdv_pkey" PRIMARY KEY ("reponse_id")
);

CREATE UNIQUE INDEX "reponse_offre_rdv_offre_id_medecin_id_key" ON "reponse_offre_rdv"("offre_id", "medecin_id");
CREATE INDEX "reponse_offre_rdv_medecin_id_idx" ON "reponse_offre_rdv"("medecin_id");

ALTER TABLE "reponse_offre_rdv" ADD CONSTRAINT "reponse_offre_rdv_offre_id_fkey" FOREIGN KEY ("offre_id") REFERENCES "offre_rdv"("offre_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reponse_offre_rdv" ADD CONSTRAINT "reponse_offre_rdv_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE RESTRICT ON UPDATE CASCADE;
