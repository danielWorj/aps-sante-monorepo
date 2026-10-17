// src/controllers/parametreDelaiConfirmation.controller.js
// Agenda — API d'administration du délai H (heures) pendant lequel un RDV
// non confirmé (« cree », non payé) garde son créneau réservé.
//
// Même patron que parametreDelaiLiberation.controller.js : toute la logique
// (validation, désactivation de l'actif + création dans UNE transaction,
// bornes 1..720 h) vit dans parametreDelaiConfirmation.service.js. Sans
// paramètre actif pour un pays, 4 h s'appliquent (DELAI_CONFIRMATION_PAR_DEFAUT_H).
// Modifier H = nouvelle version ; les RDV déjà en attente gardent le H figé
// (rendez_vous.delai_confirmation_heures).

import {
  ErreurParametreDelaiConfirmation,
  listerParametresDelaiConfirmation,
  creerParametreDelaiConfirmation,
  resoudreDelaiConfirmationPays,
} from "../services/parametreDelaiConfirmation.service.js";
import { DELAI_CONFIRMATION_PAR_DEFAUT_H, HEURES_MIN, HEURES_MAX } from "../lib/delaiConfirmation.js";

function repondreErreur(err, res, next) {
  if (err instanceof ErreurParametreDelaiConfirmation) {
    return res.status(err.status).json({ message: err.message, code: err.code });
  }
  // Index unique partiel « un seul actif par pays » : deux créations concurrentes.
  if (err?.code === "P2002") {
    return res.status(409).json({
      message: "Une autre modification du même paramètre vient d'avoir lieu. Réessayez.",
      code: "PARAMETRE_DELAI_CONFIRMATION_CONFLIT",
    });
  }
  return next(err);
}

/**
 * GET /api/parametres-delai-confirmation
 * Filtrable par ?pays_id=... et ?actif=true|false (historique inclus par défaut).
 * Renvoie aussi la valeur par défaut et les bornes, pour le formulaire.
 */
export async function listerParametresDelaiConfirmationCtrl(req, res, next) {
  try {
    const { pays_id, actif } = req.query;
    if (actif !== undefined && actif !== "true" && actif !== "false") {
      return res.status(400).json({ message: "actif invalide. Valeurs acceptées : true, false." });
    }

    const parametres = await listerParametresDelaiConfirmation({
      pays_id: pays_id || undefined,
      actif: actif === undefined ? undefined : actif === "true",
    });

    return res.status(200).json({
      parametres_delai_confirmation: parametres,
      heures_par_defaut: DELAI_CONFIRMATION_PAR_DEFAUT_H,
      heures_min: HEURES_MIN,
      heures_max: HEURES_MAX,
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/**
 * GET /api/parametres-delai-confirmation/pays/:pays_id/actif
 * Délai applicable dans un pays : { heures, par_defaut, parametre }.
 * `par_defaut: true` = aucun paramètre saisi, 4 h s'appliquent.
 */
export async function obtenirDelaiConfirmationPaysCtrl(req, res, next) {
  try {
    const delai = await resoudreDelaiConfirmationPays(req.params.pays_id);
    return res.status(200).json({ delai_confirmation: delai });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/**
 * POST /api/parametres-delai-confirmation
 * Body : { pays_id, libelle, heures }
 * Désactive le paramètre actif du pays puis crée le nouveau (transaction).
 */
export async function creerParametreDelaiConfirmationCtrl(req, res, next) {
  try {
    const { pays_id, libelle, heures } = req.body ?? {};
    const nouveau = await creerParametreDelaiConfirmation({ pays_id, libelle, heures });

    return res.status(201).json({
      message:
        "Nouveau délai de confirmation créé et activé. Il s'applique aux rendez-vous demandés à partir de maintenant ; " +
        "les demandes déjà en attente gardent leur délai.",
      parametre_delai_confirmation: nouveau,
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}
