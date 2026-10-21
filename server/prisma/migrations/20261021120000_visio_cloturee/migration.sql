-- Fin d'appel visio signalée par le médecin (le patient raccroche), distincte de termine_le.
ALTER TABLE "rendez_vous" ADD COLUMN "visio_cloturee_le" TIMESTAMP(3);
