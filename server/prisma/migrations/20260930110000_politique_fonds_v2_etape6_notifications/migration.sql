-- Politique de fonds v2 — étape 6 : notifications in-app (point ouvert E).
-- Aucun canal e-mail/push n'existe dans le dépôt : la note « reprogrammer »
-- (§5, deux absents) et les échanges de proposition/acceptation passent par
-- cette table, lue via GET /api/notifications. Aucune valeur par défaut
-- métier, aucune donnée existante touchée.

-- 1) Types de notification (liste fermée).
CREATE TYPE "TypeNotification" AS ENUM (
  'rdv_a_reprogrammer',
  'rdv_reprogrammation_proposee',
  'rdv_reprogrammation_acceptee'
);

-- 2) Table. `cle` : clé d'idempotence (une notification par événement,
--    par destinataire ; un rejeu ne crée jamais de doublon).
CREATE TABLE "notification" (
    "notification_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "type" "TypeNotification" NOT NULL,
    "rdv_id" UUID,
    "titre" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "donnees" JSONB,
    "cle" VARCHAR(255) NOT NULL,
    "lue_le" TIMESTAMP(3),
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("notification_id")
);

CREATE UNIQUE INDEX "notification_cle_key" ON "notification"("cle");
CREATE INDEX "notification_utilisateur_id_lue_le_date_creation_idx"
  ON "notification"("utilisateur_id", "lue_le", "date_creation");
CREATE INDEX "notification_rdv_id_idx" ON "notification"("rdv_id");

ALTER TABLE "notification" ADD CONSTRAINT "notification_utilisateur_id_fkey"
  FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification" ADD CONSTRAINT "notification_rdv_id_fkey"
  FOREIGN KEY ("rdv_id") REFERENCES "rendez_vous"("rdv_id") ON DELETE SET NULL ON UPDATE CASCADE;
