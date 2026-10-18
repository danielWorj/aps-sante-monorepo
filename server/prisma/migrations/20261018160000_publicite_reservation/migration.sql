-- Publicité v9 — réservation d'espace publicitaire.
--
-- 1. Emplacements : groupe de pages, nombre de places (rangs du slider).
-- 2. Forfaits : échelonnés par rang et par pays (devise).
-- 3. Publicités : cycle de réservation (modération -> paiement -> diffusion),
--    contact affiché, informations de l'annonceur, prix figé.
-- 4. Factures de publicité (compteur annuel propre), statistiques par jour.
-- 5. Transactions : une transaction peut payer une publicité.
-- 6. Modèles de messages WhatsApp éditables au back-office.

CREATE TYPE "StatutPublicite" AS ENUM ('en_moderation', 'rejetee', 'en_attente_paiement', 'expiree', 'payee', 'annulee');

-- ---------------------------------------------------------------------------
-- 1. emplacement_publicitaire
-- ---------------------------------------------------------------------------
ALTER TABLE "emplacement_publicitaire"
  ADD COLUMN "pages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "nombre_places" SMALLINT NOT NULL DEFAULT 3,
  ADD COLUMN "actif" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "emplacement_publicitaire" ADD CONSTRAINT "emplacement_publicitaire_nombre_places_check"
  CHECK ("nombre_places" BETWEEN 1 AND 10);

-- ---------------------------------------------------------------------------
-- 2. forfait_publicitaire
-- ---------------------------------------------------------------------------
ALTER TABLE "forfait_publicitaire"
  ADD COLUMN "rang" SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN "pays_id" UUID,
  ADD COLUMN "devise" VARCHAR(3) NOT NULL DEFAULT 'xaf',
  ADD COLUMN "actif" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "forfait_publicitaire" ADD CONSTRAINT "forfait_publicitaire_rang_check" CHECK ("rang" >= 1);
ALTER TABLE "forfait_publicitaire" ADD CONSTRAINT "forfait_publicitaire_duree_check" CHECK ("duree_jours" >= 1);
ALTER TABLE "forfait_publicitaire" ADD CONSTRAINT "forfait_publicitaire_prix_check" CHECK ("prix" >= 0);

CREATE INDEX "forfait_publicitaire_emplacement_publicitaire_id_pays_id_rang_idx"
  ON "forfait_publicitaire"("emplacement_publicitaire_id", "pays_id", "rang");

ALTER TABLE "forfait_publicitaire" ADD CONSTRAINT "forfait_publicitaire_pays_id_fkey"
  FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. publicite
-- ---------------------------------------------------------------------------
ALTER TABLE "publicite"
  ADD COLUMN "statut" "StatutPublicite" NOT NULL DEFAULT 'en_moderation',
  ADD COLUMN "rang" SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "telephone_contact" VARCHAR(30),
  ADD COLUMN "email_contact" VARCHAR(150),
  ADD COLUMN "localisation" VARCHAR(255),
  ADD COLUMN "annonceur_nom" VARCHAR(150),
  ADD COLUMN "annonceur_entreprise" VARCHAR(150),
  ADD COLUMN "annonceur_telephone" VARCHAR(30),
  ADD COLUMN "annonceur_email" VARCHAR(150),
  ADD COLUMN "montant" DECIMAL(12,2),
  ADD COLUMN "devise" VARCHAR(3),
  ADD COLUMN "motif_rejet" TEXT,
  ADD COLUMN "date_soumission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "date_moderation" TIMESTAMP(3),
  ADD COLUMN "moderateur_id" UUID,
  ADD COLUMN "date_limite_paiement" TIMESTAMP(3),
  ADD COLUMN "date_paiement" TIMESTAMP(3),
  ADD COLUMN "transaction_id" UUID;

-- Publicités existantes : une publicité déjà validée reste diffusée (elle
-- est considérée comme payée hors plateforme), les autres suivent leur statut.
UPDATE "publicite" p SET
  "statut" = CASE p."statut_moderation"
               WHEN 'validee' THEN 'payee'::"StatutPublicite"
               WHEN 'rejetee' THEN 'rejetee'::"StatutPublicite"
               ELSE 'en_moderation'::"StatutPublicite"
             END,
  "montant" = f."prix",
  "devise" = f."devise"
FROM "forfait_publicitaire" f
WHERE f."forfait_publicitaire_id" = p."forfait_publicitaire_id";

