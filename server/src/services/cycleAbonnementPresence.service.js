// src/services/cycleAbonnementPresence.service.js
// Cycle de vie des abonnements de présence (pharmacies, centres de santé,
// médecins), appelé par lib/scheduler.js — même logique que
// cycleAbonnementAssurance.service.js. Chaque fonction est idempotente et
// traite ses lignes une à une : l'échec d'une ligne n'arrête pas les autres.

import prisma from "../lib/prisma.js";
import { debutDuJourUtc } from "../lib/droitsAssurance.js";
import { ajouterJours, joursEntre } from "../lib/dates.js";
import { journaliserAudit } from "../lib/audit.js";
import { expirerSessionCheckout } from "../lib/stripeService.js";
import { acteur, acteurIdDe, filtreAbonnementsDe, verrouillerFichePresence } from "../lib/acteursPresence.js";
import { notifierEcheanceAbonnementPresence } from "./abonnementPresence.service.js";

const GRACE_PAR_DEFAUT = 7;
const PALIERS_RAPPEL = [30, 7, 1];
const DUREE_VIE_BROUILLON_MS = 24 * 60 * 60 * 1000;
const DUREE_VIE_COLLECTE_CAMPAY_MS = 2 * 60 * 60 * 1000;

/** Grâce (jours) par « type:pays » pour une liste d'abonnements. */
async function graceParFiche(abonnements) {
  const parType = new Map();
  for (const a of abonnements) {
    if (!parType.has(a.type_acteur)) parType.set(a.type_acteur, new Set());
    parType.get(a.type_acteur).add(acteurIdDe(a));
  }
  const paysParFiche = new Map();
  const cles = new Set();
  for (const [type, ids] of parType) {
    for (const f of await acteur(type).chargerPlusieurs(prisma, [...ids])) {
      paysParFiche.set(`${type}:${f.acteur_id}`, f.pays_id);
      cles.add(f.pays_id);
    }
  }
  const configs = cles.size
    ? await prisma.configAbonnementPresence.findMany({ where: { pays_id: { in: [...cles] } } })
    : [];
  const grace = new Map(configs.map((c) => [`${c.type_acteur}:${c.pays_id}`, c.grace_jours]));
  return (a) => grace.get(`${a.type_acteur}:${paysParFiche.get(`${a.type_acteur}:${acteurIdDe(a)}`)}`) ?? GRACE_PAR_DEFAUT;
}

/** actif -> expire quand date_fin + grace_jours <= aujourd'hui (droits publics déjà retirés à l'échéance). */
export async function expirerAbonnementsPresenceEchus() {
  const aujourdhui = debutDuJourUtc();
  const candidats = await prisma.abonnementPresence.findMany({
    where: { statut: "actif", date_fin: { lte: aujourdhui } },
  });
  if (!candidats.length) return { expires: 0 };
  const grace = await graceParFiche(candidats);

  let expires = 0;
  for (const c of candidats) {
    if (ajouterJours(c.date_fin, grace(c)) > aujourdhui) continue;
    try {
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.abonnementPresence.updateMany({
          where: { abonnement_id: c.abonnement_id, statut: "actif" },
          data: { statut: "expire" },
        });
        if (count) {
          expires += 1;
          await journaliserAudit(tx, {
            type: "ABONNEMENT_PRESENCE_EXPIRE", objet_type: "abonnement_presence", objet_id: c.abonnement_id,
            details: { type_acteur: c.type_acteur, date_fin: c.date_fin },
          });
        }
      });
    } catch (err) {
      console.error(`[abonnement-presence] Expiration de ${c.abonnement_id} impossible :`, err.message);
    }
  }
  return { expires };
}

/** Rappels J-30, J-7, J-1 du DERNIER abonnement actif de chaque fiche. */
export async function envoyerRappelsEcheancePresence() {
  const aujourdhui = debutDuJourUtc();
  const limite = ajouterJours(aujourdhui, PALIERS_RAPPEL[0]);
  const candidats = await prisma.abonnementPresence.findMany({
    where: { statut: "actif", date_fin: { gt: aujourdhui, lte: limite } },
    include: { niveau: { select: { libelle: true } } },
  });
  let envoyes = 0;
  for (const abo of candidats) {
    try {
      const suite = await prisma.abonnementPresence.findFirst({
        where: { ...filtreAbonnementsDe(abo.type_acteur, acteurIdDe(abo)), statut: "actif", date_fin: { gt: abo.date_fin } },
        select: { abonnement_id: true },
      });
      if (suite) continue;

      const restants = joursEntre(aujourdhui, abo.date_fin);
      const palier = [...PALIERS_RAPPEL].reverse().find((p) => restants <= p);
      if (!palier) continue;
      if (abo.dernier_rappel_jours !== null && abo.dernier_rappel_jours <= palier) continue;

      await notifierEcheanceAbonnementPresence(abo, restants);
      await prisma.abonnementPresence.update({
        where: { abonnement_id: abo.abonnement_id },
        data: { dernier_rappel_jours: palier },
      });
      envoyes += 1;
    } catch (err) {
      console.error(`[abonnement-presence] Rappel d'échéance de ${abo.abonnement_id} impossible :`, err.message);
    }
  }
  return { envoyes };
}

/**
 * Brouillons self-service de plus de 24 h -> « annule », après clôture de
 * leurs paiements morts (session Stripe expirée, collecte CamPay de plus
 * de 2 h). Un brouillon « virement » n'est jamais annulé automatiquement.
 */
export async function annulerBrouillonsPresencePerimes() {
  const seuil = new Date(Date.now() - DUREE_VIE_BROUILLON_MS);
  const brouillons = await prisma.abonnementPresence.findMany({
    where: { statut: "en_attente_paiement", origine: "self_service", date_creation: { lt: seuil } },
  });
  let annules = 0;
  for (const b of brouillons) {
    try {
      const transactions = await prisma.transactionPaiement.findMany({
        where: { abonnement_presence_id_cible: b.abonnement_id, statut: { in: ["en_attente", "reussie"] } },
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
        await verrouillerFichePresence(tx, b.type_acteur, acteurIdDe(b));
        const ouverte = await tx.transactionPaiement.findFirst({
          where: { abonnement_presence_id_cible: b.abonnement_id, statut: { in: ["en_attente", "reussie"] } },
        });
        if (ouverte) return;
        const { count } = await tx.abonnementPresence.updateMany({
          where: { abonnement_id: b.abonnement_id, statut: "en_attente_paiement" },
          data: { statut: "annule" },
        });
        if (count) {
          annules += 1;
          await journaliserAudit(tx, {
            type: "ABONNEMENT_PRESENCE_BROUILLON_ANNULE", objet_type: "abonnement_presence", objet_id: b.abonnement_id,
            details: { raison: "perime_24h" },
          });
        }
      });
    } catch (err) {
      console.error(`[abonnement-presence] Annulation du brouillon ${b.abonnement_id} impossible :`, err.message);
    }
  }
  return { annules };
}
