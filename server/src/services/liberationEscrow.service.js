// src/services/liberationEscrow.service.js
// Phase 2 — Libération conditionnelle (voir politique de gestion des
// fonds §1-2) : bascule CompteEscrow.statut "sequestre" -> "libere",
// RendezVous.statut -> "honore", et crédite le portefeuille du
// médecin — le tout dans une seule transaction Prisma, appelée
// UNIQUEMENT par les deux déclencheurs légitimes de la politique :
//   - le scan du QR code par le médecin (RDV physique) ;
//   - la clôture de la session de téléconsultation (RDV visio).
// Ni l'un ni l'autre appelant ne repasse par PATCH .../statut : voir
// rendezVous.controller.js, TRANSITIONS_AUTORISEES, où la transition
// medecin "en_attente_presence" -> "honore" a été retirée du chemin
// générique pour garantir qu'un passage à "honoré" déclenche TOUJOURS
// cette fonction (et donc la libération des fonds).

import prisma from "../lib/prisma.js";
import { decomposerMontant } from "./tarification.service.js";
import { creerMouvement } from "./portefeuille.service.js";

// Correctif : creerMouvement (portefeuille.service.js, Phase 1) accepte
// bien un client transactionnel en second paramètre (`client = prisma`)
// depuis son tout premier ajout en Phase 2 — voir portefeuille.service.js.
// Une version antérieure de ce fichier affirmait le contraire et
// dupliquait donc ici, sur une prémisse fausse, le motif idempotent de
// creerMouvement (catch de la violation P2002 sur reference_idempotence).
// On réutilise maintenant creerMouvement(données, tx) directement, comme
// le fait déjà annulation.service.js (Phase 3) et defaillancePro.service.js
// (Phase 4) — un seul endroit qui sait comment écrire un mouvement.

// Arrondi à 2 décimales (même motif que tarification.service.js,
// portefeuille.service.js, annulation.service.js...) — évite les écarts
// de type 14.999999999999998 lors de la soustraction commission/taxe.
function arrondir(valeur) {
  return Math.round(valeur * 100) / 100;
}

/**
 * Libère l'escrow d'un rendez-vous et crédite le portefeuille du
 * médecin des honoraires NETS de la commission APS et de la taxe
 * (politique §2 : "crédité... commission APS et taxes déjà
 * déduites") — jamais des frais d'agrégateur, qui restent
 * exclusivement à la charge du patient (§4) et ne concernent donc pas
 * ce crédit. Rien n'est stocké : commission et taxe sont recalculées
 * à la volée via decomposerMontant (Phase 0), à partir des lignes
 * tarifaires figées sur la transaction au moment de la capture —
 * jamais les lignes actives à l'instant T — pour rester correct même
 * si un taux a changé depuis.
 *
 * ⚠️ Correctif : une version antérieure créditait ici le montant BRUT
 * des honoraires (decomposerMontant(...).honoraires, qui n'est pas net
 * de commission/taxe) — un surpaiement systématique au médecin et une
 * perte de la commission/taxe pour APS sur toute libération d'escrow.
 * Voir git blame pour l'historique.
 *
 * Idempotent à deux niveaux, pour supporter un double appel (ex. le
 * patient ET le médecin ferment la session visio à quelques
 * millisecondes d'écart, ou le webhook Jitsi est livré deux fois) :
 *   1. Si le CompteEscrow n'est plus "sequestre" (déjà libéré,
 *      remboursé ou gelé par un litige), on sort sans rien faire.
 *   2. `creerMouvement` (Phase 1) est lui-même protégé par la
 *      contrainte unique `reference_idempotence = rdv_id` : même si
 *      l'étape 1 était contournée par une course, le grand-livre ne
 *      peut recevoir qu'un seul crédit `credit_honoraires` par rdv_id.
 *
 * @param {string} rdv_id
 * @returns {Promise<{ deja_traite: boolean }>}
 */
export async function libererEscrow(rdv_id) {
  return prisma.$transaction(async (tx) => {
    const [rdv, escrow] = await Promise.all([
      tx.rendezVous.findUnique({ where: { rdv_id }, select: { medecin_id: true } }),
      tx.compteEscrow.findUnique({
        where: { rdv_id },
        include: {
          transaction: {
            include: { ligne_commission: true, ligne_taxe: true, ligne_frais_agregateur: true },
          },
        },
      }),
    ]);

    // Pas d'escrow du tout (rdv jamais payé) : rien à libérer. Ne
    // devrait pas arriver si l'appelant a déjà vérifié le statut du
    // rdv en amont, mais on reste défensif — jamais d'exception pour
    // un webhook qui pourrait être rejoué par Jitsi/Stripe.
    if (!escrow) {
      return { deja_traite: true };
    }

    // Déjà libéré (double appel), déjà remboursé (annulation
    // entre-temps), ou gelé (litige ouvert, Phase 5) : on ne touche à
    // rien. C'est cette vérification qui rend l'opération idempotente
    // au niveau de l'escrow lui-même.
    if (escrow.statut !== "sequestre") {
      return { deja_traite: true };
    }

    const t = escrow.transaction;
    const decomposition = decomposerMontant(t.montant_honoraires, {
      commission: t.ligne_commission,
      taxe: t.ligne_taxe,
      frais_agregateur: t.ligne_frais_agregateur,
    });
    // Net de commission ET de taxe (§2) — pas le montant brut. Les
    // frais d'agrégateur (decomposition.fraisAgregateur) n'entrent pas
    // dans ce calcul : ils ne sont jamais à la charge du médecin.
    const montantNetMedecin = arrondir(
      decomposition.honoraires - decomposition.commission - decomposition.taxes
    );

    await tx.compteEscrow.update({
      where: { escrow_id: escrow.escrow_id },
      data: { statut: "libere" },
    });

    await tx.rendezVous.update({
      where: { rdv_id },
      data: { statut: "honore" },
    });

    // creerMouvement (Phase 1) gère déjà l'idempotence (catch P2002 sur
    // reference_idempotence) : un rejeu concurrent ne relève aucune
    // erreur, les mises à jour de statut ci-dessus restent acquises.
    await creerMouvement(
      {
        medecin_id: rdv.medecin_id,
        type: "credit_honoraires",
        montant: montantNetMedecin,
        rdv_id,
        reference_idempotence: rdv_id,
      },
      tx
    );

    return { deja_traite: false };
  });
}