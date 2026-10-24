-- Téléconsultation : alerte du patient quand le médecin lance la visio.
ALTER TYPE "TypeNotification" ADD VALUE IF NOT EXISTS 'rdv_visio_demarree';
