-- Commission patient (CP) — mesure d'impact AVANT déploiement.
-- Lecture seule : aucune écriture. À exécuter avant ET après les migrations
-- 20261004100000_commission_patient_enums / 20261004100100_commission_patient
-- (les requêtes 1, 3, 4 et 5 ne dépendent d'aucun objet ajouté ; les requêtes 2,
-- 6 et 7 ne sont valables qu'APRÈS les migrations : voir leurs en-têtes).
--
-- Rappel : sans ligne 'commission_patient' ACTIVE pour le pays d'exercice du
-- médecin, tout nouveau paiement pour ce médecin est refusé (503). Les lignes
-- CP doivent donc être saisies par un admin AVANT la mise en production.

-- 1) Pays où des médecins exercent mais où aucune commission CM active n'existe
--    (état actuel : ces pays sont déjà bloqués) — référence pour la requête 2.
SELECT p.pays_id, p.nom, count(m.medecin_id) AS nb_medecins
  FROM pays p
  JOIN medecin m ON m.pays_exercice_id = p.pays_id
 WHERE NOT EXISTS (
         SELECT 1 FROM ligne_tarifaire l
          WHERE l.pays_id = p.pays_id AND l.type_frais = 'commission' AND l.actif)
 GROUP BY p.pays_id, p.nom
 ORDER BY nb_medecins DESC;

-- 2) Pays où des médecins exercent et où la commission CM est active : ce sont
--    les pays dont le paiement SERA BLOQUÉ tant qu'aucune ligne
--    'commission_patient' active n'est saisie (colonne cp_a_saisir = true).
--    Valable APRÈS la migration 20261004100000 (valeur d'enum requise).
SELECT p.pays_id, p.nom,
       count(DISTINCT m.medecin_id) AS nb_medecins,
       l.taux AS taux_commission_medecin_actif,
       NOT EXISTS (
         SELECT 1 FROM ligne_tarifaire c
          WHERE c.pays_id = p.pays_id AND c.type_frais = 'commission_patient' AND c.actif
       ) AS cp_a_saisir
  FROM pays p
  JOIN medecin m ON m.pays_exercice_id = p.pays_id
  JOIN ligne_tarifaire l ON l.pays_id = p.pays_id AND l.type_frais = 'commission' AND l.actif
 GROUP BY p.pays_id, p.nom, l.taux
 ORDER BY nb_medecins DESC;

-- 3) Transactions de RDV existantes par fournisseur et statut : elles n'auront
--    PAS de ligne CP (CP = 0), leur total et leurs remboursements ne changent pas.
SELECT t.fournisseur,
       t.statut,
       count(*)                   AS nb_transactions,
       sum(t.montant)             AS total_paye,
       sum(t.montant_honoraires)  AS total_honoraires
  FROM transaction_paiement t
 WHERE t.montant_honoraires IS NOT NULL
 GROUP BY t.fournisseur, t.statut
 ORDER BY t.fournisseur, t.statut;

-- 4) Paiements EN ATTENTE au moment du déploiement : leur total a été calculé
--    sans CP. Un PaymentIntent Stripe ouvert est annulé et recréé au prochain
--    essai (montant différent) ; une collecte CamPay déjà envoyée reste valable
--    avec l'ancien montant. Liste à surveiller le jour J.
SELECT t.transaction_id, t.fournisseur, t.rdv_id_cible, t.montant, t.date_creation
  FROM transaction_paiement t
 WHERE t.statut = 'en_attente' AND t.montant_honoraires IS NOT NULL
 ORDER BY t.date_creation;

-- 5) Fonds en séquestre : traités plus tard avec CP = 0 (transactions sans ligne
--    CP) — aucune commission patient n'est créée rétroactivement.
SELECT t.fournisseur,
       count(*)                  AS nb_escrows_sequestre,
       sum(e.montant)            AS fonds_sequestres,
       sum(t.montant_honoraires) AS honoraires_correspondants
  FROM compte_escrow e
  JOIN transaction_paiement t ON t.transaction_id = e.transaction_id
 WHERE e.statut = 'sequestre'
 GROUP BY t.fournisseur;

-- 6) Contrôle POST-migration : toutes les commissions APS existantes doivent être
--    d'origine 'medecin', et aucune transaction ne doit déjà porter une ligne CP.
SELECT origine, count(*) AS nb, sum(montant) AS total
  FROM commission_aps_versee
 GROUP BY origine;

SELECT count(*) AS nb_transactions_avec_cp
  FROM transaction_paiement
 WHERE ligne_commission_patient_id IS NOT NULL;

-- 7) RDV déjà annulés (annule_par restera NULL, traité « patient » par le code).
--    Valable APRÈS la migration 20261004100100.
SELECT count(*) AS nb_rdv_annules_sans_initiateur
  FROM rendez_vous
 WHERE statut = 'annule' AND annule_par IS NULL;