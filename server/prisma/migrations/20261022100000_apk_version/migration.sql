-- Version lue dans l'AndroidManifest de l'APK au téléversement.
ALTER TABLE "mobile_apk" ADD COLUMN "version_name" VARCHAR(50),
ADD COLUMN "version_code" INTEGER;
