// src/services/finConsultation.service.js
// Libération différée des fonds — Phase 2 : constatation de la FIN DE
// CONSULTATION.
//
// Deux sources, un seul fait :
//   - « code » : le médecin saisit le code_unique du RDV physique
//                (validerCodeConsultation, avec protection anti force-brute) ;
//   - « visio » : clôture de la téléconsultation, les deux parties présentes
//                (constaterFinConsultation, appelée par visio.controller.js).
// Dans les deux cas on écrit, de façon atomique et idempotente :
//   - rendez_vous.termine_le               : l'instant constaté (FAIT) ;
//   - rendez_vous.delai_liberation_heures  : T figé, lu dans
//     parametre_delai_liberation du pays d'exercice du médecin
//     (parametreDelaiLiberation.service.js).
// Les fonds, eux, NE BOUGENT PAS ici : ils restent en séquestre jusqu'à
// termine_le + T, puis liberationDifferee.service.js les libère. Le statut du
// RDV reste inchangé (« confirme » / « en_attente_presence ») jusqu'à la
// libération, qui le passe à « honore » (libererFonds).
//
// Concurrence : toutes les opérations verrouillent la ligne du RDV
// (SELECT … FOR UPDATE) pour sérialiser les tentatives parallèles — sans cela,
// des requêtes simultanées contourneraient le compteur d'échecs du code.
//
// Convention de retour (même que annulation.service.js) : un refus métier
// attendu est renvoyé sous forme `{ erreur: { status, message, code, … } }` ;
// une exception signale une erreur technique ou de configuration (par
// exemple aucun délai T actif pour le pays : échec explicite voulu).

import prisma from "../lib/prisma.js";
import { calculerDateLiberation } from "../lib/delaiLiberation.js";
import {
  DONNEES_CODE_REINITIALISE,
  appliquerEchecCode,
  codeCorrespond,
  etatVerrou,
  normaliserCode,
} from "../lib/codeConsultation.js";
import { exigerParametreDelai } from "./parametreDelaiLiberation.service.js";
import { enregistrerPresence } from "./presence.service.js";

// Statuts depuis lesquels une fin de consultation peut être constatée (mêmes
// statuts que l'enregistrement des présences et la détection d'absence).
export const STATUTS_FIN_CONSULTATION = Object.freeze(["confirme", "en_attente_presence"]);

export const SOURCES_FIN_CONSULTATION = Object.freeze(["code", "visio"]);

// Types de RDV pour lesquels la saisie du code est acceptée. La
// téléconsultation se clôt par la visio ; un défaut de webhook relève de
// forcer-liberation (admin). Ajouter « teleconsultation » ici suffit pour
// ouvrir le code aux téléconsultations.
export const TYPES_RDV_CODE = Object.freeze(["physique"]);

function erreur(status, message, code, extra = {}) {
  return { erreur: { status, message, code, ...extra } };
}

/** Verrou de ligne : sérialise les opérations concurrentes sur un même RDV. */
async function chargerRdvVerrouille(db, rdv_id) {
  await db.$queryRaw`SELECT rdv_id FROM rendez_vous WHERE rdv_id = ${rdv_id}::uuid FOR UPDATE`;
  return db.rendezVous.findUnique({
    where: { rdv_id },
    include: { compte_escrow: { select: { statut: true } } },
  });
}

function resumeFin(rdv) {
  return {
    termine_le: rdv.termine_le,
    delai_liberation_heures: rdv.delai_liberation_heures,
    date_liberation:
      rdv.termine_le && rdv.delai_liberation_heures != null
        ? calculerDateLiberation(rdv.termine_le, rdv.delai_liberation_heures)
        : null,
  };
}

/**
 * Le RDV est-il dans un état où une fin de consultation peut être constatée ?
 * (La fin déjà constatée est traitée AVANT par les appelants : idempotence.)
 * @returns {null | { erreur: object }}
 */
