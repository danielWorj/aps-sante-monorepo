-- Portail assurance : valeurs d'enum ajoutées à des types existants.
--   TypeNotification.mise_en_relation_recue : nouvelle demande reçue (agents de la fiche)
--   TypeActeurPresence.assurance            : compteur de vues des fiches assurance (vue_fiche)
--
-- Isolée dans sa propre migration : PostgreSQL interdit d'utiliser une
-- valeur ajoutée par ALTER TYPE ... ADD VALUE dans la transaction qui
-- l'ajoute. Sans risque sur les données existantes.
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'mise_en_relation_recue';
ALTER TYPE "TypeActeurPresence" ADD VALUE IF NOT EXISTS 'assurance';
