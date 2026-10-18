// src/services/factureAbonnementPresence.service.js
// Devis et facture d'un abonnement de présence — même mécanique que
// factureAbonnement.service.js (assurances) :
//   - devis : recalculé à la demande, jamais stocké (fonction PURE) ;
//   - facture : stockée (ajout seul), numérotée SANS TROU avec le compteur
//     annuel partagé, émise dans la transaction d'activation.

import { arrondir, decimalesPourMontant } from "../utils/montants.js";
import { ligneFraisAbonnement, fraisDeLaTransaction, libelleAbonnement } from "./fraisAbonnement.service.js";
import { calculerMontantsAbonnement } from "./tarifAbonnementPresence.service.js";
import { numeroSuivant } from "./factureAbonnement.service.js";
import { acteur, acteurIdDe } from "../lib/acteursPresence.js";

const LIBELLE_TYPE = { pharmacie: "Pharmacie", structure: "Centre de santé", medecin: "Médecin" };

/**
 * @param {{ abonnement: object, niveau: object, fiche: { nom: string }, frais_agregateur?: object|null }} p
 *   frais_agregateur : { agregateur, ligne, montant } (fraisAbonnement.service.js),
 *   payés par le souscripteur en plus de l'abonnement ; null = virement / aucun.
 */
export function construireDevisAbonnementPresence({ abonnement, niveau, fiche, frais_agregateur = null }) {
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

  // Garde-fou : le devis n'affiche jamais un total différent du montant figé (= montant débité).
  if (Math.abs(m.total - sousTotal) > 0.001) {
    throw new Error(
      `Incohérence devis abonnement ${abonnement.abonnement_id} : total figé ${sousTotal} ≠ brut − remise − crédit (${m.total}).`
    );
  }

  const lignes = [
    {
      code: "abonnement",
      libelle: `${libelleAbonnement("Abonnement de présence", niveau)} - ${abonnement.duree_mois} mois`,
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
      souscripteur: fiche.nom,
      type_acteur: abonnement.type_acteur,
      type_acteur_libelle: LIBELLE_TYPE[abonnement.type_acteur],
      acteur_id: acteurIdDe(abonnement),
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

/** Émet la facture d'un abonnement qui vient d'être activé, DANS la transaction d'activation. */
export async function emettreFactureAbonnementPresence(tx, abonnement_id, transaction) {
  const abo = await tx.abonnementPresence.findUnique({ where: { abonnement_id }, include: { niveau: true } });
  const fiche = await acteur(abo.type_acteur).charger(tx, acteurIdDe(abo));
  const devis = construireDevisAbonnementPresence({ abonnement: abo, niveau: abo.niveau, fiche, frais_agregateur: await fraisDeLaTransaction(tx, abo, transaction) });
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
  return tx.factureAbonnementPresence.create({
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
