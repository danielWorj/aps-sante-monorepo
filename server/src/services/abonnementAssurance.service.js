// src/services/abonnementAssurance.service.js
// Cœur métier des abonnements assurance (guide abonnements assurances v3,
// §1.4.3, §1.5.4, §1.5.6.4, §1.5.7, §1.5.8, §1.5.10).
//
// Point d'entrée UNIQUE pour :
//   - évaluer un achat (renouvellement, montée au prorata, descente refusée) ;
//   - créer ou réutiliser le brouillon d'une fiche (un seul à la fois,
//     index unique partiel abo_assurance_un_brouillon) ;
//   - activer un abonnement (paiement, virement, gratuité, geste admin) :
//     activerAbonnement est partagée par tous ces chemins.
//
// Verrou : toute écriture qui peut changer les dates ou le statut des
// abonnements d'une fiche verrouille d'abord la ligne service_assurance
// (SELECT ... FOR UPDATE) : webhook, callback, cron et actions admin sont
// ainsi sérialisés par fiche.

import prisma from "../lib/prisma.js";
import { debutDuJourUtc } from "../lib/droitsAssurance.js";
import { ajouterMois, ajouterJours } from "../lib/dates.js";
import { journaliserAudit } from "../lib/audit.js";
import { creerNotifications } from "./notification.service.js";
import { emettreFactureAbonnement } from "./factureAbonnement.service.js";
import {
  calculerMontantsAbonnement,
  calculerCreditProrata,
  resoudreTarifAbonnement,
  resoudreRemiseDuree,
} from "./tarifAbonnementAssurance.service.js";

/** Refus métier : le contrôleur le traduit en réponse HTTP (status, code, message). */
export class ErreurAbonnement extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ErreurAbonnement";
    this.status = status;
    this.code = code;
  }
}

/** Réponse HTTP pour une ErreurAbonnement ; renvoie true si l'erreur a été traitée. */
export function repondreSiErreurAbonnement(err, res) {
  if (!(err instanceof ErreurAbonnement)) return false;
  res.status(err.status).json({ code: err.code, message: err.message });
  return true;
}

/** Verrouille la fiche pour la durée de la transaction SQL `tx`. */
export async function verrouillerFiche(tx, service_assurance_id) {
  await tx.$queryRaw`SELECT 1 FROM service_assurance WHERE service_assurance_id = ${service_assurance_id}::uuid FOR UPDATE`;
}

/* ===================================================================
 * Conditions préalables (politique §2)
 * =================================================================== */

/** Fiche publiée, sinon ErreurAbonnement 403 FICHE_NON_PUBLIEE. */
export function exigerFichePubliee(service) {
  if (service.statut_verification !== "publie") {
    throw new ErreurAbonnement(403, "FICHE_NON_PUBLIEE", "La fiche doit être vérifiée et publiée avant de souscrire.");
  }
}

/**
 * Relit le payeur en base : le jeton (req.utilisateur) ne porte ni e-mail
 * ni statut de compte. Refuse un compte suspendu, et l'absence de 2FA si
 * EXIGER_2FA_PAIEMENT=true (module 2FA inexistant à ce jour : écart de
 * conformité assumé, Annexe C point 2 — aucun champ n'est inventé).
 */
export async function verifierPayeur(utilisateur_id, client = prisma) {
  const payeur = await client.utilisateur.findUnique({
    where: { utilisateur_id },
    select: { utilisateur_id: true, email: true, telephone: true, statut_compte: true },
  });
  if (!payeur || payeur.statut_compte === "suspendu") {
    throw new ErreurAbonnement(403, "COMPTE_SUSPENDU", "Un compte suspendu ne peut pas souscrire.");
  }
  if (process.env.EXIGER_2FA_PAIEMENT === "true" && !payeur.deux_fa_active) {
    throw new ErreurAbonnement(403, "DEUX_FA_REQUISE", "L'authentification à deux facteurs est requise.");
  }
  return payeur;
}

/* ===================================================================
 * Évaluation d'un achat (§1.5.7)
 * =================================================================== */

/** Abonnements valides AUJOURD'HUI (date_debut <= j < date_fin), rang le plus haut en premier. */
async function abonnementsValides(client, service_assurance_id, aujourdhui) {
  const valides = await client.abonnementAssurance.findMany({
    where: {
      service_assurance_id,
      statut: "actif",
      date_debut: { lte: aujourdhui },
      date_fin: { gt: aujourdhui },
    },
    include: { niveau: true },
  });
  return valides.sort((x, y) => y.niveau.rang - x.niveau.rang || y.date_fin - x.date_fin);
}

