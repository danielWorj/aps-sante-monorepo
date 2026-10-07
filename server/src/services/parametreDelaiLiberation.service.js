// src/services/parametreDelaiLiberation.service.js
// Libération différée des fonds — Phase 2 : délai T (heures) avant libération
// des fonds d'un RDV terminé, PAR PAYS, VERSIONNÉ, saisi par le super admin.
//
// Même mécanique que amende.service.js / parametreAmende.controller.js :
//   - AUCUNE valeur par défaut ni seed : sans paramètre actif pour le pays
//     d'exercice du médecin, la fin de consultation échoue explicitement ;
//   - jamais d'UPDATE d'une ligne existante : on désactive l'actuelle et on
//     en crée une nouvelle (historique conservé) ;
//   - T est lu à la constatation de fin de consultation puis FIGÉ sur le RDV
//     (rendez_vous.delai_liberation_heures) : modifier T ne touche jamais
//     les RDV déjà terminés.
// Garanties de la base (migration 20261007100000) : CHECK 0 <= heures <= 720,
// index unique PARTIEL « un seul paramètre actif par pays ».

import prisma from "../lib/prisma.js";
import { HEURES_MIN, HEURES_MAX, heuresDelaiValides } from "../lib/delaiLiberation.js";

const LONGUEUR_MAX_LIBELLE = 100;

/**
 * Erreur métier attendue (saisie invalide, pays inconnu) : le contrôleur la
 * traduit en réponse HTTP via `status`. Toute autre exception reste une
 * erreur technique.
 */
export class ErreurParametreDelai extends Error {
  constructor(message, status = 400, code = "PARAMETRE_DELAI_INVALIDE") {
    super(message);
    this.name = "ErreurParametreDelai";
    this.status = status;
    this.code = code;
  }
}

/**
 * Paramètre T actif du pays. Erreur explicite si l'administrateur n'a rien
 * saisi (aucune valeur codée en dur).
 * @param {string} pays_id
 * @param {object} [client] client Prisma ou `tx`
 */
export async function obtenirParametreDelaiActif(pays_id, client = prisma) {
  const ligne = await client.parametreDelaiLiberation.findFirst({
    where: { pays_id, actif: true },
    orderBy: { date_debut_validite: "desc" },
  });
  if (!ligne) {
    throw new Error(
      `Aucun délai de libération des fonds actif pour le pays ${pays_id} : un administrateur doit saisir le délai T avant toute fin de consultation.`
    );
  }
  return ligne;
}

/**
 * Contrôle amont : lève l'erreur explicite si aucun T actif n'existe pour le
 * pays d'exercice du médecin. Renvoie la ligne de paramètre.
 * @param {string} medecin_id
 * @param {object} [client]
 */
export async function exigerParametreDelai(medecin_id, client = prisma) {
  const medecin = await client.medecin.findUnique({
    where: { medecin_id },
    select: { pays_exercice_id: true },
  });
  if (!medecin) throw new Error(`Médecin introuvable (${medecin_id}) : délai de libération impossible à déterminer.`);
  return obtenirParametreDelaiActif(medecin.pays_exercice_id, client);
}

/**
 * Liste des paramètres (historique inclus), filtrable.
 * @param {{ pays_id?: string, actif?: boolean }} [filtres]
 * @param {object} [client]
 */
export function listerParametresDelai({ pays_id, actif } = {}, client = prisma) {
  return client.parametreDelaiLiberation.findMany({
    where: {
      ...(pays_id && { pays_id }),
      ...(actif !== undefined && { actif }),
    },
    orderBy: [{ pays_id: "asc" }, { date_debut_validite: "desc" }],
    include: { pays: { select: { pays_id: true, nom: true, code_iso2: true } } },
  });
}

/**
 * Crée un nouveau délai T pour un pays : désactive le paramètre actif puis
 * crée le nouveau, dans UNE transaction (l'index unique partiel WHERE actif
 * interdit deux actifs). Si l'appelant fournit déjà un `tx`, on s'y greffe.
 *
 * @param {{ pays_id: string, libelle: string, heures: number }} p
 * @param {object} [client] client Prisma ou `tx`
 * @returns {Promise<object>} le paramètre créé
 * @throws {ErreurParametreDelai} saisie invalide (400) ou pays introuvable (404)
 */
export async function creerParametreDelai({ pays_id, libelle, heures } = {}, client = prisma) {
  if (!pays_id) throw new ErreurParametreDelai("Champ requis manquant : pays_id.");
  if (typeof libelle !== "string" || !libelle.trim()) {
    throw new ErreurParametreDelai("Champ requis manquant : libelle.");
  }
  if (libelle.trim().length > LONGUEUR_MAX_LIBELLE) {
    throw new ErreurParametreDelai(`libelle trop long (${LONGUEUR_MAX_LIBELLE} caractères maximum).`);
  }
  if (!heuresDelaiValides(heures)) {
    throw new ErreurParametreDelai(
      `Champ invalide : heures doit être un entier compris entre ${HEURES_MIN} et ${HEURES_MAX}.`
    );
  }

  const executer = async (db) => {
    const pays = await db.pays.findUnique({ where: { pays_id }, select: { pays_id: true } });
    if (!pays) throw new ErreurParametreDelai("Pays introuvable.", 404, "PAYS_INTROUVABLE");

    await db.parametreDelaiLiberation.updateMany({
      where: { pays_id, actif: true },
      data: { actif: false },
    });
    return db.parametreDelaiLiberation.create({
      data: { pays_id, libelle: libelle.trim(), heures, actif: true },
    });
  };

  // Un client transactionnel (tx) n'a pas $transaction : on s'y greffe tel quel.
  return typeof client.$transaction === "function" ? client.$transaction(executer) : executer(client);
}