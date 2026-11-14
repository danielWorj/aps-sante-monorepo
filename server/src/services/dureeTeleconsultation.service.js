// src/services/dureeTeleconsultation.service.js
// Durée maximale d'une téléconsultation : paramètre par pays (back-office,
// versionné comme parametreDelaiConfirmation.service.js), durée figée sur le
// RDV, état exposé aux applications et clôture automatique à l'échéance.
//
// Règles :
//   - jamais d'UPDATE d'un paramètre : on désactive l'actif et on en crée un
//     nouveau (historique conservé) ;
//   - D est figée sur le RDV (visio_duree_minutes) dès que les deux parties
//     sont présentes : modifier D ne touche jamais un appel en cours ;
//   - sans paramètre actif pour le pays : DUREE_TELECONSULTATION_PAR_DEFAUT_MIN.

import prisma from "../lib/prisma.js";
import {
  ALERTE_AVANT_FIN_MIN,
  DUREE_TELECONSULTATION_PAR_DEFAUT_MIN,
  MARGE_CLOTURE_AUTO_MS,
  MINUTES_MAX,
  MINUTES_MIN,
  debutConsultation,
  finPrevue,
  minutesDureeValides,
} from "../lib/dureeTeleconsultation.js";
import { constaterFinConsultation } from "./finConsultation.service.js";
import { ErreurParametreDelai } from "./parametreDelaiLiberation.service.js";
import { inviterAvisPatient } from "./avisMedecin.service.js";
import { signalerAppareils } from "./push.service.js";
import { creerNotifications } from "./notification.service.js";

const LONGUEUR_MAX_LIBELLE = 100;
const STATUTS_VISIO = ["confirme", "en_attente_presence"];

export class ErreurParametreDureeTeleconsultation extends Error {
  constructor(message, status = 400, code = "PARAMETRE_DUREE_TELECONSULTATION_INVALIDE") {
    super(message);
    this.name = "ErreurParametreDureeTeleconsultation";
    this.status = status;
    this.code = code;
  }
}

/* -------------------------------------------------------------------
 * Paramètre par pays
 * ------------------------------------------------------------------- */

export function obtenirParametreDureeActif(pays_id, client = prisma) {
  return client.parametreDureeTeleconsultation.findFirst({
    where: { pays_id, actif: true },
    orderBy: { date_debut_validite: "desc" },
  });
}

/**
 * Durée applicable dans un pays : le paramètre actif, sinon la valeur par défaut.
 * @returns {Promise<{ minutes: number, par_defaut: boolean, parametre: object|null }>}
 */
export async function resoudreDureePays(pays_id, client = prisma) {
  const parametre = pays_id ? await obtenirParametreDureeActif(pays_id, client) : null;
  return parametre
    ? { minutes: parametre.minutes, par_defaut: false, parametre }
    : { minutes: DUREE_TELECONSULTATION_PAR_DEFAUT_MIN, par_defaut: true, parametre: null };
}

/** Durée applicable aux téléconsultations d'un médecin (pays d'exercice). */
export async function resoudreDureeMedecin(medecin_id, client = prisma) {
  const medecin = await client.medecin.findUnique({ where: { medecin_id }, select: { pays_exercice_id: true } });
  return resoudreDureePays(medecin?.pays_exercice_id, client);
}

export function listerParametresDuree({ pays_id, actif } = {}, client = prisma) {
  return client.parametreDureeTeleconsultation.findMany({
    where: { ...(pays_id && { pays_id }), ...(actif !== undefined && { actif }) },
    orderBy: [{ pays_id: "asc" }, { date_debut_validite: "desc" }],
    include: { pays: { select: { pays_id: true, nom: true, code_iso2: true } } },
  });
}

/**
 * Nouvelle durée pour un pays : désactive l'actif puis crée le nouveau (transaction).
 * @param {{ pays_id: string, libelle: string, minutes: number }} p
 */
