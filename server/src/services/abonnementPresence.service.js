// src/services/abonnementPresence.service.js
// Cœur métier des abonnements de présence (pharmacies, centres de santé,
// médecins). Même règles que abonnementAssurance.service.js :
//   - évaluer un achat (renouvellement chaîné, montée au prorata, descente
//     refusée) ;
//   - un seul brouillon par fiche (index uniques partiels) ;
//   - activerAbonnementPresence, partagée par TOUS les chemins (paiement,
//     virement, gratuité, geste admin).
//
// Verrou : toute écriture qui peut changer les dates ou le statut des
// abonnements d'une fiche verrouille d'abord la ligne de la fiche
// (verrouillerFichePresence).

import prisma from "../lib/prisma.js";
import { debutDuJourUtc } from "../lib/droitsAssurance.js";
import { ajouterMois, ajouterJours } from "../lib/dates.js";
import { journaliserAudit } from "../lib/audit.js";
import {
  acteur,
  acteurIdDe,
  champActeur,
  estFicheEnLigne,
  filtreAbonnementsDe,
  verrouillerFichePresence,
} from "../lib/acteursPresence.js";
import { creerNotifications } from "./notification.service.js";
import { ErreurAbonnement } from "./abonnementAssurance.service.js";
import { emettreFactureAbonnementPresence } from "./factureAbonnementPresence.service.js";
import {
  calculerMontantsAbonnement,
  calculerCreditProrata,
  resoudreTarifPresence,
  resoudreRemiseDureePresence,
} from "./tarifAbonnementPresence.service.js";

export { ErreurAbonnement, repondreSiErreurAbonnement, verifierPayeur } from "./abonnementAssurance.service.js";

/* ===================================================================
 * Conditions préalables
 * =================================================================== */

/** Fiche normalisée de ce type, sinon ErreurAbonnement 404. */
export async function chargerFicheOuErreur(client, type, acteur_id) {
  const fiche = acteur_id ? await acteur(type).charger(client, acteur_id) : null;
  if (!fiche) throw new ErreurAbonnement(404, "FICHE_INTROUVABLE", `Fiche ${acteur(type).libelle} introuvable.`);
  return fiche;
}

/**
 * Fiche en ligne (publiée, ou déjà publiée et en cours de re-modération
 * après une modification), sinon 403 FICHE_NON_PUBLIEE.
 */
export function exigerFichePubliee(fiche) {
  if (!estFicheEnLigne(fiche)) {
    throw new ErreurAbonnement(403, "FICHE_NON_PUBLIEE", "La fiche doit être vérifiée et publiée avant de souscrire.");
  }
}

/** Configuration (type, pays) ou null. */
export async function configPresence(client, type, pays_id) {
  return client.configAbonnementPresence.findUnique({
    where: { type_acteur_pays_id: { type_acteur: type, pays_id } },
  });
}

/** Les médecins ne souscrivent que dans un pays où l'abonnement est obligatoire. */
export async function abonnementRequis(client, type, fiche) {
  if (type !== "medecin") return true;
  return (await configPresence(client, type, fiche.pays_id))?.abonnement_obligatoire === true;
}

export async function exigerAbonnementRequis(client, type, fiche) {
  if (!(await abonnementRequis(client, type, fiche))) {
    throw new ErreurAbonnement(
      409,
      "ABONNEMENT_NON_REQUIS",
      "L'abonnement n'est pas requis pour les médecins de votre pays : votre fiche dispose déjà de toutes ses fonctionnalités."
    );
  }
}

/** Refus si un gestionnaire de la fiche a un compte suspendu. */
export async function exigerGestionnairesNonSuspendus(client, type, acteur_id) {
  const gestionnaires = await acteur(type).gestionnaires(client, acteur_id);
  if (gestionnaires.some((g) => g.statut_compte === "suspendu")) {
    throw new ErreurAbonnement(403, "COMPTE_SUSPENDU", "Le compte du gestionnaire de cette fiche est suspendu.");
  }
}

/* ===================================================================
 * Évaluation d'un achat
 * =================================================================== */

/**
 * Renouvellements déjà payés qui démarreront plus tard, d'un rang
 * inférieur à `rang` : une montée les remplace aussi (crédités en entier).
 */
async function renouvellementsAVenir(client, type, acteur_id, rang, aujourdhui) {
  return client.abonnementPresence.findMany({
    where: {
      ...filtreAbonnementsDe(type, acteur_id),
      statut: "actif",
      date_debut: { gt: aujourdhui },
      niveau: { rang: { lt: rang } },
    },
  });
}

