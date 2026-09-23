// src/services/portefeuille.service.js
// Phase 1 — Portefeuille médecin & grand-livre (voir politique de
// gestion des fonds §2).
//
// Principe directeur : le solde d'un portefeuille n'est JAMAIS une
// colonne stockée. C'est la somme signée des mouvements du grand-livre
// (MouvementPortefeuille), recalculée à la demande — ça élimine tout
// risque de désynchronisation entre un solde mis en cache et la
// réalité des mouvements.

import prisma from "../lib/prisma.js";

// Le signe vient du préfixe du type de mouvement (voir schema.prisma,
// enum TypeMouvementPortefeuille) : credit_* augmente le solde,
// debit_* le diminue. Un mouvement est toujours stocké avec un
// montant positif (voir creerMouvement).
function signe(type) {
  if (type.startsWith("credit_")) return 1;
  if (type.startsWith("debit_")) return -1;
  throw new Error(`Type de mouvement de portefeuille inconnu : "${type}".`);
}

// Arrondi à 2 décimales (unité monétaire courante des montants en
// base, voir @db.Decimal(12, 2) sur MouvementPortefeuille.montant) —
// évite les écarts de type 14.999999999999998 issus de l'arithmétique
// flottante lors de la sommation.
function arrondir(valeur) {
  return Math.round(valeur * 100) / 100;
}

/**
 * Solde du portefeuille d'un médecin, recalculé à la demande comme la
 * somme signée de tous ses mouvements — jamais mis en cache.
 * @param {string} medecin_id
 * @returns {Promise<number>}
 */
export async function soldePortefeuille(medecin_id) {
  const totauxParType = await prisma.mouvementPortefeuille.groupBy({
    by: ["type"],
    where: { medecin_id },
    _sum: { montant: true },
  });

  const solde = totauxParType.reduce(
    (total, { type, _sum }) => total + signe(type) * Number(_sum.montant ?? 0),
    0
  );

  return arrondir(solde);
}

/**
 * Écrit un mouvement au grand-livre. Idempotent : si un mouvement
 * portant la même `reference_idempotence` existe déjà (ex. double
 * appel de libererEscrow pour le même rdv_id), l'opération est
 * considérée comme déjà faite et aucune erreur n'est remontée — c'est
 * cette contrainte unique en base qui garantit qu'un même événement
 * métier ne peut jamais créer deux mouvements.
 *
 * @param {{ medecin_id: string, type: import("../../generated/prisma/client.js").TypeMouvementPortefeuille, montant: number|string, rdv_id?: string, demande_retrait_id?: string, reference_idempotence: string }} params
 * @param {import("../../generated/prisma/client.js").PrismaClient} [client] client Prisma à utiliser
 *   (par défaut le client global ; passer le `tx` d'un `$transaction` en
 *   cours — voir libererEscrow — pour que l'écriture du mouvement et la
 *   mise à jour du CompteEscrow soient atomiques).
 * @returns {Promise<object|null>} le mouvement créé, ou null si déjà existant (idempotence)
 */
export async function creerMouvement(
  { medecin_id, type, montant, rdv_id, demande_retrait_id, reference_idempotence },
  client = prisma
) {
  try {
    return await client.mouvementPortefeuille.create({
      data: {
        medecin_id,
        type,
        montant,
        rdv_id,
        demande_retrait_id,
        reference_idempotence,
      },
    });
  } catch (err) {
    // P2002 : violation de contrainte unique sur reference_idempotence
    // -> le mouvement existe déjà, on ne relève pas d'erreur.
    if (err.code === "P2002" && err.meta?.target?.includes("reference_idempotence")) {
      return null;
    }
    throw err;
  }
}

