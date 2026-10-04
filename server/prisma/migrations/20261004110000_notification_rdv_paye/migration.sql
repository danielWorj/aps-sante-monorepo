-- Notification « rendez-vous payé » (D8) : le médecin n'est notifié qu'à la
-- confirmation du paiement (cree -> confirme), jamais avant.
--
-- Une seule migration suffit ici : la nouvelle valeur d'enum n'est utilisée
-- par aucune instruction de ce fichier (PostgreSQL interdit seulement de
-- l'utiliser dans la MÊME transaction que l'ALTER TYPE ... ADD VALUE).
-- Aucune donnée existante n'est modifiée.

-- AlterEnum
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'rdv_paye';