export async function creerParametreDuree({ pays_id, libelle, minutes } = {}, client = prisma) {
  if (!pays_id) throw new ErreurParametreDureeTeleconsultation("Champ requis manquant : pays_id.");
  if (typeof libelle !== "string" || !libelle.trim()) {
    throw new ErreurParametreDureeTeleconsultation("Champ requis manquant : libelle.");
  }
  if (libelle.trim().length > LONGUEUR_MAX_LIBELLE) {
    throw new ErreurParametreDureeTeleconsultation(`libelle trop long (${LONGUEUR_MAX_LIBELLE} caractères maximum).`);
  }
  if (!minutesDureeValides(minutes)) {
    throw new ErreurParametreDureeTeleconsultation(
      `Champ invalide : minutes doit être un entier compris entre ${MINUTES_MIN} et ${MINUTES_MAX}.`
    );
  }
  const executer = async (db) => {
    const pays = await db.pays.findUnique({ where: { pays_id }, select: { pays_id: true } });
    if (!pays) throw new ErreurParametreDureeTeleconsultation("Pays introuvable.", 404, "PAYS_INTROUVABLE");
    await db.parametreDureeTeleconsultation.updateMany({ where: { pays_id, actif: true }, data: { actif: false } });
    return db.parametreDureeTeleconsultation.create({
      data: { pays_id, libelle: libelle.trim(), minutes, actif: true },
    });
  };
  return typeof client.$transaction === "function" ? client.$transaction(executer) : executer(client);
}

/* -------------------------------------------------------------------
 * Durée d'un appel
 * ------------------------------------------------------------------- */

/**
 * Fige la durée sur le RDV dès que les deux parties sont présentes (UPDATE
 * conditionnel : la première valeur écrite gagne). Renvoie le RDV à jour.
 */
export async function figerDureeSiCommencee(rdv, client = prisma) {
  if (rdv.type_rdv !== "teleconsultation" || rdv.visio_duree_minutes != null || !debutConsultation(rdv)) return rdv;
  const { minutes } = await resoudreDureeMedecin(rdv.medecin_id, client);
  await client.rendezVous.updateMany({
    where: { rdv_id: rdv.rdv_id, visio_duree_minutes: null },
    data: { visio_duree_minutes: minutes },
  });
  const relu = await client.rendezVous.findUnique({
    where: { rdv_id: rdv.rdv_id },
    select: { visio_duree_minutes: true },
  });
  return { ...rdv, visio_duree_minutes: relu?.visio_duree_minutes ?? minutes };
}

/**
 * État de la durée pour les applications. `fin_prevue_le` est null tant que
 * les deux parties ne sont pas présentes (pas encore de compte à rebours).
 * `maintenant` (heure du serveur) permet de corriger l'horloge de l'appareil.
 */
export async function etatDureeVisio(rdv, maintenant = new Date(), client = prisma) {
  const avecDuree = await figerDureeSiCommencee(rdv, client);
  const duree_minutes = avecDuree.visio_duree_minutes ?? (await resoudreDureeMedecin(rdv.medecin_id, client)).minutes;
  const debut = debutConsultation(avecDuree);
  const fin = finPrevue(avecDuree);
  return {
    duree_minutes,
    debut_le: debut ? debut.toISOString() : null,
    fin_prevue_le: fin ? fin.toISOString() : null,
    alerte_avant_fin_minutes: ALERTE_AVANT_FIN_MIN,
    ecoulee: Boolean(fin && maintenant.getTime() >= fin.getTime()),
    maintenant: maintenant.toISOString(),
  };
}

/* -------------------------------------------------------------------
 * Clôture côté médecin (sortie de visio, ou durée écoulée)
 * ------------------------------------------------------------------- */

/** Le patient a répondu à l'appel de ce lancement (miroir de visio.controller.js). */
function appelRepondu(rdv) {
  return Boolean(
    rdv.visio_lancee_le && rdv.visio_appel_repondu_le && new Date(rdv.visio_appel_repondu_le) >= new Date(rdv.visio_lancee_le)
  );
}

/**
 * Clôt la visio comme le fait la sortie du MÉDECIN : `visio_cloturee_le`
 * posé (le patient raccroche), puis fin de consultation constatée si les
 * deux parties ont été présentes. Idempotent.
 * @param {object} rdv avec patient.utilisateur_id
 * @returns {Promise<string|null>} raison si la fin n'a pas pu être constatée
 */
