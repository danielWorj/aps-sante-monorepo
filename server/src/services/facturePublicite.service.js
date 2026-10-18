// src/services/facturePublicite.service.js
// Devis et facture d'une réservation d'espace publicitaire — même mécanique
// que les abonnements (factureAbonnementPresence.service.js) :
//   - devis : recalculé à la demande, jamais stocké (fonction PURE) ;
//   - facture : stockée (ajout seul), numérotée SANS TROU par son compteur
//     annuel (FAC-PUB-AAAA-NNNNNN), émise dans la transaction de paiement ;
//   - frais d'agrégateur payés par l'annonceur EN PLUS du prix (ligne figée
//     sur la transaction).

import { arrondir, decimalesPourMontant } from "../utils/montants.js";
import { ligneFraisAbonnement } from "./fraisAbonnement.service.js";
import { ajouterJours, formaterMontant, jourUtc, versJourIso } from "./publicite.service.js";

/**
 * @param {{ publicite: object, emplacement: { libelle: string }, frais_agregateur?: object|null }} p
 *   frais_agregateur : { agregateur, ligne, montant } (fraisEnvoiAbonnement), null = aucun.
 */
export function construireDevisPublicite({ publicite, emplacement, frais_agregateur = null }) {
  const devise = publicite.devise;
  const decimales = decimalesPourMontant({ devise });
  const sousTotal = arrondir(Number(publicite.montant), decimales);
  const jours = Math.round((jourUtc(publicite.date_fin) - jourUtc(publicite.date_debut)) / 86_400_000);

  const lignes = [
    {
      code: "publicite",
      libelle: `Publicité « ${publicite.titre} » - ${emplacement.libelle}, position ${publicite.rang} - ${jours} jour(s)`,
      base: sousTotal,
      montant: sousTotal,
    },
  ];
  const frais = frais_agregateur?.montant > 0 ? frais_agregateur : null;
  if (frais) lignes.push(ligneFraisAbonnement(frais, sousTotal));

  return {
    type: "devis",
    numero: null,
    devise,
    statut_paiement: "en_attente",
    entete: {
      annonceur: publicite.annonceur_nom,
      entreprise: publicite.annonceur_entreprise,
      telephone: publicite.annonceur_telephone,
      email: publicite.annonceur_email,
      publicite_id: publicite.publicite_id,
      titre: publicite.titre,
      emplacement: emplacement.libelle,
      position: publicite.rang,
      date_debut: versJourIso(publicite.date_debut),
      date_fin_incluse: versJourIso(ajouterJours(jourUtc(publicite.date_fin), -1)),
      duree_jours: jours,
    },
    lignes,
    // Montant initial (prix du forfait), frais d'agrégateur, montant final.
    montant_brut: sousTotal,
    sous_total: sousTotal,
    frais_agregateur: frais ? frais.montant : 0,
    total: arrondir(sousTotal + (frais?.montant ?? 0), decimales),
  };
}

/** Détail de la page Stripe Checkout, à partir du devis. */
export function detailCheckoutPublicite(devis) {
  const f = (m) => formaterMontant(m, devis.devise);
  const [principale, frais] = [devis.lignes.find((l) => l.code === "publicite"), devis.lignes.find((l) => l.code === "frais_agregateur")];
  const lignes = [{ libelle: principale.libelle, description: `Du ${devis.entete.date_debut} au ${devis.entete.date_fin_incluse}`, montant: principale.montant }];
  if (frais) lignes.push({ libelle: frais.libelle, description: null, montant: frais.montant });
  const recapitulatif = [
    `Montant initial : ${f(devis.sous_total)}`,
    frais ? `Frais agrégateur : ${f(frais.montant)}` : null,
    `Montant final à payer : ${f(devis.total)}`,
  ].filter(Boolean).join(" · ");
  return { lignes, recapitulatif };
}

/** Frais réellement payés : écart entre le montant débité et le prix, avec la ligne figée. */
async function fraisDeLaTransaction(tx, publicite, transaction) {
  if (!transaction?.frais_envoi_id) return null;
  const decimales = decimalesPourMontant({ devise: publicite.devise });
  const montant = Number((Number(transaction.montant) - Number(publicite.montant)).toFixed(decimales));
  if (!(montant > 0)) return null;
  const ligne = await tx.fraisAgregateur.findUnique({ where: { frais_agregateur_id: transaction.frais_envoi_id } });
  return { agregateur: transaction.fournisseur, ligne, montant };
}

/** Numéro suivant, sans trou (compteur annuel verrouillé par la ligne). */
export async function numeroFacturePublicite(tx, annee) {
  const [{ dernier }] = await tx.$queryRaw`
    INSERT INTO compteur_facture_publicite (annee, dernier) VALUES (${annee}, 1)
    ON CONFLICT (annee) DO UPDATE SET dernier = compteur_facture_publicite.dernier + 1
    RETURNING dernier`;
  return `FAC-PUB-${annee}-${String(dernier).padStart(6, "0")}`;
}

/** Émet la facture d'une publicité qui vient d'être payée, DANS la transaction de paiement. */
export async function emettreFacturePublicite(tx, publicite_id, transaction) {
  const pub = await tx.publicite.findUnique({
    where: { publicite_id },
    include: { emplacement_publicitaire: { select: { libelle: true } } },
  });
  const devis = construireDevisPublicite({
    publicite: pub,
    emplacement: pub.emplacement_publicitaire,
    frais_agregateur: await fraisDeLaTransaction(tx, pub, transaction),
  });
  const maintenant = new Date();
  const numero = await numeroFacturePublicite(tx, maintenant.getUTCFullYear());
  const snapshot = {
    ...devis,
    type: "facture",
    numero,
    statut_paiement: "reussie",
    date: maintenant.toISOString(),
    paiement: {
      transaction_id: transaction.transaction_id,
      fournisseur: transaction.fournisseur,
      reference: transaction.campay_reference ?? transaction.stripe_payment_intent_id ?? null,
    },
  };
  return tx.facturePublicite.create({
    data: {
      numero,
      publicite_id,
      transaction_id: transaction.transaction_id,
      devise: pub.devise,
      total: pub.montant, // revenu APS ; le montant débité (frais compris) est snapshot.total
      snapshot,
    },
  });
}
