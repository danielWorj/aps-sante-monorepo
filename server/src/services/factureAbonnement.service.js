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
import { ligneFraisAbonnement, fraisDeLaTransaction, libelleAbonnement } from "./fraisAbonnement.service.js";
import { calculerMontantsAbonnement } from "./tarifAbonnementAssurance.service.js";

/**
 * @param {{ abonnement: object, niveau: object, service: object, frais_agregateur?: object|null }} p
 *   frais_agregateur : { agregateur, ligne, montant } (fraisAbonnement.service.js),
 *   payés par le souscripteur en plus de l'abonnement, comme pour un RDV ;
 *   null = virement / aucun frais.
 */
export function construireDevisAbonnement({ abonnement, niveau, service, frais_agregateur = null }) {
  const devise = abonnement.devise;
  const decimales = decimalesPourMontant({ devise });
  const m = calculerMontantsAbonnement({
    prix_mensuel: abonnement.prix_mensuel_applique,
    duree_mois: abonnement.duree_mois,
    remise_pourcent: abonnement.remise_pourcent,
    credit_prorata: abonnement.credit_prorata,
    devise,
  });
  const sousTotal = arrondir(Number(abonnement.montant_total), decimales);

  // Garde-fou : le devis ne doit jamais afficher un total différent du
  // montant figé sur l'abonnement (= montant débité).
  if (Math.abs(m.total - sousTotal) > 0.001) {
    throw new Error(
      `Incohérence devis abonnement ${abonnement.abonnement_id} : total figé ${sousTotal} ≠ brut − remise − crédit (${m.total}).`
    );
  }

  const lignes = [
    {
      code: "abonnement",
      libelle: `${libelleAbonnement("Abonnement", niveau)} - ${abonnement.duree_mois} mois`,
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
  const frais = frais_agregateur?.montant > 0 ? frais_agregateur : null;
  if (frais) lignes.push(ligneFraisAbonnement(frais, sousTotal));

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
    // Prix sans réduction, après réduction (= montant de l'abonnement), puis total débité.
    montant_brut: m.brut,
    sous_total: sousTotal,
    frais_agregateur: frais ? frais.montant : 0,
    total: arrondir(sousTotal + (frais?.montant ?? 0), decimales),
  };
}

/**
 * Numéro suivant, sans trou : compteur annuel verrouillé par la ligne (ON CONFLICT DO UPDATE).
 * Partagé avec les abonnements de présence (pharmacies, centres, médecins) :
 * même nature de facture, donc même séquence.
 */
export async function numeroSuivant(tx, annee) {
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
  const devis = construireDevisAbonnement({ abonnement: abo, niveau: abo.niveau, service: abo.service, frais_agregateur: await fraisDeLaTransaction(tx, abo, transaction) });
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
      // Revenu APS (hors frais d'agrégateur, reversés à Stripe / CamPay) :
      // le montant débité, frais compris, est snapshot.total.
      total: abo.montant_total,
      snapshot,
    },
  });
}
