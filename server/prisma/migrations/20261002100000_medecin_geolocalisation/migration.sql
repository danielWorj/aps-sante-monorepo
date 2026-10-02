-- Géolocalisation des médecins (Medecin.geolocalisation) + index spatial GIST
--
-- Contexte : ajoute au modèle Medecin la même colonne que Pharmacie,
-- StructureSante et ServiceAssurance : `geography(Point, 4326)`, déclarée
-- `Unsupported(...)` dans schema.prisma (Prisma Client ne sait ni la lire ni
-- l'écrire ; tout passe par $queryRaw / $executeRaw via src/lib/geo.js).
--
-- La colonne est NULLABLE : la position est facultative et les médecins
-- existants restent à NULL (pas de backfill) — ils n'apparaissent pas dans la
-- recherche de proximité tant qu'ils n'ont pas renseigné leur position.
--
-- Index GIST : Prisma Migrate ne sait pas générer d'index `USING GIST` sur ce
-- type de colonne à partir du schéma ; il est donc écrit à la main dans cette
-- migration "custom SQL", comme documenté par Prisma pour les cas non
-- supportés nativement (https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations).
-- Sans lui, toute requête de proximité (ST_DWithin / ST_Distance) sur medecin
-- déclencherait un Seq Scan complet avec calcul de distance ligne par ligne.
--
-- Même patron que les migrations 20260914120000_index_gist_geolocalisation_assurance,
-- 20260914130000_index_gist_geolocalisation_pharmacie et
-- 20260914140000_index_gist_geolocalisation_centre_sante, appliqué ici au
-- module Médecin.
--
-- Prérequis : extension `postgis` déjà activée (migrations précédentes).
-- CREATE INDEX IF NOT EXISTS : idempotent, sans effet si l'index existe déjà.

-- AlterTable
ALTER TABLE "medecin" ADD COLUMN "geolocalisation" geography(Point, 4326);

-- CreateIndex (GIST) sur medecin.geolocalisation
CREATE INDEX IF NOT EXISTS "medecin_geolocalisation_gist_idx"
    ON "medecin"
    USING GIST ("geolocalisation");