/**
 * Calcule les conditions figées d'un nouvel abonnement payant :
 *   - niveau vendable, durée proposée, tarif du pays (503 si absent) ;
 *   - abonnement valide de rang supérieur -> 409 DESCENTE_NON_AUTORISEE ;
 *   - rang inférieur -> montée immédiate au prorata (crédit + remplacement) ;
 *   - même rang -> renouvellement (dates chaînées à l'activation).
 * @returns {Promise<object>} champs `data` de l'abonnement (hors statut/origine)
 */
export async function evaluerAchat(client, { service, niveau, duree_mois, aujourdhui = debutDuJourUtc() }) {
  if (!niveau || !niveau.actif) {
    throw new ErreurAbonnement(409, "NIVEAU_NON_VENDABLE", "Ce niveau d'abonnement n'est pas proposé à la vente.");
  }
  const remise = await resoudreRemiseDuree(duree_mois, client);
  if (!remise) {
    throw new ErreurAbonnement(400, "DUREE_NON_PROPOSEE", "Durée d'abonnement non proposée.");
  }
  const tarif = await resoudreTarifAbonnement({ niveau_id: niveau.niveau_id, service }, client);

  const [courant] = await abonnementsValides(client, service.service_assurance_id, aujourdhui);
  let credit = 0;
  let abonnement_remplace_id = null;
  if (courant && courant.niveau.rang > niveau.rang) {
    throw new ErreurAbonnement(
      409,
      "DESCENTE_NON_AUTORISEE",
      "Votre abonnement en cours est d'un niveau supérieur : le passage à un niveau inférieur se fera à son échéance."
    );
  }
  if (courant && courant.niveau.rang < niveau.rang) {
    credit = calculerCreditProrata(courant, tarif.devise, aujourdhui);
    abonnement_remplace_id = courant.abonnement_id;
  }

  const devise = tarif.devise.toLowerCase();
  const montants = calculerMontantsAbonnement({
    prix_mensuel: tarif.prix_mensuel,
    duree_mois,
    remise_pourcent: remise.remise_pourcent,
    credit_prorata: credit,
    devise,
  });

  return {
    service_assurance_id: service.service_assurance_id,
    niveau_id: niveau.niveau_id,
    duree_mois,
    prix_mensuel_applique: tarif.prix_mensuel,
    remise_pourcent: remise.remise_pourcent,
    credit_prorata: montants.credit_prorata,
    montant_total: montants.total,
    devise,
    abonnement_remplace_id,
  };
}

/* ===================================================================
 * Gratuité d'amorçage (§1.5.8)
 * =================================================================== */

/** Configuration de gratuité applicable à ce niveau aujourd'hui, ou null. */
export async function gratuiteApplicable(client, { service, niveau_id, aujourdhui = debutDuJourUtc() }) {
  const config = await client.configAbonnementAssurance.findUnique({ where: { pays_id: service.pays_id } });
  if (!config?.gratuite_active || config.gratuite_niveau_id !== niveau_id) return null;
  if (config.gratuite_jusqu_au && config.gratuite_jusqu_au < aujourdhui) return null;
  return config;
}

/* ===================================================================
 * Activation partagée (§1.5.6.4)
 * =================================================================== */

/**
 * Active un abonnement `en_attente_paiement`, DANS la transaction `tx`
 * (fiche déjà verrouillée par l'appelant).
 *   - montée de niveau : démarre aujourd'hui, l'ancien passe « remplace » ;
 *   - renouvellement du même niveau : démarre à l'échéance la plus lointaine ;
 *   - sinon : démarre aujourd'hui.
 * date_fin est EXCLUSIVE ; `plafond_fin` (gratuité) la borne.
 * Mise à jour conditionnelle : si deux appels se croisent, un seul passe.
 * Facture émise seulement pour un paiement réel (transaction, montant > 0).
 * @returns {Promise<{ effet: boolean, abonnement_id?: string }>}
 */
