-- =====================================================================
-- Seed du référentiel des spécialités médicales (table "specialite")
--
-- Idempotent : ON CONFLICT (nom) DO UPDATE, donc rejouable sans créer
-- de doublons (nom est UNIQUE dans le schéma Prisma).
-- specialite_id est généré via gen_random_uuid() (extension pgcrypto,
-- déjà activée dans le schéma : extensions = [postgis, pgcrypto]).
-- =====================================================================

INSERT INTO specialite (specialite_id, nom, description) VALUES
  (gen_random_uuid(), 'Médecine générale', 'Prise en charge globale et suivi médical courant du patient.'),
  (gen_random_uuid(), 'Pédiatrie', 'Suivi médical des nourrissons, enfants et adolescents.'),
  (gen_random_uuid(), 'Gynécologie-obstétrique', 'Santé de la femme, suivi de grossesse et accouchement.'),
  (gen_random_uuid(), 'Cardiologie', 'Diagnostic et traitement des maladies du cœur et des vaisseaux.'),
  (gen_random_uuid(), 'Dermatologie', 'Diagnostic et traitement des maladies de la peau, des cheveux et des ongles.'),
  (gen_random_uuid(), 'Ophtalmologie', 'Diagnostic et traitement des maladies des yeux et de la vision.'),
  (gen_random_uuid(), 'ORL (Oto-rhino-laryngologie)', 'Prise en charge des pathologies de l''oreille, du nez et de la gorge.'),
  (gen_random_uuid(), 'Neurologie', 'Diagnostic et traitement des maladies du système nerveux.'),
  (gen_random_uuid(), 'Psychiatrie', 'Diagnostic et traitement des troubles mentaux et psychiques.'),
  (gen_random_uuid(), 'Endocrinologie-diabétologie', 'Prise en charge des maladies hormonales et du diabète.'),
  (gen_random_uuid(), 'Gastro-entérologie', 'Diagnostic et traitement des maladies de l''appareil digestif.'),
  (gen_random_uuid(), 'Pneumologie', 'Diagnostic et traitement des maladies respiratoires.'),
  (gen_random_uuid(), 'Rhumatologie', 'Diagnostic et traitement des maladies des os, articulations et muscles.'),
  (gen_random_uuid(), 'Urologie', 'Diagnostic et traitement des maladies de l''appareil urinaire et génital masculin.'),
  (gen_random_uuid(), 'Néphrologie', 'Diagnostic et traitement des maladies des reins.'),
  (gen_random_uuid(), 'Oncologie', 'Diagnostic et traitement des cancers.'),
  (gen_random_uuid(), 'Hématologie', 'Diagnostic et traitement des maladies du sang.'),
  (gen_random_uuid(), 'Chirurgie générale', 'Interventions chirurgicales courantes sur l''abdomen et les tissus mous.'),
  (gen_random_uuid(), 'Chirurgie orthopédique', 'Chirurgie des os, articulations, ligaments et tendons.'),
  (gen_random_uuid(), 'Chirurgie pédiatrique', 'Chirurgie spécialisée pour les enfants.'),
  (gen_random_uuid(), 'Anesthésie-réanimation', 'Prise en charge anesthésique et soins critiques péri-opératoires.'),
  (gen_random_uuid(), 'Radiologie et imagerie médicale', 'Diagnostic par imagerie médicale (radio, échographie, scanner, IRM).'),
  (gen_random_uuid(), 'Médecine du travail', 'Prévention et suivi de la santé des travailleurs en milieu professionnel.'),
  (gen_random_uuid(), 'Médecine interne', 'Diagnostic et prise en charge globale des maladies complexes de l''adulte.'),
  (gen_random_uuid(), 'Infectiologie', 'Diagnostic et traitement des maladies infectieuses.'),
  (gen_random_uuid(), 'Allergologie', 'Diagnostic et traitement des allergies et maladies du système immunitaire.'),
  (gen_random_uuid(), 'Stomatologie / Chirurgie dentaire', 'Soins et chirurgie de la cavité buccale et des dents.'),
  (gen_random_uuid(), 'Kinésithérapie', 'Rééducation fonctionnelle et physiothérapie.'),
  (gen_random_uuid(), 'Médecine de la reproduction', 'Diagnostic et traitement de l''infertilité et procréation médicalement assistée.'),
  (gen_random_uuid(), 'Gériatrie', 'Prise en charge médicale des personnes âgées.')
ON CONFLICT (nom) DO UPDATE
  SET description = EXCLUDED.description;