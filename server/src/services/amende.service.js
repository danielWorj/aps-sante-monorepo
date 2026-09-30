// src/services/amende.service.js
// Politique de fonds v2 §7 — Amende du médecin (annulation médecin
// < 24h, médecin absent).
//
// Principe « aucune valeur dérivée stockée » : à la création on ne fige
// que des FAITS (rdv fautif, taux retenu). Le montant se calcule au
// moment de l'imputation (taux × crédit net de la libération, voir
// baseCalculAmende / imputerAmendes dans politiqueFonds.service.js) et
// seul le montant réellement imputé est écrit (AmendeMedecin.montant_impute
// + mouvement `debit_amende` du grand-livre). Le montant imputé est
// reversé à APS : c'est la somme des mouvements `debit_amende`.

import prisma from "../lib/prisma.js";
import { creerMouvement } from "./portefeuille.service.js";
import { imputerAmendes } from "./politiqueFonds.service.js";

/**
 * Taux d'amende actif du pays d'exercice du médecin. Erreur explicite
 * si l'administrateur n'a rien saisi (aucune valeur codée en dur).
 * @param {string} pays_id
 * @param {object} [client]
 */
export async function obtenirParametreAmendeActif(pays_id, client = prisma) {
  const ligne = await client.parametreAmende.findFirst({
    where: { pays_id, actif: true },
    orderBy: { date_debut_validite: "desc" },
  });
  if (!ligne) {
    throw new Error(
      `Aucun paramètre d'amende actif pour le pays ${pays_id} : un administrateur doit saisir le taux d'amende avant toute opération.`
    );
  }
  return ligne;
}

/**
 * Crée l'amende d'un médecin pour un RDV fautif (§7). Idempotent sur
 * `rdv_id` : un second appel renvoie l'amende existante sans erreur.
 * `createMany({ skipDuplicates })` (INSERT … ON CONFLICT DO NOTHING) est
 * utilisé plutôt qu'un catch de P2002 : une violation de contrainte
 * ferait échouer le reste d'une transaction PostgreSQL déjà ouverte.
 * L'amende est due même sans escrow (point ouvert D).
 *
 * @param {{ rdv_id: string, medecin_id: string }} p
 * @param {object} [client] client Prisma ou `tx`
 * @returns {Promise<{ amende: object, creee: boolean }>}
 */
export async function creerAmende({ rdv_id, medecin_id }, client = prisma) {
  const existante = await client.amendeMedecin.findUnique({ where: { rdv_id } });
  if (existante) return { amende: existante, creee: false };

  const medecin = await client.medecin.findUnique({
    where: { medecin_id },
    select: { pays_exercice_id: true },
  });
  if (!medecin) throw new Error(`Médecin introuvable (${medecin_id}) : amende impossible.`);

  const parametre = await obtenirParametreAmendeActif(medecin.pays_exercice_id, client);

  const { count } = await client.amendeMedecin.createMany({
    data: [
      {
        medecin_id,
        rdv_id,
        parametre_amende_id: parametre.parametre_amende_id,
        taux_applique: parametre.taux,
        statut: "en_attente",
      },
    ],
    skipDuplicates: true,
  });
  const amende = await client.amendeMedecin.findUnique({ where: { rdv_id } });
  return { amende, creee: count === 1 };
}

/**
 * Impute les amendes en attente du médecin sur UN crédit (§7). À
 * appeler DANS la transaction de la libération, après l'écriture du
 * crédit net. Toutes les amendes se calculent sur la même base (le
 * crédit net, avant amendes) et leur somme est plafonnée à ce crédit
 * (imputerAmendes, fonction pure).
 *
 * Idempotence / concurrence : chaque amende est « réservée » par un
 * UPDATE conditionnel (`WHERE statut = 'en_attente'`) ; si une autre
 * libération concurrente l'a déjà prise (count = 0) on la saute. Le
 * mouvement `debit_amende` porte la clé `debit_amende:<amende_id>`.
 * Le verrou du portefeuille (même patron que retrait.service.js) est
 * pris pour sérialiser les libérations d'un même médecin.
 *
 * @param {{ medecin_id: string, creditNet: number, decimales?: 0|2 }} p
 * @param {object} tx client transactionnel
 * @returns {Promise<{ totalImpute: number, creditApres: number, amendes_imputees: string[] }>}
 */
export async function appliquerAmendesEnAttente({ medecin_id, creditNet, decimales = 2 }, tx) {
  if (!tx) throw new Error("appliquerAmendesEnAttente doit s'exécuter dans une transaction (tx requis).");

  await tx.$queryRaw`SELECT medecin_id FROM portefeuille_medecin WHERE medecin_id = ${medecin_id}::uuid FOR UPDATE`;

  const enAttente = await tx.amendeMedecin.findMany({
    where: { medecin_id, statut: "en_attente" },
    orderBy: [{ date_creation: "asc" }, { amende_id: "asc" }],
  });

  const { imputations, creditApres } = imputerAmendes({
    creditNet,
    amendes: enAttente.map((a) => ({
      amende_id: a.amende_id,
      taux: a.taux_applique,
      date_creation: a.date_creation,
    })),
    decimales,
  });

  const amendes_imputees = [];
  let totalImpute = 0;
  for (const { amende_id, montant } of imputations) {
    const { count } = await tx.amendeMedecin.updateMany({
      where: { amende_id, statut: "en_attente" },
      data: { statut: "imputee", montant_impute: montant, date_imputation: new Date() },
    });
    if (count !== 1) continue; // prise par une libération concurrente

    if (montant > 0) {
      const amende = enAttente.find((a) => a.amende_id === amende_id);
      await creerMouvement(
        {
          medecin_id,
          type: "debit_amende",
          montant,
          rdv_id: amende.rdv_id,
          reference_idempotence: `debit_amende:${amende_id}`,
        },
        tx
      );
    }
    amendes_imputees.push(amende_id);
    totalImpute += montant;
  }

  return {
    totalImpute: Math.round(totalImpute * 100) / 100,
    creditApres: Math.max(0, Math.round((creditNet - totalImpute) * 100) / 100),
    amendes_imputees,
  };
}