export async function activerAbonnement(tx, abo, { transaction = null, acteur_id = null, plafond_fin = null } = {}) {
  const aujourdhui = debutDuJourUtc();
  let debut = aujourdhui;
  let remplace = null;

  if (abo.abonnement_remplace_id) {
    remplace = await tx.abonnementAssurance.findFirst({
      where: { abonnement_id: abo.abonnement_remplace_id, statut: "actif" },
    });
  }
  if (!remplace) {
    const courant = await tx.abonnementAssurance.findFirst({
      where: { service_assurance_id: abo.service_assurance_id, statut: "actif", niveau_id: abo.niveau_id },
      orderBy: { date_fin: "desc" },
    });
    if (courant && courant.date_fin > aujourdhui) debut = courant.date_fin;
  }
  let fin = ajouterMois(debut, abo.duree_mois);
  if (plafond_fin && plafond_fin < fin) fin = plafond_fin;
  if (fin <= debut) return { effet: false };

  const { count } = await tx.abonnementAssurance.updateMany({
    where: { abonnement_id: abo.abonnement_id, statut: "en_attente_paiement" },
    data: {
      statut: "actif",
      date_debut: debut,
      date_fin: fin,
      transaction_id: transaction?.transaction_id ?? null,
    },
  });
  if (count === 0) return { effet: false };

  if (remplace) {
    await tx.abonnementAssurance.update({
      where: { abonnement_id: remplace.abonnement_id },
      data: { statut: "remplace" },
    });
  }
  if (transaction && Number(abo.montant_total) > 0) {
    await emettreFactureAbonnement(tx, abo.abonnement_id, transaction);
  }
  await journaliserAudit(tx, {
    acteur_id,
    type: "ABONNEMENT_ASSURANCE_ACTIVE",
    objet_type: "abonnement_assurance",
    objet_id: abo.abonnement_id,
    details: {
      service_assurance_id: abo.service_assurance_id,
      niveau_id: abo.niveau_id,
      origine: abo.origine,
      transaction_id: transaction?.transaction_id ?? null,
      date_debut: debut.toISOString().slice(0, 10),
      date_fin: fin.toISOString().slice(0, 10),
      remplace: remplace?.abonnement_id ?? null,
    },
  });
  return { effet: true, abonnement_id: abo.abonnement_id };
}

/* ===================================================================
 * Souscription par le promoteur (§1.5.4)
 * =================================================================== */

/**
 * Crée (ou réutilise) le brouillon d'une fiche pour (niveau, durée) ; active
 * directement, sans paiement, une gratuité d'amorçage ou un montant nul
 * (montée entièrement couverte par le crédit).
 * Règles du brouillon existant :
 *   - origine « virement » (encaissement attendu) : 409 VIREMENT_EN_ATTENTE ;
 *   - mêmes niveau, durée et montant : réutilisé ;
 *   - sinon, sans transaction en_attente : annulé puis remplacé ;
 *   - sinon : 409 PAIEMENT_EN_COURS (annuler d'abord le paiement en cours).
 * @returns {Promise<{ abonnement: object, active: boolean, reutilise: boolean }>}
 */
export async function creerBrouillonOuActiver({ service, niveau, duree_mois, acteur_id }) {
  const resultat = await prisma.$transaction(async (tx) => {
    await verrouillerFiche(tx, service.service_assurance_id);
    const aujourdhui = debutDuJourUtc();

    const existant = await tx.abonnementAssurance.findFirst({
      where: { service_assurance_id: service.service_assurance_id, statut: "en_attente_paiement" },
    });

    const config = await gratuiteApplicable(tx, { service, niveau_id: niveau.niveau_id, aujourdhui });
    let data;
    let origine = "self_service";
    let plafond_fin = null;
    if (config) {
      if (!niveau.actif) {
        throw new ErreurAbonnement(409, "NIVEAU_NON_VENDABLE", "Ce niveau d'abonnement n'est pas proposé.");
      }
      const [courant] = await abonnementsValides(tx, service.service_assurance_id, aujourdhui);
      if (courant && courant.niveau.rang > niveau.rang) {
        throw new ErreurAbonnement(409, "DESCENTE_NON_AUTORISEE", "Votre abonnement en cours est d'un niveau supérieur.");
      }
      // Devise indicative (montant nul) : celle du tarif du pays s'il existe.
      let deviseGratuite = "xaf";
      try {
        deviseGratuite = (await resoudreTarifAbonnement({ niveau_id: niveau.niveau_id, service }, tx)).devise.toLowerCase();
      } catch {
        // Pas de tarif saisi : la gratuité reste possible.
      }
      data = {
        service_assurance_id: service.service_assurance_id,
        niveau_id: niveau.niveau_id,
        duree_mois,
        prix_mensuel_applique: 0,
        remise_pourcent: 0,
        credit_prorata: 0,
        montant_total: 0,
        devise: deviseGratuite,
        abonnement_remplace_id: courant && courant.niveau.rang < niveau.rang ? courant.abonnement_id : null,
      };
      origine = "gratuite";
      // gratuite_jusqu_au est INCLUSIVE ; date_fin est exclusive.
      plafond_fin = config.gratuite_jusqu_au ? ajouterJours(config.gratuite_jusqu_au, 1) : null;
    } else {
      data = await evaluerAchat(tx, { service, niveau, duree_mois, aujourdhui });
    }

    if (existant) {
      if (existant.origine === "virement") {
        throw new ErreurAbonnement(
          409,
          "VIREMENT_EN_ATTENTE",
          "Un abonnement réglé par virement attend son encaissement : contactez l'administration pour le modifier."
        );
      }
      const identique =
        origine === "self_service" &&
        existant.niveau_id === data.niveau_id &&
        existant.duree_mois === data.duree_mois &&
        Number(existant.montant_total) === Number(data.montant_total) &&
        existant.devise === data.devise;
      if (identique) return { abonnement: existant, active: false, reutilise: true };

      const ouverte = await tx.transactionPaiement.findFirst({
        where: { abonnement_assurance_id_cible: existant.abonnement_id, statut: "en_attente" },
      });
      if (ouverte) {
        throw new ErreurAbonnement(
          409,
          "PAIEMENT_EN_COURS",
          "Un paiement est en cours pour cet abonnement : annulez-le avant de changer de formule."
        );
      }
      await tx.abonnementAssurance.update({
        where: { abonnement_id: existant.abonnement_id },
        data: { statut: "annule" },
      });
    }

    const abonnement = await tx.abonnementAssurance.create({ data: { ...data, origine } });

    if (origine === "gratuite" || Number(data.montant_total) === 0) {
      const { effet } = await activerAbonnement(tx, abonnement, { acteur_id, plafond_fin });
      if (!effet) {
        throw new ErreurAbonnement(409, "ACTIVATION_IMPOSSIBLE", "La période gratuite est déjà terminée.");
      }
      const active = await tx.abonnementAssurance.findUnique({ where: { abonnement_id: abonnement.abonnement_id } });
      return { abonnement: active, active: true, reutilise: false };
    }
    return { abonnement, active: false, reutilise: false };
  });

  if (resultat.active) {
    await notifierAbonnementActive(resultat.abonnement.abonnement_id).catch((err) =>
      console.error("[abonnement] Notification d'activation impossible :", err.message)
    );
  }
  return resultat;
}

