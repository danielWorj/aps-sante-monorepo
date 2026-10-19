-- Réputation médecin — nouvelles valeurs d'enum, dans une migration à part :
-- PostgreSQL n'autorise pas l'usage d'une valeur ajoutée par
-- ALTER TYPE ... ADD VALUE dans la même transaction.
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'avis_medecin_invitation';
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'avis_medecin_publie';
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'avis_medecin_reponse';

CREATE TYPE "TypeEngagementMedecin" AS ENUM ('clic_rdv', 'clic_contact', 'clic_itineraire', 'partage', 'lecture_avis');
