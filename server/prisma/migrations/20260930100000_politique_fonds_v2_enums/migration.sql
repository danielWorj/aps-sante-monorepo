-- Politique de fonds v2 — étape 1/2 : pré-contrôle et nouvelles valeurs d'enum.
--
-- Cette migration est volontairement séparée de la suivante : PostgreSQL
-- interdit d'utiliser une valeur d'enum ajoutée par ALTER TYPE ... ADD VALUE
-- dans la MÊME transaction (or Prisma exécute un fichier de migration en une
-- seule transaction). La migration 20260930100100_politique_fonds_v2 utilise
-- 'a_reprogrammer' dans le prédicat d'un index partiel : elle doit donc venir
-- après le commit de celle-ci.

-- ---------------------------------------------------------------------------
-- 0. Pré-contrôle : doublons de créneau parmi les RDV actifs.
-- La migration suivante crée un index unique partiel sur
-- (medecin_id, date_creneau) pour les RDV actifs. On détecte ICI les doublons
-- existants, avant toute modification, et on échoue en listant les rdv_id
-- concernés. RIEN n'est corrigé silencieusement : c'est à un humain de
-- trancher (annuler / reprogrammer l'un des RDV), puis de relancer.
-- (a_reprogrammer n'existe pas encore : aucun RDV n'a ce statut.)
-- ---------------------------------------------------------------------------
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
       WHERE "statut" IN ('cree', 'confirme', 'en_attente_presence')
       GROUP BY medecin_id, date_creneau
      HAVING count(*) > 1
    ) d;

  IF doublons IS NOT NULL THEN
    RAISE EXCEPTION E'Migration politique de fonds v2 interrompue : des RDV actifs occupent le même créneau d''un même médecin. Corrigez-les (annulation ou reprogrammation manuelle) puis relancez.\n%', doublons;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. Nouvelles valeurs d'enum
-- ---------------------------------------------------------------------------

-- AlterEnum : deux absents -> le RDV attend une reprogrammation (48h).
ALTER TYPE "StatutRendezVous" ADD VALUE IF NOT EXISTS 'a_reprogrammer';

-- AlterEnum : amende du médecin imputée sur une libération de fonds.
-- Les anciennes valeurs (debit_frais_no_show, debit_retenue_annulation_tardive,
-- credit_frais_annulation) sont CONSERVÉES : le grand-livre existant les
-- référence. Elles sont seulement marquées obsolètes dans schema.prisma et ne
-- seront plus écrites.
ALTER TYPE "TypeMouvementPortefeuille" ADD VALUE IF NOT EXISTS 'debit_amende';