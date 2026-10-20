-- Push mobile — nouvelles valeurs d'enum, dans une migration à part :
-- PostgreSQL n'autorise pas l'usage d'une valeur ajoutée par
-- ALTER TYPE ... ADD VALUE dans la même transaction.
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'rdv_rappel';
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'offre_rdv_candidature_retenue';
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'offre_rdv_candidature_non_retenue';
