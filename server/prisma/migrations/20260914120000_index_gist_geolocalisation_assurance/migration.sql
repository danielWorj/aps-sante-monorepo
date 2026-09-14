-- Index spatiaux GIST pour le module Assurance (ServiceAssurance.geolocalisation, Agence.gps)
--
-- Contexte : ces colonnes sont typées `geography(Point, 4326)` et déclarées comme
-- `Unsupported(...)` dans schema.prisma. Prisma Migrate ne sait pas générer d'index
-- `USING GIST` sur ce type de colonne à partir du schéma : ce fichier SQL est donc
-- écrit à la main (migration "custom SQL"), comme documenté par Prisma pour les cas
-- non supportés nativement (https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations).
--
-- Sans ces index, toute requête de proximité (ST_DWithin / ST_Distance / tri par
-- distance / KNN <->) sur service_assurance ou agence déclenche un Seq Scan complet
-- avec calcul de distance ligne par ligne. Un index GIST sur une colonne geography
-- permet à PostGIS d'utiliser l'opérateur de bounding-box pour ne visiter que les
-- lignes plausibles avant de calculer la distance exacte.
--
-- CREATE INDEX IF NOT EXISTS : idempotent, sans effet si l'index existe déjà
-- (ex. rejoué après un état de base déjà corrigé manuellement).

-- CreateIndex (GIST) sur service_assurance.geolocalisation
CREATE INDEX IF NOT EXISTS "service_assurance_geolocalisation_gist_idx"
    ON "service_assurance"
    USING GIST ("geolocalisation");

-- CreateIndex (GIST) sur agence.gps
CREATE INDEX IF NOT EXISTS "agence_gps_gist_idx"
    ON "agence"
    USING GIST ("gps");
