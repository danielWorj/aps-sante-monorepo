-- Acceptation d'un RDV physique par le médecin : nouvelle valeur d'enum.
--
-- Isolée dans sa propre migration (même principe que
-- 20261017100000_agenda_reservation_enums) : PostgreSQL interdit d'utiliser
-- une valeur ajoutée par ALTER TYPE ... ADD VALUE dans la transaction qui
-- l'ajoute.
--
-- rdv_accepte : notification du PATIENT quand le médecin accepte un RDV
-- physique payé en précisant le lieu (ou modifie ce lieu).
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'rdv_accepte';
