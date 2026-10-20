-- Moyens de paiement du médecin : numéro Mobile Money actif (un seul par
-- médecin) et compte Stripe Connect pour la réception par carte / banque.

-- 1. Mobile Money : drapeau « actif » + date de création.
ALTER TABLE "mobile_money" ADD COLUMN "actif" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mobile_money" ADD COLUMN "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Reprise : chaque médecin ayant déjà des numéros en garde un actif.
UPDATE "mobile_money" mm SET "actif" = true
WHERE mm."id" IN (SELECT DISTINCT ON ("medecin_id") "id" FROM "mobile_money" ORDER BY "medecin_id", "id");

-- Garantie en base : au plus un numéro actif par médecin.
CREATE UNIQUE INDEX "mobile_money_un_actif_par_medecin" ON "mobile_money"("medecin_id") WHERE "actif" = true;

-- 2. Compte Stripe Connect du médecin.
CREATE TABLE "compte_stripe_connect" (
    "id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "stripe_account_id" VARCHAR(255) NOT NULL,
    "details_soumis" BOOLEAN NOT NULL DEFAULT false,
    "paiements_actives" BOOLEAN NOT NULL DEFAULT false,
    "virements_actives" BOOLEAN NOT NULL DEFAULT false,
    "exigences_en_attente" INTEGER NOT NULL DEFAULT 0,
    "type_externe" VARCHAR(20),
    "marque_externe" VARCHAR(100),
    "derniers_chiffres" VARCHAR(4),
    "devise" VARCHAR(3),
    "pays" VARCHAR(2),
    "date_creation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_mise_a_jour" TIMESTAMP(3) NOT NULL,
    "date_synchro" TIMESTAMP(3),

    CONSTRAINT "compte_stripe_connect_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "compte_stripe_connect_medecin_id_key" ON "compte_stripe_connect"("medecin_id");
CREATE UNIQUE INDEX "compte_stripe_connect_stripe_account_id_key" ON "compte_stripe_connect"("stripe_account_id");

ALTER TABLE "compte_stripe_connect" ADD CONSTRAINT "compte_stripe_connect_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecin"("medecin_id") ON DELETE CASCADE ON UPDATE CASCADE;
