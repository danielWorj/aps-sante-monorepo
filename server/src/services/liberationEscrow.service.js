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

// NB : on n'appelle pas creerMouvement (portefeuille.service.js,
// Phase 1) ici — il travaille sur le client Prisma global, pas sur un
// `tx` de transaction, ce qui empêcherait de garantir que la mise à
// jour du statut de l'escrow/rdv et le crédit du portefeuille sont
// atomiques (tout ou rien). Plutôt que de modifier silencieusement un
// fichier déjà livré en Phase 1 pour lui ajouter un paramètre `tx`
// optionnel, on reproduit ici son motif idempotent minimal (catch de
// la violation de contrainte unique P2002 sur reference_idempotence).
// Point à signaler : si d'autres phases ont le même besoin, on pourra
// centraliser ce motif "creerMouvement(tx, ...)" à ce moment-là.

/**
 * Libère l'escrow d'un rendez-vous et crédite le portefeuille du
 * médecin des honoraires (commission/taxes/frais d'agrégateur déjà
 * déduits, jamais stockés — recalculés à la volée via
 * decomposerMontant, voir Phase 0).
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
    const montantHonoraires = decomposerMontant(t.montant_honoraires, {
      commission: t.ligne_commission,
      taxe: t.ligne_taxe,
      frais_agregateur: t.ligne_frais_agregateur,
    }).honoraires;

    await tx.compteEscrow.update({
      where: { escrow_id: escrow.escrow_id },
      data: { statut: "libere" },
    });

    await tx.rendezVous.update({
      where: { rdv_id },
      data: { statut: "honore" },
    });

    try {
      await tx.mouvementPortefeuille.create({
        data: {
          medecin_id: rdv.medecin_id,
          type: "credit_honoraires",
          montant: montantHonoraires,
          rdv_id,
          reference_idempotence: rdv_id,
        },
      });
    } catch (err) {
      // P2002 sur reference_idempotence : un mouvement pour ce rdv_id
      // existe déjà (course entre deux appels concurrents) — on ne
      // relève pas d'erreur, le reste de la transaction (statuts déjà
      // mis à jour ci-dessus) est conservé normalement.
      if (!(err.code === "P2002" && err.meta?.target?.includes("reference_idempotence"))) {
        throw err;
      }
    }

    return { deja_traite: false };
  });
}