/* ===================================================================
 * Notifications (in-app — seul canal existant, voir notification.service.js)
 * =================================================================== */

async function agentsDeLaFiche(service_assurance_id) {
  const agents = await prisma.agentAssurance.findMany({
    where: { service_assurance_id },
    select: { utilisateur_id: true },
  });
  return agents.map((a) => a.utilisateur_id);
}

const formatDate = (d) => d.toISOString().slice(0, 10);

/** Abonnement activé : les agents de la fiche sont prévenus. Idempotent (clé). */
export async function notifierAbonnementActive(abonnement_id) {
  const abo = await prisma.abonnementAssurance.findUnique({
    where: { abonnement_id },
    include: { niveau: { select: { libelle: true } } },
  });
  if (!abo || abo.statut !== "actif") return { creees: 0 };
  const destinataires = await agentsDeLaFiche(abo.service_assurance_id);
  const { count } = await creerNotifications(
    destinataires.map((utilisateur_id) => ({
      utilisateur_id,
      type: "abonnement_assurance_active",
      titre: "Abonnement activé",
      message:
        `Votre abonnement « ${abo.niveau.libelle} » est actif jusqu'au ${formatDate(ajouterJours(abo.date_fin, -1))} inclus. ` +
        "Vos contenus enrichis sont visibles du public.",
      donnees: {
        abonnement_id,
        service_assurance_id: abo.service_assurance_id,
        date_debut: abo.date_debut.toISOString(),
        date_fin: abo.date_fin.toISOString(),
      },
      cle: `abonnement_assurance_active:${abonnement_id}:${utilisateur_id}`,
    }))
  );
  return { creees: count };
}

/** Rappel d'échéance (J-30, J-7, J-1). Idempotent (clé par palier). */
export async function notifierEcheanceAbonnement(abo, joursRestants) {
  const destinataires = await agentsDeLaFiche(abo.service_assurance_id);
  const { count } = await creerNotifications(
    destinataires.map((utilisateur_id) => ({
      utilisateur_id,
      type: "abonnement_assurance_echeance",
      titre: "Votre abonnement arrive à échéance",
      message:
        `Votre abonnement « ${abo.niveau.libelle} » se termine dans ${joursRestants} jour(s). ` +
        "Renouvelez-le pour que vos contenus enrichis restent visibles du public.",
      donnees: {
        abonnement_id: abo.abonnement_id,
        service_assurance_id: abo.service_assurance_id,
        date_fin: abo.date_fin.toISOString(),
        jours_restants: joursRestants,
      },
      cle: `abonnement_assurance_echeance:${abo.abonnement_id}:${joursRestants}:${utilisateur_id}`,
    }))
  );
  return { creees: count };
}
