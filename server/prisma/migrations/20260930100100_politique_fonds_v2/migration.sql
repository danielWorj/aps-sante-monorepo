-- Politique de fonds v2 — étape 2/2 : schéma (voir aussi la migration
-- 20260930100000_politique_fonds_v2_enums qui la précède obligatoirement).
--
-- Ordre : (1) nouveaux types, (2) nouvelles tables, (3) données obsolètes
-- (colonnes/lignes de taxe et de frais d'agrégateur), (4) recréation du type
-- TypeFraisTarifaire APRÈS suppression des lignes qui l'utilisent, (5) RDV et
-- remboursements, (6) index partiels.
--
-- AUCUNE valeur de frais d'agrégateur ni d'amende n'est insérée : elles sont
-- saisies par un administrateur (API admin, étape 3). Tant qu'elles sont
-- absentes, le code lèvera une erreur explicite.

-- ---------------------------------------------------------------------------
-- 1. Nouveaux types
-- ---------------------------------------------------------------------------
CREATE TYPE "AgregateurPaiement" AS ENUM ('stripe', 'campay');
CREATE TYPE "TypeFraisAgregateur" AS ENUM ('envoi', 'remboursement');
CREATE TYPE "StatutAmende" AS ENUM ('en_attente', 'partielle', 'imputee');
CREATE TYPE "PartieRendezVous" AS ENUM ('patient', 'medecin');

-- ---------------------------------------------------------------------------
-- 2. Nouvelles tables
-- ---------------------------------------------------------------------------

-- Frais d'agrégateur (envoi / remboursement), versionnés, saisis par l'admin.
CREATE TABLE "frais_agregateur" (
    "frais_agregateur_id" UUID NOT NULL,
    "agregateur" "AgregateurPaiement" NOT NULL,
    "type_frais" "TypeFraisAgregateur" NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "taux" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "montant_fixe" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "date_debut_validite" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "frais_agregateur_pkey" PRIMARY KEY ("frais_agregateur_id"),
    -- Garde-fous de saisie (pas des valeurs métier) : un taux est une
    -- fraction de 0 à 1 (0,025 = 2,5 %), un montant fixe n'est pas négatif.
    CONSTRAINT "frais_agregateur_taux_check" CHECK ("taux" >= 0 AND "taux" <= 1),
    CONSTRAINT "frais_agregateur_montant_fixe_check" CHECK ("montant_fixe" >= 0)
);

-- Taux d'amende du médecin, par pays, versionné, saisi par l'admin.
CREATE TABLE "parametre_amende" (
    "parametre_amende_id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "taux" DECIMAL(5,4) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "date_debut_validite" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametre_amende_pkey" PRIMARY KEY ("parametre_amende_id"),
    CONSTRAINT "parametre_amende_taux_check" CHECK ("taux" >= 0 AND "taux" <= 1)
);

-- Amende du médecin : une par RDV fautif (rdv_id unique = idempotence).
CREATE TABLE "amende_medecin" (
    "amende_id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "rdv_id" UUID NOT NULL,
    "parametre_amende_id" UUID NOT NULL,
    "taux_applique" DECIMAL(5,4) NOT NULL,
    "statut" "StatutAmende" NOT NULL DEFAULT 'en_attente',
    "montant_impute" DECIMAL(12,2),
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_imputation" TIMESTAMP(3),

    CONSTRAINT "amende_medecin_pkey" PRIMARY KEY ("amende_id"),
    CONSTRAINT "amende_medecin_montant_impute_check" CHECK ("montant_impute" IS NULL OR "montant_impute" >= 0)
);

-- Commission APS effectivement versée (une par RDV).
CREATE TABLE "commission_aps_versee" (
    "commission_versee_id" UUID NOT NULL,
    "rdv_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "ligne_commission_id" UUID NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "date_versement" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_aps_versee_pkey" PRIMARY KEY ("commission_versee_id"),
    CONSTRAINT "commission_aps_versee_montant_check" CHECK ("montant" >= 0)
);

-- ---------------------------------------------------------------------------
-- 3. transaction_paiement : taxe / frais d'agrégateur (anciens) -> FraisAgregateur
-- Les colonnes ligne_taxe_id et ligne_frais_agregateur_id sont supprimées
-- AVANT la suppression des lignes tarifaires correspondantes (étape 4) ; leurs
-- contraintes FK et index tombent avec elles.
--
-- Les transactions EXISTANTES gardent montant / montant_honoraires /
-- ligne_commission_id tels quels ; leurs nouvelles colonnes frais_envoi_id et
-- frais_remboursement_id restent NULL (aucun backfill : aucune ligne de frais
-- n'existe tant qu'un admin ne les a pas saisies). Voir le rapport d'étape.
-- ---------------------------------------------------------------------------
ALTER TABLE "transaction_paiement"
  DROP COLUMN "ligne_taxe_id",
  DROP COLUMN "ligne_frais_agregateur_id",
  ADD COLUMN "frais_envoi_id" UUID,
  ADD COLUMN "frais_remboursement_id" UUID;

-- ---------------------------------------------------------------------------
-- 4. ligne_tarifaire : ne garder que 'commission'.
-- Suppression des lignes taxe / frais_agregateur, PUIS recréation du type
-- Postgres (on ne peut pas retirer une valeur d'un enum existant).
-- ---------------------------------------------------------------------------
DELETE FROM "ligne_tarifaire" WHERE "type_frais" IN ('taxe', 'frais_agregateur');

ALTER TYPE "TypeFraisTarifaire" RENAME TO "TypeFraisTarifaire_old";
CREATE TYPE "TypeFraisTarifaire" AS ENUM ('commission');
ALTER TABLE "ligne_tarifaire"
  ALTER COLUMN "type_frais" TYPE "TypeFraisTarifaire"
  USING ("type_frais"::text::"TypeFraisTarifaire");
DROP TYPE "TypeFraisTarifaire_old";

-- ---------------------------------------------------------------------------
-- 5. medecin : le taux de frais d'annulation tardive disparaît (remplacé par
-- l'amende paramétrée par l'administrateur, table parametre_amende).
-- ---------------------------------------------------------------------------
ALTER TABLE "medecin" DROP COLUMN "taux_frais_annulation_tardive";

-- ---------------------------------------------------------------------------
-- 6. rendez_vous : présences (faits) et reprogrammation
-- ---------------------------------------------------------------------------
ALTER TABLE "rendez_vous"
  ADD COLUMN "medecin_present_le" TIMESTAMP(3),
  ADD COLUMN "patient_present_le" TIMESTAMP(3),
  ADD COLUMN "a_reprogrammer_le" TIMESTAMP(3),
  ADD COLUMN "nouvelle_date_proposee" TIMESTAMP(3),
  ADD COLUMN "proposee_par" "PartieRendezVous",
  ADD COLUMN "date_proposition" TIMESTAMP(3),
  -- Une proposition est soit complète, soit absente : jamais à moitié saisie.
  ADD CONSTRAINT "rendez_vous_proposition_coherente_check" CHECK (
    ("nouvelle_date_proposee" IS NULL AND "proposee_par" IS NULL AND "date_proposition" IS NULL)
    OR
    ("nouvelle_date_proposee" IS NOT NULL AND "proposee_par" IS NOT NULL AND "date_proposition" IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- 7. remboursement_paiement : frais réels du retrait CamPay (fait, nullable)
-- ---------------------------------------------------------------------------
ALTER TABLE "remboursement_paiement"
  ADD COLUMN "frais_reels" DECIMAL(12,2),
  ADD CONSTRAINT "remboursement_paiement_frais_reels_check" CHECK ("frais_reels" IS NULL OR "frais_reels" >= 0);

-- ---------------------------------------------------------------------------
-- 8. Index
-- ---------------------------------------------------------------------------
CREATE INDEX "frais_agregateur_agregateur_type_frais_idx" ON "frais_agregateur"("agregateur", "type_frais");
CREATE INDEX "parametre_amende_pays_id_idx" ON "parametre_amende"("pays_id");
CREATE UNIQUE INDEX "amende_medecin_rdv_id_key" ON "amende_medecin"("rdv_id");
CREATE INDEX "amende_medecin_medecin_id_statut_idx" ON "amende_medecin"("medecin_id", "statut");
CREATE INDEX "amende_medecin_parametre_amende_id_idx" ON "amende_medecin"("parametre_amende_id");
CREATE UNIQUE INDEX "commission_aps_versee_rdv_id_key" ON "commission_aps_versee"("rdv_id");
CREATE UNIQUE INDEX "commission_aps_versee_transaction_id_key" ON "commission_aps_versee"("transaction_id");
CREATE INDEX "commission_aps_versee_ligne_commission_id_idx" ON "commission_aps_versee"("ligne_commission_id");
CREATE INDEX "transaction_paiement_frais_envoi_id_idx" ON "transaction_paiement"("frais_envoi_id");
CREATE INDEX "transaction_paiement_frais_remboursement_id_idx" ON "transaction_paiement"("frais_remboursement_id");

-- Versionnement (comme ligne_tarifaire) : une seule ligne ACTIVE par
-- (agregateur, type_frais) et par pays_id. Index uniques PARTIELS (WHERE
-- actif), imposés en base : l'historique des lignes désactivées n'est jamais
-- concerné. Prisma ne sait pas exprimer ces index : ils ne figurent que dans
-- cette migration.
CREATE UNIQUE INDEX "frais_agregateur_agregateur_type_frais_actif_key"
  ON "frais_agregateur"("agregateur", "type_frais") WHERE "actif";
CREATE UNIQUE INDEX "parametre_amende_pays_id_actif_key"
  ON "parametre_amende"("pays_id") WHERE "actif";

-- Anti double créneau (§6) : deux RDV ACTIFS ne peuvent pas occuper le même
-- créneau d'un même médecin. Les RDV terminés/annulés (honore, non_honore,
-- annule, conteste) sont exclus : leur créneau peut être réutilisé.
-- On revérifie les doublons juste avant (des RDV ont pu être créés depuis le
-- pré-contrôle de la migration précédente) pour un message explicite plutôt
-- qu'une simple violation d'unicité.
DO $$
DECLARE
  doublons text;
BEGIN
  SELECT string_agg(
           format('médecin %s, créneau %s : rdv_id = %s', d.medecin_id, d.date_creneau, d.ids),
           E'\n' ORDER BY d.date_creneau)
    INTO doublons
    FROM (
      SELECT medecin_id, date_creneau,
             string_agg(rdv_id::text, ', ' ORDER BY rdv_id) AS ids
        FROM "rendez_vous"
       WHERE "statut" IN ('cree', 'confirme', 'en_attente_presence', 'a_reprogrammer')
       GROUP BY medecin_id, date_creneau
      HAVING count(*) > 1
    ) d;

  IF doublons IS NOT NULL THEN
    RAISE EXCEPTION E'Migration politique de fonds v2 interrompue : des RDV actifs occupent le même créneau d''un même médecin. Corrigez-les puis relancez.\n%', doublons;
  END IF;
END
$$;

CREATE UNIQUE INDEX "rendez_vous_medecin_creneau_actif_key"
  ON "rendez_vous"("medecin_id", "date_creneau")
  WHERE "statut" IN ('cree', 'confirme', 'en_attente_presence', 'a_reprogrammer');

-- ---------------------------------------------------------------------------
-- 9. Clés étrangères
-- ---------------------------------------------------------------------------
ALTER TABLE "parametre_amende" ADD CONSTRAINT "parametre_amende_pays_id_fkey"
  FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transaction_paiement" ADD CONSTRAINT "transaction_paiement_frais_envoi_id_fkey"
  FOREIGN KEY ("frais_envoi_id") REFERENCES "frais_agregateur"("frais_agregateur_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transaction_paiement" ADD CONSTRAINT "transaction_paiement_frais_remboursement_id_fkey"
  FOREIGN KEY ("frais_remboursement_id") REFERENCES "frais_agregateur"("frais_agregateur_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "amende_medecin" ADD CONSTRAINT "amende_medecin_medecin_id_fkey"
  FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "amende_medecin" ADD CONSTRAINT "amende_medecin_rdv_id_fkey"
  FOREIGN KEY ("rdv_id") REFERENCES "rendez_vous"("rdv_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "amende_medecin" ADD CONSTRAINT "amende_medecin_parametre_amende_id_fkey"
  FOREIGN KEY ("parametre_amende_id") REFERENCES "parametre_amende"("parametre_amende_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commission_aps_versee" ADD CONSTRAINT "commission_aps_versee_rdv_id_fkey"
  FOREIGN KEY ("rdv_id") REFERENCES "rendez_vous"("rdv_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission_aps_versee" ADD CONSTRAINT "commission_aps_versee_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "transaction_paiement"("transaction_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission_aps_versee" ADD CONSTRAINT "commission_aps_versee_ligne_commission_id_fkey"
  FOREIGN KEY ("ligne_commission_id") REFERENCES "ligne_tarifaire"("ligne_tarifaire_id") ON DELETE RESTRICT ON UPDATE CASCADE;