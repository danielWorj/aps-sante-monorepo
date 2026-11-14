-- Demande DIRECTE de RDV à un médecin sans créneau libre : le patient propose
-- un jour + une heure, le médecin accepte ou refuse sous 24 h ; sinon le
-- patient change de médecin ou ouvre sa demande aux autres médecins.
ALTER TYPE "StatutOffreRdv" ADD VALUE IF NOT EXISTS 'en_attente_medecin';
ALTER TYPE "StatutOffreRdv" ADD VALUE IF NOT EXISTS 'refusee';

ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'demande_rdv_directe';
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'demande_rdv_directe_acceptee';
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'demande_rdv_directe_refusee';

ALTER TABLE "offre_rdv"
  ADD COLUMN "medecin_cible_id" UUID,
  ADD COLUMN "echeance_reponse_medecin" TIMESTAMP(3),
  ADD COLUMN "refusee_le" TIMESTAMP(3),
  ADD COLUMN "motif_refus" VARCHAR(500),
  ADD COLUMN "sans_reponse" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "diffusee_le" TIMESTAMP(3);

ALTER TABLE "offre_rdv"
  ADD CONSTRAINT "offre_rdv_medecin_cible_id_fkey"
  FOREIGN KEY ("medecin_cible_id") REFERENCES "medecin"("medecin_id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "offre_rdv_medecin_cible_id_statut_idx" ON "offre_rdv"("medecin_cible_id", "statut");
CREATE INDEX "offre_rdv_statut_echeance_reponse_medecin_idx" ON "offre_rdv"("statut", "echeance_reponse_medecin");

-- Téléconsultation refusée faute de RDV physique effectué avec ce médecin : notification du patient.
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'rdv_teleconsultation_refusee';
