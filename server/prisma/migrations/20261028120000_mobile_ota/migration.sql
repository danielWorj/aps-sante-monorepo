-- Déploiement OTA de l'application mobile : version minimale obligatoire,
-- déploiement progressif et empreinte SHA-256 de l'APK.
ALTER TABLE "mobile_apk" ADD COLUMN "build_minimum" INTEGER;
ALTER TABLE "mobile_apk" ADD COLUMN "deploiement_pourcentage" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "mobile_apk" ADD COLUMN "sha256" VARCHAR(64);
