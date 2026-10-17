// src/services/parametreDelaiConfirmation.service.js
// Agenda — délai H (heures) pendant lequel un RDV « cree » (non confirmé,
// non payé) garde son créneau réservé, PAR PAYS (pays d'exercice du
// médecin), VERSIONNÉ, réglé depuis le back-office.
//
// Même mécanique que parametreDelaiLiberation.service.js :
//   - jamais d'UPDATE d'une ligne existante : on désactive l'actuelle et on
//     en crée une nouvelle (historique conservé) ;
//   - H est lu à la création du RDV puis FIGÉ sur le RDV
//     (rendez_vous.delai_confirmation_heures) : modifier H ne touche jamais
//     les RDV déjà en attente.
// Différence : une valeur par défaut existe (DELAI_CONFIRMATION_PAR_DEFAUT_H,
// 4 h) quand aucun paramètre n'est actif pour le pays — une réservation ne
// doit jamais échouer faute de paramétrage.
// Garanties de la base (migration 20261017100100) : CHECK 1 <= heures <= 720,
// index unique PARTIEL « un seul paramètre actif par pays ».

import prisma from "../lib/prisma.js";
import {
  HEURES_MIN,
  HEURES_MAX,
  DELAI_CONFIRMATION_PAR_DEFAUT_H,
  heuresDelaiConfirmationValides,
} from "../lib/delaiConfirmation.js";

const LONGUEUR_MAX_LIBELLE = 100;

/**
 * Erreur métier attendue (saisie invalide, pays inconnu) : le contrôleur la
 * traduit en réponse HTTP via `status`.
 */
export class ErreurParametreDelaiConfirmation extends Error {
  constructor(message, status = 400, code = "PARAMETRE_DELAI_CONFIRMATION_INVALIDE") {
    super(message);
    this.name = "ErreurParametreDelaiConfirmation";
    this.status = status;
    this.code = code;
  }
}

/**
 * Paramètre actif du pays, ou null.
 * @param {string} pays_id
 * @param {object} [client] client Prisma ou `tx`
 */
export function obtenirParametreDelaiConfirmationActif(pays_id, client = prisma) {
  return client.parametreDelaiConfirmation.findFirst({
    where: { pays_id, actif: true },
    orderBy: { date_debut_validite: "desc" },
  });
}

/**
 * Délai H applicable dans un pays : le paramètre actif, sinon la valeur par défaut.
 * @param {string} pays_id
 * @param {object} [client]
 * @returns {Promise<{ heures: number, par_defaut: boolean, parametre: object|null }>}
 */
export async function resoudreDelaiConfirmationPays(pays_id, client = prisma) {
  const parametre = pays_id ? await obtenirParametreDelaiConfirmationActif(pays_id, client) : null;
  return parametre
    ? { heures: parametre.heures, par_defaut: false, parametre }
    : { heures: DELAI_CONFIRMATION_PAR_DEFAUT_H, par_defaut: true, parametre: null };
}

/**
 * Délai H applicable aux RDV d'un médecin (pays d'exercice).
 * @param {string} medecin_id
 * @param {object} [client]
 */
export async function resoudreDelaiConfirmationMedecin(medecin_id, client = prisma) {
  const medecin = await client.medecin.findUnique({
    where: { medecin_id },
    select: { pays_exercice_id: true },
  });
  return resoudreDelaiConfirmationPays(medecin?.pays_exercice_id, client);
}

/**
 * Liste des paramètres (historique inclus), filtrable.
 * @param {{ pays_id?: string, actif?: boolean }} [filtres]
 * @param {object} [client]
 */
export function listerParametresDelaiConfirmation({ pays_id, actif } = {}, client = prisma) {
  return client.parametreDelaiConfirmation.findMany({
    where: {
      ...(pays_id && { pays_id }),
      ...(actif !== undefined && { actif }),
    },
    orderBy: [{ pays_id: "asc" }, { date_debut_validite: "desc" }],
    include: { pays: { select: { pays_id: true, nom: true, code_iso2: true } } },
  });
}

/**
 * Crée un nouveau délai H pour un pays : désactive le paramètre actif puis
 * crée le nouveau, dans UNE transaction.
 *
 * @param {{ pays_id: string, libelle: string, heures: number }} p
 * @param {object} [client] client Prisma ou `tx`
 * @returns {Promise<object>} le paramètre créé
 * @throws {ErreurParametreDelaiConfirmation} saisie invalide (400) ou pays introuvable (404)
 */
export async function creerParametreDelaiConfirmation({ pays_id, libelle, heures } = {}, client = prisma) {
  if (!pays_id) throw new ErreurParametreDelaiConfirmation("Champ requis manquant : pays_id.");
  if (typeof libelle !== "string" || !libelle.trim()) {
    throw new ErreurParametreDelaiConfirmation("Champ requis manquant : libelle.");
  }
  if (libelle.trim().length > LONGUEUR_MAX_LIBELLE) {
    throw new ErreurParametreDelaiConfirmation(`libelle trop long (${LONGUEUR_MAX_LIBELLE} caractères maximum).`);
  }
  if (!heuresDelaiConfirmationValides(heures)) {
    throw new ErreurParametreDelaiConfirmation(
      `Champ invalide : heures doit être un entier compris entre ${HEURES_MIN} et ${HEURES_MAX}.`
    );
  }

  const executer = async (db) => {
    const pays = await db.pays.findUnique({ where: { pays_id }, select: { pays_id: true } });
    if (!pays) throw new ErreurParametreDelaiConfirmation("Pays introuvable.", 404, "PAYS_INTROUVABLE");

    await db.parametreDelaiConfirmation.updateMany({
      where: { pays_id, actif: true },
      data: { actif: false },
    });
    return db.parametreDelaiConfirmation.create({
      data: { pays_id, libelle: libelle.trim(), heures, actif: true },
    });
  };

  return typeof client.$transaction === "function" ? client.$transaction(executer) : executer(client);
}
