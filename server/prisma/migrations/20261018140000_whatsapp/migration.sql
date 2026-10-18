-- WhatsApp — socle d'envoi (API WhatsApp Cloud de Meta).
--
-- 1. numero_whatsapp : numéro(s) expéditeur d'APS Santé, gérés au
--    back-office. Un seul actif à la fois (index unique PARTIEL).
-- 2. message_whatsapp : journal des envois (idempotence par `cle`).
--
-- Le jeton d'accès Meta reste en variable d'environnement
-- (WHATSAPP_ACCESS_TOKEN) : aucune donnée secrète en base.

CREATE TYPE "StatutMessageWhatsapp" AS ENUM ('en_attente', 'envoye', 'echec');
CREATE TYPE "TypeMessageWhatsapp" AS ENUM ('texte', 'modele');

-- ---------------------------------------------------------------------------
-- 1. numero_whatsapp
-- ---------------------------------------------------------------------------
CREATE TABLE "numero_whatsapp" (
    "numero_whatsapp_id" UUID NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "phone_number_id" VARCHAR(40) NOT NULL,
    "waba_id" VARCHAR(40),
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_mise_a_jour" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "numero_whatsapp_pkey" PRIMARY KEY ("numero_whatsapp_id"),
    CONSTRAINT "numero_whatsapp_numero_check" CHECK ("numero" ~ '^[1-9][0-9]{7,14}$')
);

CREATE UNIQUE INDEX "numero_whatsapp_numero_key" ON "numero_whatsapp"("numero");
CREATE UNIQUE INDEX "numero_whatsapp_phone_number_id_key" ON "numero_whatsapp"("phone_number_id");

-- Un seul numéro expéditeur actif.
CREATE UNIQUE INDEX "numero_whatsapp_un_seul_actif_key" ON "numero_whatsapp"(("actif")) WHERE "actif";

-- ---------------------------------------------------------------------------
-- 2. message_whatsapp
-- ---------------------------------------------------------------------------
CREATE TABLE "message_whatsapp" (
    "message_whatsapp_id" UUID NOT NULL,
    "cle" VARCHAR(200),
    "origine" VARCHAR(60) NOT NULL,
    "numero_whatsapp_id" UUID,
    "destinataire" VARCHAR(20) NOT NULL,
    "utilisateur_id" UUID,
    "type" "TypeMessageWhatsapp" NOT NULL,
    "contenu" JSONB NOT NULL,
    "statut" "StatutMessageWhatsapp" NOT NULL DEFAULT 'en_attente',
    "identifiant_fournisseur" VARCHAR(128),
    "erreur_code" VARCHAR(40),
    "erreur" TEXT,
    "relancable" BOOLEAN NOT NULL DEFAULT false,
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_envoi" TIMESTAMP(3),

    CONSTRAINT "message_whatsapp_pkey" PRIMARY KEY ("message_whatsapp_id")
);

CREATE UNIQUE INDEX "message_whatsapp_cle_key" ON "message_whatsapp"("cle");
CREATE INDEX "message_whatsapp_statut_relancable_idx" ON "message_whatsapp"("statut", "relancable");
CREATE INDEX "message_whatsapp_utilisateur_id_idx" ON "message_whatsapp"("utilisateur_id");
CREATE INDEX "message_whatsapp_date_creation_idx" ON "message_whatsapp"("date_creation");

ALTER TABLE "message_whatsapp" ADD CONSTRAINT "message_whatsapp_numero_whatsapp_id_fkey"
  FOREIGN KEY ("numero_whatsapp_id") REFERENCES "numero_whatsapp"("numero_whatsapp_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "message_whatsapp" ADD CONSTRAINT "message_whatsapp_utilisateur_id_fkey"
  FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE SET NULL ON UPDATE CASCADE;
