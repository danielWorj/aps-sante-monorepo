// src/services/tarifAbonnementAssurance.service.js
// Prix d'un abonnement assurance (guide abonnements assurances v3, §1.5.3
// et §1.5.7). Le prix est TOUJOURS calculé côté serveur : le client
// n'envoie que niveau_id et duree_mois, jamais un montant.
//
// Les fonctions pures (calculerMontantsAbonnement, calculerCreditProrata)
// n'accèdent pas à la base : testables seules.

import prisma from "../lib/prisma.js";
import { arrondir, decimalesPourMontant } from "../utils/montants.js";
import { debutDuJourUtc } from "../lib/droitsAssurance.js";

export const DUREES_PROPOSEES = [1, 3, 6, 12];

/**
 * Montants d'un abonnement, dans l'ordre de la facture :
 *   brut     = prix_mensuel × durée
 *   remise   = brut × remise %            (arrondie)
 *   apres_remise = brut − remise          (jamais ré-arrondi séparément :
 *                                          le devis retombe toujours juste)
 *   total    = max(0, apres_remise − credit_prorata)
 * Arrondis à l'unité pour une devise zéro-décimale (XAF/XOF), au centime sinon.
 */
export function calculerMontantsAbonnement({ prix_mensuel, duree_mois, remise_pourcent = 0, credit_prorata = 0, devise }) {
  const decimales = decimalesPourMontant({ devise });
  const brut = arrondir(Number(prix_mensuel) * duree_mois, decimales);
  const remise = arrondir((brut * Number(remise_pourcent)) / 100, decimales);
  const apresRemise = arrondir(brut - remise, decimales);
  const credit = Math.min(arrondir(Number(credit_prorata), decimales), apresRemise);
  const total = arrondir(Math.max(0, apresRemise - credit), decimales);
  return { brut, remise, apres_remise: apresRemise, credit_prorata: credit, total };
}

/**
 * Crédit de l'abonnement remplacé lors d'une montée de niveau : part non
 * consommée du montant payé, au prorata des jours restants. Même devise
 * uniquement (sinon 0 : aucune conversion n'est faite).
 */
export function calculerCreditProrata(courant, devise, aujourdhui = debutDuJourUtc()) {
  if (!courant?.date_debut || !courant?.date_fin) return 0;
  if (String(courant.devise).toLowerCase() !== String(devise).toLowerCase()) return 0;
  const totalJours = (courant.date_fin - courant.date_debut) / 86_400_000;
  if (totalJours <= 0) return 0;
  const restants = Math.min(totalJours, Math.max(0, (courant.date_fin - aujourdhui) / 86_400_000));
  const credit = (Number(courant.montant_total) * restants) / totalJours;
  return arrondir(credit, decimalesPourMontant({ devise }));
}

/**
 * Ligne de tarif applicable à une fiche : celle de son type d'acteur
 * l'emporte sur la ligne générique (type_acteur NULL). Sélection en JS :
 * un orderBy sur une colonne nullable placerait les NULL en premier sous
 * PostgreSQL.
 * Lève « Aucune ligne… » (reconnu par repondreSiBaremeAbsent -> 503) si
 * l'admin n'a pas saisi de tarif pour ce pays.
 */
export async function resoudreTarifAbonnement({ niveau_id, service }, client = prisma) {
  const candidats = await client.tarifAbonnementAssurance.findMany({
    where: {
      niveau_id,
      pays_id: service.pays_id,
      actif: true,
      OR: [{ type_acteur: service.type_acteur }, { type_acteur: null }],
    },
  });
  const tarif =
    candidats.find((t) => t.type_acteur === service.type_acteur) ??
    candidats.find((t) => t.type_acteur === null);
  if (!tarif) {
    throw new Error("Aucune ligne de tarif d'abonnement assurance active pour ce niveau et ce pays.");
  }
  return tarif;
}

/** Remise de la durée choisie ; null si la durée n'est pas proposée. */
export async function resoudreRemiseDuree(duree_mois, client = prisma) {
  return client.remiseDureeAbonnementAssurance.findUnique({ where: { duree_mois } });
}
