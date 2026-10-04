// src/services/facture.service.js
// Politique de fonds v2 — Facture récapitulative (D4).
//
// Service PUR : aucun accès base, aucun effet de bord, aucune génération de
// PDF et aucune dépendance. Il ne construit que les DONNÉES (JSON) de la
// facture : la présentation (card) et le téléchargement (impression du
// navigateur côté web, PDF généré dans l'app côté Flutter) sont 100 %
// côté client.
//
// Principe directeur du projet : la facture n'est JAMAIS stockée. Elle se
// recalcule à la demande à partir de faits (montant_honoraires) et des
// lignes de taux FIGÉES sur la transaction (frais_envoi_id,
// ligne_commission_patient_id) : changer un taux ne modifie jamais une
// facture passée.
//
// Vocabulaire (identique dans tout le code) :
//   H  = honoraires de la consultation ;
//   CP = commission PATIENT (ligne « Commission APS » de la facture) ;
//   CM = commission MÉDECIN : retenue sur le médecin à la libération, elle
//        ne figure JAMAIS sur la facture du patient (D7).
//
// La facture détaille le total réellement débité :
//   total = H + frais d'envoi de l'agrégateur + CP
// Les lignes sont calculées EXACTEMENT comme decomposerMontant
// (tarification.service.js) : somme de composantes déjà arrondies, donc
// la somme des lignes égale le total débité, sans écart d'arrondi.
//
// Deux fonctions :
//   - construireFacture       : facture d'un paiement abouti (transaction
//                               + lignes figées) ;
//   - construireApercuFacture : aperçu AVANT paiement (lignes en vigueur,
//                               agrégateur choisi), même structure.
//
// Transaction antérieure à la v2 (sans ligne de frais d'envoi figée) : son
// total inclut d'anciennes taxes et d'anciens frais qu'on ne peut pas
// décomposer sans dépasser le montant débité. Elle reçoit une facture
// MINIMALE : une seule ligne « Consultation » égale au total débité,
// aucune ligne de frais ni de commission (D4). Même repli si la
// décomposition recalculée ne somme pas au montant débité : on n'affiche
// jamais une facture qui diverge de ce que le patient a payé.

import { arrondir, decimalesPourMontant } from "../utils/montants.js";
import { calculerFrais } from "./fraisAgregateur.service.js";
import { calculerCommissionPatient } from "./tarification.service.js";

/** Codes des lignes (alignés sur lignesDetailPaiement de paiement.controller.js). */
export const CODES_LIGNES_FACTURE = Object.freeze({
  CONSULTATION: "consultation",
  FRAIS_AGREGATEUR: "frais_agregateur",
  COMMISSION_APS: "commission_aps",
});

/** `devis` = aperçu avant paiement ; `facture` = paiement abouti. */
export const TYPES_FACTURE = Object.freeze({
  FACTURE: "facture",
  DEVIS: "devis",
});

/** Pourquoi une facture est minimale (voir l'en-tête du fichier). */
export const RAISONS_FACTURE_MINIMALE = Object.freeze({
  PRE_V2: "pre_v2",
  ECART_TOTAL: "ecart_total",
});

const LIBELLE_CONSULTATION = "Montant consultation";
const LIBELLE_FRAIS_AGREGATEUR = "Frais agrégateur";
const LIBELLE_COMMISSION_APS = "Commission APS";
const LIBELLE_CONSULTATION_MINIMALE = "Consultation";

function enDate(valeur) {
  if (valeur == null) return null;
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  return Number.isNaN(d.getTime()) ? null : d;
}

function versIso(valeur) {
  const d = enDate(valeur);
  return d ? d.toISOString() : null;
}

