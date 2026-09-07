-- CreateTable
CREATE TABLE "annonce" (
    "id" UUID NOT NULL,
    "libelle" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "file_url" TEXT,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jour_validite" INTEGER NOT NULL,
    "statut" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "annonce_pkey" PRIMARY KEY ("id")
);
