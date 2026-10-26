-- Le médecin a lancé la visio : le patient peut la rejoindre (appel entrant).
ALTER TABLE "rendez_vous" ADD COLUMN "visio_lancee_le" TIMESTAMP(3);