/** Abonnements valides AUJOURD'HUI, rang le plus haut en premier. */
async function abonnementsValides(client, type, acteur_id, aujourdhui) {
  const valides = await client.abonnementPresence.findMany({
    where: {
      ...filtreAbonnementsDe(type, acteur_id),
      statut: "actif",
      date_debut: { lte: aujourdhui },
      date_fin: { gt: aujourdhui },
    },
    include: { niveau: true },
  });
  return valides.sort((x, y) => y.niveau.rang - x.niveau.rang || y.date_fin - x.date_fin);
}

function exigerNiveauVendable(type, niveau) {
  if (!niveau || niveau.type_acteur !== type) {
    throw new ErreurAbonnement(400, "NIVEAU_INCOMPATIBLE", "Ce niveau d'abonnement ne correspond pas à ce type de fiche.");
  }
  if (!niveau.actif) {
    throw new ErreurAbonnement(409, "NIVEAU_NON_VENDABLE", "Ce niveau d'abonnement n'est pas proposé à la vente.");
  }
}

/**
 * Conditions figées d'un nouvel abonnement payant (mêmes règles que les
 * assurances) : tarif du pays (503 si absent), descente refusée (409),
 * montée immédiate au prorata, renouvellement chaîné.
 * @returns {Promise<object>} champs `data` de l'abonnement (hors statut/origine)
 */
