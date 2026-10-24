-- Espaces pharmacie et centre de santé (gestionnaire de la fiche) : adresse,
-- e-mail et horaires des fiches, photos, actualités, messages de contact et
-- prestations des centres. Voir schema.prisma, section « Espaces pharmacie
-- et centre de santé », et services/espacePresence.service.js.
-- Prérequis : 20261023100000_espaces_presence_enums.

-- Fiches : coordonnées et horaires (adresse / horaires toujours publics).
ALTER TABLE "pharmacie"
  ADD COLUMN "adresse" VARCHAR(255),
  ADD COLUMN "email" VARCHAR(255),
  ADD COLUMN "horaires" JSONB,
  ADD COLUMN "horaires_note" VARCHAR(255);

ALTER TABLE "structure_sante"
  ADD COLUMN "adresse" VARCHAR(255),
  ADD COLUMN "email" VARCHAR(255),
  ADD COLUMN "horaires" JSONB,
  ADD COLUMN "horaires_note" VARCHAR(255),
  ADD COLUMN "urgences_24h" BOOLEAN NOT NULL DEFAULT false;

-- Photos
CREATE TABLE "media_fiche_presence" (
  "media_id" UUID NOT NULL,
  "type_acteur" "TypeActeurPresence" NOT NULL,
  "pharmacie_id" UUID,
  "structure_id" UUID,
  "fichier_nom" TEXT NOT NULL,
  "titre" VARCHAR(150),
  "ordre" INTEGER NOT NULL DEFAULT 0,
  "taille_octets" INTEGER,
  "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_fiche_presence_pkey" PRIMARY KEY ("media_id")
);
CREATE INDEX "media_fiche_presence_pharmacie_id_ordre_idx" ON "media_fiche_presence"("pharmacie_id", "ordre");
CREATE INDEX "media_fiche_presence_structure_id_ordre_idx" ON "media_fiche_presence"("structure_id", "ordre");
ALTER TABLE "media_fiche_presence" ADD CONSTRAINT "media_fiche_presence_pharmacie_id_fkey"
  FOREIGN KEY ("pharmacie_id") REFERENCES "pharmacie"("pharmacie_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_fiche_presence" ADD CONSTRAINT "media_fiche_presence_structure_id_fkey"
  FOREIGN KEY ("structure_id") REFERENCES "structure_sante"("structure_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Actualités
CREATE TABLE "actualite_fiche_presence" (
  "actualite_id" UUID NOT NULL,
  "type_acteur" "TypeActeurPresence" NOT NULL,
  "pharmacie_id" UUID,
  "structure_id" UUID,
  "titre" VARCHAR(150) NOT NULL,
  "contenu" TEXT NOT NULL,
  "image_nom" VARCHAR(255),
  "publiee" BOOLEAN NOT NULL DEFAULT true,
  "date_publication" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "date_expiration" TIMESTAMP(3),
  "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "date_mise_a_jour" TIMESTAMP(3),
  CONSTRAINT "actualite_fiche_presence_pkey" PRIMARY KEY ("actualite_id"),
  CONSTRAINT "actualite_fiche_presence_dates_check"
    CHECK ("date_expiration" IS NULL OR "date_expiration" > "date_publication")
);
CREATE INDEX "actualite_fiche_presence_pharmacie_id_date_publication_idx"
  ON "actualite_fiche_presence"("pharmacie_id", "date_publication");
CREATE INDEX "actualite_fiche_presence_structure_id_date_publication_idx"
  ON "actualite_fiche_presence"("structure_id", "date_publication");
ALTER TABLE "actualite_fiche_presence" ADD CONSTRAINT "actualite_fiche_presence_pharmacie_id_fkey"
  FOREIGN KEY ("pharmacie_id") REFERENCES "pharmacie"("pharmacie_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "actualite_fiche_presence" ADD CONSTRAINT "actualite_fiche_presence_structure_id_fkey"
  FOREIGN KEY ("structure_id") REFERENCES "structure_sante"("structure_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Messages du formulaire de contact
CREATE TABLE "message_fiche_presence" (
  "message_id" UUID NOT NULL,
  "type_acteur" "TypeActeurPresence" NOT NULL,
  "pharmacie_id" UUID,
  "structure_id" UUID,
  "utilisateur_id" UUID,
  "nom" VARCHAR(150),
  "email" VARCHAR(255) NOT NULL,
  "telephone" VARCHAR(30),
  "contenu" TEXT NOT NULL,
  "statut" "StatutMessageFiche" NOT NULL DEFAULT 'non_lu',
  "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "date_lecture" TIMESTAMP(3),
  CONSTRAINT "message_fiche_presence_pkey" PRIMARY KEY ("message_id")
);
CREATE INDEX "message_fiche_presence_pharmacie_id_statut_date_creation_idx"
  ON "message_fiche_presence"("pharmacie_id", "statut", "date_creation");
CREATE INDEX "message_fiche_presence_structure_id_statut_date_creation_idx"
  ON "message_fiche_presence"("structure_id", "statut", "date_creation");
CREATE INDEX "message_fiche_presence_utilisateur_id_idx" ON "message_fiche_presence"("utilisateur_id");
ALTER TABLE "message_fiche_presence" ADD CONSTRAINT "message_fiche_presence_pharmacie_id_fkey"
  FOREIGN KEY ("pharmacie_id") REFERENCES "pharmacie"("pharmacie_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_fiche_presence" ADD CONSTRAINT "message_fiche_presence_structure_id_fkey"
  FOREIGN KEY ("structure_id") REFERENCES "structure_sante"("structure_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_fiche_presence" ADD CONSTRAINT "message_fiche_presence_utilisateur_id_fkey"
  FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prestations des centres de santé
CREATE TABLE "prestation_structure" (
  "prestation_id" UUID NOT NULL,
  "structure_id" UUID NOT NULL,
  "nom" VARCHAR(200) NOT NULL,
  "categorie" VARCHAR(100),
  "description" TEXT,
  "prix" DECIMAL(12,2),
  "disponible" BOOLEAN NOT NULL DEFAULT true,
  "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "date_mise_a_jour" TIMESTAMP(3),
  CONSTRAINT "prestation_structure_pkey" PRIMARY KEY ("prestation_id"),
  CONSTRAINT "prestation_structure_prix_check" CHECK ("prix" IS NULL OR "prix" >= 0)
);
CREATE INDEX "prestation_structure_structure_id_categorie_idx" ON "prestation_structure"("structure_id", "categorie");
ALTER TABLE "prestation_structure" ADD CONSTRAINT "prestation_structure_structure_id_fkey"
  FOREIGN KEY ("structure_id") REFERENCES "structure_sante"("structure_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Chaque ligne porte exactement la fiche de son type d'acteur (pharmacie ou
-- centre de santé ; jamais un médecin).
ALTER TABLE "media_fiche_presence" ADD CONSTRAINT "media_fiche_presence_acteur_coherent"
  CHECK (
    ("type_acteur" = 'pharmacie' AND "pharmacie_id" IS NOT NULL AND "structure_id" IS NULL)
    OR ("type_acteur" = 'structure' AND "structure_id" IS NOT NULL AND "pharmacie_id" IS NULL)
  );
ALTER TABLE "actualite_fiche_presence" ADD CONSTRAINT "actualite_fiche_presence_acteur_coherent"
  CHECK (
    ("type_acteur" = 'pharmacie' AND "pharmacie_id" IS NOT NULL AND "structure_id" IS NULL)
    OR ("type_acteur" = 'structure' AND "structure_id" IS NOT NULL AND "pharmacie_id" IS NULL)
  );
ALTER TABLE "message_fiche_presence" ADD CONSTRAINT "message_fiche_presence_acteur_coherent"
  CHECK (
    ("type_acteur" = 'pharmacie' AND "pharmacie_id" IS NOT NULL AND "structure_id" IS NULL)
    OR ("type_acteur" = 'structure' AND "structure_id" IS NOT NULL AND "pharmacie_id" IS NULL)
  );
