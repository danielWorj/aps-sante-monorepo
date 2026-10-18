// src/services/tarifAbonnementPresence.service.js
// Prix d'un abonnement de présence (pharmacie, centre de santé, médecin).
// Le prix est TOUJOURS calculé côté serveur : le client n'envoie que
// niveau_id et duree_mois. Les calculs purs (montants, prorata) sont ceux
// des abonnements assurance, partagés tels quels.

import prisma from "../lib/prisma.js";

export {
  DUREES_PROPOSEES,
  calculerMontantsAbonnement,
  calculerCreditProrata,
} from "./tarifAbonnementAssurance.service.js";

/**
 * Tarif actif du niveau dans le pays de la fiche. Lève « Aucune ligne… »
 * (reconnu par repondreSiBaremeAbsent -> 503) si l'admin n'a rien saisi.
 */
export async function resoudreTarifPresence({ niveau_id, pays_id }, client = prisma) {
  const tarif = await client.tarifAbonnementPresence.findFirst({ where: { niveau_id, pays_id, actif: true } });
  if (!tarif) {
    throw new Error("Aucune ligne de tarif d'abonnement de présence active pour ce niveau et ce pays.");
  }
  return tarif;
}

/** Remise de la durée choisie pour ce type d'acteur ; null si la durée n'est pas proposée. */
export async function resoudreRemiseDureePresence(type_acteur, duree_mois, client = prisma) {
  return client.remiseDureeAbonnementPresence.findUnique({
    where: { type_acteur_duree_mois: { type_acteur, duree_mois } },
  });
}
