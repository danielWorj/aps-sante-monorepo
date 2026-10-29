-- E-mail (SMTP / IMAP) — socle d'envoi et de réception, et canal de
-- notification choisi par l'annonceur d'une publicité.
--
-- 1. message_email : journal des envois (idempotence par `cle`, Message-ID
--    pour relier les réponses).
-- 2. email_recu : e-mails relevés dans la boîte IMAP (un seul par Message-ID).
-- 3. publicite.canal_notification : whatsapp (défaut, comportement
--    antérieur), sms ou email.
-- 4. Textes des messages de publicité : « par WhatsApp » retiré (le texte
--    sert désormais aux trois canaux), seulement s'il n'a pas été modifié.
--
-- Les paramètres SMTP / IMAP restent en variables d'environnement.

CREATE TYPE "StatutMessageEmail" AS ENUM ('en_attente', 'envoye', 'echec');
CREATE TYPE "CanalNotificationPublicite" AS ENUM ('whatsapp', 'sms', 'email');

-- ---------------------------------------------------------------------------
-- 1. message_email
-- ---------------------------------------------------------------------------
CREATE TABLE "message_email" (
    "message_email_id" UUID NOT NULL,
    "cle" VARCHAR(200),
    "origine" VARCHAR(60) NOT NULL,
    "destinataire" VARCHAR(254) NOT NULL,
    "utilisateur_id" UUID,
    "sujet" VARCHAR(255) NOT NULL,
    "texte" TEXT NOT NULL,
    "html" TEXT,
    "statut" "StatutMessageEmail" NOT NULL DEFAULT 'en_attente',
    "identifiant_fournisseur" VARCHAR(255),
    "erreur_code" VARCHAR(40),
    "erreur" TEXT,
    "relancable" BOOLEAN NOT NULL DEFAULT false,
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_envoi" TIMESTAMP(3),

    CONSTRAINT "message_email_pkey" PRIMARY KEY ("message_email_id")
);

CREATE UNIQUE INDEX "message_email_cle_key" ON "message_email"("cle");
CREATE UNIQUE INDEX "message_email_identifiant_fournisseur_key" ON "message_email"("identifiant_fournisseur");
CREATE INDEX "message_email_statut_relancable_idx" ON "message_email"("statut", "relancable");
CREATE INDEX "message_email_utilisateur_id_idx" ON "message_email"("utilisateur_id");
CREATE INDEX "message_email_date_creation_idx" ON "message_email"("date_creation");

ALTER TABLE "message_email" ADD CONSTRAINT "message_email_utilisateur_id_fkey"
    FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. email_recu
-- ---------------------------------------------------------------------------
CREATE TABLE "email_recu" (
    "email_recu_id" UUID NOT NULL,
    "message_id" VARCHAR(512) NOT NULL,
    "expediteur" VARCHAR(254) NOT NULL,
    "expediteur_nom" VARCHAR(255),
    "destinataire" VARCHAR(254),
    "sujet" VARCHAR(500) NOT NULL,
    "texte" TEXT NOT NULL,
    "html" TEXT,
    "en_reponse_a" VARCHAR(512),
    "message_email_id" UUID,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "date_reception" TIMESTAMP(3) NOT NULL,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_recu_pkey" PRIMARY KEY ("email_recu_id")
);

CREATE UNIQUE INDEX "email_recu_message_id_key" ON "email_recu"("message_id");
CREATE INDEX "email_recu_lu_idx" ON "email_recu"("lu");
CREATE INDEX "email_recu_date_reception_idx" ON "email_recu"("date_reception");
CREATE INDEX "email_recu_message_email_id_idx" ON "email_recu"("message_email_id");

ALTER TABLE "email_recu" ADD CONSTRAINT "email_recu_message_email_id_fkey"
    FOREIGN KEY ("message_email_id") REFERENCES "message_email"("message_email_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Canal de notification de l'annonceur
-- ---------------------------------------------------------------------------
ALTER TABLE "publicite" ADD COLUMN "canal_notification" "CanalNotificationPublicite" NOT NULL DEFAULT 'whatsapp';

-- ---------------------------------------------------------------------------
-- 4. Textes communs aux trois canaux
-- ---------------------------------------------------------------------------
UPDATE "modele_message_whatsapp"
SET "texte" = REPLACE("texte", 'Vous serez notifié par WhatsApp dès son acceptation', 'Vous serez notifié dès son acceptation'),
    "date_mise_a_jour" = CURRENT_TIMESTAMP
WHERE "code" = 'publicite_soumise' AND "texte" LIKE '%Vous serez notifié par WhatsApp dès son acceptation%';
