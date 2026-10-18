-- RDV aléatoire (RDV sur offre) : types de notification in-app.
--   offre_rdv_nouvelle : nouvelle offre signalée aux médecins éligibles
--   offre_rdv_reponse  : un médecin a répondu à l'offre du patient
--   offre_rdv_expiree  : la date de l'offre est passée sans médecin validé
--
-- Isolée dans sa propre migration : PostgreSQL interdit d'utiliser une
-- valeur ajoutée par ALTER TYPE ... ADD VALUE dans la transaction qui
-- l'ajoute. Sans risque sur les données existantes.
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'offre_rdv_nouvelle';
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'offre_rdv_reponse';
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'offre_rdv_expiree';
