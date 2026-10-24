-- Le médecin change le type d'un RDV (physique <-> téléconsultation) : notification du patient.
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'rdv_type_modifie';
