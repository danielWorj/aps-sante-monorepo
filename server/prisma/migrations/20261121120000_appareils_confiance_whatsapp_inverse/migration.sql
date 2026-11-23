-- Connexion par numéro + PIN : validation d'un nouvel appareil (depuis un
-- autre appareil connecté, ou par WhatsApp inversé) et appareils de confiance.

-- 1. Vérification WhatsApp inversée (l'utilisateur envoie le code).
ALTER TYPE "CanalCodeVerification" ADD VALUE IF NOT EXISTS 'whatsapp_inverse';

-- 2. Appareils de confiance.
CREATE TABLE "appareil_confiance" (
    "appareil_confiance_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "empreinte" VARCHAR(64) NOT NULL,
    "mobile" BOOLEAN NOT NULL DEFAULT false,
    "libelle" VARCHAR(255),
    "valide_par" VARCHAR(30) NOT NULL,
    "derniere_utilisation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appareil_confiance_pkey" PRIMARY KEY ("appareil_confiance_id")
);

CREATE UNIQUE INDEX "appareil_confiance_utilisateur_id_empreinte_key" ON "appareil_confiance"("utilisateur_id", "empreinte");

ALTER TABLE "appareil_confiance" ADD CONSTRAINT "appareil_confiance_utilisateur_id_fkey"
    FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Appareil et type de client de chaque session.
ALTER TABLE "refresh_token" ADD COLUMN "appareil_empreinte" VARCHAR(64);
ALTER TABLE "refresh_token" ADD COLUMN "mobile" BOOLEAN NOT NULL DEFAULT false;

-- 4. Validation d'un nouvel appareil depuis l'application connectée.
ALTER TABLE "demande_connexion_web" ADD COLUMN "objet" VARCHAR(20) NOT NULL DEFAULT 'connexion_web';
ALTER TABLE "demande_connexion_web" ADD COLUMN "appareil_empreinte" VARCHAR(64);
ALTER TABLE "demande_connexion_web" ADD COLUMN "appareil_mobile" BOOLEAN NOT NULL DEFAULT false;