export async function evaluerAchatPresence(client, { type, fiche, niveau, duree_mois, aujourdhui = debutDuJourUtc() }) {
  exigerNiveauVendable(type, niveau);
  const remise = await resoudreRemiseDureePresence(type, duree_mois, client);
  if (!remise) throw new ErreurAbonnement(400, "DUREE_NON_PROPOSEE", "Durée d'abonnement non proposée.");
  const tarif = await resoudreTarifPresence({ niveau_id: niveau.niveau_id, pays_id: fiche.pays_id }, client);

  const [courant] = await abonnementsValides(client, type, fiche.acteur_id, aujourdhui);
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
    // Renouvellements déjà payés de l'ancien niveau : remplacés eux aussi
    // à l'activation, donc crédités (sinon payés deux fois).
    for (const futur of await renouvellementsAVenir(client, type, fiche.acteur_id, niveau.rang, aujourdhui)) {
      credit += calculerCreditProrata(futur, tarif.devise, aujourdhui);
    }
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
    type_acteur: type,
    [champActeur(type)]: fiche.acteur_id,
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

/** Gratuité d'amorçage applicable à ce niveau aujourd'hui, ou null. */
export async function gratuitePresenceApplicable(client, { type, fiche, niveau_id, aujourdhui = debutDuJourUtc() }) {
  const config = await configPresence(client, type, fiche.pays_id);
  if (!config?.gratuite_active || config.gratuite_niveau_id !== niveau_id) return null;
  if (config.gratuite_jusqu_au && config.gratuite_jusqu_au < aujourdhui) return null;
  return config;
}

/* ===================================================================
 * Activation partagée
 * =================================================================== */

/**
 * Active un abonnement `en_attente_paiement`, DANS `tx` (fiche déjà
 * verrouillée). Montée : démarre aujourd'hui, l'ancien passe « remplace »,
 * ainsi que les renouvellements à venir d'un rang inférieur (crédités par
 * evaluerAchatPresence) ;
 * renouvellement du même niveau : démarre à l'échéance la plus lointaine.
 * date_fin EXCLUSIVE, bornée par `plafond_fin` (gratuité). Mise à jour
 * conditionnelle : un seul appel concurrent passe. Facture pour un
 * paiement réel seulement.
 * @returns {Promise<{ effet: boolean, abonnement_id?: string }>}
 */
export async function activerAbonnementPresence(tx, abo, { transaction = null, acteur_id = null, plafond_fin = null } = {}) {
  const aujourdhui = debutDuJourUtc();
  const ficheId = acteurIdDe(abo);
  let debut = aujourdhui;
  let remplace = null;

  if (abo.abonnement_remplace_id) {
    remplace = await tx.abonnementPresence.findFirst({
      where: { abonnement_id: abo.abonnement_remplace_id, statut: "actif" },
    });
  }
  if (!remplace) {
    const courant = await tx.abonnementPresence.findFirst({
      where: { ...filtreAbonnementsDe(abo.type_acteur, ficheId), statut: "actif", niveau_id: abo.niveau_id },
      orderBy: { date_fin: "desc" },
    });
    if (courant && courant.date_fin > aujourdhui) debut = courant.date_fin;
  }
  let fin = ajouterMois(debut, abo.duree_mois);
  if (plafond_fin && plafond_fin < fin) fin = plafond_fin;
  if (fin <= debut) return { effet: false };

  const { count } = await tx.abonnementPresence.updateMany({
    where: { abonnement_id: abo.abonnement_id, statut: "en_attente_paiement" },
    data: {
      statut: "actif",
      date_debut: debut,
      date_fin: fin,
      transaction_id: transaction?.transaction_id ?? null,
    },
  });
  if (count === 0) return { effet: false };

  let remplaces = [];
  if (remplace) {
    const { rang } = await tx.niveauAbonnementPresence.findUnique({
      where: { niveau_id: abo.niveau_id },
      select: { rang: true },
    });
    remplaces = [
      remplace.abonnement_id,
      ...(await renouvellementsAVenir(tx, abo.type_acteur, ficheId, rang, aujourdhui))
        .map((a) => a.abonnement_id)
        .filter((id) => id !== remplace.abonnement_id && id !== abo.abonnement_id),
    ];
    await tx.abonnementPresence.updateMany({
      where: { abonnement_id: { in: remplaces }, statut: "actif" },
      data: { statut: "remplace" },
    });
  }
  if (transaction && Number(abo.montant_total) > 0) {
    await emettreFactureAbonnementPresence(tx, abo.abonnement_id, transaction);
  }
  await journaliserAudit(tx, {
    acteur_id,
    type: "ABONNEMENT_PRESENCE_ACTIVE",
    objet_type: "abonnement_presence",
    objet_id: abo.abonnement_id,
    details: {
      type_acteur: abo.type_acteur,
      acteur_id: ficheId,
      niveau_id: abo.niveau_id,
      origine: abo.origine,
      transaction_id: transaction?.transaction_id ?? null,
      date_debut: debut.toISOString().slice(0, 10),
      date_fin: fin.toISOString().slice(0, 10),
      remplace: remplace?.abonnement_id ?? null,
      remplaces,
    },
  });
  return { effet: true, abonnement_id: abo.abonnement_id };
}

/* ===================================================================
 * Souscription par le gestionnaire de la fiche
 * =================================================================== */

/**
 * Crée (ou réutilise) le brouillon de la fiche pour (niveau, durée) ; active
 * directement un montant nul (montée couverte par le crédit). Le niveau
 * offert par une gratuité d'amorçage n'est pas souscriptible (409).
 * Brouillon existant : « virement » -> 409 VIREMENT_EN_ATTENTE ; identique ->
 * réutilisé ; sinon annulé et remplacé, sauf paiement en cours (409).
 * @returns {Promise<{ abonnement: object, active: boolean, reutilise: boolean }>}
 */
export async function creerBrouillonOuActiverPresence({ type, fiche, niveau, duree_mois, acteur_id }) {
  const resultat = await prisma.$transaction(async (tx) => {
    await verrouillerFichePresence(tx, type, fiche.acteur_id);
    const aujourdhui = debutDuJourUtc();

    const existant = await tx.abonnementPresence.findFirst({
      where: { ...filtreAbonnementsDe(type, fiche.acteur_id), statut: "en_attente_paiement" },
    });

    // Gratuité d'amorçage : le niveau offert est DÉJÀ accordé à toutes les
    // fiches publiées du pays (lib/droitsPresence.js) ; le souscrire ne
    // ferait que prolonger la gratuité au-delà de l'amorçage.
    if (await gratuitePresenceApplicable(tx, { type, fiche, niveau_id: niveau.niveau_id, aujourdhui })) {
      throw new ErreurAbonnement(
        409,
        "NIVEAU_DEJA_OFFERT",
        "Ce niveau vous est déjà offert pendant la période de lancement : aucune souscription n'est nécessaire."
      );
    }
    const origine = "self_service";
    const data = await evaluerAchatPresence(tx, { type, fiche, niveau, duree_mois, aujourdhui });

    if (existant) {
      if (existant.origine === "virement") {
        throw new ErreurAbonnement(
          409,
          "VIREMENT_EN_ATTENTE",
          "Un abonnement réglé par virement attend son encaissement : contactez l'administration pour le modifier."
        );
      }
      const identique =
        existant.niveau_id === data.niveau_id &&
        existant.duree_mois === data.duree_mois &&
        Number(existant.montant_total) === Number(data.montant_total) &&
        existant.devise === data.devise;
      if (identique) return { abonnement: existant, active: false, reutilise: true };

      const ouverte = await tx.transactionPaiement.findFirst({
        where: { abonnement_presence_id_cible: existant.abonnement_id, statut: "en_attente" },
      });
      if (ouverte) {
        throw new ErreurAbonnement(
          409,
          "PAIEMENT_EN_COURS",
          "Un paiement est en cours pour cet abonnement : annulez-le avant de changer de formule."
        );
      }
      await tx.abonnementPresence.update({ where: { abonnement_id: existant.abonnement_id }, data: { statut: "annule" } });
    }

    const abonnement = await tx.abonnementPresence.create({ data: { ...data, origine } });

    // Montée entièrement couverte par le crédit : rien à encaisser.
    if (Number(data.montant_total) === 0) {
      const { effet } = await activerAbonnementPresence(tx, abonnement, { acteur_id });
      if (!effet) throw new ErreurAbonnement(409, "ACTIVATION_IMPOSSIBLE", "Activation impossible.");
      const active = await tx.abonnementPresence.findUnique({ where: { abonnement_id: abonnement.abonnement_id } });
      return { abonnement: active, active: true, reutilise: false };
    }
    return { abonnement, active: false, reutilise: false };
  });

  if (resultat.active) {
    await notifierAbonnementPresenceActive(resultat.abonnement.abonnement_id).catch((err) =>
      console.error("[abonnement-presence] Notification d'activation impossible :", err.message)
    );
  }
  return resultat;
}

/* ===================================================================
 * Notifications in-app (destinataires : gestionnaires de la fiche)
 * =================================================================== */

const formatDate = (d) => d.toISOString().slice(0, 10);

async function destinataires(abo) {
  const gestionnaires = await acteur(abo.type_acteur).gestionnaires(prisma, acteurIdDe(abo));
  return gestionnaires.map((g) => g.utilisateur_id);
}

/** Abonnement activé. Idempotent (clé). */
export async function notifierAbonnementPresenceActive(abonnement_id) {
  const abo = await prisma.abonnementPresence.findUnique({
    where: { abonnement_id },
    include: { niveau: { select: { libelle: true } } },
  });
  if (!abo || abo.statut !== "actif") return { creees: 0 };
  const ids = await destinataires(abo);
  const { count } = await creerNotifications(
    ids.map((utilisateur_id) => ({
      utilisateur_id,
      type: "abonnement_presence_active",
      titre: "Abonnement activé",
      message:
        `Votre abonnement de présence « ${abo.niveau.libelle} » est actif jusqu'au ${formatDate(ajouterJours(abo.date_fin, -1))} inclus. ` +
        "Les informations enrichies de votre fiche sont visibles du public.",
      donnees: {
        abonnement_id,
        type_acteur: abo.type_acteur,
        acteur_id: acteurIdDe(abo),
        lien: acteur(abo.type_acteur).lienGestion(acteurIdDe(abo)),
        date_debut: abo.date_debut.toISOString(),
        date_fin: abo.date_fin.toISOString(),
      },
      cle: `abonnement_presence_active:${abonnement_id}:${utilisateur_id}`,
    }))
  );
  return { creees: count };
}

/** Rappel d'échéance (J-30, J-7, J-1). Idempotent (clé par palier). */
export async function notifierEcheanceAbonnementPresence(abo, joursRestants) {
  const ids = await destinataires(abo);
  const { count } = await creerNotifications(
    ids.map((utilisateur_id) => ({
      utilisateur_id,
      type: "abonnement_presence_echeance",
      titre: "Votre abonnement arrive à échéance",
      message:
        `Votre abonnement de présence « ${abo.niveau.libelle} » se termine dans ${joursRestants} jour(s). ` +
        "Renouvelez-le pour que les informations enrichies de votre fiche restent visibles du public.",
      donnees: {
        abonnement_id: abo.abonnement_id,
        type_acteur: abo.type_acteur,
        acteur_id: acteurIdDe(abo),
        lien: acteur(abo.type_acteur).lienGestion(acteurIdDe(abo)),
        date_fin: abo.date_fin.toISOString(),
        jours_restants: joursRestants,
      },
      cle: `abonnement_presence_echeance:${abo.abonnement_id}:${joursRestants}:${utilisateur_id}`,
    }))
  );
  return { creees: count };
}