function verifierEligibilite(rdv) {
  if (rdv.statut === "cree") {
    return erreur(409, "Ce rendez-vous n'est pas encore payé : aucune fin de consultation ne peut être constatée.", "RDV_NON_PAYE");
  }
  if (!STATUTS_FIN_CONSULTATION.includes(rdv.statut)) {
    return erreur(
      409,
      `La fin de consultation ne peut pas être constatée depuis le statut actuel du rendez-vous (${rdv.statut}).`,
      "STATUT_INVALIDE"
    );
  }
  if (!rdv.compte_escrow) {
    return erreur(409, "Aucun paiement (escrow) n'existe pour ce rendez-vous : rien à libérer.", "AUCUN_ESCROW");
  }
  if (rdv.compte_escrow.statut !== "sequestre") {
    return erreur(
      409,
      `Les fonds de ce rendez-vous ne sont pas en séquestre (statut actuel : « ${rdv.compte_escrow.statut} »).`,
      "ESCROW_NON_SEQUESTRE"
    );
  }
  return null;
}

/**
 * Écrit le fait « consultation terminée » + T figé. À appeler DANS une
 * transaction, ligne du RDV verrouillée, éligibilité déjà vérifiée.
 * @private
 */
async function ecrireFinConsultation(db, rdv, { source, maintenant, donneesSupplementaires = {} }) {
  if (source === "visio") {
    // Défensif : le webhook vérifie déjà les deux présences avant d'appeler.
    if (!rdv.medecin_present_le || !rdv.patient_present_le) {
      return erreur(
        409,
        "Les deux parties n'ont pas été présentes : la fin de consultation ne peut pas être constatée.",
        "PRESENCES_INCOMPLETES"
      );
    }
  } else {
    // Code valide : le patient a communiqué son code (présent) et le médecin
    // le saisit (présent) — mêmes deux présences que le scan du QR.
    await enregistrerPresence(rdv.rdv_id, "patient", { maintenant, db });
    await enregistrerPresence(rdv.rdv_id, "medecin", { maintenant, db });
  }

  // Échoue explicitement (exception) sans délai T actif pour le pays du médecin.
  const parametre = await exigerParametreDelai(rdv.medecin_id, db);

  const { count } = await db.rendezVous.updateMany({
    where: { rdv_id: rdv.rdv_id, termine_le: null, statut: { in: [...STATUTS_FIN_CONSULTATION] } },
    data: {
      termine_le: maintenant,
      delai_liberation_heures: parametre.heures,
      ...donneesSupplementaires,
    },
  });
  if (count !== 1) {
    // Ne peut arriver que si la ligne a changé malgré le verrou : on relit.
    const actuel = await db.rendezVous.findUnique({ where: { rdv_id: rdv.rdv_id } });
    return actuel?.termine_le
      ? { constate: false, deja_constate: true, source, ...resumeFin(actuel) }
      : erreur(409, "Le rendez-vous a changé de statut pendant l'opération : réessayez.", "CONFLIT");
  }

  return {
    constate: true,
    deja_constate: false,
    source,
    termine_le: maintenant,
    delai_liberation_heures: parametre.heures,
    date_liberation: calculerDateLiberation(maintenant, parametre.heures),
  };
}

/**
 * Constate la fin de consultation d'un RDV (source « visio » ou « code »).
 *
 * Idempotente : une fin déjà constatée n'est ni réécrite ni décalée
 * (`deja_constate: true`, avec les valeurs d'origine). T déjà figé n'est
 * jamais relu.
 *
 * @param {string} rdv_id
 * @param {{ source: "visio"|"code", maintenant?: Date }} options
 * @param {object} [tx] transaction Prisma de l'appelant (sinon une est ouverte)
 * @returns {Promise<
 *   { constate: boolean, deja_constate: boolean, source: string,
 *     termine_le: Date, delai_liberation_heures: number, date_liberation: Date }
 *   | { erreur: { status: number, message: string, code: string } }>}
 */
export async function constaterFinConsultation(rdv_id, { source, maintenant = new Date() } = {}, tx) {
  if (!SOURCES_FIN_CONSULTATION.includes(source)) {
    throw new Error(`Source de fin de consultation inconnue : « ${source} » (attendu : ${SOURCES_FIN_CONSULTATION.join(", ")}).`);
  }

  const executer = async (db) => {
    const rdv = await chargerRdvVerrouille(db, rdv_id);
    if (!rdv) return erreur(404, "Rendez-vous introuvable.", "RDV_INTROUVABLE");

    if (rdv.termine_le) return { constate: false, deja_constate: true, source, ...resumeFin(rdv) };

    const refus = verifierEligibilite(rdv);
    if (refus) return refus;

    return ecrireFinConsultation(db, rdv, { source, maintenant });
  };

  return tx ? executer(tx) : prisma.$transaction(executer);
}

