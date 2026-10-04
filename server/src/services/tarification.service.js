// src/services/tarification.service.js
// Politique de fonds v2 — Décomposition du montant capturé.
//
// Principe directeur (voir schema.prisma, LigneTarifaire et
// FraisAgregateur) : aucun montant dérivé (commission, frais) n'est
// jamais stocké en base. Tout se recalcule à la demande à partir de
// faits constatés : montant_honoraires (figé à la réservation) et les
// lignes référencées par la transaction (commissions APS, frais d'envoi
// de l'agrégateur). Changer un taux aujourd'hui ne modifie donc jamais
// une transaction passée.
//
// Vocabulaire (identique dans tout le code) :
//   H  = honoraires de la consultation ;
//   F  = frais de l'agrégateur, calculés sur H ;
//   CM = commission MÉDECIN : prélevée sur le médecin à la libération
//        (valeur d'enum `commission`, ligne figée ligne_commission_id) ;
//   CP = commission PATIENT : ajoutée au total payé par le patient
//        (valeur d'enum `commission_patient`, ligne figée
//        ligne_commission_patient_id).
//
// Le patient paie : total = H + frais d'envoi + CP.
// CM n'est jamais à sa charge : elle est retenue sur les honoraires du
// médecin à la libération (voir liberationEscrow).
//
// Transaction antérieure à CP (ligne_commission_patient_id = NULL) :
// CP = 0, le total déjà encaissé ne change jamais (aucun backfill).

import { arrondir } from "../utils/montants.js";
import { calculerFrais } from "./fraisAgregateur.service.js";

/**
 * CM — commission médecin : H × taux, plafonnée à H, arrondie selon la
 * devise. Fonction PURE, source unique de la formule (decomposerMontant,
 * decider, repartirLiberation et baseCalculAmende l'utilisent toutes).
 * Suppose une ligne valide : chaque appelant garde sa propre validation
 * (et son propre message) en amont.
 * @param {number|string} honoraires
 * @param {{ taux: number|string }} ligneCommission ligne `commission`
 * @param {0|2} [decimales=2]
 * @returns {number}
 */
export function calculerCommissionMedecin(honoraires, ligneCommission, decimales = 2) {
  const h = arrondir(honoraires, decimales);
  return Math.min(h, arrondir(Number(honoraires) * Number(ligneCommission.taux), decimales));
}

/**
 * CP — commission patient : H × taux, arrondie selon la devise.
 * Fonction PURE. Une ligne absente (null / undefined) vaut CP = 0 :
 * c'est le cas des transactions antérieures à CP (ligne figée NULL).
 * Pour un NOUVEAU paiement, l'absence de ligne active est interdite en
 * amont par obtenirLignesTarifairesActives (barème absent = erreur) ; un
 * taux de 0 est en revanche un barème valide.
 * Pas de plafonnement à H : un taux de CP ne dépasse pas 100 % (contrôlé
 * à la saisie), et plafonner ferait diverger le total débité de la
 * facture affichée.
 * @param {number|string} honoraires
 * @param {{ taux: number|string }|null|undefined} ligneCommissionPatient ligne `commission_patient`
 * @param {0|2} [decimales=2]
 * @returns {number}
 */
export function calculerCommissionPatient(honoraires, ligneCommissionPatient, decimales = 2) {
  if (!ligneCommissionPatient) return 0;
  const taux = Number(ligneCommissionPatient.taux);
  if (ligneCommissionPatient.taux == null || !Number.isFinite(taux) || taux < 0) {
    throw new Error(
      `Taux de commission patient invalide (${ligneCommissionPatient.taux}) : calcul impossible.`
    );
  }
  return arrondir(Number(honoraires) * taux, decimales);
}

/**
 * Fonction pure : aucun accès DB, aucun effet de bord.
 *
 * @param {number|string} honoraires
 * @param {{
 *   commission: {taux:number|string},
 *   commission_patient?: {taux:number|string}|null,
 *   frais_envoi: {taux?:number|string, montant_fixe?:number|string}
 * }} lignes
 *   `commission` = ligne CM (obligatoire). `commission_patient` = ligne CP
 *   figée ; absente/null => CP = 0 (transaction antérieure à CP).
 * @param {0|2} [decimales=2]  0 pour CamPay / devises zéro-décimale
 * @returns {{
 *   honoraires: number,         // H : ce que le médecin facture
 *   fraisEnvoi: number,         // frais de l'agrégateur, à la charge du patient
 *   commissionPatient: number,  // CP : à la charge du patient, incluse dans le total
 *   total: number,              // H + fraisEnvoi + CP = montant débité au patient
 *   commissionMedecin: number,  // CM — INFORMATIVE : prélevée sur le médecin à la libération
 *   commission: number,         // ALIAS DÉPRÉCIÉ de commissionMedecin (appelants historiques)
 *   netMedecin: number,         // H − CM (avant amendes éventuelles)
 * }}
 */
export function decomposerMontant(honoraires, lignes, decimales = 2) {
  if (!lignes?.commission || lignes.commission.taux == null) {
    throw new Error("Ligne de commission manquante : décomposition impossible.");
  }
  const h = arrondir(honoraires, decimales);
  const fraisEnvoi = calculerFrais(honoraires, lignes.frais_envoi, decimales);
  const commissionPatient = calculerCommissionPatient(honoraires, lignes.commission_patient, decimales);
  const commissionMedecin = calculerCommissionMedecin(honoraires, lignes.commission, decimales);

  return {
    honoraires: h,
    fraisEnvoi,
    commissionPatient,
    // Somme de composantes DÉJÀ arrondies : le total débité est exactement
    // la somme des lignes de la facture, sans écart d'arrondi.
    total: arrondir(h + fraisEnvoi + commissionPatient, decimales),
    commissionMedecin,
    commission: commissionMedecin,
    netMedecin: arrondir(h - commissionMedecin, decimales),
  };
}

/**
 * Lit en base, pour un pays donné, les lignes tarifaires actives les plus
 * récentes de type `commission` (CM) ET `commission_patient` (CP). Lève
 * une erreur explicite si l'une manque : mieux vaut un 503 clair au
 * moment du paiement qu'un paiement accepté sans barème de commission.
 * Aucune valeur par défaut, aucun seed. Une ligne CP au taux 0 est un
 * barème valide ; seule son ABSENCE est une erreur.
 * (Les frais d'agrégateur, eux, sont lus par fraisAgregateur.service.js.)
 *
 * Les messages d'erreur commencent par « Aucune ligne » : ils doivent
 * continuer à matcher BAREME_ABSENT (paiement.controller.js).
 * @param {string} pays_id
 * @param {object} [client] client Prisma (ou tx) ; défaut : client global
 * @returns {Promise<{ commission: object, commission_patient: object }>}
 *   commission = ligne CM ; commission_patient = ligne CP
 */
export async function obtenirLignesTarifairesActives(pays_id, client) {
  const db = client ?? (await import("../lib/prisma.js")).default;
  const resultat = {};
  for (const type_frais of ["commission", "commission_patient"]) {
    const ligne = await db.ligneTarifaire.findFirst({
      where: { pays_id, type_frais, actif: true },
      orderBy: { date_debut_validite: "desc" },
    });
    if (!ligne) {
      throw new Error(
        `Aucune ligne tarifaire active de type "${type_frais}" pour le pays ${pays_id} : le paiement ne peut pas être capturé.`
      );
    }
    resultat[type_frais] = ligne;
  }
  return resultat;
}