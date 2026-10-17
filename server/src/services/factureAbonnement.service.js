// src/services/factureAbonnement.service.js
// Devis et facture d'un abonnement assurance (guide v3, §1.5.9).
//
//   - Devis : JSON recalculé à la demande, jamais stocké (construireDevisAbonnement,
//     fonction PURE, sans accès base).
//   - Facture : document comptable d'APS (EF-PAY-13), STOCKÉE
//     (facture_abonnement_assurance, ajout seul par déclencheur SQL),
//     numérotée SANS TROU via un compteur annuel verrouillé, émise dans la
//     transaction SQL d'activation : une activation annulée ne consomme
//     aucun numéro.

import { arrondir, decimalesPourMontant } from "../utils/montants.js";
import { calculerMontantsAbonnement } from "./tarifAbonnementAssurance.service.js";

/**
 * @param {{ abonnement: object, niveau: object, service: object, frais_operateur?: number|null }} p
 *   frais_operateur : frais Mobile Money estimés, payés EN SUS à l'opérateur
 *   (information, hors total APS — voir guide §1.5.3).
 */
export function construireDevisAbonnement({ abonnement, niveau, service, frais_operateur = null }) {
  const devise = abonnement.devise;
  const decimales = decimalesPourMontant({ devise });
  const m = calculerMontantsAbonnement({
    prix_mensuel: abonnement.prix_mensuel_applique,
    duree_mois: abonnement.duree_mois,
    remise_pourcent: abonnement.remise_pourcent,
    credit_prorata: abonnement.credit_prorata,
    devise,
  });
  const total = arrondir(Number(abonnement.montant_total), decimales);

  // Garde-fou : le devis ne doit jamais afficher un total différent du
  // montant figé sur l'abonnement (= montant débité).
  if (Math.abs(m.total - total) > 0.001) {
    throw new Error(
      `Incohérence devis abonnement ${abonnement.abonnement_id} : total figé ${total} ≠ brut − remise − crédit (${m.total}).`
    );
  }

  const lignes = [
    {
      code: "abonnement",
      libelle: `Abonnement ${niveau.libelle} - ${abonnement.duree_mois} mois`,
      base: Number(abonnement.prix_mensuel_applique),
      montant: m.brut,
    },
  ];
  if (m.remise > 0) {
    lignes.push({ code: "remise", libelle: `Remise durée (${Number(abonnement.remise_pourcent)} %)`, montant: -m.remise });
  }
  if (m.credit_prorata > 0) {
    lignes.push({ code: "credit_prorata", libelle: "Crédit de l'abonnement remplacé", montant: -m.credit_prorata });
  }

  return {
    type: "devis",
    numero: null,
    devise,
    statut_paiement: "en_attente",
    entete: {
      assurance: service.nom,
      service_assurance_id: service.service_assurance_id,
      abonnement_id: abonnement.abonnement_id,
      niveau: { code: niveau.code, libelle: niveau.libelle },
      duree_mois: abonnement.duree_mois,
    },
    lignes,
    total,
    ...(frais_operateur != null
      ? { frais_operateur: { montant: frais_operateur, mention: "Frais de l'opérateur Mobile Money en sus" } }
      : {}),
  };
}

/** Numéro suivant, sans trou : compteur annuel verrouillé par la ligne (ON CONFLICT DO UPDATE). */
async function numeroSuivant(tx, annee) {
  const [{ dernier }] = await tx.$queryRaw`
    INSERT INTO compteur_facture_abonnement (annee, dernier) VALUES (${annee}, 1)
    ON CONFLICT (annee) DO UPDATE SET dernier = compteur_facture_abonnement.dernier + 1
    RETURNING dernier`;
  return `FAC-ABO-${annee}-${String(dernier).padStart(6, "0")}`;
}

/**
 * Émet la facture d'un abonnement qui vient d'être activé. À appeler DANS
 * la transaction d'activation (tx) : numéro et facture sont validés ou
 * annulés avec elle.
 */
export async function emettreFactureAbonnement(tx, abonnement_id, transaction) {
  const abo = await tx.abonnementAssurance.findUnique({
    where: { abonnement_id },
    include: { niveau: true, service: true },
  });
  const devis = construireDevisAbonnement({ abonnement: abo, niveau: abo.niveau, service: abo.service });
  const maintenant = new Date();
  const numero = await numeroSuivant(tx, maintenant.getUTCFullYear());
  const snapshot = {
    ...devis,
    type: "facture",
    numero,
    statut_paiement: "reussie",
    date: maintenant.toISOString(),
    periode: { debut: abo.date_debut, fin_exclusive: abo.date_fin },
    paiement: {
      transaction_id: transaction.transaction_id,
      fournisseur: transaction.fournisseur,
      reference: transaction.campay_reference ?? transaction.stripe_payment_intent_id ?? null,
    },
  };
  return tx.factureAbonnementAssurance.create({
    data: {
      numero,
      abonnement_id,
      transaction_id: transaction.transaction_id,
      devise: abo.devise,
      total: abo.montant_total,
      snapshot,
    },
  });
}
