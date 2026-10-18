-- Abonnements de présence : pharmacies, centres de santé, médecins.
--
-- Même moteur que les abonnements assurance (20261013100100), mutualisé
-- pour trois types d'acteur. Cette migration ajoute :
--   1. l'enum TypeActeurPresence ;
--   2. les tables niveau / abonnement / tarif / remise / config / facture
--      « _abonnement_presence » ;
--   3. les contenus enrichis des fiches (pharmacie, structure_sante) et la
--      colonne "abonnement_presence_id_cible" sur "transaction_paiement" ;
--   4. les contraintes que Prisma ne sait pas exprimer (CHECK, index
--      uniques partiels, déclencheur d'ajout seul) ;
--   5. une grille de départ (niveaux, remises de durée, tarifs indicatifs
--      du Cameroun) — modifiable ensuite depuis le back-office.
--
-- Prérequis : 20261013100000_journal_audit (interdire_modification()) et
-- 20261013100100_abonnement_assurance (enums de statut et d'origine,
-- compteur de facture partagé).
--
-- Sans risque sur les données existantes : seules des tables sont créées,
-- les colonnes ajoutées aux tables existantes sont nullables. Médecins :
-- l'obligation de souscrire est DÉSACTIVÉE par défaut dans tous les pays.

-- ---------------------------------------------------------------------------
-- 1. Enum
-- ---------------------------------------------------------------------------
CREATE TYPE "TypeActeurPresence" AS ENUM ('pharmacie', 'structure', 'medecin');

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE "niveau_abonnement_presence" (
    "niveau_id" UUID NOT NULL,
    "type_acteur" "TypeActeurPresence" NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "rang" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "contact_direct" BOOLEAN NOT NULL DEFAULT true,
    "photos" BOOLEAN NOT NULL DEFAULT true,
    "description_enrichie" BOOLEAN NOT NULL DEFAULT true,
    "presentation_equipe" BOOLEAN NOT NULL DEFAULT false,
    "prise_rdv_en_ligne" BOOLEAN NOT NULL DEFAULT true,
    "multimedia" BOOLEAN NOT NULL DEFAULT false,
    "statistiques" BOOLEAN NOT NULL DEFAULT false,
    "statistiques_detaillees" BOOLEAN NOT NULL DEFAULT false,
    "multi_utilisateurs" BOOLEAN NOT NULL DEFAULT false,
    "support_prioritaire" BOOLEAN NOT NULL DEFAULT false,
    "max_photos" INTEGER,
    "max_gestionnaires" INTEGER,

    CONSTRAINT "niveau_abonnement_presence_pkey" PRIMARY KEY ("niveau_id")
);

CREATE TABLE "abonnement_presence" (
    "abonnement_id" UUID NOT NULL,
    "type_acteur" "TypeActeurPresence" NOT NULL,
    "pharmacie_id" UUID,
    "structure_id" UUID,
    "medecin_id" UUID,
    "niveau_id" UUID NOT NULL,
    "duree_mois" INTEGER NOT NULL,
    "prix_mensuel_applique" DECIMAL(12,2) NOT NULL,
    "remise_pourcent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "credit_prorata" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "montant_total" DECIMAL(12,2) NOT NULL,
    "devise" VARCHAR(3) NOT NULL,
    "date_debut" DATE,
    "date_fin" DATE,
    "statut" "StatutAbonnementAssurance" NOT NULL DEFAULT 'en_attente_paiement',
    "abonnement_remplace_id" UUID,
    "dernier_rappel_jours" INTEGER,
    "transaction_id" UUID,
    "motif" TEXT,
    "origine" "OrigineAbonnementAssurance" NOT NULL DEFAULT 'self_service',
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_mise_a_jour" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "abonnement_presence_pkey" PRIMARY KEY ("abonnement_id")
);

CREATE TABLE "tarif_abonnement_presence" (
    "tarif_id" UUID NOT NULL,
    "niveau_id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "devise" VARCHAR(3) NOT NULL,
    "prix_mensuel" DECIMAL(12,2) NOT NULL,
    "prix_usd_indicatif" DECIMAL(12,2),
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tarif_abonnement_presence_pkey" PRIMARY KEY ("tarif_id")
);

CREATE TABLE "remise_duree_abonnement_presence" (
    "type_acteur" "TypeActeurPresence" NOT NULL,
    "duree_mois" INTEGER NOT NULL,
    "remise_pourcent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "remise_duree_abonnement_presence_pkey" PRIMARY KEY ("type_acteur","duree_mois")
);

CREATE TABLE "config_abonnement_presence" (
    "type_acteur" "TypeActeurPresence" NOT NULL,
    "pays_id" UUID NOT NULL,
    "gratuite_active" BOOLEAN NOT NULL DEFAULT false,
    "gratuite_niveau_id" UUID,
    "gratuite_jusqu_au" DATE,
    "grace_jours" INTEGER NOT NULL DEFAULT 7,
    "abonnement_obligatoire" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "config_abonnement_presence_pkey" PRIMARY KEY ("type_acteur","pays_id")
);

CREATE TABLE "facture_abonnement_presence" (
    "facture_id" UUID NOT NULL,
    "numero" VARCHAR(30) NOT NULL,
    "abonnement_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "date_emission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "devise" VARCHAR(3) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "facture_abonnement_presence_pkey" PRIMARY KEY ("facture_id")
);

-- ---------------------------------------------------------------------------
-- 3. Colonnes ajoutées aux tables existantes (toutes nullables)
-- ---------------------------------------------------------------------------
ALTER TABLE "pharmacie" ADD COLUMN "description_enrichie" TEXT,
ADD COLUMN "services_particuliers" TEXT;

ALTER TABLE "structure_sante" ADD COLUMN "description_enrichie" TEXT,
ADD COLUMN "presentation_equipe" TEXT;

ALTER TABLE "transaction_paiement" ADD COLUMN "abonnement_presence_id_cible" UUID;

-- ---------------------------------------------------------------------------
-- 4. Index et unicités
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "niveau_abonnement_presence_type_acteur_code_key" ON "niveau_abonnement_presence"("type_acteur", "code");

CREATE UNIQUE INDEX "niveau_abonnement_presence_type_acteur_rang_key" ON "niveau_abonnement_presence"("type_acteur", "rang");

CREATE INDEX "abonnement_presence_pharmacie_id_statut_idx" ON "abonnement_presence"("pharmacie_id", "statut");

CREATE INDEX "abonnement_presence_structure_id_statut_idx" ON "abonnement_presence"("structure_id", "statut");

CREATE INDEX "abonnement_presence_medecin_id_statut_idx" ON "abonnement_presence"("medecin_id", "statut");

CREATE INDEX "abonnement_presence_type_acteur_statut_date_fin_idx" ON "abonnement_presence"("type_acteur", "statut", "date_fin");

CREATE INDEX "abonnement_presence_niveau_id_idx" ON "abonnement_presence"("niveau_id");

CREATE INDEX "abonnement_presence_transaction_id_idx" ON "abonnement_presence"("transaction_id");

CREATE UNIQUE INDEX "tarif_abonnement_presence_niveau_id_pays_id_key" ON "tarif_abonnement_presence"("niveau_id", "pays_id");

CREATE INDEX "tarif_abonnement_presence_pays_id_idx" ON "tarif_abonnement_presence"("pays_id");

CREATE UNIQUE INDEX "facture_abonnement_presence_numero_key" ON "facture_abonnement_presence"("numero");

CREATE UNIQUE INDEX "facture_abonnement_presence_abonnement_id_key" ON "facture_abonnement_presence"("abonnement_id");

CREATE UNIQUE INDEX "facture_abonnement_presence_transaction_id_key" ON "facture_abonnement_presence"("transaction_id");

CREATE INDEX "transaction_paiement_abonnement_presence_id_cible_idx" ON "transaction_paiement"("abonnement_presence_id_cible");

-- ---------------------------------------------------------------------------
-- 5. Clés étrangères — RESTRICT sur la fiche : une fiche qui porte des
--    abonnements (donc peut-être des factures) ne se supprime pas.
-- ---------------------------------------------------------------------------
ALTER TABLE "abonnement_presence" ADD CONSTRAINT "abonnement_presence_pharmacie_id_fkey" FOREIGN KEY ("pharmacie_id") REFERENCES "pharmacie"("pharmacie_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "abonnement_presence" ADD CONSTRAINT "abonnement_presence_structure_id_fkey" FOREIGN KEY ("structure_id") REFERENCES "structure_sante"("structure_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "abonnement_presence" ADD CONSTRAINT "abonnement_presence_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "abonnement_presence" ADD CONSTRAINT "abonnement_presence_niveau_id_fkey" FOREIGN KEY ("niveau_id") REFERENCES "niveau_abonnement_presence"("niveau_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "abonnement_presence" ADD CONSTRAINT "abonnement_presence_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction_paiement"("transaction_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tarif_abonnement_presence" ADD CONSTRAINT "tarif_abonnement_presence_niveau_id_fkey" FOREIGN KEY ("niveau_id") REFERENCES "niveau_abonnement_presence"("niveau_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tarif_abonnement_presence" ADD CONSTRAINT "tarif_abonnement_presence_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "config_abonnement_presence" ADD CONSTRAINT "config_abonnement_presence_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "facture_abonnement_presence" ADD CONSTRAINT "facture_abonnement_presence_abonnement_id_fkey" FOREIGN KEY ("abonnement_id") REFERENCES "abonnement_presence"("abonnement_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Contraintes que Prisma ne sait pas exprimer (déclarées ici seulement)
-- ---------------------------------------------------------------------------

-- Une transaction vise UN seul objet : RDV, abonnement assurance OU
-- abonnement de présence.
ALTER TABLE "transaction_paiement" DROP CONSTRAINT "transaction_objet_unique";
ALTER TABLE "transaction_paiement" ADD CONSTRAINT "transaction_objet_unique"
  CHECK (
    (CASE WHEN "rdv_id_cible" IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN "abonnement_assurance_id_cible" IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN "abonnement_presence_id_cible" IS NOT NULL THEN 1 ELSE 0 END) <= 1
  );

-- Un abonnement porte exactement la fiche de son type d'acteur.
ALTER TABLE "abonnement_presence" ADD CONSTRAINT "abonnement_presence_acteur_coherent"
  CHECK (
    ("type_acteur" = 'pharmacie' AND "pharmacie_id" IS NOT NULL AND "structure_id" IS NULL AND "medecin_id" IS NULL)
    OR ("type_acteur" = 'structure' AND "structure_id" IS NOT NULL AND "pharmacie_id" IS NULL AND "medecin_id" IS NULL)
    OR ("type_acteur" = 'medecin' AND "medecin_id" IS NOT NULL AND "pharmacie_id" IS NULL AND "structure_id" IS NULL)
  );

-- Un niveau ne sert qu'aux abonnements de son type d'acteur : vérifié par
-- l'API (le type est relu sur le niveau à chaque achat).

-- Un seul brouillon ouvert par fiche.
CREATE UNIQUE INDEX "abo_presence_un_brouillon_pharmacie"
  ON "abonnement_presence" ("pharmacie_id") WHERE "statut" = 'en_attente_paiement' AND "pharmacie_id" IS NOT NULL;
CREATE UNIQUE INDEX "abo_presence_un_brouillon_structure"
  ON "abonnement_presence" ("structure_id") WHERE "statut" = 'en_attente_paiement' AND "structure_id" IS NOT NULL;
CREATE UNIQUE INDEX "abo_presence_un_brouillon_medecin"
  ON "abonnement_presence" ("medecin_id") WHERE "statut" = 'en_attente_paiement' AND "medecin_id" IS NOT NULL;

-- Facture archivée : ajout seul.
CREATE TRIGGER facture_abo_presence_ajout_seul
  BEFORE UPDATE OR DELETE ON "facture_abonnement_presence"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();

-- ---------------------------------------------------------------------------
-- 7. Grille de départ (cahier des charges §2, montants INDICATIFS à valider)
--    Pharmacies : Standard. Centres de santé : Premium, Corporate.
--    Médecins : Standard (libéraux), Premium (cabinets de groupe).
--    Un rang supérieur cumule les avantages des rangs inférieurs.
-- ---------------------------------------------------------------------------
INSERT INTO "niveau_abonnement_presence"
  ("niveau_id", "type_acteur", "code", "libelle", "rang",
   "contact_direct", "photos", "description_enrichie", "presentation_equipe", "prise_rdv_en_ligne",
   "multimedia", "statistiques", "statistiques_detaillees", "multi_utilisateurs", "support_prioritaire")
VALUES
  (gen_random_uuid(), 'pharmacie', 'standard',  'Standard',  1, true, true, true, false, false, false, true, false, false, false),
  (gen_random_uuid(), 'structure', 'premium',   'Premium',   1, true, true, true, true,  false, true,  true, true,  false, true),
  (gen_random_uuid(), 'structure', 'corporate', 'Corporate', 2, true, true, true, true,  false, true,  true, true,  true,  true),
  (gen_random_uuid(), 'medecin',   'standard',  'Standard',  1, true, true, true, false, true,  false, true, false, false, false),
  (gen_random_uuid(), 'medecin',   'premium',   'Premium',   2, true, true, true, false, true,  true,  true, true,  false, true);

-- Durées M1, M3, M6, Y1 (une durée absente n'est pas proposée).
INSERT INTO "remise_duree_abonnement_presence" ("type_acteur", "duree_mois", "remise_pourcent")
SELECT t.type_acteur::"TypeActeurPresence", d.duree_mois, d.remise
FROM (VALUES ('pharmacie'), ('structure'), ('medecin')) AS t(type_acteur)
CROSS JOIN (VALUES (1, 0), (3, 5), (6, 10), (12, 15)) AS d(duree_mois, remise);

-- Tarifs mensuels indicatifs du Cameroun (XAF), si le pays existe.
INSERT INTO "tarif_abonnement_presence" ("tarif_id", "niveau_id", "pays_id", "devise", "prix_mensuel")
SELECT gen_random_uuid(), n."niveau_id", p."pays_id", 'xaf',
  CASE n."code" WHEN 'standard' THEN 5000 WHEN 'premium' THEN 25000 WHEN 'corporate' THEN 60000 END
FROM "niveau_abonnement_presence" n
CROSS JOIN "pays" p
WHERE p."code_iso2" = 'CM';
