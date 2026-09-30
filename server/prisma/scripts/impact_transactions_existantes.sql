-- Politique de fonds v2 — mesure d'impact sur les transactions existantes (§8)
-- À EXÉCUTER AVANT la migration : elle supprime ligne_taxe_id / ligne_frais_agregateur_id.
-- Cette requête n'utilise que des colonnes qui survivent (montant, montant_honoraires).
-- Lecture seule.

-- 1) Vue d'ensemble par fournisseur et statut de transaction (RDV uniquement)
SELECT t.fournisseur,
       t.statut,
       count(*)                                        AS nb_transactions,
       sum(t.montant)                                  AS total_paye_ancien,
       sum(t.montant_honoraires)                       AS total_honoraires,
       sum(t.montant - t.montant_honoraires)           AS surcout_ancien_commission_taxe_frais,
       round(avg(t.montant / NULLIF(t.montant_honoraires, 0)), 4) AS ratio_moyen_montant_sur_honoraires
  FROM transaction_paiement t
 WHERE t.montant_honoraires IS NOT NULL
 GROUP BY t.fournisseur, t.statut
 ORDER BY t.fournisseur, t.statut;

-- 2) Exposition immédiate : fonds encore en séquestre (seront traités par la nouvelle règle)
SELECT t.fournisseur,
       count(*)                                        AS nb_escrows_sequestre,
       sum(e.montant)                                  AS fonds_sequestres,
       sum(t.montant_honoraires)                       AS honoraires_correspondants,
       sum(e.montant - t.montant_honoraires)           AS ecart_a_arbitrer
  FROM compte_escrow e
  JOIN transaction_paiement t ON t.transaction_id = e.transaction_id
 WHERE e.statut = 'sequestre'
 GROUP BY t.fournisseur;

-- 3) Anomalies : ratio hors norme (données à vérifier avant bascule)
SELECT t.transaction_id, t.montant, t.montant_honoraires,
       round(t.montant / NULLIF(t.montant_honoraires, 0), 4) AS ratio
  FROM transaction_paiement t
 WHERE t.montant_honoraires IS NOT NULL
   AND (t.montant_honoraires = 0 OR t.montant < t.montant_honoraires)
 LIMIT 100;

-- 4) Simulation du montant remboursable v2 sur les escrows en séquestre
--    Paramètres psql : \set taux_remb_stripe 0.015  \set taux_remb_campay 0.015
--    (valeurs À SAISIR par vous : rien n'est codé en dur dans l'application)
SELECT t.fournisseur,
       count(*) AS nb,
       sum(t.montant_honoraires) AS honoraires,
       sum(round(t.montant_honoraires *
           CASE t.fournisseur WHEN 'campay' THEN :taux_remb_campay ELSE :taux_remb_stripe END, 2)) AS frais_remboursement_estimes,
       sum(t.montant) - sum(t.montant_honoraires) AS non_rembourse_vs_paye
  FROM compte_escrow e
  JOIN transaction_paiement t ON t.transaction_id = e.transaction_id
 WHERE e.statut = 'sequestre'
 GROUP BY t.fournisseur;