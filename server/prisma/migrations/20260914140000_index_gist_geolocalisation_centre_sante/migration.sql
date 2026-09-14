-- Index spatial GIST pour le module Centre de santé (StructureSante.geolocalisation)
--
-- Contexte : cette colonne est typée `geography(Point, 4326)` et déclarée comme
-- `Unsupported(...)` dans schema.prisma. Prisma Migrate ne sait pas générer d'index
-- `USING GIST` sur ce type de colonne à partir du schéma : ce fichier SQL est donc
-- écrit à la main (migration "custom SQL"), comme documenté par Prisma pour les cas
-- non supportés nativement (https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations).
--
-- Sans cet index, toute requête de proximité (ST_DWithin / ST_Distance / tri par
-- distance / KNN <->) sur structure_sante déclenche un Seq Scan complet avec calcul
-- de distance ligne par ligne. Un index GIST sur une colonne geography permet à
-- PostGIS d'utiliser l'opérateur de bounding-box pour ne visiter que les lignes
-- plausibles avant de calculer la distance exacte.
--
-- Même patron que les migrations 20260914120000_index_gist_geolocalisation_assurance
-- (module Assurance) et 20260914130000_index_gist_geolocalisation_pharmacie (module
-- Pharmacie), appliqué ici au module Centre de santé.
--
-- CREATE INDEX IF NOT EXISTS : idempotent, sans effet si l'index existe déjà
-- (ex. rejoué après un état de base déjà corrigé manuellement).

-- CreateIndex (GIST) sur structure_sante.geolocalisation
CREATE INDEX IF NOT EXISTS "structure_sante_geolocalisation_gist_idx"
    ON "structure_sante"
    USING GIST ("geolocalisation");