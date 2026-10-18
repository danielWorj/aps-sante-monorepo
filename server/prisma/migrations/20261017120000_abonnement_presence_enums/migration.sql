-- Abonnements de présence (pharmacies, centres de santé, médecins) :
-- types de notification in-app.
--   abonnement_presence_active   : abonnement activé (paiement, virement, gratuité, geste)
--   abonnement_presence_echeance : rappel d'échéance J-30 / J-7 / J-1
--
-- Isolée dans sa propre migration : PostgreSQL interdit d'utiliser une
-- valeur ajoutée par ALTER TYPE ... ADD VALUE dans la transaction qui
-- l'ajoute. Sans risque sur les données existantes.
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'abonnement_presence_active';
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'abonnement_presence_echeance';