/**
 * Saisie du code de consultation par le MÉDECIN du RDV (source « code »).
 *
 * Anti force-brute (lib/codeConsultation.js) : après MAX_TENTATIVES échecs
 * consécutifs, saisie verrouillée DUREE_VERROU_MINUTES (HTTP 429, même pour
 * un code juste pendant le verrou). Les échecs sont ÉCRITS (la transaction
 * est validée, pas annulée). Ne comptent pas comme échec : médecin qui n'est
 * pas celui du RDV, code absent, RDV inéligible.
 *
 * @param {{ rdv_id: string, medecin_id: string, code: unknown }} params
 *   `medecin_id` : médecin authentifié, résolu par l'appelant (profilMedecinCourant).
 * @param {{ maintenant?: Date }} [options]
 * @param {object} [tx]
 * @returns {Promise<
 *   { constate: boolean, deja_constate: boolean, source: "code",
 *     termine_le: Date, delai_liberation_heures: number, date_liberation: Date }
 *   | { erreur: { status: number, message: string, code: string,
 *       tentatives_restantes?: number, reessayer_dans_secondes?: number } }>}
 */
export async function validerCodeConsultation({ rdv_id, medecin_id, code }, { maintenant = new Date() } = {}, tx) {
  const executer = async (db) => {
    const rdv = await chargerRdvVerrouille(db, rdv_id);
    if (!rdv) return erreur(404, "Rendez-vous introuvable.", "RDV_INTROUVABLE");

    if (!medecin_id || rdv.medecin_id !== medecin_id) {
      return erreur(403, "Accès refusé : vous n'êtes pas le médecin de ce rendez-vous.", "ACCES_REFUSE");
    }

    if (rdv.statut === "cree") {
      return erreur(409, "Ce rendez-vous n'est pas encore payé : aucune fin de consultation ne peut être constatée.", "RDV_NON_PAYE");
    }
    if (!TYPES_RDV_CODE.includes(rdv.type_rdv)) {
      return erreur(400, "La saisie du code n'est pas disponible pour ce type de rendez-vous.", "TYPE_RDV_INVALIDE");
    }

    // Déjà constatée : réponse idempotente, AVANT le verrou et le compteur
    // (un double envoi de formulaire ne doit pas coûter une tentative).
    if (rdv.termine_le) return { constate: false, deja_constate: true, source: "code", ...resumeFin(rdv) };

    const refus = verifierEligibilite(rdv);
    if (refus) return refus;

    if (!normaliserCode(code)) {
      return erreur(400, "Champ requis manquant : code.", "CODE_REQUIS");
    }

    const verrou = etatVerrou(rdv, maintenant);
    if (verrou.verrouille) {
      return erreur(
        429,
        "Trop de codes erronés : la saisie est temporairement verrouillée pour ce rendez-vous.",
        "CODE_VERROUILLE",
        { reessayer_dans_secondes: verrou.reessayer_dans_secondes }
      );
    }

    // Configuration avant comparaison : un délai T manquant (exception) ne
    // doit consommer aucune tentative du médecin.
    await exigerParametreDelai(rdv.medecin_id, db);

    if (!codeCorrespond(code, rdv.code_unique)) {
      const echec = appliquerEchecCode(rdv, maintenant);
      await db.rendezVous.update({ where: { rdv_id }, data: echec.donnees });
      return echec.verrouille
        ? erreur(
            429,
            "Trop de codes erronés : la saisie est temporairement verrouillée pour ce rendez-vous.",
            "CODE_VERROUILLE",
            { reessayer_dans_secondes: echec.reessayer_dans_secondes }
          )
        : erreur(403, "Code invalide pour ce rendez-vous.", "CODE_INVALIDE", {
            tentatives_restantes: echec.tentatives_restantes,
          });
    }

    return ecrireFinConsultation(db, rdv, {
      source: "code",
      maintenant,
      donneesSupplementaires: { ...DONNEES_CODE_REINITIALISE },
    });
  };

  return tx ? executer(tx) : prisma.$transaction(executer);
}