-- Formulaire public « Contactez-nous » : messages traités au back-office.
CREATE TYPE "StatutMessageContact" AS ENUM ('nouveau', 'en_cours', 'traite');

CREATE TABLE "message_contact" (
    "message_contact_id" UUID NOT NULL,
    "nom" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255),
    "telephone" VARCHAR(30),
    "profil" VARCHAR(30) NOT NULL,
    "sujet" VARCHAR(30) NOT NULL,
    "message" TEXT NOT NULL,
    "utilisateur_id" UUID,
    "statut" "StatutMessageContact" NOT NULL DEFAULT 'nouveau',
    "note_interne" TEXT,
    "traite_par_id" UUID,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_traitement" TIMESTAMP(3),

    CONSTRAINT "message_contact_pkey" PRIMARY KEY ("message_contact_id")
);

CREATE INDEX "message_contact_statut_date_creation_idx" ON "message_contact"("statut", "date_creation");
