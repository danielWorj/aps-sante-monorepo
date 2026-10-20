-- Connexion numéro + code PIN (parcours B), à côté de l'email + mot de passe
-- qui reste disponible. Aucun numéro n'est repris automatiquement : chaque
-- utilisateur confirme son numéro en créant son PIN.

ALTER TABLE "utilisateur"
    ADD COLUMN "telephone_connexion" VARCHAR(20),
    ADD COLUMN "telephone_verifie" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "pin_hash" VARCHAR(255),
    ADD COLUMN "pin_provisoire" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "pin_echecs" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "pin_bloque_jusqu_au" TIMESTAMP(3),
    ADD COLUMN "pin_nb_blocages" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "dernier_espace" VARCHAR(80);

CREATE UNIQUE INDEX "utilisateur_telephone_connexion_key" ON "utilisateur"("telephone_connexion");

ALTER TABLE "utilisateur"
    ADD CONSTRAINT "utilisateur_telephone_connexion_check" CHECK ("telephone_connexion" ~ '^[1-9][0-9]{7,14}$'),
    ADD CONSTRAINT "utilisateur_pin_echecs_check" CHECK ("pin_echecs" >= 0 AND "pin_nb_blocages" >= 0);
