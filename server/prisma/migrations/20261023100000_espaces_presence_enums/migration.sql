-- Espaces pharmacie / centre de santé — nouvelles valeurs d'enum, dans une
-- migration à part : PostgreSQL n'autorise pas l'usage d'une valeur ajoutée
-- par ALTER TYPE ... ADD VALUE dans la même transaction.
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'message_fiche_recu';

CREATE TYPE "StatutMessageFiche" AS ENUM ('non_lu', 'lu', 'archive');
