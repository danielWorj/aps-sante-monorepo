-- Abonnements des assurances : types de notification in-app.
--   abonnement_assurance_active   : abonnement activé (paiement, virement, gratuité, geste)
--   abonnement_assurance_echeance : rappel d'échéance J-30 / J-7 / J-1
-- Sans risque sur les données existantes : ajout de valeurs d'enum.

ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'abonnement_assurance_active';
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'abonnement_assurance_echeance';
