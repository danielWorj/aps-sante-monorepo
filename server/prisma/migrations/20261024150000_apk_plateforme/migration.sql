-- Plateforme de la version publiée : android (fichier .apk) ou ios (lien externe).
ALTER TABLE "mobile_apk" ADD COLUMN "plateforme" VARCHAR(10) NOT NULL DEFAULT 'android';
