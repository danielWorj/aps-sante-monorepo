-- Commission patient (CP) — étape 1/2 : nouvelle valeur d'enum.
--
-- Cette migration est volontairement séparée de la suivante : PostgreSQL
-- interdit d'utiliser une valeur d'enum ajoutée par ALTER TYPE ... ADD VALUE
-- dans la MÊME transaction (or Prisma exécute un fichier de migration en une
-- seule transaction). Même pattern que 20260930100000_politique_fonds_v2_enums.
--
-- Convention : la valeur existante 'commission' reste la commission MÉDECIN
-- (CM, ex-« Z ») ; 'commission_patient' est la commission PATIENT (CP,
-- ex-« Y »). Aucune ligne n'est insérée : les taux CP sont saisis par un
-- administrateur (aucun seed, aucune valeur par défaut).

-- AlterEnum
ALTER TYPE "TypeFraisTarifaire" ADD VALUE IF NOT EXISTS 'commission_patient';