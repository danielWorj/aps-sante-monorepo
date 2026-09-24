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
 * appel de traiterAnnulation pour le même rdv_id), l'opération est
 * considérée comme déjà faite et aucune erreur n'est remontée — c'est
 * cette contrainte unique en base qui garantit qu'un même événement
 * métier ne peut jamais créer deux mouvements.
 *
 * @param {{ medecin_id: string, type: import("../../generated/prisma/client.js").TypeMouvementPortefeuille, montant: number|string, rdv_id?: string, demande_retrait_id?: string, reference_idempotence: string }} params
 * @param {import("../../generated/prisma/client.js").PrismaClient} [client] client Prisma à utiliser
 *   (par défaut le client global ; passer le `tx` d'un `$transaction` en
 *   cours — voir traiterAnnulation (annulation.service.js) — pour que
 *   l'écriture du mouvement et la mise à jour du CompteEscrow soient
 *   atomiques).
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