export async function cloturerVisioCoteMedecin(rdv, maintenant = new Date(), client = prisma) {
  let raison = null;
  if (!rdv.visio_cloturee_le) {
    await client.rendezVous.update({ where: { rdv_id: rdv.rdv_id }, data: { visio_cloturee_le: maintenant } });
    if (!appelRepondu(rdv) && rdv.patient?.utilisateur_id) {
      signalerAppareils(rdv.patient.utilisateur_id, { type: "visio_appel_termine", rdv_id: rdv.rdv_id });
    }
  }
  if (!rdv.termine_le && STATUTS_VISIO.includes(rdv.statut) && rdv.medecin_present_le && rdv.patient_present_le) {
    try {
      const fin = await constaterFinConsultation(rdv.rdv_id, { source: "visio" });
      if (fin.erreur) raison = fin.erreur.code?.toLowerCase() ?? "fin_non_constatee";
      else if (!fin.deja_constate) inviterAvisPatient(rdv.rdv_id);
    } catch (err) {
      if (!(err instanceof ErreurParametreDelai)) throw err;
      console.error(`[visio] rdv ${rdv.rdv_id} : aucun délai de libération actif pour le pays du médecin — fin NON constatée.`);
      raison = "parametre_delai_absent";
    }
  }
  return raison;
}

/**
 * Alerte « fin proche » aux deux parties (in-app + push, visible même par
 * dessus l'appel sur mobile). Une seule fois par RDV et par personne (clé).
 */
async function alerterFinProche(rdv, fin, client) {
  const minutes = Math.max(1, Math.ceil((fin.getTime() - Date.now()) / 60_000));
  const destinataires = [rdv.medecin?.utilisateur_id, rdv.patient?.utilisateur_id].filter(Boolean);
  await creerNotifications(
    destinataires.map((utilisateur_id) => ({
      utilisateur_id,
      type: "rdv_visio_fin_proche",
      titre: "Fin de la téléconsultation proche",
      message:
        `Il reste environ ${minutes} minute${minutes > 1 ? "s" : ""} : ` +
        "l'appel sera coupé automatiquement à la fin du temps prévu.",
      donnees: { rdv_id: rdv.rdv_id, fin_prevue_le: fin.toISOString() },
      cle: `rdv_visio_fin_proche:${rdv.rdv_id}:${utilisateur_id}`,
    })),
    client
  );
}

/**
 * Cron (chaque minute) sur les téléconsultations en cours :
 *   - ALERTE_AVANT_FIN_MIN minutes avant la fin : alerte aux deux parties ;
 *   - durée écoulée (plus une marge laissée aux applications pour couper
 *     elles-mêmes) et pas encore clôturée : clôture côté serveur.
 * @returns {Promise<{ alertes: number, cloturees: number }>}
 */
export async function cloturerVisiosEchues({ maintenant = new Date() } = {}, client = prisma) {
  const candidats = await client.rendezVous.findMany({
    where: {
      type_rdv: "teleconsultation",
      statut: { in: STATUTS_VISIO },
      termine_le: null,
      visio_cloturee_le: null,
      medecin_present_le: { not: null },
      patient_present_le: { not: null },
    },
    include: { patient: { select: { utilisateur_id: true } }, medecin: { select: { utilisateur_id: true } } },
  });
  let cloturees = 0;
  let alertes = 0;
  for (const brut of candidats) {
    // eslint-disable-next-line no-await-in-loop
    const rdv = await figerDureeSiCommencee(brut, client);
    const fin = finPrevue(rdv);
    if (!fin) continue;
    const alerteDes = fin.getTime() - ALERTE_AVANT_FIN_MIN * 60_000;
    if (maintenant.getTime() >= alerteDes && maintenant.getTime() < fin.getTime()) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await alerterFinProche(rdv, fin, client);
        alertes += 1;
      } catch (err) {
        console.error(`[visio] Alerte de fin proche impossible (rdv ${rdv.rdv_id}) :`, err.message);
      }
    }
    if (maintenant.getTime() < fin.getTime() + MARGE_CLOTURE_AUTO_MS) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await cloturerVisioCoteMedecin(rdv, maintenant, client);
      cloturees += 1;
    } catch (err) {
      console.error(`[visio] Clôture automatique impossible (rdv ${rdv.rdv_id}) :`, err.message);
    }
  }
  return { alertes, cloturees };
}
