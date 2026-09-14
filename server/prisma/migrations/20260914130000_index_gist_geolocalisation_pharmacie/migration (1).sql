-- Index spatial GIST pour le module Pharmacie (Pharmacie.geolocalisation)
--
-- Contexte : cette colonne est typée `geography(Point, 4326)` et déclarée comme
-- `Unsupported(...)` dans schema.prisma. Prisma Migrate ne sait pas générer d'index
-- `USING GIST` sur ce type de colonne à partir du schéma : ce fichier SQL est donc
-- écrit à la main (migration "custom SQL"), comme documenté par Prisma pour les cas
-- non supportés nativement (https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations).
--
-- Sans cet index, toute requête de proximité (ST_DWithin / ST_Distance / tri par
-- distance / KNN <->) sur pharmacie déclenche un Seq Scan complet avec calcul de
-- distance ligne par ligne. Un index GIST sur une colonne geography permet à
-- PostGIS d'utiliser l'opérateur de bounding-box pour ne visiter que les lignes
-- plausibles avant de calculer la distance exacte.
--
-- Même patron que la migration 20260914120000_index_gist_geolocalisation_assurance
-- (module Assurance), appliqué ici au module Pharmacie.
--
-- CREATE INDEX IF NOT EXISTS : idempotent, sans effet si l'index existe déjà
-- (ex. rejoué après un état de base déjà corrigé manuellement).

-- CreateIndex (GIST) sur pharmacie.geolocalisation
CREATE INDEX IF NOT EXISTS "pharmacie_geolocalisation_gist_idx"
    ON "pharmacie"
    USING GIST ("geolocalisation");