/** Nombre strictement positif, sinon null (taux ou montant fixe absent / nul). */
function positifOuNull(valeur) {
  if (valeur == null) return null;
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Numéro de facture dérivé (jamais stocké) :
 * FAC-AAAAMMJJ-<8 premiers caractères du transaction_id, en majuscules>.
 * La date est celle du paiement, en UTC (déterministe quel que soit le
 * fuseau du serveur).
 * @param {string} transaction_id
 * @param {Date|string} date
 * @returns {string|null}
 */
export function numeroFacture(transaction_id, date) {
  const d = enDate(date);
  if (!transaction_id || !d) return null;
  const jour = d.toISOString().slice(0, 10).replaceAll("-", "");
  return `FAC-${jour}-${String(transaction_id).slice(0, 8).toUpperCase()}`;
}

/** « Dr. Nom Prénom » (même convention que le reste du paiement). */
function nomAffiche(medecin) {
  const nom = [medecin?.nom, medecin?.prenom].filter(Boolean).join(" ");
  return nom ? `Dr. ${nom}` : "Médecin";
}

function construireEntete({ rdv, medecin, specialite, pays, ville }) {
  return {
    medecin: nomAffiche(medecin),
    specialite: specialite?.nom ?? null,
    pays: pays?.nom ?? null,
    ville: ville?.nom ?? null,
    rdv_id: rdv?.rdv_id ?? null,
    date_creneau: versIso(rdv?.date_creneau),
  };
}

/**
 * Ligne de facture. `taux` est une FRACTION (0,02 = 2 %) ; `base` vaut H
 * quand un taux s'applique (null sinon) ; `montant_fixe` n'est renseigné
 * que s'il est > 0. `montant` est déjà arrondi selon la devise.
 */
function ligneFacture({ code, libelle, base = null, taux = null, montant_fixe = null, montant }) {
  return { code, libelle, base, taux, montant_fixe, montant };
}

/**
 * Lignes détaillées et total, calculés comme decomposerMontant.
 * Les lignes de frais et de commission à 0 sont OMISES (comme les lignes
 * Stripe Checkout) : la somme des lignes reste exacte. La ligne
 * « consultation » est toujours présente.
 */
function calculerLignesFacture({ honoraires, lignes, decimales }) {
  const h = arrondir(honoraires, decimales);
  const fraisEnvoi = calculerFrais(honoraires, lignes.frais_envoi, decimales);
  const commissionPatient = calculerCommissionPatient(honoraires, lignes.commission_patient, decimales);

  const detail = [
    ligneFacture({ code: CODES_LIGNES_FACTURE.CONSULTATION, libelle: LIBELLE_CONSULTATION, montant: h }),
  ];
  if (fraisEnvoi > 0) {
    const taux = positifOuNull(lignes.frais_envoi?.taux);
    detail.push(
      ligneFacture({
        code: CODES_LIGNES_FACTURE.FRAIS_AGREGATEUR,
        libelle: LIBELLE_FRAIS_AGREGATEUR,
        base: taux != null ? h : null,
        taux,
        montant_fixe: positifOuNull(lignes.frais_envoi?.montant_fixe),
        montant: fraisEnvoi,
      })
    );
  }
  if (commissionPatient > 0) {
    const taux = positifOuNull(lignes.commission_patient?.taux);
    detail.push(
      ligneFacture({
        code: CODES_LIGNES_FACTURE.COMMISSION_APS,
        libelle: LIBELLE_COMMISSION_APS,
        base: taux != null ? h : null,
        taux,
        montant: commissionPatient,
      })
    );
  }

  return { lignes: detail, total: arrondir(h + fraisEnvoi + commissionPatient, decimales) };
}

/**
 * Facture d'un paiement abouti. Fonction PURE.
 *
 * @param {object} p
 * @param {{ rdv_id: string, date_creneau: Date|string }} p.rdv
 * @param {{ nom?: string, prenom?: string }} p.medecin  identité du médecin (utilisateur)
 * @param {{ nom?: string }} [p.specialite]
 * @param {{ nom?: string }} [p.pays]   pays d'exercice du médecin
 * @param {{ nom?: string }} [p.ville]  ville d'exercice du médecin
 * @param {{
 *   transaction_id: string, montant: number|string, devise: string,
 *   statut?: string, fournisseur?: string, montant_honoraires?: number|string|null,
 *   date_creation?: Date|string
 * }} p.transaction
 * @param {{
 *   frais_envoi?: {taux?: number|string, montant_fixe?: number|string}|null,
 *   commission_patient?: {taux: number|string}|null
 * }} p.lignes  lignes FIGÉES sur la transaction ; frais_envoi absent =>
 *   transaction antérieure à la v2 ; commission_patient absente => CP = 0
 * @param {0|2} [p.decimales]  défaut : selon fournisseur / devise
 * @param {Date|string} [p.date_paiement]  défaut : date_creation de la transaction
 * @returns {{
 *   type: "facture", numero: string|null, date: string|null, devise: string,
 *   agregateur: string|null, statut_paiement: string|null,
 *   entete: { medecin: string, specialite: string|null, pays: string|null,
 *             ville: string|null, rdv_id: string|null, date_creneau: string|null },
 *   lignes: Array<{ code: string, libelle: string, base: number|null,
 *                   taux: number|null, montant_fixe: number|null, montant: number }>,
 *   total: number, minimale: boolean, raison_minimale: string|null
 * }}
 */
export function construireFacture({
  rdv, medecin, specialite, pays, ville, transaction, lignes, decimales, date_paiement,
}) {
  if (!transaction) {
    throw new Error("Transaction manquante : facture impossible (avant paiement, voir construireApercuFacture).");
  }
  const d = decimales ?? decimalesPourMontant({ fournisseur: transaction.fournisseur, devise: transaction.devise });
  const date = enDate(date_paiement) ?? enDate(transaction.date_creation);
  const totalDebite = arrondir(transaction.montant, d);

  const commun = {
    type: TYPES_FACTURE.FACTURE,
    numero: numeroFacture(transaction.transaction_id, date),
    date: versIso(date),
    devise: transaction.devise,
    agregateur: transaction.fournisseur ?? null,
    statut_paiement: transaction.statut ?? null,
    entete: construireEntete({ rdv, medecin, specialite, pays, ville }),
  };

  let raison = null;
  if (transaction.montant_honoraires == null || !lignes?.frais_envoi) {
    raison = RAISONS_FACTURE_MINIMALE.PRE_V2;
  } else {
    const calcul = calculerLignesFacture({
      honoraires: transaction.montant_honoraires,
      lignes,
      decimales: d,
    });
    if (calcul.total === totalDebite) {
      return { ...commun, lignes: calcul.lignes, total: calcul.total, minimale: false, raison_minimale: null };
    }
    raison = RAISONS_FACTURE_MINIMALE.ECART_TOTAL;
  }

  return {
    ...commun,
    lignes: [
      ligneFacture({ code: CODES_LIGNES_FACTURE.CONSULTATION, libelle: LIBELLE_CONSULTATION_MINIMALE, montant: totalDebite }),
    ],
    total: totalDebite,
    minimale: true,
    raison_minimale: raison,
  };
}

/**
 * Vue MÉDECIN d'une facture (D7). Fonction PURE.
 *
 * Le médecin concerné ne doit jamais pouvoir déduire CP : ni la ligne
 * « Commission APS », ni les frais d'agrégateur, ni le total payé (H + frais
 * + CP) ne lui sont montrés. Il ne voit que la consultation : une seule ligne
 * égale aux honoraires H, et un total égal à H. Pour une facture minimale
 * (transaction antérieure à la v2), le total débité contient d'anciennes
 * taxes : on repart des honoraires enregistrés ; s'ils sont absents, la vue
 * n'existe pas (null) plutôt que de révéler le total débité.
 *
 * @param {object} facture   résultat de construireFacture
 * @param {object} p
 * @param {number|string|null} p.honoraires  transaction.montant_honoraires
 * @param {0|2} [p.decimales=2]
 * @returns {object|null}
 */
export function projeterFacturePourMedecin(facture, { honoraires, decimales = 2 } = {}) {
  if (!facture || honoraires == null) return null;
  const h = arrondir(honoraires, decimales);
  return {
    type: facture.type,
    numero: facture.numero,
    date: facture.date,
    devise: facture.devise,
    agregateur: null,
    statut_paiement: facture.statut_paiement,
    entete: facture.entete,
    lignes: [
      ligneFacture({ code: CODES_LIGNES_FACTURE.CONSULTATION, libelle: LIBELLE_CONSULTATION, montant: h }),
    ],
    total: h,
    minimale: false,
    raison_minimale: null,
  };
}

/**
 * Aperçu de la facture AVANT paiement, pour l'agrégateur choisi : mêmes
 * lignes et même total que la facture qui sera émise (lignes en vigueur,
 * pas de numéro ni de transaction). Fonction PURE.
 *
 * @param {object} p
 * @param {{ rdv_id: string, date_creneau: Date|string }} p.rdv
 * @param {{ nom?: string, prenom?: string }} p.medecin
 * @param {{ nom?: string }} [p.specialite]
 * @param {{ nom?: string }} [p.pays]
 * @param {{ nom?: string }} [p.ville]
 * @param {"stripe"|"campay"} p.agregateur
 * @param {string} p.devise
 * @param {number|string} p.honoraires
 * @param {{ frais_envoi: object, commission_patient?: object|null }} p.lignes  lignes en vigueur
 * @param {0|2} [p.decimales]  défaut : selon agrégateur / devise
 * @param {Date|string} [p.date]  date d'émission de l'aperçu
 * @returns {object} même forme que construireFacture (type « devis », numero null)
 */
export function construireApercuFacture({
  rdv, medecin, specialite, pays, ville, agregateur, devise, honoraires, lignes, decimales, date,
}) {
  const d = decimales ?? decimalesPourMontant({ fournisseur: agregateur, devise });
  const calcul = calculerLignesFacture({ honoraires, lignes, decimales: d });
  return {
    type: TYPES_FACTURE.DEVIS,
    numero: null,
    date: versIso(date),
    devise,
    agregateur: agregateur ?? null,
    statut_paiement: null,
    entete: construireEntete({ rdv, medecin, specialite, pays, ville }),
    lignes: calcul.lignes,
    total: calcul.total,
    minimale: false,
    raison_minimale: null,
  };
}