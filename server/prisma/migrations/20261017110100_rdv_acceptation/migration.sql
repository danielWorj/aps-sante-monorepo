-- Acceptation d'un RDV physique par le médecin, après paiement : lieu de la
-- consultation (saisi par le médecin) et date de la première acceptation.
-- Colonnes facultatives : sans risque sur les données existantes.
ALTER TABLE "rendez_vous" ADD COLUMN "lieu_rdv" VARCHAR(500);
ALTER TABLE "rendez_vous" ADD COLUMN "accepte_le" TIMESTAMP(3);