CREATE UNIQUE INDEX "publicite_transaction_id_key" ON "publicite"("transaction_id");
CREATE INDEX "publicite_emplacement_publicitaire_id_pays_id_rang_statut_idx"
  ON "publicite"("emplacement_publicitaire_id", "pays_id", "rang", "statut");
CREATE INDEX "publicite_statut_date_limite_paiement_idx" ON "publicite"("statut", "date_limite_paiement");

ALTER TABLE "publicite" ADD CONSTRAINT "publicite_periode_check" CHECK ("date_fin" > "date_debut");

-- ---------------------------------------------------------------------------
-- 4. facture_publicite, compteur, statistiques
-- ---------------------------------------------------------------------------
CREATE TABLE "facture_publicite" (
    "facture_id" UUID NOT NULL,
    "numero" VARCHAR(30) NOT NULL,
    "publicite_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "date_emission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "devise" VARCHAR(3) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "facture_publicite_pkey" PRIMARY KEY ("facture_id")
);

CREATE UNIQUE INDEX "facture_publicite_numero_key" ON "facture_publicite"("numero");
CREATE UNIQUE INDEX "facture_publicite_publicite_id_key" ON "facture_publicite"("publicite_id");
CREATE UNIQUE INDEX "facture_publicite_transaction_id_key" ON "facture_publicite"("transaction_id");

ALTER TABLE "facture_publicite" ADD CONSTRAINT "facture_publicite_publicite_id_fkey"
  FOREIGN KEY ("publicite_id") REFERENCES "publicite"("publicite_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "compteur_facture_publicite" (
    "annee" INTEGER NOT NULL,
    "dernier" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "compteur_facture_publicite_pkey" PRIMARY KEY ("annee")
);

CREATE TABLE "statistique_publicite_jour" (
    "publicite_id" UUID NOT NULL,
    "jour" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clics" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "statistique_publicite_jour_pkey" PRIMARY KEY ("publicite_id", "jour")
);

ALTER TABLE "statistique_publicite_jour" ADD CONSTRAINT "statistique_publicite_jour_publicite_id_fkey"
  FOREIGN KEY ("publicite_id") REFERENCES "publicite"("publicite_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. transaction_paiement
-- ---------------------------------------------------------------------------
ALTER TABLE "transaction_paiement" ADD COLUMN "publicite_id_cible" UUID;
CREATE INDEX "transaction_paiement_publicite_id_cible_idx" ON "transaction_paiement"("publicite_id_cible");

-- Une transaction vise UN seul objet : RDV, abonnement assurance,
-- abonnement de présence OU publicité.
ALTER TABLE "transaction_paiement" DROP CONSTRAINT "transaction_objet_unique";
ALTER TABLE "transaction_paiement" ADD CONSTRAINT "transaction_objet_unique"
  CHECK (
    (CASE WHEN "rdv_id_cible" IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN "abonnement_assurance_id_cible" IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN "abonnement_presence_id_cible" IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN "publicite_id_cible" IS NOT NULL THEN 1 ELSE 0 END) <= 1
  );

-- ---------------------------------------------------------------------------
-- 6. modele_message_whatsapp
-- ---------------------------------------------------------------------------
CREATE TABLE "modele_message_whatsapp" (
    "code" VARCHAR(60) NOT NULL,
    "libelle" VARCHAR(150) NOT NULL,
    "texte" TEXT NOT NULL,
    "nom_modele_meta" VARCHAR(512),
    "langue" VARCHAR(10) NOT NULL DEFAULT 'fr',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "date_mise_a_jour" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modele_message_whatsapp_pkey" PRIMARY KEY ("code")
);

INSERT INTO "modele_message_whatsapp" ("code", "libelle", "texte") VALUES
('publicite_acceptee', 'Publicité acceptée',
 'Bonjour {annonceur}, votre publicité « {titre} » ({emplacement}, position {position}) a été acceptée par APS Santé. Diffusion prévue du {date_debut} au {date_fin}. Montant : {montant}. Pour la confirmer, réglez avant le {date_limite_paiement} : {lien_paiement}'),
('publicite_rejetee', 'Publicité rejetée',
 'Bonjour {annonceur}, votre publicité « {titre} » n''a pas été retenue par APS Santé. Motif : {motif}. Vous pouvez soumettre une nouvelle demande depuis l''application.'),
('publicite_payee', 'Paiement de publicité confirmé',
 'Bonjour {annonceur}, nous avons bien reçu votre paiement pour la publicité « {titre} ». Facture {numero_facture} : {recapitulatif}. Diffusion du {date_debut} au {date_fin}. Facture et statistiques : {lien_facture}');
