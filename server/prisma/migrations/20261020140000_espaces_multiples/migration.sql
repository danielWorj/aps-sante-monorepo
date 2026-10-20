-- Espaces multiples (option A) : un compte peut gérer plusieurs fiches
-- (pharmacies, structures, assurances…), la session porte l'espace actif,
-- et une connexion web peut être validée depuis l'application mobile.

-- 1. Rattachements d'agent : une ligne par couple compte / fiche.
DROP INDEX "agent_pharmacie_utilisateur_id_key";
CREATE UNIQUE INDEX "agent_pharmacie_utilisateur_id_pharmacie_id_key" ON "agent_pharmacie"("utilisateur_id", "pharmacie_id");
CREATE INDEX "agent_pharmacie_utilisateur_id_idx" ON "agent_pharmacie"("utilisateur_id");

DROP INDEX "agent_structure_sante_utilisateur_id_key";
CREATE UNIQUE INDEX "agent_structure_sante_utilisateur_id_structure_id_key" ON "agent_structure_sante"("utilisateur_id", "structure_id");
CREATE INDEX "agent_structure_sante_utilisateur_id_idx" ON "agent_structure_sante"("utilisateur_id");

DROP INDEX "agent_assurance_utilisateur_id_key";
CREATE UNIQUE INDEX "agent_assurance_utilisateur_id_service_assurance_id_key" ON "agent_assurance"("utilisateur_id", "service_assurance_id");
CREATE INDEX "agent_assurance_utilisateur_id_idx" ON "agent_assurance"("utilisateur_id");

DROP INDEX "agent_ambulance_utilisateur_id_key";
CREATE UNIQUE INDEX "agent_ambulance_utilisateur_id_service_ambulance_id_key" ON "agent_ambulance"("utilisateur_id", "service_ambulance_id");
CREATE INDEX "agent_ambulance_utilisateur_id_idx" ON "agent_ambulance"("utilisateur_id");

DROP INDEX "agent_pompes_funebres_utilisateur_id_key";
CREATE UNIQUE INDEX "agent_pompes_funebres_utilisateur_id_pompes_funebres_id_key" ON "agent_pompes_funebres"("utilisateur_id", "pompes_funebres_id");
CREATE INDEX "agent_pompes_funebres_utilisateur_id_idx" ON "agent_pompes_funebres"("utilisateur_id");

-- 2. Espace actif de la session (repris au renouvellement du jeton).
ALTER TABLE "refresh_token" ADD COLUMN "espace" VARCHAR(80);

-- 3. Connexion web validée depuis l'application.
CREATE TYPE "StatutDemandeConnexionWeb" AS ENUM ('en_attente', 'approuvee', 'refusee', 'consommee');

CREATE TABLE "demande_connexion_web" (
    "demande_connexion_id" UUID NOT NULL,
    "utilisateur_id" UUID,
    "secret_hache" VARCHAR(64) NOT NULL,
    "code_correspondance" VARCHAR(2) NOT NULL,
    "codes_proposes" VARCHAR(20) NOT NULL,
    "statut" "StatutDemandeConnexionWeb" NOT NULL DEFAULT 'en_attente',
    "user_agent" VARCHAR(255),
    "adresse_ip" VARCHAR(45),
    "expire_le" TIMESTAMP(3) NOT NULL,
    "date_decision" TIMESTAMP(3),
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demande_connexion_web_pkey" PRIMARY KEY ("demande_connexion_id")
);

CREATE INDEX "demande_connexion_web_utilisateur_id_statut_expire_le_idx" ON "demande_connexion_web"("utilisateur_id", "statut", "expire_le");
CREATE INDEX "demande_connexion_web_date_creation_idx" ON "demande_connexion_web"("date_creation");

ALTER TABLE "demande_connexion_web" ADD CONSTRAINT "demande_connexion_web_utilisateur_id_fkey"
    FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE CASCADE ON UPDATE CASCADE;
