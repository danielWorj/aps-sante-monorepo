-- AlterTable
ALTER TABLE "utilisateur" ADD COLUMN     "mot_de_passe_expire_le" TIMESTAMP(3),
ADD COLUMN     "mot_de_passe_temporaire" BOOLEAN NOT NULL DEFAULT false;
