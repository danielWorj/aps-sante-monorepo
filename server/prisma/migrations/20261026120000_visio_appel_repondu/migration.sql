-- Réponse du patient à l'appel visio entrant (refus, manqué ou rejoint) : partagée entre ses appareils.
ALTER TABLE "rendez_vous" ADD COLUMN "visio_appel_repondu_le" TIMESTAMP(3);
