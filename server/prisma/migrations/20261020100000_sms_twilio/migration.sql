-- SMS (Twilio) — socle d'envoi et codes de vérification de téléphone.
--
-- 1. message_sms : journal des envois (idempotence par `cle`, rappel de
--    statut Twilio par `identifiant_fournisseur`).
-- 2. code_verification : codes à usage unique (hachés), puis preuve de
--    possession du numéro consommée par le service métier.
--
-- Les identifiants Twilio restent en variables d'environnement (TWILIO_*).

CREATE TYPE "StatutMessageSms" AS ENUM ('en_attente', 'envoye', 'delivre', 'echec', 'simule');
CREATE TYPE "ObjetCodeVerification" AS ENUM ('inscription', 'connexion', 'reinitialisation_mot_de_passe', 'changement_telephone');
CREATE TYPE "CanalCodeVerification" AS ENUM ('sms', 'whatsapp');

-- ---------------------------------------------------------------------------
-- 1. message_sms
-- ---------------------------------------------------------------------------
CREATE TABLE "message_sms" (
    "message_sms_id" UUID NOT NULL,
    "cle" VARCHAR(200),
    "origine" VARCHAR(60) NOT NULL,
    "destinataire" VARCHAR(20) NOT NULL,
    "utilisateur_id" UUID,
    "texte" TEXT NOT NULL,
    "statut" "StatutMessageSms" NOT NULL DEFAULT 'en_attente',
    "identifiant_fournisseur" VARCHAR(64),
    "segments" INTEGER,
    "erreur_code" VARCHAR(40),
    "erreur" TEXT,
    "relancable" BOOLEAN NOT NULL DEFAULT false,
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_envoi" TIMESTAMP(3),
    "date_statut" TIMESTAMP(3),

    CONSTRAINT "message_sms_pkey" PRIMARY KEY ("message_sms_id"),
    CONSTRAINT "message_sms_destinataire_check" CHECK ("destinataire" ~ '^[1-9][0-9]{7,14}$')
);

CREATE UNIQUE INDEX "message_sms_cle_key" ON "message_sms"("cle");
CREATE UNIQUE INDEX "message_sms_identifiant_fournisseur_key" ON "message_sms"("identifiant_fournisseur");
CREATE INDEX "message_sms_statut_relancable_idx" ON "message_sms"("statut", "relancable");
CREATE INDEX "message_sms_utilisateur_id_idx" ON "message_sms"("utilisateur_id");
CREATE INDEX "message_sms_date_creation_idx" ON "message_sms"("date_creation");

ALTER TABLE "message_sms" ADD CONSTRAINT "message_sms_utilisateur_id_fkey"
    FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. code_verification
-- ---------------------------------------------------------------------------
CREATE TABLE "code_verification" (
    "code_verification_id" UUID NOT NULL,
    "telephone" VARCHAR(20) NOT NULL,
    "objet" "ObjetCodeVerification" NOT NULL,
    "canal" "CanalCodeVerification" NOT NULL,
    "code_hache" VARCHAR(64) NOT NULL,
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "expire_le" TIMESTAMP(3) NOT NULL,
    "verifie_le" TIMESTAMP(3),
    "consomme_le" TIMESTAMP(3),
    "adresse_ip" VARCHAR(45),
    "message_sms_id" UUID,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_verification_pkey" PRIMARY KEY ("code_verification_id"),
    CONSTRAINT "code_verification_telephone_check" CHECK ("telephone" ~ '^[1-9][0-9]{7,14}$'),
    CONSTRAINT "code_verification_tentatives_check" CHECK ("tentatives" >= 0)
);

CREATE INDEX "code_verification_telephone_objet_date_creation_idx" ON "code_verification"("telephone", "objet", "date_creation");
CREATE INDEX "code_verification_adresse_ip_date_creation_idx" ON "code_verification"("adresse_ip", "date_creation");

ALTER TABLE "code_verification" ADD CONSTRAINT "code_verification_message_sms_id_fkey"
    FOREIGN KEY ("message_sms_id") REFERENCES "message_sms"("message_sms_id") ON DELETE SET NULL ON UPDATE CASCADE;
