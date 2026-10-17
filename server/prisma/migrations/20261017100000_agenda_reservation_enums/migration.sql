-- Agenda — réservation des créneaux : nouvelle valeur d'enum.
--
-- Isolée dans sa propre migration : PostgreSQL interdit d'utiliser une
-- valeur ajoutée par ALTER TYPE ... ADD VALUE dans la transaction qui
-- l'ajoute (même principe que 20260930100000_politique_fonds_v2_enums).
--
-- delai_confirmation_expire : annulation AUTOMATIQUE d'un RDV « cree »
-- (non payé) resté sans confirmation au-delà du délai du pays.
ALTER TYPE "MotifAnnulation" ADD VALUE IF NOT EXISTS 'delai_confirmation_expire';

-- rdv_confirmation_expiree : notification du PATIENT dont la demande a été
-- annulée automatiquement à l'échéance du délai de confirmation.
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'rdv_confirmation_expiree';
