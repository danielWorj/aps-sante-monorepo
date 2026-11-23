-- Référentiel : villes importées depuis Google Maps (Places API) et
-- choix de la source des villes (manuel / google) au back-office.
ALTER TABLE "ville"
  ADD COLUMN "google_place_id" VARCHAR(300),
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION;
CREATE UNIQUE INDEX "ville_google_place_id_key" ON "ville"("google_place_id");

CREATE TYPE "SourceVilles" AS ENUM ('manuel', 'google');

CREATE TABLE "config_source_villes" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "source" "SourceVilles" NOT NULL DEFAULT 'manuel',
  "dernier_test_le" TIMESTAMP(3),
  "dernier_test_ok" BOOLEAN,
  "dernier_message" VARCHAR(500),
  "date_mise_a_jour" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "config_source_villes_pkey" PRIMARY KEY ("id")
);
