-- Documents légaux (CGU, politique de confidentialité) rédigés au
-- back-office, versionnés, et preuve d'acceptation par compte.
CREATE TYPE "TypeDocumentLegal" AS ENUM ('cgu', 'confidentialite');

CREATE TYPE "StatutVersionDocumentLegal" AS ENUM ('brouillon', 'publiee', 'archivee');

CREATE TABLE "version_document_legal" (
    "version_document_legal_id" UUID NOT NULL,
    "type" "TypeDocumentLegal" NOT NULL,
    "numero" INTEGER NOT NULL,
    "titre" VARCHAR(200) NOT NULL,
    "contenu_html" TEXT NOT NULL,
    "resume_modifications" TEXT,
    "statut" "StatutVersionDocumentLegal" NOT NULL DEFAULT 'brouillon',
    "date_publication" TIMESTAMP(3),
    "date_archivage" TIMESTAMP(3),
    "cree_par_id" UUID,
    "publie_par_id" UUID,
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_modification" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "version_document_legal_pkey" PRIMARY KEY ("version_document_legal_id")
);

CREATE TABLE "acceptation_document_legal" (
    "acceptation_document_legal_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "version_document_legal_id" UUID NOT NULL,
    "contexte" VARCHAR(40) NOT NULL,
    "adresse_ip" VARCHAR(64),
    "user_agent" VARCHAR(300),
    "date_acceptation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceptation_document_legal_pkey" PRIMARY KEY ("acceptation_document_legal_id")
);

CREATE INDEX "version_document_legal_type_statut_idx" ON "version_document_legal"("type", "statut");

CREATE UNIQUE INDEX "version_document_legal_type_numero_key" ON "version_document_legal"("type", "numero");

CREATE INDEX "acceptation_document_legal_version_document_legal_id_date_a_idx" ON "acceptation_document_legal"("version_document_legal_id", "date_acceptation");

CREATE UNIQUE INDEX "acceptation_document_legal_utilisateur_id_version_document__key" ON "acceptation_document_legal"("utilisateur_id", "version_document_legal_id");

ALTER TABLE "acceptation_document_legal" ADD CONSTRAINT "acceptation_document_legal_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("utilisateur_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "acceptation_document_legal" ADD CONSTRAINT "acceptation_document_legal_version_document_legal_id_fkey" FOREIGN KEY ("version_document_legal_id") REFERENCES "version_document_legal"("version_document_legal_id") ON DELETE CASCADE ON UPDATE CASCADE;
