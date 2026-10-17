// src/services/cycleAbonnementAssurance.service.js
// Cycle de vie des abonnements assurance (guide v3, §1.4.4), appelé par
// lib/scheduler.js. Chaque fonction est idempotente et traite ses lignes
// une à une : l'échec d'une ligne est journalisé sans bloquer les autres.
//
// Dates comparées en jours calendaires UTC (V1, Annexe C point 12).

import prisma from "../lib/prisma.js";
import { debutDuJourUtc } from "../lib/droitsAssurance.js";
import { ajouterJours, joursEntre } from "../lib/dates.js";
import { journaliserAudit } from "../lib/audit.js";
import { expirerSessionCheckout } from "../lib/stripeService.js";
import { notifierEcheanceAbonnement, verrouillerFiche } from "./abonnementAssurance.service.js";

const GRACE_PAR_DEFAUT = 7;
const PALIERS_RAPPEL = [30, 7, 1];
const DUREE_VIE_BROUILLON_MS = 24 * 60 * 60 * 1000;
// Une demande USSD CamPay expire en quelques minutes : au-delà, la
// collecte est considérée morte (un succès tardif reste rattrapé par
// finaliserAbonnementAssurance -> remboursement manuel).
const DUREE_VIE_COLLECTE_CAMPAY_MS = 2 * 60 * 60 * 1000;

/**
 * actif -> expire quand date_fin + grace_jours(pays) <= aujourd'hui.
 * Pendant la grâce, l'abonnement reste « actif » en base mais ne donne
 * déjà plus aucun droit public (voir resoudreDroitsEnLot).
 */
export async function expirerAbonnementsEchus() {
  const aujourdhui = debutDuJourUtc();
  const candidats = await prisma.abonnementAssurance.findMany({
    where: { statut: "actif", date_fin: { lte: aujourdhui } },
    select: { abonnement_id: true, date_fin: true, service: { select: { pays_id: true } } },
  });
  if (!candidats.length) return { expires: 0 };

  const paysIds = [...new Set(candidats.map((c) => c.service.pays_id))];
  const configs = await prisma.configAbonnementAssurance.findMany({ where: { pays_id: { in: paysIds } } });
  const grace = new Map(configs.map((c) => [c.pays_id, c.grace_jours]));

  let expires = 0;
  for (const c of candidats) {
    const finGrace = ajouterJours(c.date_fin, grace.get(c.service.pays_id) ?? GRACE_PAR_DEFAUT);
    if (finGrace > aujourdhui) continue;
    try {
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.abonnementAssurance.updateMany({
          where: { abonnement_id: c.abonnement_id, statut: "actif" },
          data: { statut: "expire" },
        });
        if (count) {
          expires += 1;
          await journaliserAudit(tx, {
            type: "ABONNEMENT_EXPIRE", objet_type: "abonnement_assurance", objet_id: c.abonnement_id,
            details: { date_fin: c.date_fin },
          });
        }
      });
    } catch (err) {
      console.error(`[abonnement] Expiration de ${c.abonnement_id} impossible :`, err.message);
    }
  }
  return { expires };
}

/**
 * Rappels d'échéance J-30, J-7, J-1 (notification in-app aux agents de la
 * fiche). Seul le DERNIER abonnement actif de la fiche est rappelé (un
 * renouvellement déjà chaîné supprime le rappel). `dernier_rappel_jours`
 * évite les doublons ; la clé de notification aussi.
 */
