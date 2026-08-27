-- CreateEnum
CREATE TYPE "JourSemaine" AS ENUM ('lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche');

-- CreateEnum
CREATE TYPE "StatutCreneauAgenda" AS ENUM ('disponible', 'reserve', 'bloque');

-- CreateEnum
CREATE TYPE "OrigineCreneauAgenda" AS ENUM ('genere', 'manuel');

-- CreateTable
CREATE TABLE "horaire" (
    "horaire_id" UUID NOT NULL,
    "heure_debut" TIME NOT NULL,
    "heure_fin" TIME NOT NULL,

    CONSTRAINT "horaire_pkey" PRIMARY KEY ("horaire_id")
);

-- CreateTable
CREATE TABLE "disponibilite_medecin" (
    "disponibilite_id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "horaire_id" UUID NOT NULL,
    "jour_semaine" "JourSemaine" NOT NULL,

    CONSTRAINT "disponibilite_medecin_pkey" PRIMARY KEY ("disponibilite_id")
);

-- CreateTable
CREATE TABLE "creneau_agenda" (
    "creneau_id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "horaire_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "statut" "StatutCreneauAgenda" NOT NULL DEFAULT 'disponible',
    "origine" "OrigineCreneauAgenda" NOT NULL DEFAULT 'genere',
    "rdv_id" UUID,

    CONSTRAINT "creneau_agenda_pkey" PRIMARY KEY ("creneau_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "horaire_heure_debut_heure_fin_key" ON "horaire"("heure_debut", "heure_fin");

-- CreateIndex
CREATE INDEX "disponibilite_medecin_medecin_id_idx" ON "disponibilite_medecin"("medecin_id");

-- CreateIndex
CREATE INDEX "disponibilite_medecin_horaire_id_idx" ON "disponibilite_medecin"("horaire_id");

-- CreateIndex
CREATE UNIQUE INDEX "disponibilite_medecin_medecin_id_horaire_id_jour_semaine_key" ON "disponibilite_medecin"("medecin_id", "horaire_id", "jour_semaine");

-- CreateIndex
CREATE UNIQUE INDEX "creneau_agenda_rdv_id_key" ON "creneau_agenda"("rdv_id");

-- CreateIndex
CREATE INDEX "creneau_agenda_medecin_id_idx" ON "creneau_agenda"("medecin_id");

-- CreateIndex
CREATE INDEX "creneau_agenda_horaire_id_idx" ON "creneau_agenda"("horaire_id");

-- CreateIndex
CREATE INDEX "creneau_agenda_date_idx" ON "creneau_agenda"("date");

-- CreateIndex
CREATE UNIQUE INDEX "creneau_agenda_medecin_id_horaire_id_date_key" ON "creneau_agenda"("medecin_id", "horaire_id", "date");

-- AddForeignKey
ALTER TABLE "disponibilite_medecin" ADD CONSTRAINT "disponibilite_medecin_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disponibilite_medecin" ADD CONSTRAINT "disponibilite_medecin_horaire_id_fkey" FOREIGN KEY ("horaire_id") REFERENCES "horaire"("horaire_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creneau_agenda" ADD CONSTRAINT "creneau_agenda_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creneau_agenda" ADD CONSTRAINT "creneau_agenda_horaire_id_fkey" FOREIGN KEY ("horaire_id") REFERENCES "horaire"("horaire_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creneau_agenda" ADD CONSTRAINT "creneau_agenda_rdv_id_fkey" FOREIGN KEY ("rdv_id") REFERENCES "rendez_vous"("rdv_id") ON DELETE SET NULL ON UPDATE CASCADE;
