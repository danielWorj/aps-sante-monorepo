-- CreateTable
CREATE TABLE "type_urgence" (
    "type_urgence_id" UUID NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "description" TEXT,

    CONSTRAINT "type_urgence_pkey" PRIMARY KEY ("type_urgence_id")
);

-- CreateTable
CREATE TABLE "urgence" (
    "urgence_id" UUID NOT NULL,
    "type_urgence_id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "libelle" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "telephone" VARCHAR(20) NOT NULL,

    CONSTRAINT "urgence_pkey" PRIMARY KEY ("urgence_id")
);

-- CreateIndex
CREATE INDEX "urgence_type_urgence_id_idx" ON "urgence"("type_urgence_id");

-- CreateIndex
CREATE INDEX "urgence_pays_id_idx" ON "urgence"("pays_id");

-- AddForeignKey
ALTER TABLE "urgence" ADD CONSTRAINT "urgence_type_urgence_id_fkey" FOREIGN KEY ("type_urgence_id") REFERENCES "type_urgence"("type_urgence_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "urgence" ADD CONSTRAINT "urgence_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "pays"("pays_id") ON DELETE RESTRICT ON UPDATE CASCADE;