export async function envoyerRappelsEcheance() {
  const aujourdhui = debutDuJourUtc();
  const limite = ajouterJours(aujourdhui, PALIERS_RAPPEL[0]);
  const candidats = await prisma.abonnementAssurance.findMany({
    where: { statut: "actif", date_fin: { gt: aujourdhui, lte: limite } },
    include: { niveau: { select: { libelle: true } } },
  });
  let envoyes = 0;
  for (const abo of candidats) {
    try {
      const suite = await prisma.abonnementAssurance.findFirst({
        where: {
          service_assurance_id: abo.service_assurance_id,
          statut: "actif",
          date_fin: { gt: abo.date_fin },
        },
        select: { abonnement_id: true },
      });
      if (suite) continue;

      const restants = joursEntre(aujourdhui, abo.date_fin);
      // Plus petit palier atteint : J-25 -> 30, J-6 -> 7, J-1 -> 1.
      const palier = [...PALIERS_RAPPEL].reverse().find((p) => restants <= p);
      if (!palier) continue;
      if (abo.dernier_rappel_jours !== null && abo.dernier_rappel_jours <= palier) continue;

      await notifierEcheanceAbonnement(abo, restants);
      await prisma.abonnementAssurance.update({
        where: { abonnement_id: abo.abonnement_id },
        data: { dernier_rappel_jours: palier },
      });
      envoyes += 1;
    } catch (err) {
      console.error(`[abonnement] Rappel d'échéance de ${abo.abonnement_id} impossible :`, err.message);
    }
  }
  return { envoyes };
}

/**
 * Brouillons self-service de plus de 24 h -> « annule », après avoir clos
 * leurs paiements morts :
 *   - Stripe : session Checkout expirée (payée entre-temps -> on n'annule
 *     pas, le webhook activera) ;
 *   - CamPay : collecte en attente depuis plus de 2 h -> « echouee » ;
 *     plus récente -> on attend.
 * Un brouillon « virement » n'est jamais annulé automatiquement (encaissement
 * attendu, constaté par l'admin).
 */
export async function annulerBrouillonsPerimes() {
  const seuil = new Date(Date.now() - DUREE_VIE_BROUILLON_MS);
  const brouillons = await prisma.abonnementAssurance.findMany({
    where: { statut: "en_attente_paiement", origine: "self_service", date_creation: { lt: seuil } },
    select: { abonnement_id: true, service_assurance_id: true },
  });
  let annules = 0;
  for (const b of brouillons) {
    try {
      const transactions = await prisma.transactionPaiement.findMany({
        where: { abonnement_assurance_id_cible: b.abonnement_id, statut: { in: ["en_attente", "reussie"] } },
      });
      if (transactions.some((t) => t.statut === "reussie")) continue; // finalisation en cours

      let bloque = false;
      for (const t of transactions) {
        if (t.fournisseur === "stripe" && t.stripe_checkout_session_id) {
          if ((await expirerSessionCheckout(t.stripe_checkout_session_id)) === "payee") { bloque = true; break; }
        } else if (t.fournisseur === "campay" && Date.now() - t.date_creation.getTime() < DUREE_VIE_COLLECTE_CAMPAY_MS) {
          bloque = true;
          break;
        }
        await prisma.transactionPaiement.updateMany({
          where: { transaction_id: t.transaction_id, statut: "en_attente" },
          data: { statut: "echouee" },
        });
      }
      if (bloque) continue;

      await prisma.$transaction(async (tx) => {
        await verrouillerFiche(tx, b.service_assurance_id);
        const ouverte = await tx.transactionPaiement.findFirst({
          where: { abonnement_assurance_id_cible: b.abonnement_id, statut: { in: ["en_attente", "reussie"] } },
        });
        if (ouverte) return; // un paiement est arrivé entre-temps
        const { count } = await tx.abonnementAssurance.updateMany({
          where: { abonnement_id: b.abonnement_id, statut: "en_attente_paiement" },
          data: { statut: "annule" },
        });
        if (count) {
          annules += 1;
          await journaliserAudit(tx, {
            type: "ABONNEMENT_BROUILLON_ANNULE", objet_type: "abonnement_assurance", objet_id: b.abonnement_id,
            details: { raison: "perime_24h" },
          });
        }
      });
    } catch (err) {
      console.error(`[abonnement] Annulation du brouillon ${b.abonnement_id} impossible :`, err.message);
    }
  }
  return { annules };
}