/**
 * Phase 2 — Libération du séquestre à la confirmation effective du
 * service (politique de gestion des fonds §2) : appelée par
 * scannerQrRendezVous (physique) et cloturerTeleconsultationRendezVous
 * (téléconsultation) dans rendezVous.controller.js, une fois le rdv
 * passé à "honore".
 *
 * Crédite le portefeuille du médecin des honoraires nets de la
 * commission APS et de la taxe — JAMAIS des frais d'agrégateur, qui
 * restent à la charge du patient et ne sont jamais déduits d'un
 * remboursement ni d'une libération (voir politique §4). Le calcul
 * relit les lignes tarifaires (taux) figées sur la transaction au
 * moment de la capture — jamais les lignes actives à l'instant T —
 * pour rester correct même si un taux a changé depuis (même principe
 * que decomposerMontant, voir tarification.service.js et Phase 0).
 *
 * Idempotente à deux niveaux, pour supporter un rejeu (ex. double
 * appel de l'un des deux endpoints) sans jamais créditer deux fois :
 *   1. Si le CompteEscrow n'est déjà plus "sequestre" (déjà libéré, ou
 *      remboursé), l'opération est un no-op silencieux.
 *   2. Le mouvement écrit porte une reference_idempotence déterministe
 *      (`credit_honoraires:${rdv_id}`) : creerMouvement() absorbe déjà
 *      toute tentative de doublon via la contrainte unique en base.
 * L'ensemble (lecture de l'escrow, création du mouvement, passage à
 * "libere") tourne dans une seule transaction Prisma pour écarter toute
 * fenêtre où l'un aurait eu lieu sans l'autre.
 *
 * @param {string} rdv_id
 * @returns {Promise<{ deja_libere: boolean, mouvement: object|null }>}
 */
export async function libererEscrow(rdv_id) {
  return prisma.$transaction(async (tx) => {
    const escrow = await tx.compteEscrow.findUnique({
      where: { rdv_id },
      include: {
        transaction: { include: { ligne_commission: true, ligne_taxe: true } },
        rendez_vous: true,
      },
    });

    if (!escrow) {
      throw new Error(
        `Aucun compte séquestre pour le rendez-vous ${rdv_id} : la libération est impossible.`
      );
    }

    // Rejeu : déjà libéré (ou remboursé entre-temps par un admin, cas
    // conteste — voir Phase 3) -> no-op, pas d'erreur.
    if (escrow.statut !== "sequestre") {
      return { deja_libere: true, mouvement: null };
    }

    const { transaction: t } = escrow;
    if (t.montant_honoraires == null || !t.ligne_commission || !t.ligne_taxe) {
      // Ne devrait jamais arriver pour une transaction liée à un rdv
      // (montant_honoraires + les 3 lignes sont posés ensemble à la
      // capture, voir paiement.controller.js) — mieux vaut un 500 clair
      // qu'une libération avec un montant net incorrect.
      throw new Error(
        `Transaction ${t.transaction_id} incomplète (honoraires ou lignes tarifaires manquants) : libération du rdv ${rdv_id} impossible.`
      );
    }

    const honoraires = Number(t.montant_honoraires);
    const commission = arrondir(honoraires * Number(t.ligne_commission.taux));
    const taxe = arrondir(honoraires * Number(t.ligne_taxe.taux));
    const montantNet = arrondir(honoraires - commission - taxe);

    const mouvement = await creerMouvement(
      {
        medecin_id: escrow.rendez_vous.medecin_id,
        type: "credit_honoraires",
        montant: montantNet,
        rdv_id,
        reference_idempotence: `credit_honoraires:${rdv_id}`,
      },
      tx
    );

    await tx.compteEscrow.update({
      where: { escrow_id: escrow.escrow_id },
      data: { statut: "libere" },
    });

    return { deja_libere: false, mouvement };
  });
}

// Nombre de mouvements retournés par défaut par obtenirPortefeuilleMedecin
// (voir controllers/portefeuille.controller.js) — non précisé par le
// plan, valeur par défaut raisonnable en attendant une éventuelle
// pagination.
export const NB_MOUVEMENTS_PAR_DEFAUT = 50;

/**
 * @param {string} medecin_id
 * @returns {Promise<{ solde: number, mouvements: object[] }>}
 */
export async function obtenirPortefeuille(medecin_id) {
  const [solde, mouvements] = await Promise.all([
    soldePortefeuille(medecin_id),
    prisma.mouvementPortefeuille.findMany({
      where: { medecin_id },
      orderBy: { date_creation: "desc" },
      take: NB_MOUVEMENTS_PAR_DEFAUT,
    }),
  ]);

  return { solde, mouvements };
}