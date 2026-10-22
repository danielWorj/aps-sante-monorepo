-- Annuaire laboratoires : valeur d'enum ajoutée à un type existant.
--   TypeActeurPresence.laboratoire : compteur de vues des fiches laboratoire (vue_fiche)
--
-- Isolée dans sa propre migration : PostgreSQL interdit d'utiliser une
-- valeur ajoutée par ALTER TYPE ... ADD VALUE dans la transaction qui
-- l'ajoute. Sans risque sur les données existantes.
ALTER TYPE "TypeActeurPresence" ADD VALUE IF NOT EXISTS 'laboratoire';
