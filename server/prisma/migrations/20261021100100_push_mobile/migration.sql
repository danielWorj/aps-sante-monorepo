-- Push mobile (FCM) : jetons des appareils et suivi d'envoi des notifications.
CREATE TABLE "appareil_push" (
    "appareil_push_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "jeton" VARCHAR(512) NOT NULL,
    "plateforme" VARCHAR(20) NOT NULL,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_maj" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appareil_push_pkey" PRIMARY KEY ("appareil_push_id")
);

CREATE UNIQUE INDEX "appareil_push_jeton_key" ON "appareil_push"("jeton");
CREATE INDEX "appareil_push_utilisateur_id_idx" ON "appareil_push"("utilisateur_id");

ALTER TABLE "appareil_push" ADD CONSTRAINT "appareil_push_utilisateur_id_fkey"
    FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification" ADD COLUMN "push_envoye_le" TIMESTAMP(3);
-- Les notifications existantes ne doivent jamais être poussées après coup.
UPDATE "notification" SET "push_envoye_le" = "date_creation";
