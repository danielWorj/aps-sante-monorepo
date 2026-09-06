-- CreateTable
CREATE TABLE "mobile_apk" (
    "id" UUID NOT NULL,
    "libelle" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "file_url" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "date_upload" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_apk_pkey" PRIMARY KEY ("id")
);
